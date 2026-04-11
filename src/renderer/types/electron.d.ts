export interface ElectronAPI {
  // 会话管理
  createSession: (options?: any) => Promise<any>;
  killSession: (sessionId: string) => Promise<void>;
  getSessions: () => Promise<any[]>;
  getSessionOutput: (sessionId: string) => Promise<string>;
  sendInput: (sessionId: string, data: string) => void;
  setNote: (sessionId: string, note: string) => void;
  resizeSession: (sessionId: string, cols: number, rows: number) => void;

  // 对话框
  selectWorkDir: () => Promise<string | null>;

  // 窗口控制
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  toggleAutoHideWindow: () => void;
  hideWindowToEdge: () => void;
  restoreWindow: () => void;

  // 事件监听
  onSessionCreated: (callback: (data: any) => void) => void;
  onSessionOutput: (callback: (data: any) => void) => void;
  onSessionStatus: (callback: (data: any) => void) => void;
  onSessionClosed: (callback: (data: any) => void) => void;
  onAlert: (callback: (data: any) => void) => void;

  // 移除监听
  removeAllListeners: (channel: string) => void;

  // 性能监控
  getSystemMetrics: () => Promise<any>;
  getSessionMetrics: () => Promise<any[]>;
  startMonitoring: (interval?: number) => Promise<any>;
  stopMonitoring: () => Promise<any>;

  // 分组管理
  createGroup: (options: any) => Promise<any>;
  updateGroup: (groupId: string, updates: any) => Promise<any>;
  deleteGroup: (groupId: string) => Promise<any>;
  getGroups: () => Promise<any[]>;
  addSessionToGroup: (groupId: string, sessionId: string) => Promise<any>;
  removeSessionFromGroup: (groupId: string, sessionId: string) => Promise<any>;

  // 远程访问控制
  getRemoteStatus: () => Promise<{
    enabled: boolean;
    running: boolean;
    port: number;
    token: string;
    localIPs: string[];
    clientCount: number;
    clients: Array<{ id: string; ip: string; connectedAt: string }>;
  }>;
  setRemotePort: (port: number) => Promise<{ success: boolean; port?: number; error?: string }>;
  checkRemotePort: (port: number) => Promise<{ port: number; inUse: boolean }>;
  toggleRemote: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean; running: boolean }>;
  refreshToken: () => Promise<{ success: boolean; token: string }>;
  kickClient: (clientId: string) => Promise<{ success: boolean }>;
  kickAllClients: () => Promise<{ success: boolean }>;

  // 标记 Electron 环境
  isElectron?: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
