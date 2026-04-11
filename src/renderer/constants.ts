/**
 * 渲染进程常量
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

  // 主进程 -> 渲染进程
  SESSION_CREATED: 'session:created',
  SESSION_OUTPUT: 'session:outputChunk',
  SESSION_STATUS: 'session:status',
  SESSION_CLOSED: 'session:closed',
  ALERT: 'alert:trigger',
} as const;

export enum SessionStatus {
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
  IDLE = 'idle',
}

export enum AlertType {
  USER_INPUT = 'user_input',
  TASK_COMPLETE = 'task_complete',
  ERROR = 'error',
  WARNING = 'warning',
}

export enum DisplayMode {
  THUMBNAIL = 'thumbnail',
  ICON = 'icon',
}

export const DEFAULT_CONFIG = {
  maxOutputLines: 1000,
  sidebarWidth: 280,
  thumbnailHeight: 150,
  iconSize: 48,
  autoHideSidebar: true,
  sidebarHideDelay: 2000,
  alertSound: true,
  claudeCommand: 'claude',
  defaultWorkDir: '~',
} as const;