/**
 * 浏览器端 API 适配器
 * 在非 Electron 环境中通过 HTTP + WebSocket 提供与 electronAPI 相同的接口
 */

type EventCallback = (data: any) => void;

class BrowserAPI {
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private token: string;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private wsReconnectTimer: any = null;
  private pendingRequests: Map<string, { resolve: (v: any) => void; reject: (e: any) => void }> = new Map();
  private requestId = 0;

  constructor() {
    // 从 URL 参数获取 token
    const params = new URLSearchParams(window.location.search);
    this.token = params.get('token') || '';
    this.baseUrl = `${window.location.protocol}//${window.location.host}`;
  }

  async init(): Promise<void> {
    // 如果没有 token，尝试从 cookie 获取
    if (!this.token) {
      this.token = document.cookie
        .split('; ')
        .find(row => row.startsWith('cccm_token='))
        ?.split('=')[1] || '';
    }

    // 如果仍然没有 token，跳转到登录页
    if (!this.token) {
      window.location.href = '/login.html';
      return;
    }

    // 保存 token 到 cookie（7天有效）
    document.cookie = `cccm_token=${this.token}; max-age=${7 * 24 * 3600}; path=/`;

    // 检查是否远程创建会话被禁用
    try {
      const saved = localStorage.getItem('generalSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.allowRemoteCreateSession === false) {
          document.body.setAttribute('data-remote-create-disabled', 'true');
        }
      }
    } catch { /* ignore */ }

