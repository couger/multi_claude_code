/**
 * HTTP/WebSocket 服务器 — 远程访问
 */

import type { Server } from 'http';
import type { Server as WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { IPC_CHANNELS, APP_CONSTANTS } from './constants';
import { configManager } from './ConfigManager';
import { getLocalIPv4s } from './utils';
import type { ProcessManager } from './ProcessManager';
import type { PerformanceMonitor } from './PerformanceMonitor';
import type { GroupManager } from './GroupManager';

interface WsClientInfo {
  ws: WebSocket;
  ip: string;
  connectedAt: Date;
  id: string;
}

export class HttpServerManager {
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private port: number;
  private accessToken: string = '';
  private enabled: boolean = false;
  private allowedIPs = new Set<string>();
  private selectedServerIPs = new Set<string>();
  private allowRemoteCreateSession = true;
  private maxRemoteConnections = 0;
  private wsClients: Map<string, WsClientInfo> = new Map();

  constructor(
    private processManager: ProcessManager,
    private performanceMonitor: PerformanceMonitor | null,
    private groupManager: GroupManager | null,
    private broadcastFn: (message: any) => void,
  ) {
    this.port = APP_CONSTANTS.DEFAULT_HTTP_PORT;
    this.loadToken();
  }

  private loadToken() {
    const token = configManager.get('accessToken');
    if (token) {
      this.accessToken = token;
    } else {
      const crypto = require('crypto');
      this.accessToken = crypto.randomBytes(16).toString('hex');
      configManager.set('accessToken', this.accessToken);
    }
  }

  getStatus() {
    return {
      enabled: this.enabled,
      running: !!this.httpServer,
      port: this.port,
      token: this.accessToken,
      localIPs: getLocalIPv4s(),
      clientCount: this.wsClients.size,
      clients: this.getUniqueClients(),
    };
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled && !this.httpServer) {
      this.start();
    } else if (!enabled && this.httpServer) {
      this.stop(true);
    }
  }

  isEnabled() { return this.enabled; }
  isRunning() { return !!this.httpServer; }

  setPort(port: number) {
    const wasRunning = this.isRunning();
    if (this.httpServer) this.stop();
    this.port = port;
    if (wasRunning) this.start();
  }

  getPort() { return this.port; }

  setAllowRemoteCreate(allow: boolean) { this.allowRemoteCreateSession = allow; }
  setMaxConnections(max: number) { this.maxRemoteConnections = max; }
  setSelectedIPs(ips: string[]) { this.selectedServerIPs = new Set(ips); }
  getSelectedIPs() { return [...this.selectedServerIPs]; }

  refreshToken() {
    const crypto = require('crypto');
    this.accessToken = crypto.randomBytes(16).toString('hex');
    configManager.set('accessToken', this.accessToken);
    for (const [clientId, clientInfo] of this.wsClients) {
      try { clientInfo.ws.close(4003, 'Token refreshed'); } catch { /* ignore */ }
      this.wsClients.delete(clientId);
    }
    return this.accessToken;
  }

  kickClient(clientId: string) {
    const client = this.wsClients.get(clientId);
    if (client) {
      try { client.ws.close(4002, 'Kicked by admin'); } catch { /* ignore */ }
      this.wsClients.delete(clientId);
      return true;
    }
    return false;
  }

  kickAll() {
    for (const [, clientInfo] of this.wsClients) {
      try { clientInfo.ws.close(4002, 'Kicked by admin'); } catch { /* ignore */ }
    }
    this.wsClients.clear();
  }

  private getUniqueClients() {
    const unique = new Map<string, { id: string; ip: string; connectedAt: Date }>();
    for (const client of this.wsClients.values()) {
      const existing = unique.get(client.ip);
      if (!existing || client.connectedAt > existing.connectedAt) {
        unique.set(client.ip, { id: client.id, ip: client.ip, connectedAt: client.connectedAt });
      }
    }
    return Array.from(unique.values()).map(c => ({
      id: c.id, ip: c.ip, connectedAt: c.connectedAt.toISOString(),
    }));
  }

  private start() {
    if (this.httpServer) return;
    const http = require('http');
    const url = require('url');
    const crypto = require('crypto');
    const WebSocket = require('ws');

    const server = http.createServer((req: any, res: any) => this.handleRequest(req, res, url));
    const wsServer = new WebSocket.Server({ server });
    this.wss = wsServer;

    wsServer.on('connection', (ws: any, req: any) => this.handleWsConnection(ws, req, url, crypto));

    server.on('error', (err: any) => {
      console.error('HTTP server error:', err);
      if (err.code === 'EADDRINUSE') {
        this.port = Math.floor(Math.random() * (APP_CONSTANTS.RANDOM_PORT_MAX - APP_CONSTANTS.RANDOM_PORT_MIN)) + APP_CONSTANTS.RANDOM_PORT_MIN;
        setTimeout(() => this.start(), 1000);
      }
    });

    server.listen(this.port, () => {
      console.log(`HTTP/WebSocket server started on port ${this.port}`);
      getLocalIPv4s().forEach(ip => {
        console.log(`Access via: http://${ip}:${this.port}`);
      });
    });

    this.httpServer = server;
  }

  private handleRequest(req: any, res: any, url: any) {
    const parsedUrl = url.parse(req.url!, true);
    const clientIP = req.socket.remoteAddress || 'unknown';
    const method = req.method;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // Auth check
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const queryToken = query?.token || '';
    const ipAllowed = this.allowedIPs.has(clientIP);
    const isAuthed = token === this.accessToken || queryToken === this.accessToken || ipAllowed;

    // Check target IP
    const hostHeader = req.headers.host || '';
    const targetIP = hostHeader.split(':')[0];
    const isTargetIPAllowed = this.selectedServerIPs.size === 0 || this.selectedServerIPs.has(targetIP);
    if (this.selectedServerIPs.size > 0 && !isTargetIPAllowed) {
      req.socket.destroy();
      return;
    }

    // Public endpoints
    if (pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online', version: '0.1.0', localIPs: getLocalIPv4s(),
        port: this.port, accessToken: this.accessToken, clientIP,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // IP whitelist
    if (this.allowedIPs.size > 0 && !this.allowedIPs.has(clientIP)) {
      if (pathname !== '/login.html' && pathname !== '/api/allow-ip' && pathname !== '/api/remove-ip') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'IP address not allowed' }));
        return;
      }
    }

    // Frontend proxy
    if (pathname === '/' || pathname === '/index.html') {
      if (!isAuthed) { res.writeHead(302, { Location: '/login.html' }); res.end(); return; }
      this.proxyToVite(req, res);
      return;
    }

    if (pathname.startsWith('/@') || pathname.startsWith('/src/') || pathname.startsWith('/node_modules/') ||
        pathname.endsWith('.js') || pathname.endsWith('.css') || pathname.endsWith('.map') ||
        pathname.endsWith('.svg') || pathname.endsWith('.png') || pathname.endsWith('.ico') ||
        pathname.endsWith('.woff') || pathname.endsWith('.woff2') || pathname.startsWith('/__')) {
      this.proxyToVite(req, res);
      return;
    }

    if (pathname === '/login.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getLoginPage());
      return;
    }

    if (pathname === '/api/login' && method === 'POST') {
      this.collectBody(req).then(body => {
        try {
          const { token: inputToken } = JSON.parse(body);
          if (inputToken === this.accessToken) {
            this.allowedIPs.add(clientIP);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid token' }));
          }
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request' }));
        }
      });
      return;
    }

    if (!isAuthed) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Authenticated API routes
    this.handleApiRoute(pathname, method, req, res, query);
  }

  private async handleApiRoute(pathname: string, method: string, req: any, res: any, query: any) {
    const pm = this.processManager;

    if (pathname === '/api/sessions' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions: pm.getSessions() }));
      return;
    }

    if (pathname === '/api/sessions' && method === 'POST') {
      if (!this.allowRemoteCreateSession) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '远程创建会话已被管理员禁用' }));
        return;
      }
      const body = await this.collectBody(req);
      try {
        const options = JSON.parse(body);
        const session = await pm.createSession(options);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ session }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err?.message || 'Failed to create session' }));
      }
      return;
    }

    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/output')) {
      const sessionId = pathname.split('/')[3];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessionId, output: pm.getSessionOutput(sessionId) }));
      return;
    }

    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/input') && method === 'POST') {
      const body = await this.collectBody(req);
      try {
        const data = JSON.parse(body);
        pm.sendInput(pathname.split('/')[3], data.input);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/note') && method === 'POST') {
      const body = await this.collectBody(req);
      try {
        const { note } = JSON.parse(body);
        pm.setNote(pathname.split('/')[3], note);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/resize') && method === 'POST') {
      const body = await this.collectBody(req);
      try {
        const { cols, rows } = JSON.parse(body);
        pm.resizeSession(pathname.split('/')[3], cols, rows);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/close') && method === 'POST') {
      const sessionId = pathname.split('/')[3];
      try {
        await pm.killSession(sessionId);
        this.groupManager?.removeSessionFromAllGroups(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to close session' }));
      }
      return;
    }

    if (pathname === '/api/allow-ip' && method === 'POST') {
      const body = await this.collectBody(req);
      try {
        const { ip } = JSON.parse(body);
        this.allowedIPs.add(ip);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ip }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    if (pathname === '/api/remove-ip' && method === 'DELETE') {
      const { ip } = query;
      if (ip && typeof ip === 'string') {
        this.allowedIPs.delete(ip);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ip }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'IP not specified' }));
      }
      return;
    }

    // Default: proxy to Vite
    this.proxyToVite(req, res);
  }

  private handleWsConnection(ws: any, req: any, url: any, crypto: any) {
    const parsedUrl = url.parse(req.url!, true);
    const token = parsedUrl.query?.token || '';
    const clientIP = req.socket.remoteAddress || 'unknown';

    if (this.maxRemoteConnections > 0 && this.wsClients.size >= this.maxRemoteConnections) {
      ws.send(JSON.stringify({ channel: 'connection-rejected', data: { reason: `当前连接数已达上限 (${this.maxRemoteConnections})` } }));
      setTimeout(() => { try { ws.close(4005, 'Max connections reached'); } catch { /* ignore */ } }, APP_CONSTANTS.WS_CLOSE_DELAY);
      return;
    }

    if (this.allowedIPs.size > 0 && !this.allowedIPs.has(clientIP)) {
      ws.close(4003, 'IP address not allowed');
      return;
    }

    if (token !== this.accessToken) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const clientId = crypto.randomBytes(8).toString('hex');
    this.wsClients.set(clientId, { ws, ip: clientIP, connectedAt: new Date(), id: clientId });
    console.log(`WebSocket client connected from ${clientIP} (id: ${clientId}), total: ${this.wsClients.size}`);

    // Send initial state
    const sessions = this.processManager.getSessions();
    ws.send(JSON.stringify({ channel: 'session:list', data: { sessions } }));
    ws.send(JSON.stringify({ channel: 'settings:general', data: { allowRemoteCreateSession: this.allowRemoteCreateSession, maxRemoteConnections: this.maxRemoteConnections } }));

    ws.on('message', (message: any) => {
      try {
        const msg = JSON.parse(message.toString());
        this.handleWsMessage(ws, msg);
      } catch (e) {
        console.error('Invalid WebSocket message:', e);
      }
    });

    ws.on('close', () => {
      this.wsClients.delete(clientId);
      console.log(`WebSocket client disconnected from ${clientIP}, total: ${this.wsClients.size}`);
    });
  }

  private async handleWsMessage(ws: any, msg: any) {
    const { action, id, data } = msg;
    const pm = this.processManager;
    const respond = (responseData: any) => {
      ws.send(JSON.stringify({ channel: 'ws:response', id, data: responseData }));
    };

    try {
      let result: any;
      switch (action) {
        case 'session:create':
          if (!this.allowRemoteCreateSession) {
            respond({ success: false, error: '远程创建会话已被管理员禁用' });
            break;
          }
          {
            const createWorkDir = data?.workDir || require('os').homedir();
            const conflicts = pm.checkWorkDirConflict(createWorkDir);
            if (conflicts.length > 0 && !data?.skipConflictCheck) {
              respond({ success: false, error: 'WORKDIR_CONFLICT', conflicts });
              break;
            }
            result = await pm.createSession(data || {});
            respond({ success: true, session: result });
          }
          break;
        case 'session:kill':
          await pm.killSession(data.sessionId);
          this.groupManager?.removeSessionFromAllGroups(data.sessionId);
          respond({ success: true });
          break;
        case 'session:list':
          result = pm.getSessions();
          respond({ sessions: result });
          break;
        case 'session:output':
          result = pm.getSessionOutput(data.sessionId);
          respond({ output: result });
          break;
        case 'session:input':
          pm.sendInput(data.sessionId, data.input);
          respond({ success: true });
          break;
        case 'session:note':
          pm.setNote(data.sessionId, data.note);
          respond({ success: true });
          break;
        case 'session:resize':
          pm.resizeSession(data.sessionId, data.cols, data.rows);
          respond({ success: true });
          break;
        case 'metrics:system':
          result = this.performanceMonitor ? await this.performanceMonitor.getSystemMetrics() : {};
          respond(result);
          break;
        case 'metrics:session':
          result = this.performanceMonitor ? await this.performanceMonitor.getSessionMetrics() : [];
          respond({ metrics: result });
          break;
        case 'metrics:start':
          this.performanceMonitor?.startMonitoring(data?.interval || APP_CONSTANTS.DEFAULT_MONITOR_INTERVAL);
          respond({ success: true });
          break;
        case 'metrics:stop':
          this.performanceMonitor?.stopMonitoring();
          respond({ success: true });
          break;
        case 'group:create':
          result = this.groupManager ? this.groupManager.createGroup(data) : null;
          respond({ group: result });
          break;
        case 'group:update':
          result = this.groupManager ? this.groupManager.updateGroup(data.groupId, data.updates) : null;
          respond({ group: result });
          break;
        case 'group:delete':
          result = this.groupManager ? this.groupManager.deleteGroup(data.groupId) : false;
          respond({ success: result });
          break;
        case 'group:list':
          result = this.groupManager ? this.groupManager.getGroups() : [];
          respond({ groups: result });
          break;
        case 'group:addSession':
          result = this.groupManager ? this.groupManager.addSessionToGroup(data.groupId, data.sessionId) : false;
          respond({ success: result });
          break;
        case 'group:removeSession':
          result = this.groupManager ? this.groupManager.removeSessionFromGroup(data.groupId, data.sessionId) : false;
          respond({ success: result });
          break;
        default:
          respond({ error: 'Unknown action' });
      }
    } catch (err: any) {
      respond({ error: err?.message || String(err) });
    }
  }

  broadcast(message: any) {
    if (!this.wss) return;
    const msg = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === 1) {
        client.send(msg);
      }
    }
  }

  stop(graceful = false) {
    if (graceful && this.wss) {
      this.broadcast({ channel: 'remote-access-closed', data: { reason: '远程访问已关闭' } });
    }
    if (this.wss) {
      for (const client of this.wss.clients) {
        try { client.close(4004, graceful ? 'Server shutting down' : 'Server stopped'); } catch { /* ignore */ }
      }
      this.wss.close(() => { this.wss = null; });
    }
    if (this.httpServer) {
      this.httpServer.closeAllConnections?.();
      this.httpServer.close(() => { this.httpServer = null; console.log('HTTP/WebSocket server stopped'); });
    }
  }

  private proxyToVite(req: any, res: any) {
    const http = require('http');
    const viteUrl = new URL(req.url!, `http://localhost:${APP_CONSTANTS.VITE_DEV_PORT}`);
    const proxy = http.request({
      hostname: 'localhost',
      port: APP_CONSTANTS.VITE_DEV_PORT,
      path: viteUrl.pathname + viteUrl.search,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${APP_CONSTANTS.VITE_DEV_PORT}` },
    }, (proxyRes: any) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxy.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway - Vite dev server not available');
    });
    req.pipe(proxy);
  }

  private collectBody(req: any): Promise<string> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk.toString(); });
      req.on('end', () => resolve(body));
    });
  }
}

export async function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    server.once('error', (err: any) => { resolve(err.code === 'EADDRINUSE'); });
    server.once('listening', () => { server.close(); resolve(false); });
    server.listen(port, '0.0.0.0');
  });
}

function getLoginPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code CLI Manager - 登录</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 40px; width: 400px; max-width: 90vw; }
    h1 { text-align: center; margin-bottom: 8px; font-size: 20px; color: #58a6ff; }
    p { text-align: center; color: #8b949e; margin-bottom: 24px; font-size: 14px; }
    .input-group { margin-bottom: 16px; }
    label { display: block; margin-bottom: 6px; font-size: 13px; color: #8b949e; }
    input { width: 100%; padding: 10px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 14px; outline: none; }
    input:focus { border-color: #58a6ff; }
    button { width: 100%; padding: 10px; background: #58a6ff; color: #0d1117; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #79c0ff; }
    .error { color: #f85149; text-align: center; margin-top: 12px; font-size: 13px; display: none; }
    .info { color: #8b949e; text-align: center; margin-top: 16px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Claude Code CLI Manager</h1>
    <p>请输入访问令牌以登录</p>
    <div class="input-group">
      <label for="token">访问令牌</label>
      <input type="text" id="token" placeholder="在此输入令牌..." autofocus />
    </div>
    <button onclick="login()">登 录</button>
    <div class="error" id="error">令牌无效，请重试</div>
    <div class="info">令牌显示在应用启动日志中</div>
  </div>
  <script>
    document.getElementById('token').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    async function login() {
      const token = document.getElementById('token').value.trim();
      const errEl = document.getElementById('error');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
        if (res.ok) { window.location.href = '/?token=' + encodeURIComponent(token); } else { errEl.style.display = 'block'; }
      } catch (e) { errEl.textContent = '网络错误'; errEl.style.display = 'block'; }
    }
  </script>
</body>
</html>`;
}
