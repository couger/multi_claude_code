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
import { diagnostics } from './Diagnostics';
import type { SessionInfo, SessionInternal, CreateSessionOptions, WorkDirConflict, ExternalClaudeCheckResult } from '../shared/types';

class ProcessManager {
  sessions: Map<string, SessionInternal>;
  outputDir: string;
  private outputBuffers: Map<string, string> = new Map();
  private outputFlushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.sessions = new Map();
    this.outputDir = path.join(os.homedir(), '.claude-code-manager', 'outputs');
    fs.promises.mkdir(this.outputDir, { recursive: true }).catch(() => {});
    this.outputFlushInterval = setInterval(() => this.flushOutput(), 50);
    this.loadSessions();
  }

  checkWorkDirConflict(workDir: string): WorkDirConflict[] {
    const conflicts: WorkDirConflict[] = [];
    const normalizedNew = path.resolve(workDir).toLowerCase();

    for (const [, session] of this.sessions) {
      if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.ERROR) continue;
      const normalizedExisting = path.resolve(session.workDir).toLowerCase();

      if (normalizedNew === normalizedExisting) {
        conflicts.push({ sessionId: session.id, sessionName: session.name, workDir: session.workDir, conflictType: 'same' });
      } else if (normalizedNew.startsWith(normalizedExisting + path.sep)) {
        conflicts.push({ sessionId: session.id, sessionName: session.name, workDir: session.workDir, conflictType: 'child' });
      } else if (normalizedExisting.startsWith(normalizedNew + path.sep)) {
        conflicts.push({ sessionId: session.id, sessionName: session.name, workDir: session.workDir, conflictType: 'parent' });
      }
    }
    return conflicts;
  }

  async checkExternalClaudeCode(workDir: string): Promise<ExternalClaudeCheckResult> {
    const warnings: string[] = [];
    let detected = false;
    const details: Record<string, unknown> = {};

    try {
      const claudeDir = path.join(workDir, '.claude');
      const claudeDirExists = await fs.promises.access(claudeDir).then(() => true).catch(() => false);
      if (claudeDirExists) {
        const lockFiles = ['CLAUDE.md', 'settings.json', 'statsig_user_metadata.json'];
        const foundFiles: string[] = [];
        for (const file of lockFiles) {
          const exists = await fs.promises.access(path.join(claudeDir, file)).then(() => true).catch(() => false);
          if (exists) foundFiles.push(file);
        }
        if (foundFiles.length > 0) {
          warnings.push(`发现 .claude 目录中存在配置文件: ${foundFiles.join(', ')}`);
          details.claudeDir = foundFiles;
          detected = true;
        }
      }

      if (process.platform === 'win32') {
        try {
          const { execSync } = require('child_process');
          const output = execSync('tasklist /FI "IMAGENAME eq claude.exe" /FO CSV', { encoding: 'utf8' });
          const lines = output.split('\n').filter((l: string) => l.trim());
          if (lines.length > 1) {
            const procCount = lines.length - 1;
            warnings.push(`检测到 ${procCount} 个 Claude.exe 进程正在运行`);
            details.claudeProcesses = procCount;
            detected = true;
          }
        } catch { /* ignore */ }
      } else {
        try {
          const { execSync } = require('child_process');
          const output = execSync('pgrep -f "claude" || true', { encoding: 'utf8' });
          const pids = output.trim().split('\n').filter((p: string) => p && !p.includes('claude-code-manager'));
          if (pids.length > 0) {
            warnings.push(`检测到 ${pids.length} 个 Claude 相关进程正在运行 (PID: ${pids.slice(0, 3).join(', ')}${pids.length > 3 ? '...' : ''})`);
            details.claudeProcesses = pids.length;
            detected = true;
          }
        } catch { /* ignore */ }
      }

      try {
        const testFile = path.join(workDir, '.claude_lock_test');
        const fd = fs.openSync(testFile, 'wx');
        fs.closeSync(fd);
        fs.unlinkSync(testFile);
      } catch (e: any) {
        if (e.code === 'EACCES' || e.code === 'EPERM') {
          warnings.push('工作目录可能被其他进程锁定');
          details.dirLocked = true;
          detected = true;
        }
      }
    } catch (e) {
      console.error('检测外部 Claude Code 进程失败:', e);
    }

    return { detected, warnings, details: Object.keys(details).length > 0 ? details : undefined };
  }

  async createSession(options: CreateSessionOptions = {}): Promise<SessionInfo> {
    const id = uuidv4();
    const workDir = options.workDir || os.homedir();
    const name = options.name || `CLI #${this.sessions.size + 1}`;
    const command = options.command || DEFAULT_CONFIG.claudeCommand;
    const argsString = options.args || '';
    const outputFile = path.join(this.outputDir, `${id}.log`);

    // 验证工作目录是否存在
    try {
      const stat = await fs.promises.stat(workDir);
      if (!stat.isDirectory()) {
        throw new Error(`工作目录不是一个有效的目录: ${workDir}`);
      }
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        throw new Error(`工作目录不存在: ${workDir}`);
      }
      if (e.code === 'EACCES') {
        throw new Error(`没有权限访问工作目录: ${workDir}`);
      }
      throw e;
    }

    const parsedArgs: string[] = argsString
      ? argsString.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((a: string) => a.replace(/^"|"$/g, '')) || []
      : [];

    await fs.promises.writeFile(outputFile, '');

    const session: SessionInternal = {
      id, name, workDir,
      status: SessionStatus.RUNNING,
      note: '',
      createdAt: new Date(),
      lastActivity: new Date(),
      outputFile,
      outputBuffer: [],
      args: argsString || undefined,
      pty: null as any,
    };

    try {
      // 设置终端环境变量 - vt100 可以保留颜色但可能有不同的回显行为
      const ptyEnv = { ...process.env, TERM: 'vt100' };

      const ptyProcess = pty.spawn(command, parsedArgs, {
        name: 'xterm-256color', cols: 120, rows: 30, cwd: workDir, env: ptyEnv,
      });

      session.pty = ptyProcess;
      session.pid = ptyProcess.pid;

      ptyProcess.onData((data: string) => this.handleOutput(id, data));
      ptyProcess.onExit(({ exitCode }) => this.handleExit(id, exitCode));

      this.sessions.set(id, session);
      await this.saveSessions();

      sendToRenderer(IPC_CHANNELS.SESSION_CREATED, this.toPublicSession(session));
      return this.toPublicSession(session);
    } catch (error: any) {
      session.status = SessionStatus.ERROR;
      // 提供更友好的错误信息
      const errorCode = error?.code || '';
      if (errorCode === 'ENOENT') {
        throw new Error(`无法找到 Claude CLI 命令: ${command}\n请确保 Claude Code CLI 已正确安装并添加到 PATH 中。`);
      }
      if (errorCode === 'EACCES' || errorCode === 'EPERM') {
        throw new Error(`没有权限执行命令: ${command}`);
      }
      throw new Error(`创建会话失败: ${error?.message || String(error)}`);
    }
  }

  async killSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Session ${id} not found`);

    if (session.pty) {
      try { session.pty.kill(); } catch (e) { console.error(`终止会话 ${id} 的 pty 进程失败:`, e); }
    }

    session.status = SessionStatus.COMPLETED;
    this.sessions.delete(id);
    await this.saveSessions();
    sendToRenderer(IPC_CHANNELS.SESSION_CLOSED, { id });
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => this.toPublicSession(s));
  }

  async getSessionOutput(id: string): Promise<string> {
    const session = this.sessions.get(id);
    if (!session) return '';
    try {
      return await fs.promises.readFile(session.outputFile, 'utf-8');
    } catch {
      return session.outputBuffer.join('');
    }
  }

  sendInput(id: string, data: string) {
    const session = this.sessions.get(id);
    if (session?.pty && session.status === SessionStatus.RUNNING) {
      session.pty.write(data);
      session.lastActivity = new Date();
    }
  }

  setNote(id: string, note: string) {
    const session = this.sessions.get(id);
    if (session) {
      session.note = note;
      this.saveSessions().catch(e => console.error('保存会话注释失败:', e));
    }
  }

  resizeSession(id: string, cols: number, rows: number) {
    const session = this.sessions.get(id);
    if (session?.pty && session.status === SessionStatus.RUNNING) {
      try { session.pty.resize(cols, rows); } catch { /* pty 可能已退出 */ }
    }
  }

  private handleOutput(id: string, data: string) {
    const session = this.sessions.get(id);
    if (!session) return;

    session.outputBuffer.push(data);
    if (session.outputBuffer.length > DEFAULT_CONFIG.maxOutputLines) {
      session.outputBuffer.shift();
    }

    fs.promises.appendFile(session.outputFile, data).catch(() => {});
    diagnostics.recordFileWrite(data.length);

    session.lastActivity = new Date();

    const existing = this.outputBuffers.get(id) || '';
    this.outputBuffers.set(id, existing + data);
    diagnostics.recordOutput(data.length);

    this.checkAlerts(id, data);
  }

  private flushOutput() {
    for (const [id, data] of this.outputBuffers) {
      if (data.length > 0) {
        sendToRenderer(IPC_CHANNELS.SESSION_OUTPUT, { id, data, timestamp: Date.now() });
      }
    }
    this.outputBuffers.clear();
  }

  private handleExit(id: string, exitCode: number) {
    const session = this.sessions.get(id);
    if (!session) return;

    session.status = exitCode === 0 ? SessionStatus.COMPLETED : SessionStatus.ERROR;
    this.saveSessions().catch(e => console.error('保存会话退出状态失败:', e));

    sendToRenderer(IPC_CHANNELS.SESSION_STATUS, { id, status: session.status, exitCode });

    sendToRenderer(IPC_CHANNELS.ALERT, {
      sessionId: id,
      type: exitCode === 0 ? AlertType.TASK_COMPLETE : AlertType.ERROR,
      message: exitCode === 0 ? `任务 "${session.name}" 已完成` : `任务 "${session.name}" 异常退出 (code: ${exitCode})`,
    });
  }

  private checkAlerts(id: string, data: string) {
    const session = this.sessions.get(id);
    if (!session) return;

    const inputPatterns = [/\?\s*$/, /\[Y\/n\]/i, /\[y\/N\]/i, /please.*input/i, /enter.*:/i, /waiting.*input/i];
    for (const pattern of inputPatterns) {
      if (pattern.test(data)) {
        sendToRenderer(IPC_CHANNELS.ALERT, { sessionId: id, type: AlertType.USER_INPUT, message: `任务 "${session.name}" 等待输入` });
        break;
      }
    }

    const errorPatterns = [/error:/i, /fatal:/i, /exception/i, /failed/i];
    for (const pattern of errorPatterns) {
      if (pattern.test(data)) {
        sendToRenderer(IPC_CHANNELS.ALERT, { sessionId: id, type: AlertType.WARNING, message: `任务 "${session.name}" 出现错误` });
        break;
      }
    }
  }

  toPublicSession(session: SessionInternal): SessionInfo {
    return {
      id: session.id, name: session.name, workDir: session.workDir,
      status: session.status, note: session.note,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      outputFile: session.outputFile, pid: session.pid, args: session.args,
    };
  }

  killAllSessions() {
    for (const [id] of this.sessions) {
      this.killSession(id).catch(e => console.error(`关闭会话 ${id} 失败:`, e));
    }
  }

  private async saveSessions() {
    const sessionsFile = path.join(this.outputDir, 'sessions.json');
    const data = Array.from(this.sessions.values()).map(s => ({
      id: s.id, name: s.name, workDir: s.workDir, status: s.status, note: s.note,
      createdAt: s.createdAt, lastActivity: s.lastActivity, outputFile: s.outputFile, pid: s.pid,
    }));
    try {
      await fs.promises.writeFile(sessionsFile, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('保存会话列表失败:', e);
    }
  }

  private async loadSessions() {
    const sessionsFile = path.join(this.outputDir, 'sessions.json');
    try {
      const content = await fs.promises.readFile(sessionsFile, 'utf-8');
      const data = JSON.parse(content);
      for (const sessionData of data) {
        const session: SessionInternal = {
          ...sessionData,
          createdAt: new Date(sessionData.createdAt),
          lastActivity: new Date(sessionData.lastActivity),
          outputBuffer: [],
          status: SessionStatus.IDLE,
          pty: null as any,
        };
        this.sessions.set(session.id, session);
      }
    } catch (e) {
      // 文件不存在时忽略
    }
  }

  cleanup() {
    if (this.outputFlushInterval) {
      clearInterval(this.outputFlushInterval);
      this.outputFlushInterval = null;
    }
    this.flushOutput();
  }
}

export { ProcessManager };
