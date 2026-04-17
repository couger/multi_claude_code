/**
 * CLI 进程管理器
 */

import * as pty from 'node-pty';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

import { sendToRenderer } from './index';
import { IPC_CHANNELS, DEFAULT_CONFIG } from './constants';
import { SessionStatus, AlertType } from '../shared/constants';

class ProcessManager {
  sessions: Map<any, any>;
  outputDir: string;

  constructor() {
    this.sessions = new Map();
    // 创建输出目录
    this.outputDir = path.join(os.homedir(), '.claude-code-manager', 'outputs');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // 加载已有会话
    this.loadSessions();
  }

  /**
   * 检查工作目录是否与现有会话冲突
   * 返回冲突的会话列表
   */
  checkWorkDirConflict(workDir: string): Array<{ sessionId: string; sessionName: string; workDir: string; conflictType: string }> {
    const conflicts: Array<{ sessionId: string; sessionName: string; workDir: string; conflictType: string }> = [];
    const normalizedNew = path.resolve(workDir).toLowerCase();

    for (const [id, session] of this.sessions) {
      if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.ERROR) continue;

      const normalizedExisting = path.resolve(session.workDir).toLowerCase();

      // 检查是否是相同路径或父子关系
      if (normalizedNew === normalizedExisting) {
        conflicts.push({
          sessionId: id,
          sessionName: session.name,
          workDir: session.workDir,
          conflictType: 'same',
        });
      } else if (normalizedNew.startsWith(normalizedExisting + path.sep)) {
        conflicts.push({
          sessionId: id,
          sessionName: session.name,
          workDir: session.workDir,
          conflictType: 'child',
        });
      } else if (normalizedExisting.startsWith(normalizedNew + path.sep)) {
        conflicts.push({
          sessionId: id,
          sessionName: session.name,
          workDir: session.workDir,
          conflictType: 'parent',
        });
      }
    }