    // 连接 WebSocket
    this.connectWs();
  }

  private connectWs() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}?token=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[BrowserAPI] WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.channel === 'ws:response') {
            // 处理请求-响应
            const pending = this.pendingRequests.get(msg.id);
            if (pending) {
              this.pendingRequests.delete(msg.id);
              if (msg.data?.error) {
                pending.reject(new Error(msg.data.error));
              } else {
                pending.resolve(msg.data);
              }
            }
          } else if (msg.channel === 'remote-access-closed') {
            // 远程访问被关闭 - 显示提示然后断开
            this.showRemoteAccessClosed(msg.data?.reason || '远程访问已关闭');
          } else if (msg.channel === 'connection-rejected') {
            // 连接被拒绝（连接数上限等）
            this.showRemoteAccessClosed(msg.data?.reason || '连接被拒绝');
          } else if (msg.channel === 'settings:general') {
            // 接收通用设置更新
            if (msg.data) {
              try {
                localStorage.setItem('generalSettings', JSON.stringify(msg.data));
                // 如果远程创建会话被禁用，隐藏创建按钮
                if (msg.data.allowRemoteCreateSession === false) {
                  document.body.setAttribute('data-remote-create-disabled', 'true');
                } else {
                  document.body.removeAttribute('data-remote-create-disabled');
                }
              } catch { /* ignore */ }
            }
          } else {
            // 处理事件推送
            const callbacks = this.listeners.get(msg.channel);
            if (callbacks) {
              for (const cb of callbacks) {
                cb(msg.data);
              }
            }
          }
        } catch (e) {
          console.error('[BrowserAPI] Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log(`[BrowserAPI] WebSocket disconnected: code=${event.code}, reason=${event.reason}`);
        // 清除重连定时器
        if (this.wsReconnectTimer) {
          clearTimeout(this.wsReconnectTimer);
          this.wsReconnectTimer = null;
        }
        // 清除 cookie，强制重新登录
        document.cookie = 'cccm_token=; max-age=0; path=/';

        // 如果是连接数上限（4005），显示提示
        if (event.code === 4005) {
          const overlay = document.createElement('div');
          overlay.style.cssText = 'position:fixed;inset:0;background:#0d1117;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
          overlay.innerHTML = `<div style="text-align:center;color:#c9d1d9;">
            <div style="font-size:48px;margin-bottom:16px;">🔒</div>
            <h2 style="font-size:20px;color:#d29922;margin-bottom:8px;">连接数已达上限</h2>
            <p style="font-size:14px;color:#8b949e;">${event.reason || '请稍后再试'}</p>
          </div>`;
          document.body.appendChild(overlay);
          return;
        }
        // 任何原因断开都需要重新登录
        console.log(`[BrowserAPI] 连接被关闭，重定向到登录页面`);
        window.location.href = '/login.html';
      };

      this.ws.onerror = () => {
        console.error('[BrowserAPI] WebSocket error');
      };
    } catch (e) {
      console.error('[BrowserAPI] Failed to connect WebSocket:', e);
      this.wsReconnectTimer = setTimeout(() => this.connectWs(), 3000);
    }
  }

  private async wsRequest(action: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        // 降级到 HTTP
        this.httpFallback(action, data).then(resolve).catch(reject);
        return;
      }

      const id = `req_${++this.requestId}`;
      this.pendingRequests.set(id, { resolve, reject });

      this.ws.send(JSON.stringify({ action, id, data }));

      // 10秒超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  private async httpFallback(action: string, data: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    };

    const actionMap: Record<string, { method: string; path: string | ((d: any) => string); bodyFn?: (d: any) => any }> = {
      'session:create': { method: 'POST', path: '/api/sessions', bodyFn: (d: any) => d },
      'session:kill': { method: 'POST', path: (d: any) => `/api/sessions/${d.sessionId}/close` },
      'session:list': { method: 'GET', path: '/api/sessions' },
      'session:output': { method: 'GET', path: (d: any) => `/api/sessions/${d.sessionId}/output` },
      'session:input': { method: 'POST', path: (d: any) => `/api/sessions/${d.sessionId}/input`, bodyFn: (d: any) => ({ input: d.input }) },
      'session:note': { method: 'POST', path: (d: any) => `/api/sessions/${d.sessionId}/note`, bodyFn: (d: any) => ({ note: d.note }) },
      'session:resize': { method: 'POST', path: (d: any) => `/api/sessions/${d.sessionId}/resize`, bodyFn: (d: any) => ({ cols: d.cols, rows: d.rows }) },
    };

    const config = actionMap[action];
    if (!config) throw new Error(`Unknown action: ${action}`);

    const pathStr = typeof config.path === 'function' ? config.path(data) : config.path;
    const body = config.bodyFn ? JSON.stringify(config.bodyFn(data)) : undefined;

    const res = await fetch(`${this.baseUrl}${pathStr}`, {
      method: config.method,
      headers,
      body,
    });

    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = '/login.html';
        throw new Error('Unauthorized');
      }
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  }

  // ==================== ElectronAPI 兼容接口 ====================

  // 会话管理
  createSession(options?: any): Promise<any> {
    return this.wsRequest('session:create', options || {});
  }

  killSession(sessionId: string): Promise<void> {
    return this.wsRequest('session:kill', { sessionId });
  }

  getSessions(): Promise<any[]> {
    return this.wsRequest('session:list', {}).then(r => r.sessions || []);
  }

  getSessionOutput(sessionId: string): Promise<string> {
    return this.wsRequest('session:output', { sessionId }).then(r => r.output || '');
  }

  sendInput(sessionId: string, data: string): void {
    this.wsRequest('session:input', { sessionId, input: data }).catch(console.error);
  }

  setNote(sessionId: string, note: string): void {
    this.wsRequest('session:note', { sessionId, note }).catch(console.error);
  }

  resizeSession(sessionId: string, cols: number, rows: number): void {
    this.wsRequest('session:resize', { sessionId, cols, rows }).catch(console.error);
  }

  // 对话框 - 浏览器端无法使用原生对话框
  selectWorkDir(): Promise<string | null> {
    // 返回用户手动输入的路径
    const dir = prompt('请输入工作目录路径:');
    return Promise.resolve(dir || null);
  }

  // 窗口控制 - 浏览器端不适用，静默忽略
  minimizeWindow(): void { /* no-op */ }
  maximizeWindow(): void { /* no-op */ }
  closeWindow(): void { window.close(); }
  toggleAutoHideWindow(): void { /* no-op */ }
  hideWindowToEdge(): void { /* no-op */ }
  restoreWindow(): void { /* no-op */ }

  // 事件监听
  onSessionCreated(callback: (data: any) => void): void {
    this.addListener('session:created', callback);
  }

  onSessionOutput(callback: (data: any) => void): void {
    this.addListener('session:outputChunk', callback);
  }

  onSessionStatus(callback: (data: any) => void): void {
    this.addListener('session:status', callback);
  }

  onSessionClosed(callback: (data: any) => void): void {
    this.addListener('session:closed', callback);
  }

  onAlert(callback: (data: any) => void): void {
    this.addListener('alert:trigger', callback);
  }

  // 移除监听
  removeAllListeners(channel: string): void {
    this.listeners.delete(channel);
  }

  // 性能监控
  getSystemMetrics(): Promise<any> {
    return this.wsRequest('metrics:system', {});
  }

  getSessionMetrics(): Promise<any[]> {
    return this.wsRequest('metrics:session', {}).then(r => r.metrics || []);
  }

  startMonitoring(interval?: number): Promise<any> {
    return this.wsRequest('metrics:start', { interval: interval || 5000 });
  }

  stopMonitoring(): Promise<any> {
    return this.wsRequest('metrics:stop', {});
  }

  // 分组管理
  createGroup(options: any): Promise<any> {
    return this.wsRequest('group:create', options);
  }

  updateGroup(groupId: string, updates: any): Promise<any> {
    return this.wsRequest('group:update', { groupId, updates });
  }

  deleteGroup(groupId: string): Promise<any> {
    return this.wsRequest('group:delete', { groupId });
  }

  getGroups(): Promise<any[]> {
    return this.wsRequest('group:list', {}).then(r => r.groups || []);
  }

  addSessionToGroup(groupId: string, sessionId: string): Promise<any> {
    return this.wsRequest('group:addSession', { groupId, sessionId });
  }

  removeSessionFromGroup(groupId: string, sessionId: string): Promise<any> {
    return this.wsRequest('group:removeSession', { groupId, sessionId });
  }

  private addListener(channel: string, callback: EventCallback): void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(callback);
  }

  /**
   * 显示远程访问已关闭的提示页面
   */
  private showRemoteAccessClosed(reason: string) {
    // 创建全屏覆盖层
    const overlay = document.createElement('div');
    overlay.id = 'remote-access-closed-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:#0d1117;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    overlay.innerHTML = `
      <div style="text-align:center;color:#c9d1d9;">
        <div style="font-size:48px;margin-bottom:16px;">🔒</div>
        <h2 style="font-size:20px;color:#f85149;margin-bottom:8px;">远程访问已关闭</h2>
        <p style="font-size:14px;color:#8b949e;margin-bottom:24px;">${reason}</p>
        <p style="font-size:12px;color:#6e7681;">此页面将自动关闭...</p>
      </div>
    `;
    document.body.appendChild(overlay);

    // 延迟后尝试刷新，如果服务器已关闭则显示浏览器错误
    setTimeout(() => {
      // 关闭WebSocket连接
      if (this.ws) {
        this.ws.close();
      }
      // 尝试重新连接检测服务器状态
      setTimeout(() => {
        fetch(window.location.href, { method: 'HEAD' })
          .then(() => {
            // 服务器仍在运行，可能是重新启动了
            window.location.reload();
          })
          .catch(() => {
            // 服务器已关闭，显示断开信息
            overlay.innerHTML = `
              <div style="text-align:center;color:#c9d1d9;">
                <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
                <h2 style="font-size:20px;color:#f85149;margin-bottom:8px;">连接已断开</h2>
                <p style="font-size:14px;color:#8b949e;">远程访问服务已关闭</p>
                <p style="font-size:12px;color:#6e7681;margin-top:16px;">请刷新页面重试，或联系管理员</p>
              </div>
            `;
          });
      }, 1000);
    }, 2000);
  }
}

// 环境检测和 API 初始化
export function isElectron(): boolean {
  return !!(window as any).electronAPI;
}

export async function initBrowserAPI(): Promise<void> {
  if (isElectron()) return; // Electron 环境，无需初始化

  console.log('[BrowserAPI] Detected browser environment, initializing...');
  const api = new BrowserAPI();

  // 将 API 注入到 window.electronAPI
  (window as any).electronAPI = api;

  await api.init();
  console.log('[BrowserAPI] Ready');
}
