/**
 * Claude Code CLI Manager - 主进程入口 (单文件打包版本)
 */

import { app, BrowserWindow, ipcMain, dialog, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import type { Server } from 'http';
import type { Server as WebSocketServer, WebSocket } from 'ws';
import { IPC_CHANNELS } from './constants';
import { SessionStatus } from '../shared/constants';
import { ProcessManager } from './ProcessManager';
import { PerformanceMonitor } from './PerformanceMonitor';
import { GroupManager } from './GroupManager';
import { WindowManager } from './WindowManager';

// 扩展 BrowserWindow 类型以支持 originalBounds
declare module 'electron' {
  interface BrowserWindow {
    originalBounds?: Electron.Rectangle;
  }
}

let mainWindow: BrowserWindow | null = null;
let windowManager: WindowManager | null = null;
let processManager: ProcessManager | null = null;
let performanceMonitor: PerformanceMonitor | null = null;
let groupManager: GroupManager | null = null;
let tray: Tray | null = null;

// HTTP/WebSocket 服务器相关变量
let httpServer: Server | null = null;
let wss: WebSocketServer | null = null;
let httpPort = 8888;
let httpAccessToken = '';
const allowedIPs = new Set<string>();
let httpServerEnabled = false; // Web 访问开关（默认关闭）
let selectedServerIPs = new Set<string>(); // 用户选择的服务器IP（用于访问控制）
let allowRemoteCreateSession = true; // 是否允许远程创建会话
let maxRemoteConnections = 0; // 最大远程连接数（0 = 不限制）
let minimizeToTrayOnClose = true; // 点击关闭按钮时最小化到托盘（默认开启）
let hideToPrimary = false; // 隐藏到主显示器而非当前显示器

// WebSocket 客户端追踪
interface WsClientInfo {
  ws: WebSocket;
  ip: string;
  connectedAt: Date;
  id: string;
}
const wsClients: Map<string, WsClientInfo> = new Map();

// 确保窗口在可见屏幕范围内
function ensureWindowVisible() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const displays = screen.getAllDisplays();

  // 检查窗口是否在任何可见屏幕范围内
  let isVisible = false;
  for (const display of displays) {
    const { x, y, width, height } = display.workArea;
    // 窗口至少有一部分在屏幕可见区域内
    if (bounds.x + bounds.width > x && bounds.x < x + width &&
        bounds.y + bounds.height > y && bounds.y < y + height &&
        bounds.width > 50 && bounds.height > 50) {
      isVisible = true;
      break;
    }
  }

  if (!isVisible) {
    // 窗口不可见，重置到主屏幕中央
    const primary = screen.getPrimaryDisplay();
    const { width: sw, height: sh } = primary.workAreaSize;
    const newWidth = 1200;
    const newHeight = 800;
    const newX = primary.workArea.x + Math.floor((sw - newWidth) / 2);
    const newY = primary.workArea.y + Math.floor((sh - newHeight) / 2);

    // 重置隐藏状态
    if (windowManager) {
      windowManager.resetHiddenState();
    }

    mainWindow.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight });
    mainWindow.show();
    mainWindow.focus();
    console.log('Window was off-screen, repositioned to center');
  }
}

