/**
 * IPC 通道常量
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
  RESIZE_SESSION: 'session:resize',
  WINDOW_MAXIMIZE: 'window:maximizeForSession',
  WINDOW_UNMAXIMIZE: 'window:unmaximizeForSession',

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

  // 外部进程检测
  CHECK_EXTERNAL_CLAUDE: 'external:checkClaude',

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
 * 自动检测 Claude CLI 路径
 */
function detectClaudeCommand(): string {
  const { execSync } = require('child_process');
  try {
    const result = execSync('where claude 2>nul || which claude 2>/dev/null', { encoding: 'utf-8' });
    const paths: string[] = result.trim().split(/\r?\n/);
    // 优先使用 .cmd（Windows npm 全局安装）或第一个结果
    const cmdPath = paths.find((p: string) => p.trim().endsWith('.cmd'));
    return (cmdPath || paths[0]).trim();
  } catch {
    // 回退到常见路径
    const homeDir = require('os').homedir();
    const path = require('path');
    const candidates = [
      path.join(homeDir, '.local', 'bin', 'claude.exe'),
      path.join(homeDir, '.local', 'bin', 'claude'),
    ];
    for (const p of candidates) {
      try {
        require('fs').accessSync(p);
        return p;
      } catch { /* continue */ }
    }
    return 'claude'; // 最终回退：依赖 PATH 查找
  }
}

/**
 * 默认配置（主进程特有）
 */
export const DEFAULT_CONFIG = {
  ...SHARED_DEFAULT_CONFIG,
  claudeCommand: detectClaudeCommand(),
};

export { SessionStatus, AlertType, DisplayMode };