    return conflicts;
  }

  /**
   * 创建新的 CLI 会话
   */
  async createSession(options: any = {}) {
    const id = uuidv4();
    const workDir = options.workDir || os.homedir();
    const name = options.name || `CLI #${this.sessions.size + 1}`;
    const command = options.command || DEFAULT_CONFIG.claudeCommand;
    const argsString = options.args || '';
    const outputFile = path.join(this.outputDir, `${id}.log`);

    // 解析启动参数字符串为数组（处理带引号的参数）
    const parsedArgs: string[] = argsString
      ? argsString.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((a: string) => a.replace(/^"|"$/g, '')) || []
      : [];

    // 创建输出文件
    fs.writeFileSync(outputFile, '');

    const session: any = {
      id,
      name,
      workDir,
      status: SessionStatus.RUNNING,
      note: '',
      createdAt: new Date(),
      lastActivity: new Date(),
      outputFile,
      outputBuffer: [],
      args: argsString || undefined,
    };

    try {
      // 使用 node-pty 创建伪终端
      const ptyProcess = pty.spawn(command, parsedArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: workDir,
        env: process.env,
      });

      session.pty = ptyProcess;
      session.pid = ptyProcess.pid;

      // 监听输出
      ptyProcess.onData((data: string) => {
        this.handleOutput(id, data);
      });

      // 监听退出
      ptyProcess.onExit(({ exitCode }) => {
        this.handleExit(id, exitCode);
      });

      this.sessions.set(id, session);
      this.saveSessions();

      // 通知渲染进程
      sendToRenderer(IPC_CHANNELS.SESSION_CREATED, this.toPublicSession(session));

      return this.toPublicSession(session);
    } catch (error) {
      session.status = SessionStatus.ERROR;
      throw error;
    }
  }

  /**
   * 终止会话
   */
  async killSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    if (session.pty) {
      try {
        session.pty.kill();
      } catch {
        // 忽略错误
      }
    }

    session.status = SessionStatus.COMPLETED;
    this.sessions.delete(id);
    this.saveSessions();

    sendToRenderer(IPC_CHANNELS.SESSION_CLOSED, { id });
  }

  /**
   * 暂停会话（发送 SIGSTOP）
   */
  async pauseSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    if (session.pty && session.pid) {
      try {
        // 在Windows上，node-pty不支持SIGSTOP，我们使用其他方法
        // 暂时标记为暂停状态
        session.status = SessionStatus.PAUSED;
        this.saveSessions();
        
        sendToRenderer(IPC_CHANNELS.SESSION_STATUS, {
          id,
          status: SessionStatus.PAUSED,
          message: '会话已暂停',
        });
      } catch (error) {
        console.error(`暂停会话 ${id} 时出错:`, error);
        throw error;
      }
    }
  }

  /**
   * 恢复会话（发送 SIGCONT）
   */
  async resumeSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    if (session.pty && session.pid) {
      try {
        session.status = SessionStatus.RUNNING;
        this.saveSessions();
        
        sendToRenderer(IPC_CHANNELS.SESSION_STATUS, {
          id,
          status: SessionStatus.RUNNING,
          message: '会话已恢复',
        });
      } catch (error) {
        console.error(`恢复会话 ${id} 时出错:`, error);
        throw error;
      }
    }
  }

  /**
   * 终止所有会话
   */
  killAllSessions() {
    for (const [id] of this.sessions) {
      this.killSession(id);
    }
  }

  /**
   * 获取会话列表
   */
  getSessions() {
    return Array.from(this.sessions.values()).map(s => this.toPublicSession(s));
  }

  /**
   * 获取会话输出
   */
  getSessionOutput(id: string) {
    const session = this.sessions.get(id);
    if (!session) {
      return '';
    }

    // 从文件读取完整输出
    try {
      return fs.readFileSync(session.outputFile, 'utf-8');
    } catch {
      return session.outputBuffer.join('');
    }
  }

  /**
   * 向会话发送输入
   */
  sendInput(id: string, data: string) {
    const session = this.sessions.get(id);
    if (session?.pty && session.status === SessionStatus.RUNNING) {
      session.pty.write(data);
      session.lastActivity = new Date();
    }
  }

  /**
   * 设置会话注释
   */
  setNote(id: string, note: string) {
    const session = this.sessions.get(id);
    if (session) {
      session.note = note;
      this.saveSessions();
    }
  }

  /**
   * 调整终端大小
   */
  resizeSession(id: string, cols: number, rows: number) {
    const session = this.sessions.get(id);
    if (session?.pty && session.status === SessionStatus.RUNNING) {
      try {
        session.pty.resize(cols, rows);
      } catch {
        // pty 可能已退出，忽略 resize 错误
      }
    }
  }

  /**
   * 处理输出
   */
  handleOutput(id: string, data: string) {
    const session = this.sessions.get(id);
    if (!session) return;

    // 添加到缓冲区
    session.outputBuffer.push(data);
    if (session.outputBuffer.length > DEFAULT_CONFIG.maxOutputLines) {
      session.outputBuffer.shift();
    }

    // 追加到文件
    try {
      fs.appendFileSync(session.outputFile, data);
    } catch {
      // 忽略文件写入错误
    }

    session.lastActivity = new Date();

    // 发送输出到渲染进程
    sendToRenderer(IPC_CHANNELS.SESSION_OUTPUT, {
      id,
      data,
      timestamp: Date.now(),
    });

    // 检测告警
    this.checkAlerts(id, data);
  }

  /**
   * 处理进程退出
   */
  handleExit(id: string, exitCode: number) {
    const session = this.sessions.get(id);
    if (!session) return;

    session.status = exitCode === 0 ? SessionStatus.COMPLETED : SessionStatus.ERROR;
    this.saveSessions();

    sendToRenderer(IPC_CHANNELS.SESSION_STATUS, {
      id,
      status: session.status,
      exitCode,
    });

    // 发送完成告警
    if (exitCode === 0) {
      sendToRenderer(IPC_CHANNELS.ALERT, {
        sessionId: id,
        type: AlertType.TASK_COMPLETE,
        message: `任务 "${session.name}" 已完成`,
      });
    } else {
      sendToRenderer(IPC_CHANNELS.ALERT, {
        sessionId: id,
        type: AlertType.ERROR,
        message: `任务 "${session.name}" 异常退出 (code: ${exitCode})`,
      });
    }
  }

  /**
   * 检测告警
   */
  checkAlerts(id: string, data: string) {
    const session = this.sessions.get(id);
    if (!session) return;

    // 检测需要用户输入
    const inputPatterns = [
      /\?\s*$/,
      /\[Y\/n\]/i,
      /\[y\/N\]/i,
      /please.*input/i,
      /enter.*:/i,
      /waiting.*input/i,
    ];

    for (const pattern of inputPatterns) {
      if (pattern.test(data)) {
        sendToRenderer(IPC_CHANNELS.ALERT, {
          sessionId: id,
          type: AlertType.USER_INPUT,
          message: `任务 "${session.name}" 等待输入`,
        });
        break;
      }
    }

    // 检测错误
    const errorPatterns = [
      /error:/i,
      /fatal:/i,
      /exception/i,
      /failed/i,
    ];

    for (const pattern of errorPatterns) {
      if (pattern.test(data)) {
        sendToRenderer(IPC_CHANNELS.ALERT, {
          sessionId: id,
          type: AlertType.WARNING,
          message: `任务 "${session.name}" 出现错误`,
        });
        break;
      }
    }
  }

  /**
   * 转换为公开会话信息
   */
  toPublicSession(session: any) {
    return {
      id: session.id,
      name: session.name,
      workDir: session.workDir,
      status: session.status,
      note: session.note,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      outputFile: session.outputFile,
      pid: session.pid,
      args: session.args,
    };
  }

  /**
   * 保存会话信息到文件
   */
  saveSessions() {
    const sessionsFile = path.join(this.outputDir, 'sessions.json');
    const data = Array.from(this.sessions.values()).map((s: any) => ({
      id: s.id,
      name: s.name,
      workDir: s.workDir,
      status: s.status,
      note: s.note,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      outputFile: s.outputFile,
      pid: s.pid,
    }));
    fs.writeFileSync(sessionsFile, JSON.stringify(data, null, 2));
  }

  /**
   * 加载已有会话
   */
  loadSessions() {
    const sessionsFile = path.join(this.outputDir, 'sessions.json');
    if (!fs.existsSync(sessionsFile)) return;

    try {
      const data = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
      for (const sessionData of data) {
        const session = {
          ...sessionData,
          createdAt: new Date(sessionData.createdAt),
          lastActivity: new Date(sessionData.lastActivity),
          outputBuffer: [],
          status: SessionStatus.IDLE, // 重启后标记为 IDLE
        };
        this.sessions.set(session.id, session);
      }
    } catch {
      // 忽略加载错误
    }
  }
}

export { ProcessManager };