// 创建托盘图标
function createTray() {
  // 创建一个简单的 16x16 托盘图标
  const iconSize = 16;
  const canvas = Buffer.alloc(iconSize * iconSize * 4);
  // 绘制一个简单的圆形图标
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = (y * iconSize + x) * 4;
      if (dist < 6.5) {
        // 蓝色圆形 #58a6ff
        canvas[offset] = 0x58;
        canvas[offset + 1] = 0xa6;
        canvas[offset + 2] = 0xff;
        canvas[offset + 3] = 255;
      } else if (dist < 7.5) {
        // 边缘渐变
        const alpha = Math.floor(255 * (7.5 - dist));
        canvas[offset] = 0x58;
        canvas[offset + 1] = 0xa6;
        canvas[offset + 2] = 0xff;
        canvas[offset + 3] = alpha;
      }
    }
  }
  const icon = nativeImage.createFromBuffer(canvas, { width: iconSize, height: iconSize });

  tray = new Tray(icon);
  tray.setToolTip('Claude Code CLI Manager');

  updateTrayMenu();

  // 左键点击切换窗口可见性
  tray.on('click', () => {
    if (!mainWindow) return;
    const isWindowHidden = windowManager?.isHidden() ?? false;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      // 窗口可见时：如果隐藏状态则恢复，否则最小化到托盘
      if (isWindowHidden) {
        windowManager?.restore();
        mainWindow.focus();
      } else {
        mainWindow.hide();
      }
    } else {
      // 窗口不可见时：恢复并显示
      ensureWindowVisible();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // 右键点击显示上下文菜单
  tray.on('right-click', () => {
    updateTrayMenu();
  });
}

// 更新托盘菜单
function updateTrayMenu() {
  if (!tray) return;

  const runningCount = processManager
    ? Array.from((processManager as any).sessions.values())
        .filter((s: any) => s.status === SessionStatus.RUNNING).length
    : 0;

  const isVisible = mainWindow?.isVisible() && !mainWindow?.isMinimized() && !(windowManager?.isHidden() ?? false);
  const openAtLogin = app.getLoginItemSettings().openAtLogin;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? '隐藏窗口' : '显示窗口',
      click: () => {
        if (!mainWindow) return;
        if (isVisible) {
          mainWindow.hide();
        } else {
          ensureWindowVisible();
          if (windowManager?.isHidden()) {
            windowManager.restore();
          }
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
        updateTrayMenu();
      },
    },
    {
      label: '新建会话',
      click: () => {
        if (!mainWindow) return;
        ensureWindowVisible();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('tray:create-session');
      },
    },
    { type: 'separator' },
    {
      label: `运行中会话: ${runningCount}`,
      enabled: false,
    },
    {
      label: '一键贴边隐藏',
      click: () => {
        if (!mainWindow) return;
        let targetDisplay: Electron.Display;

        if (hideToPrimary) {
          // 使用主显示器
          targetDisplay = screen.getPrimaryDisplay();
        } else {
          // 使用当前显示器（鼠标所在位置）
          const displays = screen.getAllDisplays();
          const cursorPos = screen.getCursorScreenPoint();
          targetDisplay = displays[0];
          for (const display of displays) {
            const { x, y, width, height } = display.bounds;
            if (cursorPos.x >= x && cursorPos.x < x + width &&
                cursorPos.y >= y && cursorPos.y < y + height) {
              targetDisplay = display;
              break;
            }
          }
        }
        windowManager?.hideToEdge('right', targetDisplay);
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          openAsHidden: false,
        });
      },
    },
    {
      label: '关闭时最小化到托盘',
      type: 'checkbox',
      checked: minimizeToTrayOnClose,
      click: (menuItem) => {
        minimizeToTrayOnClose = menuItem.checked;
        // 保存设置
        try {
          const fsModule = require('fs');
          const configDir = path.join(require('os').homedir(), '.claude-code-manager');
          const configFile = path.join(configDir, 'config.json');
          let config: any = {};
          if (fsModule.existsSync(configFile)) {
            config = JSON.parse(fsModule.readFileSync(configFile, 'utf-8'));
          }
          config.minimizeToTrayOnClose = menuItem.checked;
          fsModule.writeFileSync(configFile, JSON.stringify(config, null, 2));
        } catch { /* ignore */ }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        // 强制关闭所有会话并退出
        if (processManager) {
          processManager.killAllSessions();
        }
        // 销毁托盘
        if (tray) {
          tray.destroy();
          tray = null;
        }
        // 关闭HTTP服务器
        stopHttpServer(true);
        // 强制退出进程
        app.exit(0);
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// 将窗口隐藏到屏幕边缘（使用 WindowManager）
function hideWindowToEdge(targetDisplay: any, direction: string) {
  if (!windowManager) return;
  windowManager.hideToEdge(direction as 'left' | 'right' | 'bottom' | 'top', targetDisplay);
}

// 恢复窗口（使用 WindowManager）
function restoreWindow() {
  if (!windowManager) return;
  windowManager.restore();
}

// 导出 sendToRenderer 供 ProcessManager 使用
export function sendToRenderer(channel: string, data: any) {
  mainWindow?.webContents.send(channel, data);
  // 同时广播到 WebSocket 客户端（浏览器远程访问）
  broadcastToWs({ channel, data });
}

// WebSocket 广播
function broadcastToWs(message: any) {
  if (!wss) return;
  const msg = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(msg);
    }
  }
}

// ==================== 主进程入口 ====================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 创建窗口管理器并启用贴边隐藏功能
  windowManager = new WindowManager(mainWindow, {
    restoreWidth: 500,
    restoreHeight: 600,
    handleSize: 10,
    edgeThreshold: 10,
    autoHideDelayMs: 1000,
  });
  windowManager.setupAutoHide();

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 启动后检查窗口是否在可见区域内
  mainWindow.once('ready-to-show', () => {
    ensureWindowVisible();
  });

  // 创建系统托盘
  if (!tray) {
    createTray();
  }

  // 主窗口关闭前确认（有运行中会话时弹出确认框）
  mainWindow.on('close', (e: any) => {
    // 如果设置最小化到托盘，则隐藏窗口而不是退出
    if (minimizeToTrayOnClose) {
      e.preventDefault();
      mainWindow?.hide();
      return;
    }

    if (!processManager) return;
    const runningCount = Array.from((processManager as any).sessions.values())
      .filter((s: any) => s.status === SessionStatus.RUNNING).length;
    if (runningCount > 0) {
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'question',
        title: '确认退出',
        message: `当前有 ${runningCount} 个会话正在运行。`,
        detail: '关闭窗口将终止所有运行中的会话，确定退出吗？',
        buttons: ['取消', '退出'],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice === 0) {
        e.preventDefault();
      } else {
        if (tray) { tray.destroy(); tray = null; }
      }
    }
  });
}

