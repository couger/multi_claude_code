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
  maximizeForSession: () => void;
  unmaximizeForSession: () => void;
  toggleAutoHideWindow: () => void;
  hideWindowToEdge: () => void;
  restoreWindow: () => void;

  // 事件监听
  onSessionCreated: (callback: (data: any) => void) => void;
  onSessionOutput: (callback: (data: any) => void) => void;
  onSessionStatus: (callback: (data: any) => void) => void;
  onSessionClosed: (callback: (data: any) => void) => void;
  onAlert: (callback: (data: any) => void) => void;
  onTrayCreateSession: (callback: () => void) => void;

  // 移除监听
  removeListener: (channel: string, callback: (data: any) => void) => void;
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

  // 外部进程检测
  checkExternalClaude: (workDir: string) => Promise<{ detected: boolean; warnings: string[]; details?: any }>;

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
  setSelectedIPs: (ips: string[]) => Promise<{ success: boolean; ips: string[] }>;
  getSelectedIPs: () => Promise<string[]>;
  broadcastGeneralSettings: (settings: any) => void;

  // AI 助手
  getAIConfig: () => Promise<any>;
  updateAIConfig: (updates: any) => Promise<any>;
  getAIStatus: () => Promise<any>;
  testAIConnection: () => Promise<{ success: boolean; error?: string; response?: any }>;
  queryAI: (prompt: string, systemPrompt?: string) => Promise<string>;
  analyzeAlert: (sessionId: string, text: string) => Promise<any>;
  onAIStatus: (callback: (data: any) => void) => void;
  onAIAlertAnalyzed: (callback: (data: any) => void) => void;
  
  // 自动应答规则管理
  getAutoAnswerRules: () => Promise<Array<{ id: string; pattern: string; answer: string; sessionPattern?: string; enabled: boolean }>>;
  addAutoAnswerRule: (rule: Omit<{ id: string; pattern: string; answer: string; sessionPattern?: string; enabled: boolean }, 'id'>) => Promise<any>;
  updateAutoAnswerRule: (ruleId: string, updates: Partial<{ pattern: string; answer: string; sessionPattern?: string; enabled: boolean }>) => Promise<any>;
  deleteAutoAnswerRule: (ruleId: string) => Promise<any>;

  // 语音交互
  startListening: () => void;
  stopListening: () => void;
  speakText: (text: string) => Promise<string>;
  onVoiceResult: (callback: (data: { text: string }) => void) => void;
  onVoiceSpeak: (callback: (data: any) => void) => void;
  onVoiceStartListening: (callback: () => void) => void;
  onVoiceStopListening: (callback: () => void) => void;

  // 会话模板
  templateList: () => Promise<any[]>;
  templateGet: (id: string) => Promise<any | null>;
  templateCreate: (options: { name: string; description?: string; workDir: string; args: string }) => Promise<any>;
  templateUpdate: (id: string, updates: any) => Promise<any | null>;
  templateDelete: (id: string) => Promise<boolean>;
  templateUse: (id: string) => Promise<any | null>;

  // 标记 Electron 环境
  isElectron?: boolean;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
