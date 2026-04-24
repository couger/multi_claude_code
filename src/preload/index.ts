/**
 * 预加载脚本 - 桥接主进程和渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

// IPC通道常量 — 从 shared 统一导出（编译后路径）
const IPC_CHANNELS = {
  CREATE_SESSION: 'session:create',
  KILL_SESSION: 'session:kill',
  GET_SESSIONS: 'session:list',
  GET_SESSION_OUTPUT: 'session:output',
  SEND_INPUT: 'session:input',
  SELECT_WORKDIR: 'dialog:selectWorkdir',
  SET_NOTE: 'session:note',
  RESIZE_SESSION: 'session:resize',
  WINDOW_MAXIMIZE: 'window:maximizeForSession',
  WINDOW_UNMAXIMIZE: 'window:unmaximizeForSession',

  SESSION_CREATED: 'session:created',
  SESSION_OUTPUT: 'session:outputChunk',
  SESSION_STATUS: 'session:status',
  SESSION_CLOSED: 'session:closed',
  ALERT: 'alert:trigger',
  TRAY_CREATE_SESSION: 'tray:create-session',

  // AI 助手
  AI_GET_CONFIG: 'ai:getConfig',
  AI_UPDATE_CONFIG: 'ai:updateConfig',
  AI_STATUS: 'ai:status',
  AI_ALERT_ANALYZED: 'ai:alertAnalyzed',
  AI_TEST_CONNECTION: 'ai:testConnection',
  AI_QUERY: 'ai:query',
  AI_GET_AUTO_ANSWER_RULES: 'ai:getAutoAnswerRules',
  AI_ADD_AUTO_ANSWER_RULE: 'ai:addAutoAnswerRule',
  AI_UPDATE_AUTO_ANSWER_RULE: 'ai:updateAutoAnswerRule',
  AI_DELETE_AUTO_ANSWER_RULE: 'ai:deleteAutoAnswerRule',

  // 语音交互
  VOICE_START_LISTENING: 'voice:startListening',
  VOICE_STOP_LISTENING: 'voice:stopListening',
  VOICE_SPEAK: 'voice:speak',
  VOICE_RESULT: 'voice:result',

  // 会话模板
  TEMPLATE_LIST: 'template:list',
  TEMPLATE_GET: 'template:get',
  TEMPLATE_CREATE: 'template:create',
  TEMPLATE_UPDATE: 'template:update',
  TEMPLATE_DELETE: 'template:delete',
  TEMPLATE_USE: 'template:use',
};

/**
 * 多监听器管理 — 支持同一频道注册多个回调，清理时只移除自己的
 */
const listenerRegistry = new Map<string, Set<(data: any) => void>>();

function registerListener(channel: string, callback: (data: any) => void) {
  // 首次注册该频道时，创建 ipcRenderer 监听器
  if (!listenerRegistry.has(channel)) {
    listenerRegistry.set(channel, new Set());
    ipcRenderer.on(channel, (_event: any, data: any) => {
      const callbacks = listenerRegistry.get(channel);
      if (callbacks) {
        for (const cb of callbacks) {
          try { cb(data); } catch (e) { console.error(`Listener error on ${channel}:`, e); }
        }
      }
    });
  }
  listenerRegistry.get(channel)!.add(callback);
}

function removeListener(channel: string, callback: (data: any) => void) {
  const callbacks = listenerRegistry.get(channel);
  if (callbacks) {
    callbacks.delete(callback);
    // 如果该频道没有回调了，移除 ipcRenderer 监听器
    if (callbacks.size === 0) {
      listenerRegistry.delete(channel);
      ipcRenderer.removeAllListeners(channel);
    }
  }
}

