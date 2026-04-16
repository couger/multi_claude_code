/**
 * 渲染进程常量
 */

import { SessionStatus, AlertType, DisplayMode, SHARED_DEFAULT_CONFIG } from '../shared/constants';

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

/**
 * 默认配置（渲染进程特有）
 */
export const DEFAULT_CONFIG = {
  ...SHARED_DEFAULT_CONFIG,
  claudeCommand: 'claude', // 渲染进程中不需要实际路径，使用默认值
} as const;

export { SessionStatus, AlertType, DisplayMode };