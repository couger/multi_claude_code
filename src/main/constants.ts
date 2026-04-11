/**
 * IPC 通道常量
 */

export const IPC_CHANNELS = {
  // 渲染进程 -> 主进程
  CREATE_SESSION: 'session:create',
  KILL_SESSION: 'session:kill',
  GET_SESSIONS: 'session:list',
  GET_SESSION_OUTPUT: 'session:output',
  SEND_INPUT: 'session:input',
  SELECT_WORKDIR: 'dialog:selectWorkdir',
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
};

/**
 * 会话状态
 */
export const SessionStatus = {
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ERROR: 'error',
  IDLE: 'idle',
};

/**
 * 告警类型
 */
export const AlertType = {
  USER_INPUT: 'user_input',
  TASK_COMPLETE: 'task_complete',
  ERROR: 'error',
  WARNING: 'warning',
};

/**
 * 显示模式
 */
export const DisplayMode = {
  THUMBNAIL: 'thumbnail',
  ICON: 'icon',
};

/**
 * 默认配置
 */
export const DEFAULT_CONFIG = {
  maxOutputLines: 1000,
  sidebarWidth: 280,
  thumbnailHeight: 150,
  iconSize: 48,
  autoHideSidebar: true,
  sidebarHideDelay: 2000,
  alertSound: true,
  claudeCommand: 'C:\\Users\\couger\\.local\\bin\\claude.exe',
  defaultWorkDir: '~',
  // 会话保存与恢复配置
  autoRestoreSessions: false,
  maxLogFileSize: 10 * 1024 * 1024, // 10MB
  maxLogFiles: 5, // 最多保留5个日志文件
  logRotationInterval: 'daily', // daily, weekly, monthly, or size-based
  enableLogTimestamps: true,
  logTimestampFormat: 'YYYY-MM-DD HH:mm:ss',
  snapshotInterval: 30000, // 快照间隔（毫秒）
  backupDirectory: 'backups',
};