function initIPC() {
  if (!processManager) return;
  const pm = processManager; // 本地引用，TypeScript 知道此处非 null

  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_: any, options: any) => {
    // 检查工作目录冲突
    const workDir = options.workDir || require('os').homedir();
    const conflicts = pm.checkWorkDirConflict(workDir);
    if (conflicts.length > 0 && !options.skipConflictCheck) {
      const conflictNames = conflicts.map(c =>
        `"${c.sessionName}" (${c.workDir}) - ${c.conflictType === 'same' ? '相同目录' : c.conflictType === 'child' ? '子目录' : '父目录'}`
      ).join('\n');
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'warning',
        title: '工作目录冲突',
        message: '检测到工作目录与其他运行中的会话重叠：',
        detail: `${conflictNames}\n\n重叠的工作目录可能导致文件操作互相干扰。\n是否仍要创建此会话？`,
        buttons: ['取消', '仍然创建'],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice === 0) {
        throw new Error('WORKDIR_CONFLICT');
      }
    }
    return pm.createSession(options);
  });

  ipcMain.handle(IPC_CHANNELS.KILL_SESSION, async (_: any, sessionId: string) => {
    const result = await pm.killSession(sessionId);
    // 从所有分组中移除该会话
    if (groupManager) {
      groupManager.removeSessionFromAllGroups(sessionId);
    }
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, async () => {
    return pm.getSessions();
  });

  ipcMain.handle(IPC_CHANNELS.GET_SESSION_OUTPUT, async (_: any, sessionId: string) => {
    return pm.getSessionOutput(sessionId);
  });

  ipcMain.on(IPC_CHANNELS.SEND_INPUT, (_event: any, sessionId: string, data: string) => {
    pm.sendInput(sessionId, data);
  });

  ipcMain.on(IPC_CHANNELS.RESIZE_SESSION, (_event: any, sessionId: string, cols: number, rows: number) => {
    pm.resizeSession(sessionId, cols, rows);
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_WORKDIR, async (): Promise<string | null> => {
    // 从localStorage获取用户设置的默认起始目录
    let defaultPath = app.getPath('home');
    try {
      const fsModule = require('fs');
      const configDir = path.join(require('os').homedir(), '.claude-code-manager');
      const configFile = path.join(configDir, 'config.json');
      if (fsModule.existsSync(configFile)) {
        const config = JSON.parse(fsModule.readFileSync(configFile, 'utf-8'));
        if (config.defaultBrowseDir) {
          defaultPath = config.defaultBrowseDir;
        }
      }
    } catch { /* use default */ }

    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      defaultPath,
    });
    return result.filePaths[0] || null;
  });

  ipcMain.on(IPC_CHANNELS.SET_NOTE, (_event: any, sessionId: string, note: string) => {
    pm.setNote(sessionId, note);
  });

  // 批量操作处理
  ipcMain.handle(IPC_CHANNELS.BATCH_CREATE_SESSIONS, async (_: any, sessionsConfig: any[]) => {
    const results = [];
    for (const config of sessionsConfig) {
      try {
        const session = await pm.createSession(config);
        results.push({ success: true, session });
      } catch (error: any) {
        results.push({ success: false, error: error?.message || String(error) });
      }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_KILL_SESSIONS, async (_: any, sessionIds: string[]) => {
    const results = [];
    for (const sessionId of sessionIds) {
      try {
        await pm.killSession(sessionId);
        results.push({ success: true, sessionId });
      } catch (error: any) {
        results.push({ success: false, sessionId, error: error?.message || String(error) });
      }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_PAUSE_SESSIONS, async (_: any, sessionIds: string[]) => {
    const results: Array<{ success: boolean; sessionId: string; error?: string; session?: any }> = [];
    for (const sessionId of sessionIds) {
      try {
        // 这里需要实现暂停会话的功能
        // 暂时返回占位符
        results.push({ success: false, sessionId, error: '暂停功能未实现' });
      } catch (error: any) {
        results.push({ success: false, sessionId, error: error?.message || String(error) });
      }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_RESUME_SESSIONS, async (_: any, sessionIds: string[]) => {
    const results: Array<{ success: boolean; sessionId: string; error?: string; session?: any }> = [];
    for (const sessionId of sessionIds) {
      try {
        // 这里需要实现恢复会话的功能
        // 暂时返回占位符

        results.push({ success: false, sessionId, error: '恢复功能未实现' });
      } catch (error: any) {
        results.push({ success: false, sessionId, error: error?.message || String(error) });
      }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_EXPORT_LOGS, async (_: any, { sessionIds, format: _format = 'text' }: { sessionIds: string[], format: string }) => {
    const results = [];
    for (const sessionId of sessionIds) {
      try {
        const log = pm.getSessionOutput(sessionId);
        results.push({ success: true, sessionId, log });
      } catch (error: any) {
        results.push({ success: false, sessionId, error: error?.message || String(error) });
      }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_SET_NOTES, async (_: any, { sessionIds, note }: { sessionIds: string[], note: string }) => {
    const results = [];
    for (const sessionId of sessionIds) {
      try {
        pm.setNote(sessionId, note);
        results.push({ success: true, sessionId });
      } catch (error: any) {
        results.push({ success: false, sessionId, error: error?.message || String(error) });
      }
    }
    return results;
  });

  // 外部 Claude Code 检测
  ipcMain.handle(IPC_CHANNELS.CHECK_EXTERNAL_CLAUDE, async (_: any, workDir: string) => {
    return pm.checkExternalClaudeCode(workDir);
  });

  // 性能监控处理
  ipcMain.handle(IPC_CHANNELS.GET_SYSTEM_METRICS, async () => {
    if (!performanceMonitor) {
      throw new Error('Performance monitor not initialized');
    }
    return performanceMonitor.getSystemMetrics();
  });

  ipcMain.handle(IPC_CHANNELS.GET_SESSION_METRICS, async () => {
    if (!performanceMonitor) {
      throw new Error('Performance monitor not initialized');
    }
    return performanceMonitor.getSessionMetrics();
  });

  ipcMain.handle(IPC_CHANNELS.START_MONITORING, async (_: any, interval = 5000) => {
    if (!performanceMonitor) {
      throw new Error('Performance monitor not initialized');
    }
    performanceMonitor.startMonitoring(interval);
    return { success: true, message: '性能监控已启动', interval };
  });

  ipcMain.handle(IPC_CHANNELS.STOP_MONITORING, async () => {
    if (!performanceMonitor) {
      throw new Error('Performance monitor not initialized');
    }
    performanceMonitor.stopMonitoring();
    return { success: true, message: '性能监控已停止' };
  });

  // 分组管理处理
  ipcMain.handle(IPC_CHANNELS.CREATE_GROUP, async (_: any, options: any) => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.createGroup(options);
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_GROUP, async (_: any, { groupId, updates }: any) => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.updateGroup(groupId, updates);
  });

  ipcMain.handle(IPC_CHANNELS.DELETE_GROUP, async (_: any, groupId: string) => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.deleteGroup(groupId);
  });

  ipcMain.handle(IPC_CHANNELS.GET_GROUPS, async () => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.getGroups();
  });

  ipcMain.handle(IPC_CHANNELS.ADD_SESSION_TO_GROUP, async (_: any, { groupId, sessionId }: any) => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.addSessionToGroup(groupId, sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.REMOVE_SESSION_FROM_GROUP, async (_: any, { groupId, sessionId }: any) => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.removeSessionFromGroup(groupId, sessionId);
  });

  // ========== 远程访问控制 IPC ==========

  // 获取远程访问状态
  ipcMain.handle('remote:getStatus', async () => {
    const net = require('os').networkInterfaces();
    const localIPs: string[] = [];
    for (const name in net) {
      for (const interf of net[name]) {
        if (interf.family === 'IPv4' && !interf.internal) {
          localIPs.push(interf.address);
        }
      }
    }

    // 根据 IP 去重，保留最新的连接
    const uniqueClients = new Map<string, { id: string; ip: string; connectedAt: Date }>();
    for (const client of wsClients.values()) {
      const existing = uniqueClients.get(client.ip);
      if (!existing || client.connectedAt > existing.connectedAt) {
        uniqueClients.set(client.ip, {
          id: client.id,
          ip: client.ip,
          connectedAt: client.connectedAt,
        });
      }
    }

    return {
      enabled: httpServerEnabled,
      running: !!httpServer,
      port: httpPort,
      token: httpAccessToken,
      localIPs,
      clientCount: wsClients.size, // 仍然返回实际连接数
      clients: Array.from(uniqueClients.values()).map(c => ({
        id: c.id,
        ip: c.ip,
        connectedAt: c.connectedAt.toISOString(),
      })),
    };
  });

  // 设置端口
  ipcMain.handle('remote:setPort', async (_: any, newPort: number) => {
    if (typeof newPort !== 'number' || newPort < 1024 || newPort > 65535) {
      return { success: false, error: '端口范围应为 1024-65535' };
    }
    // 检测端口是否可用
    const inUse = await checkPortInUse(newPort);
    if (inUse) {
      return { success: false, error: `端口 ${newPort} 已被占用` };
    }
    const wasRunning = !!httpServer && httpServerEnabled;
    if (httpServer) {
      stopHttpServer();
    }
    httpPort = newPort;
    if (wasRunning) {
      startHttpServer();
    }
    return { success: true, port: httpPort };
  });

  // 检测端口是否可用
  ipcMain.handle('remote:checkPort', async (_: any, port: number) => {
    const inUse = await checkPortInUse(port);
    return { port, inUse };
  });

  // 开关 Web 访问
  ipcMain.handle('remote:toggle', async (_: any, enabled: boolean) => {
    httpServerEnabled = enabled;
    if (enabled && !httpServer) {
      startHttpServer();
    } else if (!enabled && httpServer) {
      stopHttpServer(true); // 优雅关闭
    }
    return { success: true, enabled: httpServerEnabled, running: !!httpServer };
  });

  // 刷新令牌
  ipcMain.handle('remote:refreshToken', async () => {
    const crypto = require('crypto');
    httpAccessToken = crypto.randomBytes(16).toString('hex');
    // 持久化
    try {
      const fsModule = require('fs');
      const configDir = path.join(require('os').homedir(), '.claude-code-manager');
      const configFile = path.join(configDir, 'config.json');
      const existingConfig = fsModule.existsSync(configFile)
        ? JSON.parse(fsModule.readFileSync(configFile, 'utf-8')) : {};
      fsModule.writeFileSync(configFile,
        JSON.stringify({ ...existingConfig, accessToken: httpAccessToken }, null, 2));
    } catch { /* ignore */ }
    // 断开所有现有客户端（它们使用旧令牌）
    for (const [clientId, clientInfo] of wsClients) {
      try { clientInfo.ws.close(4003, 'Token refreshed'); } catch { /* ignore */ }
      wsClients.delete(clientId);
    }
    return { success: true, token: httpAccessToken };
  });

  // 断开指定客户端
  ipcMain.handle('remote:kickClient', async (_: any, clientId: string) => {
    const client = wsClients.get(clientId);
    if (client) {
      try { client.ws.close(4002, 'Kicked by admin'); } catch { /* ignore */ }
      wsClients.delete(clientId);
      return { success: true };
    }
    return { success: false, error: 'Client not found' };
  });

  // 断开所有客户端
  ipcMain.handle('remote:kickAll', async () => {
    for (const [_clientId, clientInfo] of wsClients) {
      try { clientInfo.ws.close(4002, 'Kicked by admin'); } catch { /* ignore */ }
    }
    wsClients.clear();
    return { success: true };
  });

  // 设置允许访问的服务器IP（用户选择的IP地址）
  ipcMain.handle('remote:setSelectedIPs', async (_: any, ips: string[]) => {
    const prevSize = selectedServerIPs.size;
    selectedServerIPs = new Set(ips);

    // 如果之前有选择但现在全部取消了，关闭服务器并通知远程客户端
    if (prevSize > 0 && selectedServerIPs.size === 0 && httpServer) {
      // 先通知所有远程客户端
      broadcastToWs({ channel: 'remote-access-closed', data: { reason: '所有访问地址已取消选择' } });
      // 断开所有客户端
      setTimeout(() => {
        for (const [_clientId, clientInfo] of wsClients) {
          try { clientInfo.ws.close(4004, 'All IPs deselected'); } catch { /* ignore */ }
        }
        wsClients.clear();
        stopHttpServer();
        httpServerEnabled = false;
      }, 500);
    }

    // 如果有选中的IP变化，踢出通过未选中IP连接的客户端
    if (selectedServerIPs.size > 0 && httpServer) {
      // 只限制新连接，不踢出已连接的客户端
    }

    return { success: true, ips: [...selectedServerIPs] };
  });

  // 获取当前选中的服务器IP
  ipcMain.handle('remote:getSelectedIPs', async () => {
    return [...selectedServerIPs];
  });

  // 获取/设置通用设置（同步到远程Web界面）
  ipcMain.handle('settings:getGeneral', async () => {
    return {
      allowRemoteCreateSession,
      maxRemoteConnections,
      hideDirection: windowManager?.getHideDirection() ?? 'right',
      hideToPrimary,
    };
  });
  ipcMain.on('settings:broadcastGeneral', (_event: any, settings: any) => {
    // 更新主进程中的设置
    if (settings.allowRemoteCreateSession !== undefined) {
      allowRemoteCreateSession = settings.allowRemoteCreateSession;
    }
    if (settings.maxRemoteConnections !== undefined) {
      maxRemoteConnections = settings.maxRemoteConnections;
    }
    // 更新关闭按钮行为
    if (settings.minimizeToTrayOnClose !== undefined) {
      minimizeToTrayOnClose = settings.minimizeToTrayOnClose;
    }
    // 更新隐藏方向
    if (settings.hideDirection !== undefined && (settings.hideDirection === 'left' || settings.hideDirection === 'right')) {
      windowManager?.setHideDirection(settings.hideDirection);
    }
    // 更新隐藏目标显示器
    if (settings.hideToPrimary !== undefined) {
      hideToPrimary = settings.hideToPrimary;
    }
    // 持久化 defaultBrowseDir 到 config.json
    if (settings.defaultBrowseDir !== undefined) {
      try {
        const fsModule = require('fs');
        const configDir = path.join(require('os').homedir(), '.claude-code-manager');
        const configFile = path.join(configDir, 'config.json');
        let config: any = {};
        if (fsModule.existsSync(configFile)) {
          config = JSON.parse(fsModule.readFileSync(configFile, 'utf-8'));
        }
        if (settings.defaultBrowseDir) {
          config.defaultBrowseDir = settings.defaultBrowseDir;
        } else {
          delete config.defaultBrowseDir;
        }
        // 同时保存 hideDirection
        if (settings.hideDirection) {
          config.hideDirection = settings.hideDirection;
        }
        fsModule.writeFileSync(configFile, JSON.stringify(config, null, 2));
      } catch { /* ignore */ }
    }
    // 广播通用设置到所有远程客户端（包含 allowRemoteCreateSession 用于 UI 控制）
    broadcastToWs({ channel: 'settings:general', data: {
      ...settings,
      allowRemoteCreateSession,
      maxRemoteConnections,
      hideDirection: windowManager?.getHideDirection() ?? 'right',
    } });
  });

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('window:close', () => mainWindow?.close());

  // 展开会话时调整窗口大小（避免全屏）
  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (!mainWindow) return;

    // 如果窗口已最大化，先取消最大化
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }

    // 获取当前屏幕尺寸
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // 计算新尺寸：屏幕的 80% 或固定值 1400x900，取较小值
    const targetWidth = Math.min(1400, Math.floor(screenWidth * 0.8));
    const targetHeight = Math.min(900, Math.floor(screenHeight * 0.8));

    // 计算居中位置
    const x = Math.floor((screenWidth - targetWidth) / 2);
    const y = Math.floor((screenHeight - targetHeight) / 2);

    // 设置新尺寸（不保存 originalBounds，让展开视图独立管理）
    mainWindow.setBounds({ x, y, width: targetWidth, height: targetHeight });
  });

  // 收起会话时恢复原始窗口大小
  ipcMain.on(IPC_CHANNELS.WINDOW_UNMAXIMIZE, () => {
    if (!mainWindow) return;

    // 如果窗口已最大化，先取消最大化
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }

    // 恢复原始尺寸
    if (mainWindow.originalBounds) {
      mainWindow.setBounds(mainWindow.originalBounds);
    } else {
      // 默认恢复为 1200x800
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
      const targetWidth = 1200;
      const targetHeight = 800;
      const x = Math.floor((screenWidth - targetWidth) / 2);
      const y = Math.floor((screenHeight - targetHeight) / 2);
      mainWindow.setBounds({ x, y, width: targetWidth, height: targetHeight });
    }
  });

  // 窗口贴边隐藏切换
  ipcMain.on('window:toggle-auto-hide', () => {
    if (!mainWindow || !windowManager) return;
    windowManager.toggleAutoHide();
    if (!windowManager.isAutoHideEnabled() && windowManager.isHidden()) {
      windowManager.resetHiddenState();
      // 恢复窗口大小
      mainWindow.setBounds({
        ...mainWindow.getBounds(),
        width: 1200,
        height: 800,
      });
    }
  });

  // 一键贴边隐藏（手动触发）
  ipcMain.on('window:hide-to-edge', () => {
    if (!mainWindow || !windowManager) return;

    let targetDisplay: Electron.Display;
    if (hideToPrimary) {
      // 使用主显示器
      targetDisplay = screen.getPrimaryDisplay();
    } else {
      // 使用当前显示器（鼠标所在位置）
      const displays = screen.getAllDisplays();
      const cursorPos = screen.getCursorScreenPoint();
      targetDisplay = displays[0];
      for (const display of displays) {
        const { x, y, width, height } = display.bounds;
        if (cursorPos.x >= x && cursorPos.x < x + width &&
            cursorPos.y >= y && cursorPos.y < y + height) {
          targetDisplay = display;
          break;
        }
      }
    }

    // 使用 WindowManager 隐藏
    windowManager.hideToEdge('right', targetDisplay);
  });

  // 恢复窗口
  ipcMain.on('window:restore-window', () => {
    if (!mainWindow || !windowManager || !windowManager.isHidden()) return;
    windowManager.restore();
  });

  // 窗口位置变化时自动恢复（从隐藏状态）
  mainWindow?.on('move', () => {
    if (!windowManager) return;
    windowManager.handleWindowMove();
  });

  // 窗口点击事件 - 隐藏状态下点击窗口可恢复
  mainWindow?.on('focus', () => {
    if (!windowManager) return;
    windowManager.handleWindowFocus();
  });
}

// ==================== HTTP/WebSocket 服务器 ====================

// 检测端口是否被占用
function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '0.0.0.0');
  });
}