function removeAllListenersForChannel(channel: string) {
  listenerRegistry.delete(channel);
  ipcRenderer.removeAllListeners(channel);
}

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 会话管理
  createSession: (options: any) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_SESSION, options),
  killSession: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.KILL_SESSION, sessionId),
  getSessions: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSIONS),
  getSessionOutput: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_SESSION_OUTPUT, sessionId),
  sendInput: (sessionId: string, data: string) => ipcRenderer.send(IPC_CHANNELS.SEND_INPUT, sessionId, data),
  setNote: (sessionId: string, note: string) => ipcRenderer.send(IPC_CHANNELS.SET_NOTE, sessionId, note),
  resizeSession: (sessionId: string, cols: number, rows: number) => ipcRenderer.send(IPC_CHANNELS.RESIZE_SESSION, sessionId, cols, rows),

  // 对话框
  selectWorkDir: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_WORKDIR),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  maximizeForSession: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
  unmaximizeForSession: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_UNMAXIMIZE),
  toggleAutoHideWindow: () => ipcRenderer.send('window:toggle-auto-hide'),
  hideWindowToEdge: () => ipcRenderer.send('window:hide-to-edge'),
  restoreWindow: () => ipcRenderer.send('window:restore-window'),

  // 事件监听 — 支持多回调，不会互相覆盖
  onSessionCreated: (callback: (data: any) => void) => {
    registerListener(IPC_CHANNELS.SESSION_CREATED, callback);
  },
  onSessionOutput: (callback: (data: any) => void) => {
    registerListener(IPC_CHANNELS.SESSION_OUTPUT, callback);
  },
  onSessionStatus: (callback: (data: any) => void) => {
    registerListener(IPC_CHANNELS.SESSION_STATUS, callback);
  },
  onSessionClosed: (callback: (data: any) => void) => {
    registerListener(IPC_CHANNELS.SESSION_CLOSED, callback);
  },
  onAlert: (callback: (data: any) => void) => {
    registerListener(IPC_CHANNELS.ALERT, callback);
  },
  onTrayCreateSession: (callback: () => void) => {
    registerListener(IPC_CHANNELS.TRAY_CREATE_SESSION, callback as (data: any) => void);
  },

  // 移除特定回调
  removeListener: (channel: string, callback: (data: any) => void) => {
    removeListener(channel, callback);
  },

  // 移除某个频道的所有回调
  removeAllListeners: (channel: string) => {
    removeAllListenersForChannel(channel);
  },

  // 标记 Electron 环境
  isElectron: true,

  // 性能监控
  getSystemMetrics: () => ipcRenderer.invoke('metrics:system'),
  getSessionMetrics: () => ipcRenderer.invoke('metrics:session'),
  startMonitoring: (interval?: number) => ipcRenderer.invoke('metrics:start', interval),
  stopMonitoring: () => ipcRenderer.invoke('metrics:stop'),

  // 分组管理
  createGroup: (options: any) => ipcRenderer.invoke('group:create', options),
  updateGroup: (groupId: string, updates: any) => ipcRenderer.invoke('group:update', { groupId, updates }),
  deleteGroup: (groupId: string) => ipcRenderer.invoke('group:delete', groupId),
  getGroups: () => ipcRenderer.invoke('group:list'),
  addSessionToGroup: (groupId: string, sessionId: string) => ipcRenderer.invoke('group:addSession', { groupId, sessionId }),
  removeSessionFromGroup: (groupId: string, sessionId: string) => ipcRenderer.invoke('group:removeSession', { groupId, sessionId }),

  // 外部进程检测
  checkExternalClaude: (workDir: string) => ipcRenderer.invoke('external:checkClaude', workDir),

  // 远程访问控制
  getRemoteStatus: () => ipcRenderer.invoke('remote:getStatus'),
  setRemotePort: (port: number) => ipcRenderer.invoke('remote:setPort', port),
  checkRemotePort: (port: number) => ipcRenderer.invoke('remote:checkPort', port),
  toggleRemote: (enabled: boolean) => ipcRenderer.invoke('remote:toggle', enabled),
  refreshToken: () => ipcRenderer.invoke('remote:refreshToken'),
  kickClient: (clientId: string) => ipcRenderer.invoke('remote:kickClient', clientId),
  kickAllClients: () => ipcRenderer.invoke('remote:kickAll'),
  setSelectedIPs: (ips: string[]) => ipcRenderer.invoke('remote:setSelectedIPs', ips),
  getSelectedIPs: () => ipcRenderer.invoke('remote:getSelectedIPs'),
  broadcastGeneralSettings: (settings: any) => ipcRenderer.send('settings:broadcastGeneral', settings),

  // AI 助手
  getAIConfig: () => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_CONFIG),
  updateAIConfig: (updates: any) => ipcRenderer.invoke(IPC_CHANNELS.AI_UPDATE_CONFIG, updates),
  getAIStatus: () => ipcRenderer.invoke(IPC_CHANNELS.AI_STATUS),
  testAIConnection: () => ipcRenderer.invoke(IPC_CHANNELS.AI_TEST_CONNECTION),
  queryAI: (prompt: string, systemPrompt?: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_QUERY, prompt, systemPrompt),
  analyzeAlert: (sessionId: string, text: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_ALERT_ANALYZED, sessionId, text),
  
  // 自动应答规则管理
  getAutoAnswerRules: () => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_AUTO_ANSWER_RULES),
  addAutoAnswerRule: (rule: Omit<any, 'id'>) => ipcRenderer.invoke(IPC_CHANNELS.AI_ADD_AUTO_ANSWER_RULE, rule),
  updateAutoAnswerRule: (ruleId: string, updates: Partial<any>) => ipcRenderer.invoke(IPC_CHANNELS.AI_UPDATE_AUTO_ANSWER_RULE, { ruleId, updates }),
  deleteAutoAnswerRule: (ruleId: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_DELETE_AUTO_ANSWER_RULE, ruleId),
  
  onAIStatus: (callback: (data: any) => void) => {
    registerListener(IPC_CHANNELS.AI_STATUS, callback);
  },
  onAIAlertAnalyzed: (callback: (data: any) => void) => {
    registerListener(IPC_CHANNELS.AI_ALERT_ANALYZED, callback);
  },

  // 语音交互
  startListening: () => ipcRenderer.send(IPC_CHANNELS.VOICE_START_LISTENING),
  stopListening: () => ipcRenderer.send(IPC_CHANNELS.VOICE_STOP_LISTENING),
  speakText: (text: string) => ipcRenderer.invoke(IPC_CHANNELS.VOICE_SPEAK, text),
  onVoiceResult: (callback: (data: { text: string }) => void) => {
    registerListener(IPC_CHANNELS.VOICE_RESULT, callback);
  },
  onVoiceSpeak: (callback: (data: any) => void) => {
    registerListener(IPC_CHANNELS.VOICE_SPEAK, callback);
  },
  onVoiceStartListening: (callback: () => void) => {
    registerListener(IPC_CHANNELS.VOICE_START_LISTENING, callback);
  },
  onVoiceStopListening: (callback: () => void) => {
    registerListener(IPC_CHANNELS.VOICE_STOP_LISTENING, callback);
  },

  // 会话模板
  templateList: () => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_LIST),
  templateGet: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_GET, id),
  templateCreate: (options: { name: string; description?: string; workDir: string; args: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_CREATE, options),
  templateUpdate: (id: string, updates: any) => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_UPDATE, { id, updates }),
  templateDelete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_DELETE, id),
  templateUse: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TEMPLATE_USE, id),
});

// 鼠标进入/离开窗口事件
document.addEventListener('mouseenter', () => {
  ipcRenderer.send('window:mouse-enter');
});
document.addEventListener('mouseleave', () => {
  ipcRenderer.send('window:mouse-leave');
});
