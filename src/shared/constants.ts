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
 * 告警严重级别
 */
export enum AlertSeverity {
  CRITICAL = 'critical',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

/**
 * 告警通知方式
 */
export enum AlertNotifyMode {
  NONE = 'none',
  WEAK = 'weak',
  STRONG = 'strong',
}

/**
 * 告警类型到严重级别的默认映射
 */
export const ALERT_SEVERITY_MAP: Record<AlertType, AlertSeverity> = {
  [AlertType.ERROR]: AlertSeverity.ERROR,
  [AlertType.USER_INPUT]: AlertSeverity.WARNING,
  [AlertType.WARNING]: AlertSeverity.WARNING,
  [AlertType.TASK_COMPLETE]: AlertSeverity.INFO,
};

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