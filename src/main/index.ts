/**
 * Claude Code CLI Manager — 主进程入口（精简版）
 */

import { app, BrowserWindow, ipcMain, screen, dialog, shell } from 'electron';
import path from 'path';
import os from 'os';
import { IPC_CHANNELS, APP_CONSTANTS } from './constants';
import { SessionStatus } from '../shared/constants';
import type { GeneralSettings } from '../shared/types';
import { ProcessManager } from './ProcessManager';
import { PerformanceMonitor } from './PerformanceMonitor';
import { GroupManager } from './GroupManager';
import { TemplateManager } from './TemplateManager';
import { WindowManager } from './WindowManager';
import { configManager } from './ConfigManager';
import { getLocalIPv4s } from './utils';
import { createTray, updateTrayMenu, destroyTray, ensureWindowVisible, getDisplayAtCursor } from './TrayManager';
import { HttpServerManager, checkPortInUse } from './HttpServer';
import { diagnostics } from './Diagnostics';
import { AIAssistantManager } from './AIAssistantManager';
import { VoiceManager } from './VoiceManager';

let mainWindow: BrowserWindow | null = null;
let isRecreatingWindow = false; // 防止重复创建窗口
let windowManager: WindowManager | null = null;
let processManager: ProcessManager | null = null;
let performanceMonitor: PerformanceMonitor | null = null;
let groupManager: GroupManager | null = null;
let httpServerManager: HttpServerManager | null = null;
let aiAssistantManager: AIAssistantManager | null = null;
let voiceManager: VoiceManager | null = null;
let templateManager: TemplateManager | null = null;

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

export { app };

// ==================== 窗口创建 ====================

