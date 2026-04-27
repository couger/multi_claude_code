/**
 * 共享常量定义 — 唯一的 IPC 通道和枚举定义源
 */

// ==================== 会话状态 ====================

export enum SessionStatus {
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
  IDLE = 'idle',
}

// ==================== 告警类型 ====================

export enum AlertType {
  USER_INPUT = 'user_input',
  TASK_COMPLETE = 'task_complete',
  ERROR = 'error',
  WARNING = 'warning',
}

export enum AlertSeverity {
  CRITICAL = 'critical',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export enum AlertNotifyMode {
  NONE = 'none',
  WEAK = 'weak',
  STRONG = 'strong',
}

export const ALERT_SEVERITY_MAP: Record<AlertType, AlertSeverity> = {
  [AlertType.ERROR]: AlertSeverity.ERROR,
  [AlertType.USER_INPUT]: AlertSeverity.WARNING,
  [AlertType.WARNING]: AlertSeverity.WARNING,
  [AlertType.TASK_COMPLETE]: AlertSeverity.INFO,
};

// ==================== 显示模式 ====================

export enum DisplayMode {
  THUMBNAIL = 'thumbnail',
  ICON = 'icon',
}

// ==================== IPC 通道（唯一源） ====================

export const IPC_CHANNELS = {
  // 渲染进程 -> 主进程：会话管理
  CREATE_SESSION: 'session:create',
  KILL_SESSION: 'session:kill',
  GET_SESSIONS: 'session:list',
  GET_SESSION_OUTPUT: 'session:output',
  SEND_INPUT: 'session:input',
  SELECT_WORKDIR: 'dialog:selectWorkdir',
  SELECT_WHISPER_PATH: 'dialog:selectWhisperPath',
  SET_NOTE: 'session:note',
  RESIZE_SESSION: 'session:resize',

  // 批量操作
  BATCH_CREATE_SESSIONS: 'batch:create',
  BATCH_KILL_SESSIONS: 'batch:kill',
  BATCH_PAUSE_SESSIONS: 'batch:pause',
  BATCH_RESUME_SESSIONS: 'batch:resume',
  BATCH_EXPORT_LOGS: 'batch:exportLogs',
  BATCH_SET_NOTES: 'batch:setNotes',

  // 性能监控
  GET_SYSTEM_METRICS: 'metrics:system',
  GET_SESSION_METRICS: 'metrics:session',
  START_MONITORING: 'metrics:start',
  STOP_MONITORING: 'metrics:stop',

  // 分组管理
  CREATE_GROUP: 'group:create',
  UPDATE_GROUP: 'group:update',
  DELETE_GROUP: 'group:delete',
  GET_GROUPS: 'group:list',
  ADD_SESSION_TO_GROUP: 'group:addSession',
  REMOVE_SESSION_FROM_GROUP: 'group:removeSession',
  REORDER_GROUPS: 'group:reorder',
  REORDER_SESSIONS_IN_GROUP: 'group:reorderSessions',

  // 主进程 -> 渲染进程
  SESSION_CREATED: 'session:created',
  SESSION_OUTPUT: 'session:outputChunk',
  SESSION_STATUS: 'session:status',
  SESSION_CLOSED: 'session:closed',
  ALERT: 'alert:trigger',

  // 批量操作响应
  BATCH_OPERATION_STARTED: 'batch:started',
  BATCH_OPERATION_PROGRESS: 'batch:progress',
  BATCH_OPERATION_COMPLETED: 'batch:completed',
  BATCH_OPERATION_ERROR: 'batch:error',

  // 性能监控数据推送
  SYSTEM_METRICS_UPDATE: 'metrics:systemUpdate',
  SESSION_METRICS_UPDATE: 'metrics:sessionUpdate',

  // 分组管理响应
  GROUP_CREATED: 'group:created',
  GROUP_UPDATED: 'group:updated',
  GROUP_DELETED: 'group:deleted',
  SESSION_GROUP_CHANGED: 'group:sessionChanged',

  // 外部进程检测
  CHECK_EXTERNAL_CLAUDE: 'external:checkClaude',

  // 远程访问控制
  REMOTE_GET_STATUS: 'remote:getStatus',
  REMOTE_SET_PORT: 'remote:setPort',
  REMOTE_CHECK_PORT: 'remote:checkPort',
  REMOTE_TOGGLE: 'remote:toggle',
  REMOTE_REFRESH_TOKEN: 'remote:refreshToken',
  REMOTE_KICK_CLIENT: 'remote:kickClient',
  REMOTE_KICK_ALL: 'remote:kickAll',
  REMOTE_SET_SELECTED_IPS: 'remote:setSelectedIPs',
  REMOTE_GET_SELECTED_IPS: 'remote:getSelectedIPs',

  // 设置同步
  SETTINGS_GET_GENERAL: 'settings:getGeneral',
  SETTINGS_BROADCAST_GENERAL: 'settings:broadcastGeneral',

  // 窗口控制
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_MAXIMIZE_SESSION: 'window:maximizeForSession',
  WINDOW_UNMAXIMIZE_SESSION: 'window:unmaximizeForSession',
  WINDOW_TOGGLE_AUTO_HIDE: 'window:toggle-auto-hide',
  WINDOW_HIDE_TO_EDGE: 'window:hide-to-edge',
  WINDOW_RESTORE: 'window:restore-window',
  WINDOW_SET_OPACITY: 'window:setOpacity',
  WINDOW_GET_OPACITY: 'window:getOpacity',
  WINDOW_OPACITY_CHANGED: 'window:opacityChanged',

  // 托盘
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
  VOICE_GET_CONFIG: 'voice:getConfig',
  VOICE_STOP_LISTENING: 'voice:stopListening',
  VOICE_SPEAK: 'voice:speak',
  VOICE_RESULT: 'voice:result',
  VOICE_COMMAND: 'voice:command',
  VOICE_EXECUTE_COMMAND: 'voice:executeCommand',
  VOICE_AUDIO_DATA: 'voice:audioData',    // 前端发送音频数据
  VOICE_RECOGNIZE: 'voice:recognize',     // 请求识别（返回结果）

  // 会话模板
  TEMPLATE_LIST: 'template:list',
  TEMPLATE_GET: 'template:get',
  TEMPLATE_CREATE: 'template:create',
  TEMPLATE_UPDATE: 'template:update',
  TEMPLATE_DELETE: 'template:delete',
  TEMPLATE_USE: 'template:use',
} as const;

// ==================== 默认配置 ====================

/** 应用常量（魔法数字统一管理） */
export const APP_CONSTANTS = {
  /** 默认 HTTP/WebSocket 端口 */
  DEFAULT_HTTP_PORT: 8888,
  /** Vite 开发服务器端口 */
  VITE_DEV_PORT: 5173,
  /** 默认窗口宽度 */
  DEFAULT_WINDOW_WIDTH: 1200,
  /** 默认窗口高度 */
  DEFAULT_WINDOW_HEIGHT: 800,
  /** 展开会话时窗口宽度 */
  EXPAND_SESSION_WIDTH: 1400,
  /** 展开会话时窗口高度 */
  EXPAND_SESSION_HEIGHT: 900,
  /** 展开会话时屏幕占比 */
  EXPAND_SESSION_SCREEN_RATIO: 0.8,
  /** 窗口最小宽度 */
  MIN_WINDOW_WIDTH: 400,
  /** 窗口最小高度 */
  MIN_WINDOW_HEIGHT: 600,
  /** 窗口恢复宽度（贴边隐藏后） */
  RESTORE_WIDTH: 500,
  /** 窗口恢复高度（贴边隐藏后） */
  RESTORE_HEIGHT: 600,
  /** 隐藏把手大小（像素） */
  HANDLE_SIZE: 10,
  /** 贴边检测阈值（像素） */
  EDGE_THRESHOLD: 10,
  /** 自动隐藏延迟（毫秒） */
  AUTO_HIDE_DELAY_MS: 1000,
  /** 默认性能监控间隔（毫秒） */
  DEFAULT_MONITOR_INTERVAL: 5000,
  /** 有效端口范围 */
  MIN_PORT: 1024,
  MAX_PORT: 65535,
  /** 随机端口范围（端口冲突时） */
  RANDOM_PORT_MIN: 10000,
  RANDOM_PORT_MAX: 15000,
  /** WebSocket 关闭延迟（毫秒） */
  WS_CLOSE_DELAY: 500,
} as const;

export const SHARED_DEFAULT_CONFIG = {
  maxOutputLines: 1000,
  sidebarWidth: 280,
  thumbnailHeight: 150,
  iconSize: 48,
  autoHideSidebar: true,
  sidebarHideDelay: 2000,
  alertSound: true,
  defaultWorkDir: '~',
  autoRestoreSessions: false,
  maxLogFileSize: 10 * 1024 * 1024,
  maxLogFiles: 5,
  logRotationInterval: 'daily' as const,
  enableLogTimestamps: true,
  logTimestampFormat: 'YYYY-MM-DD HH:mm:ss',
  snapshotInterval: 30000,
  backupDirectory: 'backups',
};
