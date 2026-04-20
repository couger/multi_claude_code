/**
 * 渲染进程常量 — 从 shared 统一导出
 */

import {
  IPC_CHANNELS,
  SHARED_DEFAULT_CONFIG,
  SessionStatus,
  AlertType,
  DisplayMode,
} from '../shared/constants';

export { IPC_CHANNELS, SessionStatus, AlertType, DisplayMode };

export const DEFAULT_CONFIG = {
  ...SHARED_DEFAULT_CONFIG,
  claudeCommand: 'claude',
} as const;