// 辅助函数：收集请求体
function collectBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: any) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

// 辅助函数：代理请求到 Vite 开发服务器
function proxyToVite(req: any, res: any) {
  const http = require('http');
  const viteUrl = new URL(req.url!, `http://localhost:5173`);
  const options = {
    hostname: 'localhost',
    port: 5173,
    path: viteUrl.pathname + viteUrl.search,
    method: req.method,
    headers: { ...req.headers, host: 'localhost:5173' },
  };
  const proxy = http.request(options, (proxyRes: any) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway - Vite dev server not available');
  });
  req.pipe(proxy);
}

async function startHttpServer() {
  if (httpServer) return;
  if (!processManager) {
    console.error('Cannot start HTTP server: processManager not initialized');
    return;
  }
  const pm = processManager; // 本地引用

  const http = require('http');
  const url = require('url');
  const crypto = require('crypto');
  const WebSocket = require('ws');

  // 生成或加载访问令牌（持久化到配置文件）
  const fsModule = require('fs');
  const osModule = require('os');
  const configDir = path.join(osModule.homedir(), '.claude-code-manager');
  const configFile = path.join(configDir, 'config.json');
  try {
    if (!fsModule.existsSync(configDir)) {
      fsModule.mkdirSync(configDir, { recursive: true });
    }
    if (fsModule.existsSync(configFile)) {
      const config = JSON.parse(fsModule.readFileSync(configFile, 'utf-8'));
      if (config.accessToken) {
        httpAccessToken = config.accessToken;
      }
    }
  } catch { /* ignore */ }
  if (!httpAccessToken) {
    httpAccessToken = crypto.randomBytes(16).toString('hex');
  }
  // 保存令牌到配置文件
  try {
    const existingConfig = fsModule.existsSync(configFile)
      ? JSON.parse(fsModule.readFileSync(configFile, 'utf-8')) : {};
    fsModule.writeFileSync(configFile,
      JSON.stringify({ ...existingConfig, accessToken: httpAccessToken }, null, 2));
  } catch { /* ignore */ }

  const server = http.createServer(async (req: any, res: any) => {
    const parsedUrl = url.parse(req.url!, true);
    const clientIP = req.socket.remoteAddress || 'unknown';
    const headers = req.headers;
    const method = req.method;

    // 允许跨域
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // 验证令牌
    const authHeader = headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const ipAllowed = allowedIPs.has(clientIP);
    // 从查询参数中获取 token
    const queryToken = parsedUrl.query?.token || '';
    const isAuthed = token === httpAccessToken || queryToken === httpAccessToken || ipAllowed;

    // ---- 公开端点 ----

    // 检查请求的目标IP是否在用户选中的IP列表中
    const hostHeader = headers.host || '';
    const targetIP = hostHeader.split(':')[0]; // 从 Host 头提取IP
    const isTargetIPAllowed = selectedServerIPs.size === 0 || selectedServerIPs.has(targetIP);

    // 如果用户选择了特定IP但当前请求的目标IP不在列表中，直接断开连接（模拟服务不可达）
    if (selectedServerIPs.size > 0 && !isTargetIPAllowed) {
      // 销毁连接，不发送任何响应，让浏览器显示"无法访问此网站"
      req.socket.destroy();
      return;
    }

    // 健康检查端点 - 对所有IP开放
    if (pathname === '/api/status') {
      const interfaces = require('os').networkInterfaces();
      const localIPs: string[] = [];
      for (const name in interfaces) {
        for (const net of interfaces[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            localIPs.push(net.address);
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        version: '0.1.0',
        localIPs,
        port: httpPort,
        accessEnabled: selectedServerIPs.size === 0 || isTargetIPAllowed,
        accessToken: httpAccessToken,
        clientIP,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // 如果启用了IP白名单功能，检查客户端IP是否被允许
    // 注意：allowedIPs 应该包含用户选择的IP地址
    if (allowedIPs.size > 0 && !allowedIPs.has(clientIP)) {
      // IP不在白名单中，拒绝访问（除了/login.html和/api/allow-ip等特殊端点）
      if (pathname !== '/login.html' && pathname !== '/api/allow-ip' && pathname !== '/api/remove-ip') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'IP address not allowed' }));
        return;
      }
    }

    // ---- 前端页面代理（浏览器远程访问） ----

    // 根路径和前端资源 - 需要认证
    if (pathname === '/' || pathname === '/index.html') {
      if (!isAuthed) {
        res.writeHead(302, { Location: '/login.html' });
        res.end();
        return;
      }
      proxyToVite(req, res);
      return;
    }

    // 前端静态资源（JS/CSS/等） - 不需要认证
    if (pathname.startsWith('/@') || pathname.startsWith('/src/') ||
        pathname.startsWith('/node_modules/') || pathname.endsWith('.js') ||
        pathname.endsWith('.css') || pathname.endsWith('.map') ||
        pathname.endsWith('.svg') || pathname.endsWith('.png') ||
        pathname.endsWith('.ico') || pathname.endsWith('.woff') ||
        pathname.endsWith('.woff2') || pathname.startsWith('/__')) {
      proxyToVite(req, res);
      return;
    }

    // 登录页面
    if (pathname === '/login.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getLoginPage());
      return;
    }

    // 登录验证
    if (pathname === '/api/login' && method === 'POST') {
      const body = await collectBody(req);
      try {
        const { token: inputToken } = JSON.parse(body);
        if (inputToken === httpAccessToken) {
          allowedIPs.add(clientIP);
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
      return;
    }

    // ---- 需要认证的 API 端点 ----
    if (!isAuthed) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // 获取会话列表
    if (pathname === '/api/sessions' && method === 'GET') {
      const sessions = pm.getSessions();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions }));
      return;
    }

    // 创建新会话
    if (pathname === '/api/sessions' && method === 'POST') {
      if (!allowRemoteCreateSession) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '远程创建会话已被管理员禁用' }));
        return;
      }
      const body = await collectBody(req);
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

    // 获取会话输出
    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/output')) {
      const sessionId = pathname.split('/')[3];
      const output = pm.getSessionOutput(sessionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessionId, output }));
      return;
    }

    // 向会话发送输入
    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/input') && method === 'POST') {
      const body = await collectBody(req);
      try {
        const data = JSON.parse(body);
        const sessionId = pathname.split('/')[3];
        pm.sendInput(sessionId, data.input);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    // 设置会话备注
    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/note') && method === 'POST') {
      const body = await collectBody(req);
      try {
        const { note } = JSON.parse(body);
        const sessionId = pathname.split('/')[3];
        pm.setNote(sessionId, note);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    // 调整终端大小
    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/resize') && method === 'POST') {
      const body = await collectBody(req);
      try {
        const { cols, rows } = JSON.parse(body);
        const sessionId = pathname.split('/')[3];
        pm.resizeSession(sessionId, cols, rows);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    // 关闭会话
    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/close') && method === 'POST') {
      const sessionId = pathname.split('/')[3];
      try {
        await pm.killSession(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to close session' }));
      }
      return;
    }

    // 添加 IP 到白名单
    if (pathname === '/api/allow-ip' && method === 'POST') {
      const body = await collectBody(req);
      try {
        const { ip } = JSON.parse(body);
        allowedIPs.add(ip);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ip }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    // 移除 IP 从白名单
    if (pathname === '/api/remove-ip' && method === 'DELETE') {
      const { ip } = query;
      if (ip && typeof ip === 'string') {
        allowedIPs.delete(ip);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ip }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'IP not specified' }));
      }
      return;
    }

    // 其他请求代理到 Vite
    proxyToVite(req, res);
  });

  // WebSocket 服务器
  const wsServer = new WebSocket.Server({ server });
  wss = wsServer;

  wsServer.on('connection', (ws: any, req: any) => {
    const parsedUrl = url.parse(req.url!, true);
    const token = parsedUrl.query?.token || '';
    const clientIP = req.socket.remoteAddress || 'unknown';

    // 检查最大连接数限制
    if (maxRemoteConnections > 0 && wsClients.size >= maxRemoteConnections) {
      // 先发送友好提示消息，然后关闭连接
      ws.send(JSON.stringify({
        channel: 'connection-rejected',
        data: { reason: `当前连接数已达上限 (${maxRemoteConnections})，请稍后再试` },
      }));
      setTimeout(() => {
        try { ws.close(4005, 'Max connections reached'); } catch { /* ignore */ }
      }, 500);
      return;
    }

    // 如果启用了IP白名单（allowedIPs不为空），检查客户端IP是否被允许
    if (allowedIPs.size > 0 && !allowedIPs.has(clientIP)) {
      // IP不在白名单中，拒绝连接（即使有有效令牌）
      ws.close(4003, 'IP address not allowed');
      return;
    }
    
    // 检查令牌（如果IP在白名单中或没有启用白名单，需要有效令牌）
    if (token !== httpAccessToken) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    // 生成客户端 ID 并追踪
    const clientId = crypto.randomBytes(8).toString('hex');
    const clientInfo: WsClientInfo = {
      ws,
      ip: clientIP,
      connectedAt: new Date(),
      id: clientId,
    };
    wsClients.set(clientId, clientInfo);

    console.log(`WebSocket client connected from ${clientIP} (id: ${clientId}), total: ${wsClients.size}`);

    // 发送当前所有会话状态
    if (processManager) {
      const sessions = processManager.getSessions();
      ws.send(JSON.stringify({
        channel: 'session:list',
        data: { sessions },
      }));
      // 发送当前远程创建会话设置
      ws.send(JSON.stringify({
        channel: 'settings:general',
        data: {
          allowRemoteCreateSession,
          maxRemoteConnections,
        },
      }));
    }

    ws.on('message', (message: any) => {
      try {
        const msg = JSON.parse(message.toString());
        // 处理来自浏览器的 WebSocket 命令
        handleWsMessage(ws, msg);
      } catch (e) {
        console.error('Invalid WebSocket message:', e);
      }
    });

    ws.on('close', () => {
      wsClients.delete(clientId);
      console.log(`WebSocket client disconnected from ${clientIP} (id: ${clientId}), total: ${wsClients.size}`);
    });
  });

  // 尝试启动服务器
  server.on('error', (err: any) => {
    console.error('HTTP server error:', err);
    if (err.code === 'EADDRINUSE') {
      httpPort = Math.floor(Math.random() * 5000) + 10000;
      setTimeout(() => startHttpServer(), 1000);
    }
  });

  server.listen(httpPort, () => {
    console.log(`HTTP/WebSocket server started on port ${httpPort}`);
    console.log(`Access token: ${httpAccessToken}`);

    const interfaces = require('os').networkInterfaces();
    const localIPs: string[] = [];
    for (const name in interfaces) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          localIPs.push(net.address);
        }
      }
    }

    localIPs.forEach(ip => {
      console.log(`Access via: http://${ip}:${httpPort}`);
    });
  });

  httpServer = server;
}

