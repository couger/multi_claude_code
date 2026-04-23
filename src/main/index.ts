/**
 * Claude Code CLI Manager — 主进程入口（精简版）
 */

import { app, BrowserWindow, ipcMain, screen, dialog } from 'electron';
import path from 'path';
import os from 'os';
import { IPC_CHANNELS, APP_CONSTANTS } from './constants';
import { SessionStatus } from '../shared/constants';
import type { GeneralSettings } from '../shared/types';
import { ProcessManager } from './ProcessManager';
import { PerformanceMonitor } from './PerformanceMonitor';
import { GroupManager } from './GroupManager';
import { WindowManager } from './WindowManager';
import { configManager } from './ConfigManager';
import { getLocalIPv4s } from './utils';
import { createTray, updateTrayMenu, destroyTray, ensureWindowVisible, getDisplayAtCursor } from './TrayManager';
import { HttpServerManager, checkPortInUse } from './HttpServer';
import { diagnostics } from './Diagnostics';
import { AIAssistantManager } from './AIAssistantManager';

let mainWindow: BrowserWindow | null = null;
let windowManager: WindowManager | null = null;
let processManager: ProcessManager | null = null;
let performanceMonitor: PerformanceMonitor | null = null;
let groupManager: GroupManager | null = null;
let httpServerManager: HttpServerManager | null = null;
let aiAssistantManager: AIAssistantManager | null = null;

let minimizeToTrayOnClose = configManager.get('minimizeToTrayOnClose') ?? true;
let hideToPrimary = false;

// ==================== 导出：渲染进程通信 ====================

export function sendToRenderer(channel: string, data: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
  diagnostics.recordIPC(channel);
  httpServerManager?.broadcast({ channel, data });
}