function createWindow() {
  // 防止重复创建
  if (isRecreatingWindow) {
    console.log('[Main] 窗口正在重建中，跳过');
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('[Main] 窗口已存在，跳过创建');
    return;
  }

  isRecreatingWindow = true;
  setTimeout(() => { isRecreatingWindow = false; }, 3000);

  // 获取半透明设置
  const savedOpacity = (configManager.get('windowOpacity') as number) ?? 1.0;

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

  // 注入 COOP/COEP 头以启用 SharedArrayBuffer（WASM STT 需要）
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['require-corp'],
      },
    });
  });

  // 保存窗口透明度设置（CSS 方案，不需要改变窗口本身透明度）
  if (savedOpacity < 1.0) {
    configManager.set('windowOpacity', savedOpacity);
  }

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

  // 监听渲染进程崩溃 - 自动恢复一次，避免循环
  let crashRecoveryCount = 0;
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Main] 渲染进程崩溃:', details.reason);
    if (crashRecoveryCount < 2 && mainWindow && !mainWindow.isDestroyed()) {
      crashRecoveryCount++;
      console.log(`[Main] 尝试恢复 (${crashRecoveryCount}/2)...`);
      // 清除 WASM 状态，避免再次触发崩溃
      mainWindow.webContents.session.clearCache().catch(() => {});
      // 重新加载页面
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const devServerUrl = process.env.VITE_DEV_SERVER_URL || `http://localhost:${APP_CONSTANTS.VITE_DEV_PORT}`;
          if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
            mainWindow.loadURL(devServerUrl);
          } else {
            mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
          }
        }
      }, 1000);
    } else {
      console.error('[Main] 已达到最大恢复次数，请手动重启应用');
    }
  });

  // 成功加载后重置崩溃计数
  mainWindow.webContents.on('did-finish-load', () => {
    crashRecoveryCount = 0;
  });

  // 监听未响应崩溃
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Main] 页面加载失败:', errorCode, errorDescription);
  });

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

  // 选择 Whisper 可执行文件路径
  ipcMain.handle(IPC_CHANNELS.SELECT_WHISPER_PATH, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'Executable', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: '选择 Whisper 可执行文件',
    });
    return result.filePaths[0] || null;
  });

  ipcMain.handle(IPC_CHANNELS.CHECK_EXTERNAL_CLAUDE, async (_: any, workDir: string) => pm.checkExternalClaudeCode(workDir));

  // 在系统浏览器中打开外部链接
  ipcMain.on('shell:openExternal', async (_event: any, url: string) => {
    try { await shell.openExternal(url); } catch (e) { console.error('Failed to open external URL:', e); }
  });

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

  // 窗口透明度控制（CSS 方案，不透明窗口但背景半透明）
  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_OPACITY, async (_, opacity: number) => {
    try {
      // 保存设置
      configManager.set('windowOpacity', opacity);
      // 广播给渲染进程
      mainWindow?.webContents.send(IPC_CHANNELS.WINDOW_OPACITY_CHANGED, opacity);
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_OPACITY, async () => {
    return (configManager.get('windowOpacity') as number) ?? 1.0;
  });

  // ---------- 语音交互 ----------
  ipcMain.on(IPC_CHANNELS.VOICE_START_LISTENING, async () => {
    if (voiceManager) {
      try { await voiceManager.startListening(); } catch (e) { console.error('[IPC] Voice start listening failed:', e); }
    }
  });
  ipcMain.on(IPC_CHANNELS.VOICE_STOP_LISTENING, async () => {
    if (voiceManager) {
      try { await voiceManager.stopListening(); } catch (e) { console.error('[IPC] Voice stop listening failed:', e); }
    }
  });
  ipcMain.handle(IPC_CHANNELS.VOICE_SPEAK, async (_: any, text: string) => {
    if (!voiceManager) return '';
    try { await voiceManager.speak(text); return ''; } catch (e) { console.error('[IPC] Voice speak failed:', e); return 'error'; }
  });
  // 获取语音配置
  ipcMain.handle(IPC_CHANNELS.VOICE_GET_CONFIG, async () => {
    if (!voiceManager) return { enabled: false };
    return voiceManager.getConfig();
  });
  // 音频识别请求
  ipcMain.handle(IPC_CHANNELS.VOICE_RECOGNIZE, async (_: any, audioBuffer: Buffer) => {
    console.log('[IPC] VOICE_RECOGNIZE 收到请求, 大小:', audioBuffer ? audioBuffer.length : 0);
    if (!voiceManager) {
      console.log('[IPC] voiceManager 不存在');
      return 'ERROR:voiceManager不存在';
    }
    try {
      const result = await voiceManager.recognizeAudio(audioBuffer);
      console.log('[IPC] 识别结果:', result);
      // 发送识别结果到渲染进程
      sendToRenderer(IPC_CHANNELS.VOICE_RESULT, { text: result });
      // 同时触发语音命令解析
      if (result) {
        voiceManager.handleVoiceResult(result);
      }
      return result;
    } catch (e) {
      console.error('[IPC] Voice recognize failed:', e);
      return '';
    }
  });
  // 接收前端发送的音频数据（流式）
  let audioChunks: Buffer[] = [];
  ipcMain.on(IPC_CHANNELS.VOICE_AUDIO_DATA, async (_: any, chunk: Buffer) => {
    audioChunks.push(chunk);
  });
  // 当停止录音时，处理累积的音频
  ipcMain.on(IPC_CHANNELS.VOICE_STOP_LISTENING, async () => {
    if (audioChunks.length > 0 && voiceManager) {
      const fullAudio = Buffer.concat(audioChunks);
      audioChunks = [];
      try {
        const result = await voiceManager.recognizeAudio(fullAudio);
        if (result) {
          sendToRenderer(IPC_CHANNELS.VOICE_RESULT, { text: result });
          voiceManager.handleVoiceResult(result);
        }
      } catch (e) {
        console.error('[IPC] Audio recognition failed:', e);
      }
    }
  });

  // 接收渲染进程 WASM STT 的识别结果，触发命令解析
  ipcMain.on(IPC_CHANNELS.VOICE_RESULT, (_event: any, data: { text: string }) => {
    if (!voiceManager || !data?.text) return;
    voiceManager.handleVoiceResult(data.text);
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

  // 自动应答规则管理
  ipcMain.handle(IPC_CHANNELS.AI_GET_AUTO_ANSWER_RULES, () => aiAssistantManager?.getAutoAnswerRules());
  ipcMain.handle(IPC_CHANNELS.AI_ADD_AUTO_ANSWER_RULE, (_, rule) => {
    if (!aiAssistantManager) return;
    aiAssistantManager.addAutoAnswerRule(rule);
    return aiAssistantManager.getAutoAnswerRules();
  });
  ipcMain.handle(IPC_CHANNELS.AI_UPDATE_AUTO_ANSWER_RULE, (_, { ruleId, updates }) => {
    if (!aiAssistantManager) return;
    aiAssistantManager.updateAutoAnswerRule(ruleId, updates);
    return aiAssistantManager.getAutoAnswerRules();
  });
  ipcMain.handle(IPC_CHANNELS.AI_DELETE_AUTO_ANSWER_RULE, (_, ruleId) => {
    if (!aiAssistantManager) return;
    aiAssistantManager.deleteAutoAnswerRule(ruleId);
    return aiAssistantManager.getAutoAnswerRules();
  });

  // 模板管理 IPC
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_LIST, () => templateManager?.getAll() || []);
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_GET, (_, id: string) => templateManager?.get(id));
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_CREATE, (_, options) => templateManager?.create(options));
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_UPDATE, (_, { id, updates }) => templateManager?.update(id, updates));
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_DELETE, (_, id: string) => templateManager?.delete(id) ?? false);
  ipcMain.handle(IPC_CHANNELS.TEMPLATE_USE, (_, id: string) => templateManager?.incrementUseCount(id));

  // 语音命令执行
  ipcMain.handle(IPC_CHANNELS.VOICE_EXECUTE_COMMAND, async (_, command: any) => {
    if (!processManager) return { success: false, message: 'ProcessManager not initialized' };

    try {
      switch (command.type) {
        case 'session': {
          const action = command.action;
          if (action === 'create') {
            // 创建新会话
            const session = await processManager.createSession(command.payload || {});
            return { success: true, sessionId: session?.id, message: '会话已创建' };
          } else if (action === 'close' || action === 'kill') {
            // 关闭会话
            const sessionId = command.target;
            if (sessionId) {
              await processManager.killSession(sessionId);
              return { success: true, message: '会话已关闭' };
            }
            return { success: false, message: '未指定会话ID' };
          } else if (action === 'send') {
            // 发送输入
            const { sessionId, input } = command.payload || {};
            if (sessionId && input) {
              await processManager.sendInput(sessionId, input);
              return { success: true, message: '已发送输入' };
            }
            return { success: false, message: '未指定会话ID或输入' };
          }
          return { success: false, message: '未知会话操作' };
        }
        case 'answer': {
          // 回答命令 - 发送给当前活动的会话
          const sessions = processManager.getSessions();
          const activeSession = sessions.find((s: any) => s.status === 'RUNNING');
          if (activeSession) {
            await processManager.sendInput(activeSession.id, command.content + '\n');
            return { success: true, message: '已发送回答' };
          }
          return { success: false, message: '没有运行中的会话' };
        }
        case 'control': {
          // 控制命令 - 语音配置已在 VoiceManager 中处理
          return { success: true, message: command.content };
        }
        case 'query': {
          // 查询命令 - 返回状态信息
          const sessions = processManager.getSessions();
          const running = sessions.filter((s: any) => s.status === 'RUNNING').length;
          return {
            success: true,
            message: `当前共有 ${sessions.length} 个会话，其中 ${running} 个运行中`,
            data: { total: sessions.length, running }
          };
        }
        case 'ai_query': {
          // AI 查询命令 - 发送到 AI 模型
          if (!aiAssistantManager) {
            return { success: false, message: 'AI 助手未初始化' };
          }
          const aiConfig = aiAssistantManager.getConfig();
          if (!aiConfig.enabled) {
            return { success: false, message: 'AI 助手未启用，请在设置中开启' };
          }
          const aiStatus = aiAssistantManager.getStatus();
          if (!aiStatus.healthy) {
            return { success: false, message: 'AI 助手连接不可用' };
          }
          try {
            const aiResponse = await aiAssistantManager.query(command.content);
            return { success: true, message: aiResponse || 'AI 无回复' };
          } catch (e: any) {
            return { success: false, message: 'AI 查询失败: ' + e.message };
          }
        }
        default:
          return { success: false, message: '未知命令类型' };
      }
    } catch (e: any) {
      return { success: false, message: e.message };
    }
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
  templateManager = new TemplateManager();
  httpServerManager = new HttpServerManager(processManager, performanceMonitor, groupManager, (msg) => {
    // broadcastFn — 发送到 WebSocket 客户端
    httpServerManager?.broadcast(msg);
  });

  // AI 助手管理器初始化
  aiAssistantManager = new AIAssistantManager((msg) => {
    httpServerManager?.broadcast(msg);
  });

  // 语音管理器初始化
  voiceManager = new VoiceManager();
  console.log('[Init] VoiceManager 已初始化');

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