// 处理来自浏览器的 WebSocket 命令
function handleWsMessage(ws: any, msg: any) {
  const { action, id, data } = msg;
  if (!processManager) return;
  const pm = processManager; // 本地引用

  (async () => {
    try {
      let result: any;
      switch (action) {
        case 'session:create':
          // 检查是否允许远程创建会话
          if (!allowRemoteCreateSession) {
            ws.send(JSON.stringify({ channel: 'ws:response', id, data: {
              success: false,
              error: '远程创建会话已被管理员禁用',
            }}));
            break;
          }
          // 检查工作目录冲突（浏览器端不弹确认框，返回冲突信息）
          {
            const createWorkDir = data?.workDir || require('os').homedir();
            const createConflicts = pm.checkWorkDirConflict(createWorkDir);
            if (createConflicts.length > 0 && !data?.skipConflictCheck) {
              ws.send(JSON.stringify({ channel: 'ws:response', id, data: {
                success: false,
                error: 'WORKDIR_CONFLICT',
                conflicts: createConflicts,
              }}));
              break;
            }
            result = await pm.createSession(data || {});
            ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true, session: result } }));
          }
          break;
        case 'session:kill':
          await pm.killSession(data.sessionId);
          // 从所有分组中移除该会话
          if (groupManager) {
            groupManager.removeSessionFromAllGroups(data.sessionId);
          }
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        case 'session:list':
          result = pm.getSessions();
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { sessions: result } }));
          break;
        case 'session:output':
          result = pm.getSessionOutput(data.sessionId);
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { output: result } }));
          break;
        case 'session:input':
          pm.sendInput(data.sessionId, data.input);
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        case 'session:note':
          pm.setNote(data.sessionId, data.note);
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        case 'session:resize':
          pm.resizeSession(data.sessionId, data.cols, data.rows);
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        // 性能监控
        case 'metrics:system':
          result = performanceMonitor ? await performanceMonitor.getSystemMetrics() : {};
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: result }));
          break;
        case 'metrics:session':
          result = performanceMonitor ? await performanceMonitor.getSessionMetrics() : [];
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { metrics: result } }));
          break;
        case 'metrics:start':
          if (performanceMonitor) performanceMonitor.startMonitoring(data?.interval || 5000);
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        case 'metrics:stop':
          if (performanceMonitor) performanceMonitor.stopMonitoring();
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        // 分组管理
        case 'group:create':
          result = groupManager ? groupManager.createGroup(data) : null;
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { group: result } }));
          break;
        case 'group:update':
          result = groupManager ? groupManager.updateGroup(data.groupId, data.updates) : null;
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { group: result } }));
          break;
        case 'group:delete':
          result = groupManager ? groupManager.deleteGroup(data.groupId) : false;
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: result } }));
          break;
        case 'group:list':
          result = groupManager ? groupManager.getGroups() : [];
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { groups: result } }));
          break;
        case 'group:addSession':
          result = groupManager ? groupManager.addSessionToGroup(data.groupId, data.sessionId) : false;
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: result } }));
          break;
        case 'group:removeSession':
          result = groupManager ? groupManager.removeSessionFromGroup(data.groupId, data.sessionId) : false;
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: result } }));
          break;
        default:
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { error: 'Unknown action' } }));
      }
    } catch (err: any) {
      ws.send(JSON.stringify({ channel: 'ws:response', id, data: { error: err?.message || String(err) } }));
    }
  })();
}