// ==================== 窗口创建 ====================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: APP_CONSTANTS.DEFAULT_WINDOW_WIDTH,
    height: APP_CONSTANTS.DEFAULT_WINDOW_HEIGHT,
    minWidth: APP_CONSTANTS.MIN_WINDOW_WIDTH,
    minHeight: APP_CONSTANTS.MIN_WINDOW_HEIGHT,
    frame: false,
    transparent: false,
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  windowManager = new WindowManager(mainWindow, {
    restoreWidth: APP_CONSTANTS.RESTORE_WIDTH,
    restoreHeight: APP_CONSTANTS.RESTORE_HEIGHT,
    handleSize: APP_CONSTANTS.HANDLE_SIZE,
    edgeThreshold: APP_CONSTANTS.EDGE_THRESHOLD,
    autoHideDelayMs: APP_CONSTANTS.AUTO_HIDE_DELAY_MS,
  });
  windowManager.setupAutoHide();

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || `http://localhost:${APP_CONSTANTS.VITE_DEV_PORT}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.once('ready-to-show', () => {
    ensureWindowVisible(mainWindow!, windowManager ?? undefined);
  });

  if (!processManager) return;

  createTray(mainWindow, windowManager, processManager, {
    hideToPrimary,
    minimizeToTrayOnClose,
    onUpdateMinimizeToTray: (val) => { minimizeToTrayOnClose = val; },
  });

  mainWindow.on('close', (e: any) => {
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
        type: 'question', title: '确认退出',
        message: `当前有 ${runningCount} 个会话正在运行。`,
        detail: '关闭窗口将终止所有运行中的会话，确定退出吗？',
        buttons: ['取消', '退出'], defaultId: 0, cancelId: 0,
      });
      if (choice === 0) e.preventDefault();
      else destroyTray();
    }
  });

  // 窗口事件
  mainWindow.on('move', () => windowManager?.handleWindowMove());
  mainWindow.on('focus', () => windowManager?.handleWindowFocus());
}

// ==================== IPC 注册 ====================

function initIPC() {
  if (!processManager || !groupManager || !performanceMonitor) return;
  const pm = processManager;
  const gm = groupManager;
  const perfMon = performanceMonitor;

  // ---------- 会话管理 ----------

  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_: any, options: any) => {
    const workDir = options.workDir || os.homedir();
    const conflicts = pm.checkWorkDirConflict(workDir);
    if (conflicts.length > 0 && !options.skipConflictCheck) {
      const conflictNames = conflicts.map(c =>
        `"${c.sessionName}" (${c.workDir}) - ${c.conflictType === 'same' ? '相同目录' : c.conflictType === 'child' ? '子目录' : '父目录'}`
      ).join('\n');
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'warning', title: '工作目录冲突',
        message: '检测到工作目录与其他运行中的会话重叠：',
        detail: `${conflictNames}\n\n重叠的工作目录可能导致文件操作互相干扰。\n是否仍要创建此会话？`,
        buttons: ['取消', '仍然创建'], defaultId: 0, cancelId: 0,
      });
      if (choice === 0) throw new Error('WORKDIR_CONFLICT');
    }
    return pm.createSession(options);
  });

  ipcMain.handle(IPC_CHANNELS.KILL_SESSION, async (_: any, sessionId: string) => {
    const result = await pm.killSession(sessionId);
    gm.removeSessionFromAllGroups(sessionId);
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, async () => pm.getSessions());
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_OUTPUT, async (_: any, sessionId: string) => pm.getSessionOutput(sessionId));
  ipcMain.on(IPC_CHANNELS.SEND_INPUT, (_event: any, sessionId: string, data: string) => pm.sendInput(sessionId, data));
  ipcMain.on(IPC_CHANNELS.RESIZE_SESSION, (_event: any, sessionId: string, cols: number, rows: number) => pm.resizeSession(sessionId, cols, rows));
  ipcMain.on(IPC_CHANNELS.SET_NOTE, (_event: any, sessionId: string, note: string) => pm.setNote(sessionId, note));

  ipcMain.handle(IPC_CHANNELS.SELECT_WORKDIR, async () => {
    const defaultPath = configManager.get('defaultBrowseDir') || app.getPath('home');
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'], defaultPath });
    return result.filePaths[0] || null;
  });

  ipcMain.handle(IPC_CHANNELS.CHECK_EXTERNAL_CLAUDE, async (_: any, workDir: string) => pm.checkExternalClaudeCode(workDir));

  // ---------- 批量操作 ----------

  ipcMain.handle(IPC_CHANNELS.BATCH_CREATE_SESSIONS, async (_: any, sessionsConfig: any[]) => {
    const results = [];
    for (const config of sessionsConfig) {
      try { results.push({ success: true, session: await pm.createSession(config) }); }
      catch (error: any) { results.push({ success: false, error: error?.message || String(error) }); }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_KILL_SESSIONS, async (_: any, sessionIds: string[]) => {
    const results = [];
    for (const sessionId of sessionIds) {
      try { await pm.killSession(sessionId); gm.removeSessionFromAllGroups(sessionId); results.push({ success: true, sessionId }); }
      catch (error: any) { results.push({ success: false, sessionId, error: error?.message || String(error) }); }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_EXPORT_LOGS, async (_: any, { sessionIds }: { sessionIds: string[] }) => {
    const results = [];
    for (const sessionId of sessionIds) {
      try { results.push({ success: true, sessionId, log: pm.getSessionOutput(sessionId) }); }
      catch (error: any) { results.push({ success: false, sessionId, error: error?.message || String(error) }); }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_SET_NOTES, async (_: any, { sessionIds, note }: { sessionIds: string[]; note: string }) => {
    const results = [];
    for (const sessionId of sessionIds) {
      try { pm.setNote(sessionId, note); results.push({ success: true, sessionId }); }
      catch (error: any) { results.push({ success: false, sessionId, error: error?.message || String(error) }); }
    }
    return results;
  });

  // ---------- 性能监控 ----------

  ipcMain.handle(IPC_CHANNELS.GET_SYSTEM_METRICS, async () => perfMon.getSystemMetrics());
  ipcMain.handle(IPC_CHANNELS.GET_SESSION_METRICS, async () => perfMon.getSessionMetrics());
  ipcMain.handle(IPC_CHANNELS.START_MONITORING, async (_: any, interval?: number) => {
    perfMon.startMonitoring(interval || APP_CONSTANTS.DEFAULT_MONITOR_INTERVAL);
    return { success: true };
  });
  ipcMain.handle(IPC_CHANNELS.STOP_MONITORING, async () => { perfMon.stopMonitoring(); return { success: true }; });

  // ---------- 分组管理 ----------

  ipcMain.handle(IPC_CHANNELS.CREATE_GROUP, async (_: any, options: any) => gm.createGroup(options));
  ipcMain.handle(IPC_CHANNELS.UPDATE_GROUP, async (_: any, { groupId, updates }: any) => gm.updateGroup(groupId, updates));
  ipcMain.handle(IPC_CHANNELS.DELETE_GROUP, async (_: any, groupId: string) => gm.deleteGroup(groupId));
  ipcMain.handle(IPC_CHANNELS.GET_GROUPS, async () => gm.getGroups());
  ipcMain.handle(IPC_CHANNELS.ADD_SESSION_TO_GROUP, async (_: any, { groupId, sessionId }: any) => gm.addSessionToGroup(groupId, sessionId));
  ipcMain.handle(IPC_CHANNELS.REMOVE_SESSION_FROM_GROUP, async (_: any, { groupId, sessionId }: any) => gm.removeSessionFromGroup(groupId, sessionId));

  // ---------- 远程访问控制 ----------

  ipcMain.handle(IPC_CHANNELS.REMOTE_GET_STATUS, async () => httpServerManager?.getStatus());
  ipcMain.handle(IPC_CHANNELS.REMOTE_SET_PORT, async (_: any, port: number) => {
    if (typeof port !== 'number' || port < APP_CONSTANTS.MIN_PORT || port > APP_CONSTANTS.MAX_PORT) {
      return { success: false, error: `端口范围应为 ${APP_CONSTANTS.MIN_PORT}-${APP_CONSTANTS.MAX_PORT}` };
    }
    const inUse = await checkPortInUse(port);
    if (inUse) return { success: false, error: `端口 ${port} 已被占用` };
    httpServerManager?.setPort(port);
    return { success: true, port };
  });
  ipcMain.handle(IPC_CHANNELS.REMOTE_CHECK_PORT, async (_: any, port: number) => ({ port, inUse: await checkPortInUse(port) }));
  ipcMain.handle(IPC_CHANNELS.REMOTE_TOGGLE, async (_: any, enabled: boolean) => {
    httpServerManager?.setEnabled(enabled);
    return { success: true, enabled: httpServerManager?.isEnabled(), running: httpServerManager?.isRunning() };
  });
  ipcMain.handle(IPC_CHANNELS.REMOTE_REFRESH_TOKEN, async () => {
    const token = httpServerManager?.refreshToken();
    return { success: true, token };
  });
  ipcMain.handle(IPC_CHANNELS.REMOTE_KICK_CLIENT, async (_: any, clientId: string) => ({ success: httpServerManager?.kickClient(clientId) ?? false }));
  ipcMain.handle(IPC_CHANNELS.REMOTE_KICK_ALL, async () => { httpServerManager?.kickAll(); return { success: true }; });
  ipcMain.handle(IPC_CHANNELS.REMOTE_SET_SELECTED_IPS, async (_: any, ips: string[]) => {
    httpServerManager?.setSelectedIPs(ips);
    return { success: true, ips };
  });
  ipcMain.handle(IPC_CHANNELS.REMOTE_GET_SELECTED_IPS, async () => httpServerManager?.getSelectedIPs());

  // ---------- 设置同步 ----------

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_GENERAL, async () => ({
    allowRemoteCreateSession: httpServerManager?.['allowRemoteCreateSession'] ?? true,
    maxRemoteConnections: 0,
    hideDirection: windowManager?.getHideDirection() ?? 'right',
    hideToPrimary,
  }));

  ipcMain.on(IPC_CHANNELS.SETTINGS_BROADCAST_GENERAL, (_event: any, settings: GeneralSettings) => {
    if (settings.allowRemoteCreateSession !== undefined) {
      httpServerManager?.setAllowRemoteCreate(settings.allowRemoteCreateSession);
    }
    if (settings.maxRemoteConnections !== undefined) {
      httpServerManager?.setMaxConnections(settings.maxRemoteConnections);
    }
    if (settings.minimizeToTrayOnClose !== undefined) {
      minimizeToTrayOnClose = settings.minimizeToTrayOnClose;
    }
    if (settings.hideDirection !== undefined) {
      windowManager?.setHideDirection(settings.hideDirection);
    }
    if (settings.hideToPrimary !== undefined) {
      hideToPrimary = settings.hideToPrimary;
    }
    if (settings.defaultBrowseDir !== undefined) {
      configManager.set('defaultBrowseDir', settings.defaultBrowseDir);
    }
    if (settings.hideDirection) {
      configManager.set('hideDirection', settings.hideDirection);
    }
  });

  // ---------- 窗口控制 ----------

  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => mainWindow?.minimize());
  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => mainWindow?.close());

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE_SESSION, () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = Math.min(APP_CONSTANTS.EXPAND_SESSION_WIDTH, Math.floor(sw * APP_CONSTANTS.EXPAND_SESSION_SCREEN_RATIO));
    const h = Math.min(APP_CONSTANTS.EXPAND_SESSION_HEIGHT, Math.floor(sh * APP_CONSTANTS.EXPAND_SESSION_SCREEN_RATIO));
    mainWindow.setBounds({ x: Math.floor((sw - w) / 2), y: Math.floor((sh - h) / 2), width: w, height: h });
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_UNMAXIMIZE_SESSION, () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    mainWindow.setBounds({
      x: Math.floor((sw - APP_CONSTANTS.DEFAULT_WINDOW_WIDTH) / 2),
      y: Math.floor((sh - APP_CONSTANTS.DEFAULT_WINDOW_HEIGHT) / 2),
      width: APP_CONSTANTS.DEFAULT_WINDOW_WIDTH,
      height: APP_CONSTANTS.DEFAULT_WINDOW_HEIGHT,
    });
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_TOGGLE_AUTO_HIDE, () => {
    if (!mainWindow || !windowManager) return;
    windowManager.toggleAutoHide();
    if (!windowManager.isAutoHideEnabled() && windowManager.isHidden()) {
      windowManager.resetHiddenState();
      mainWindow.setBounds({ ...mainWindow.getBounds(), width: APP_CONSTANTS.DEFAULT_WINDOW_WIDTH, height: APP_CONSTANTS.DEFAULT_WINDOW_HEIGHT });
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_HIDE_TO_EDGE, () => {
    if (!mainWindow || !windowManager) return;
    windowManager.hideToEdge('right', hideToPrimary ? screen.getPrimaryDisplay() : getDisplayAtCursor());
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_RESTORE, () => {
    if (!mainWindow || !windowManager?.isHidden()) return;
    windowManager.restore();
  });

  // ---------- AI 助手 ----------

  ipcMain.handle(IPC_CHANNELS.AI_GET_CONFIG, () => aiAssistantManager?.getConfig());
  ipcMain.handle(IPC_CHANNELS.AI_UPDATE_CONFIG, (_, updates) => {
    aiAssistantManager?.updateConfig(updates);
    return aiAssistantManager?.getConfig();
  });
  ipcMain.handle(IPC_CHANNELS.AI_STATUS, () => aiAssistantManager?.getStatus());
  ipcMain.handle(IPC_CHANNELS.AI_TEST_CONNECTION, async () => {
    if (!aiAssistantManager) return { success: false, error: 'AI 助手未初始化' };
    return await aiAssistantManager.testConnection();
  });
  ipcMain.handle(IPC_CHANNELS.AI_QUERY, async (_, prompt: string, systemPrompt?: string) => {
    if (!aiAssistantManager) return '';
    return await aiAssistantManager.query(prompt, systemPrompt);
  });

  // AI 分析告警
  ipcMain.handle(IPC_CHANNELS.AI_ALERT_ANALYZED, async (_, sessionId: string, text: string) => {
    if (!aiAssistantManager) return null;
    return await aiAssistantManager.analyzeAlert(sessionId, text);
  });
}

// ==================== 应用启动 ====================

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...');
  app.exit(1);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      ensureWindowVisible(mainWindow, windowManager ?? undefined);
      if (windowManager?.isHidden()) windowManager.restore();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  console.log('Electron app is ready');
  diagnostics.startReporting();

  processManager = new ProcessManager();
  performanceMonitor = new PerformanceMonitor(processManager);
  groupManager = new GroupManager();
  httpServerManager = new HttpServerManager(processManager, performanceMonitor, groupManager, (msg) => {
    // broadcastFn — 发送到 WebSocket 客户端
    httpServerManager?.broadcast(msg);
  });

  // AI 助手管理器初始化
  aiAssistantManager = new AIAssistantManager((msg) => {
    httpServerManager?.broadcast(msg);
  });

  createWindow();
  initIPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ==================== 全局错误处理 ====================

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('error:uncaught', { message: error.message, stack: error.stack, timestamp: new Date().toISOString() }); } catch { /* ignore */ }
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的Promise拒绝:', reason);
});

// ==================== 应用退出 ====================

app.on('before-quit', () => {
  diagnostics.stopReporting();
  httpServerManager?.stop(true);
  aiAssistantManager?.cleanup();
  if (processManager) {
    processManager.cleanup();
    processManager.killAllSessions();
  }
  if (windowManager) {
    windowManager.cleanup();
    windowManager = null;
  }
  destroyTray();
});

app.on('window-all-closed', () => {
  if (processManager) {
    processManager.cleanup();
    processManager.killAllSessions();
  }
  if (windowManager) {
    windowManager.cleanup();
    windowManager = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
