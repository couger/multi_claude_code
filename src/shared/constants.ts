/**
 * 共享常量定义
 */

/**
 * 会话状态
 */
export enum SessionStatus {
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
  IDLE = 'idle',
}

/**
 * 告警类型
 */
export enum AlertType {
  USER_INPUT = 'user_input',
  TASK_COMPLETE = 'task_complete',
  ERROR = 'error',
  WARNING = 'warning',
}

/**
 * 显示模式
 */
export enum DisplayMode {
  THUMBNAIL = 'thumbnail',
  ICON = 'icon',
}

/**
 * 默认配置（共享部分）
 */
export const SHARED_DEFAULT_CONFIG = {
  maxOutputLines: 1000,
  sidebarWidth: 280,
  thumbnailHeight: 150,
  iconSize: 48,
  autoHideSidebar: true,
  sidebarHideDelay: 2000,
  alertSound: true,
  defaultWorkDir: '~',
  // 会话保存与恢复配置
  autoRestoreSessions: false,
  maxLogFileSize: 10 * 1024 * 1024, // 10MB
  maxLogFiles: 5, // 最多保留5个日志文件
  logRotationInterval: 'daily' as const, // daily, weekly, monthly, or size-based
  enableLogTimestamps: true,
  logTimestampFormat: 'YYYY-MM-DD HH:mm:ss',
  snapshotInterval: 30000, // 快照间隔（毫秒）
  backupDirectory: 'backups',
};