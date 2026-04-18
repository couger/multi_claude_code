/**
 * 预加载脚本 - 桥接主进程和渲染进程
 */

const { contextBridge, ipcRenderer } = require('electron');

// IPC通道常量定义（与主进程constants.ts保持一致）
const IPC_CHANNELS = {
  // 渲染进程 -> 主进程
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

  // 主进程 -> 渲染进程
  SESSION_CREATED: 'session:created',
  SESSION_OUTPUT: 'session:outputChunk',
  SESSION_STATUS: 'session:status',
  SESSION_CLOSED: 'session:closed',
  ALERT: 'alert:trigger',
};

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

  // 事件监听
  onSessionCreated: (callback: (data: any) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SESSION_CREATED, (_event: any, data: any) => callback(data));
  },
  onSessionOutput: (callback: (data: any) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SESSION_OUTPUT, (_event: any, data: any) => callback(data));
  },
  onSessionStatus: (callback: (data: any) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SESSION_STATUS, (_event: any, data: any) => callback(data));
  },
  onSessionClosed: (callback: (data: any) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SESSION_CLOSED, (_event: any, data: any) => callback(data));
  },
  onAlert: (callback: (data: any) => void) => {
    ipcRenderer.on(IPC_CHANNELS.ALERT, (_event: any, data: any) => callback(data));
  },

  // 移除监听
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // 托盘事件
  onTrayCreateSession: (callback: () => void) => {
    ipcRenderer.on('tray:create-session', () => callback());
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
});

// 鼠标进入/离开窗口事件 — 通过 DOM 事件检测并通知主进程
document.addEventListener('mouseenter', () => {
  ipcRenderer.send('window:mouse-enter');
});
document.addEventListener('mouseleave', () => {
  ipcRenderer.send('window:mouse-leave');
});