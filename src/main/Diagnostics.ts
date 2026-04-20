/**
 * 性能诊断日志
 * 通过环境变量 CCCM_DEBUG=1 启用
 * 输出到 ~/.claude-code-manager/diagnostics.log
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const DEBUG = !!process.env.CCCM_DEBUG;
const LOG_FILE = path.join(os.homedir(), '.claude-code-manager', 'diagnostics.log');

interface PerfCounters {
  outputChunks: number;
  outputBytes: number;
  ipcMessages: number;
  wsBroadcasts: number;
  fileWrites: number;
  alertsTriggered: number;
  intervalsActive: number;
  sessionCount: number;
}

let counters: PerfCounters = {
  outputChunks: 0,
  outputBytes: 0,
  ipcMessages: 0,
  wsBroadcasts: 0,
  fileWrites: 0,
  alertsTriggered: 0,
  intervalsActive: 0,
  sessionCount: 0,
};

let lastReportTime = Date.now();
let reportInterval: NodeJS.Timeout | null = null;
let logStream: fs.WriteStream | null = null;

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeLog(message: string) {
  if (!DEBUG) return;
  if (!logStream) {
    try {
      ensureLogDir();
      logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
      logStream.on('error', () => { logStream = null; });
    } catch {
      return;
    }
  }
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ${message}\n`);
}

export const diagnostics = {
  isEnabled(): boolean {
    return DEBUG;
  },

  /** 记录 PTY 输出块 */
  recordOutput(bytes: number) {
    counters.outputChunks++;
    counters.outputBytes += bytes;
  },

  /** 记录 IPC 消息 */
  recordIPC(channel: string) {
    counters.ipcMessages++;
    if (DEBUG && counters.ipcMessages <= 10) {
      writeLog(`IPC: ${channel}`);
    }
  },

  /** 记录 WebSocket 广播 */
  recordWsBroadcast(clientCount: number) {
    counters.wsBroadcasts++;
  },

  /** 记录文件写入 */
  recordFileWrite(bytes: number) {
    counters.fileWrites++;
  },

  /** 记录告警 */
  recordAlert(type: string) {
    counters.alertsTriggered++;
  },

  /** 更新会话数 */
  setSessionCount(count: number) {
    counters.sessionCount = count;
  },

  /** 启动定期报告 */
  startReporting() {
    if (!DEBUG) return;
    if (reportInterval) return;

    writeLog('=== CCCM Diagnostics Started ===');
    writeLog(`Node version: ${process.version}`);
    writeLog(`Electron version: ${process.versions.electron}`);
    writeLog(`Platform: ${process.platform} ${os.release()}`);
    writeLog(`Total memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`);
    writeLog(`CPU cores: ${os.cpus().length}`);

    // 每 30 秒输出一次性能报告
    reportInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastReportTime) / 1000;
      const mem = process.memoryUsage();

      const report = [
        `--- Performance Report (last ${elapsed.toFixed(0)}s) ---`,
        `  Memory: RSS ${(mem.rss / 1024 / 1024).toFixed(1)} MB | Heap ${(mem.heapUsed / 1024 / 1024).toFixed(1)}/${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`,
        `  Output: ${counters.outputChunks} chunks (${(counters.outputBytes / 1024).toFixed(1)} KB) = ${(counters.outputChunks / elapsed).toFixed(1)}/s`,
        `  IPC: ${counters.ipcMessages} messages = ${(counters.ipcMessages / elapsed).toFixed(1)}/s`,
        `  WS broadcasts: ${counters.wsBroadcasts} = ${(counters.wsBroadcasts / elapsed).toFixed(1)}/s`,
        `  File writes: ${counters.fileWrites} = ${(counters.fileWrites / elapsed).toFixed(1)}/s`,
        `  Alerts: ${counters.alertsTriggered}`,
        `  Sessions: ${counters.sessionCount}`,
        `  System free mem: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
      ].join('\n');

      writeLog(report);

      // 重置计数器
      counters = {
        outputChunks: 0,
        outputBytes: 0,
        ipcMessages: 0,
        wsBroadcasts: 0,
        fileWrites: 0,
        alertsTriggered: 0,
        intervalsActive: 0,
        sessionCount: counters.sessionCount,
      };
      lastReportTime = now;
    }, 30000);
  },

  /** 停止报告 */
  stopReporting() {
    if (reportInterval) {
      clearInterval(reportInterval);
      reportInterval = null;
    }
    if (logStream) {
      logStream.end();
      logStream = null;
    }
  },

  /** 手动记录日志 */
  log(message: string) {
    writeLog(message);
  },
};