// 登录页面 HTML
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
    <h1>🖥️ Claude Code CLI Manager</h1>
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
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          window.location.href = '/?token=' + encodeURIComponent(token);
        } else {
          errEl.style.display = 'block';
        }
      } catch (e) {
        errEl.textContent = '网络错误';
        errEl.style.display = 'block';
      }
    }
  </script>
</body>
</html>`;
}

function stopHttpServer(graceful = false) {
  // 先广播关闭消息给所有客户端
  if (graceful && wss) {
    broadcastToWs({ channel: 'remote-access-closed', data: { reason: '远程访问已关闭' } });
  }

  // 关闭所有 WebSocket 连接
  if (wss) {
    for (const client of wss.clients) {
      try {
        client.close(4004, graceful ? 'Server shutting down' : 'Server stopped');
      } catch { /* ignore */ }
    }
    // 强制关闭所有连接
    wss.close(() => {
      wss = null;
    });
  }

  // 关闭 HTTP 服务器
  if (httpServer) {
    // 关闭所有保持活动的连接
    httpServer.closeAllConnections?.();
    httpServer.close(() => {
      httpServer = null;
      console.log('HTTP/WebSocket server stopped');
    });
  }
}

// ==================== 主进程入口 ====================

// 单实例锁 - 阻止重复启动
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...');
  // 不能在 app ready 之前使用 dialog，直接退出
  app.exit(1);
} else {
  app.on('second-instance', () => {
    // 用户尝试启动第二个实例时，聚焦到已有窗口
    if (mainWindow) {
      ensureWindowVisible();
      if (windowManager?.isHidden()) {
        windowManager.restore();
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

console.log('Electron app object:', app);
console.log('app.whenReady:', app?.whenReady);

if (!app || !app.whenReady) {
  console.error('Electron app object is not properly initialized!');
  process.exit(1);
}

app.whenReady().then(() => {
  console.log('Electron app is ready');
  processManager = new ProcessManager();
  performanceMonitor = new PerformanceMonitor(processManager);
  groupManager = new GroupManager();
  createWindow();
  initIPC();
  
  if (httpServerEnabled) {
    startHttpServer();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (httpServerEnabled) {
        startHttpServer();
      }
    }
  });
});

// 全局错误处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  // 可以在这里发送错误通知到渲染进程
  if (mainWindow) {
    try {
      mainWindow.webContents.send('error:uncaught', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      // 忽略发送错误时的错误
    }
  }
});

process.on('unhandledRejection', (reason, _promise) => {
  console.error('未处理的Promise拒绝:', reason);
  // 记录但不崩溃
});

app.on('before-quit', () => {
  stopHttpServer(true); // 优雅关闭
  // 关闭所有会话
  if (processManager) {
    processManager.killAllSessions();
  }
  // 销毁托盘
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on('window-all-closed', () => {
  if (processManager) {
    processManager.killAllSessions();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});