/**
 * IPC 通信类型定义
 */

import { SessionStatus, AlertType } from './constants';

// ==================== 基础类型定义 ====================

/**
 * CLI 会话基础接口
 */
export interface CLISession {
  id: string;
  name: string;
  workDir: string;
  status: SessionStatus;
  note: string;
  createdAt: Date;
  lastActivity: Date;
  outputFile: string;
  args?: string;
}

/**
 * 会话创建选项
 */
export interface CreateSessionOptions {
  workDir?: string;
  name?: string;
  command?: string;
  args?: string;
}

/**
 * 批量操作结果
 */
export interface BatchOperationResult<T = any> {
  success: boolean;
  sessionId?: string;
  session?: T;
  error?: string;
}

// ==================== IPC 通道类型 ====================

/**
 * 渲染进程 -> 主进程的 IPC 通道
 */
export interface RendererToMainIPC {
  // 会话管理
  'session:create': {
    request: CreateSessionOptions;
    response: CLISession;
  };
  'session:kill': {
    request: string; // sessionId
    response: void;
  };
  'session:list': {
    request: void;
    response: CLISession[];
  };
  'session:output': {
    request: string; // sessionId
    response: string[];
  };
  'session:input': {
    request: { sessionId: string; input: string };
    response: void;
  };
  'session:note': {
    request: { sessionId: string; note: string };
    response: void;
  };
  'session:resize': {
    request: { sessionId: string; cols: number; rows: number };
    response: void;
  };
  'dialog:selectWorkdir': {
    request: void;
    response: string | null;
  };

  // 批量操作
  'batch:create': {
    request: CreateSessionOptions[];
    response: BatchOperationResult<CLISession>[];
  };
  'batch:kill': {
    request: string[]; // sessionIds
    response: BatchOperationResult[];
  };
  'batch:pause': {
    request: string[]; // sessionIds
    response: BatchOperationResult[];
  };
  'batch:resume': {
    request: string[]; // sessionIds
    response: BatchOperationResult[];
  };
  'batch:exportLogs': {
    request: { sessionIds: string[]; format?: string };
    response: BatchOperationResult<{ log: string[] }>[];
  };
  'batch:setNotes': {
    request: { sessionIds: string[]; note: string };
    response: BatchOperationResult[];
  };

  // 性能监控
  'metrics:system': {
    request: void;
    response: SystemMetrics;
  };
  'metrics:session': {
    request: void;
    response: SessionMetrics[];
  };
  'metrics:start': {
    request: number | void; // interval (可选)
    response: { success: boolean; message: string; interval?: number };
  };
  'metrics:stop': {
    request: void;
    response: { success: boolean; message: string };
  };

  // 分组管理
  'group:create': {
    request: { name: string; color?: string; order?: number };
    response: Group;
  };
  'group:update': {
    request: { groupId: string; updates: Partial<Group> };
    response: Group;
  };
  'group:delete': {
    request: string; // groupId
    response: boolean;
  };
  'group:list': {
    request: void;
    response: Group[];
  };
  'group:addSession': {
    request: { groupId: string; sessionId: string };
    response: boolean;
  };
  'group:removeSession': {
    request: { groupId: string; sessionId: string };
    response: boolean;
  };
  'group:reorder': {
    request: { groupIds: string[] };
    response: void;
  };
  'group:reorderSessions': {
    request: { groupId: string; sessionIds: string[] };
    response: void;
  };

  // 窗口管理
  'window:maximizeForSession': {
    request: void;
    response: void;
  };
  'window:unmaximizeForSession': {
    request: void;
    response: void;
  };
}

/**
 * 主进程 -> 渲染进程的 IPC 通道
 */
export interface MainToRendererIPC {
  // 会话事件
  'session:created': {
    data: CLISession;
  };
  'session:outputChunk': {
    data: { sessionId: string; output: string };
  };
  'session:status': {
    data: { sessionId: string; status: SessionStatus };
  };
  'session:closed': {
    data: { sessionId: string; exitCode?: number };
  };
  'alert:trigger': {
    data: {
      sessionId: string;
      type: AlertType;
      message: string;
      timestamp: Date;
    };
  };

  // 批量操作响应
  'batch:started': {
    data: { operation: string; total: number };
  };
  'batch:progress': {
    data: { operation: string; current: number; total: number };
  };
  'batch:completed': {
    data: { operation: string; successCount: number; total: number; results: BatchOperationResult[] };
  };
  'batch:error': {
    data: { operation: string; error: string };
  };

  // 性能监控数据推送
  'metrics:systemUpdate': {
    data: SystemMetrics;
  };
  'metrics:sessionUpdate': {
    data: SessionMetrics[];
  };

  // 分组管理响应
  'group:created': {
    data: Group;
  };
  'group:updated': {
    data: Group;
  };
  'group:deleted': {
    data: { groupId: string };
  };
  'group:sessionChanged': {
    data: { groupId: string; sessionId: string; action: 'add' | 'remove' };
  };
}

// ==================== 支持类型定义 ====================

/**
 * 系统性能指标
 */
export interface SystemMetrics {
  cpu: {
    usage: number; // CPU使用率 (0-100)
    cores: number;
    model: string;
  };
  memory: {
    total: number; // 字节
    used: number; // 字节
    free: number; // 字节
    usage: number; // 使用率 (0-100)
  };
  disk: {
    total: number; // 字节
    used: number; // 字节
    free: number; // 字节
    usage: number; // 使用率 (0-100)
  };
  timestamp: Date;
}

/**
 * 会话性能指标
 */
export interface SessionMetrics {
  sessionId: string;
  cpu?: number; // CPU使用率
  memory?: number; // 内存使用量 (字节)
  status: SessionStatus;
  lastActivity: Date;
}

/**
 * 分组定义
 */
export interface Group {
  id: string;
  name: string;
  color: string; // CSS颜色值，如 "#3b82f6"
  order: number; // 显示顺序
  sessionIds: string[]; // 包含的会话ID列表
  createdAt: Date;
  updatedAt: Date;
}

// ==================== 类型工具函数 ====================

/**
 * 获取 IPC 通道类型
 */
export type IPCEvent = keyof RendererToMainIPC | keyof MainToRendererIPC;

/**
 * 获取 IPC 请求类型
 */
export type IPCRequest<T extends keyof RendererToMainIPC> = RendererToMainIPC[T]['request'];

/**
 * 获取 IPC 响应类型
 */
export type IPCResponse<T extends keyof RendererToMainIPC> = RendererToMainIPC[T]['response'];

/**
 * 获取 IPC 事件数据类型
 */
export type IPCData<T extends keyof MainToRendererIPC> = MainToRendererIPC[T]['data'];