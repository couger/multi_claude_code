/**
 * 共享类型定义 — 主进程和渲染进程共用
 */

import { SessionStatus } from './constants';

/** 会话信息（IPC 传输用，不含 pty 等不可序列化字段） */
export interface SessionInfo {
  id: string;
  name: string;
  workDir: string;
  status: SessionStatus;
  note: string;
  createdAt: string;
  lastActivity: string;
  outputFile: string;
  pid?: number;
  args?: string;
}

/** 会话内部对象（主进程 ProcessManager 使用） */
export interface SessionInternal {
  id: string;
  name: string;
  workDir: string;
  status: SessionStatus;
  note: string;
  createdAt: Date;
  lastActivity: Date;
  outputFile: string;
  pid?: number;
  args?: string;
  pty: any; // node-pty IPty
  outputBuffer: string[];
}

/** 创建会话选项 */
export interface CreateSessionOptions {
  name?: string;
  workDir?: string;
  args?: string;
  command?: string;
  skipConflictCheck?: boolean;
}

/** 工作目录冲突信息 */
export interface WorkDirConflict {
  sessionId: string;
  sessionName: string;
  workDir: string;
  conflictType: 'same' | 'child' | 'parent';
}

/** 外部 Claude Code 检测结果 */
export interface ExternalClaudeCheckResult {
  detected: boolean;
  warnings: string[];
  details?: Record<string, unknown>;
}

/** IPC 输出数据 */
export interface SessionOutputPayload {
  id: string;
  data: string;
  timestamp: number;
}

/** IPC 状态变更 */
export interface SessionStatusPayload {
  id: string;
  status: SessionStatus;
  exitCode?: number;
  message?: string;
}

/** IPC 告警 */
export interface AlertPayload {
  sessionId: string;
  type: string;
  message: string;
}

/** 系统性能指标 */
export interface SystemMetrics {
  cpu: { usage: number; cores: number; model: string; speed: number };
  memory: { total: number; used: number; free: number; usagePercent: number };
  disk: { total: number; used: number; free: number; usagePercent: number };
  network: {
    interfaces: Array<{ name: string; ip4: string; ip6: string; mac: string; speed: number }>;
    rx_bytes: number;
    tx_bytes: number;
  };
  processes: { total: number; running: number; sleeping: number };
  uptime: number;
  timestamp: number;
}

/** 会话性能指标 */
export interface SessionMetrics {
  sessionId: string;
  pid?: number;
  cpuUsage: number;
  memoryUsage: number;
  memoryRss: number;
  memoryHeapTotal: number;
  memoryHeapUsed: number;
  uptime: number;
  outputLines: number;
  status: string;
  lastActivity: Date;
  timestamp: number;
}

/** 分组信息 */
export interface GroupInfo {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
  order: number;
  collapsed: boolean;
}

/** 分组创建选项 */
export interface CreateGroupOptions {
  name: string;
  color: string;
  icon: string;
  description?: string;
}

/** 远程访问状态 */
export interface RemoteStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  token: string;
  localIPs: string[];
  clientCount: number;
  clients: Array<{ id: string; ip: string; connectedAt: string }>;
}

/** 通用设置 */
export interface GeneralSettings {
  showGroupPanel?: boolean;
  showPerformancePanel?: boolean;
  defaultBrowseDir?: string;
  allowRemoteCreateSession?: boolean;
  terminalFontSize?: number;
  minimizeToTrayOnClose?: boolean;
  hideDirection?: 'left' | 'right';
  hideToPrimary?: boolean;
  maxRemoteConnections?: number;
}

/** 配置文件结构 */
export interface AppConfig {
  accessToken?: string;
  minimizeToTrayOnClose?: boolean;
  defaultBrowseDir?: string;
  hideDirection?: string;
  [key: string]: unknown;
}
