/**
 * 性能监控管理器
 */

import os from 'os';
import fs from 'fs';
import { ProcessManager } from './ProcessManager';
import { sendToRenderer } from './index';
import { IPC_CHANNELS } from './constants';

interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    model: string;
    speed: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  network: {
    interfaces: Array<{
      name: string;
      ip4: string;
      ip6: string;
      mac: string;
      speed: number;
    }>;
    rx_bytes: number;
    tx_bytes: number;
  };
  processes: {
    total: number;
    running: number;
    sleeping: number;
  };
  uptime: number;
  timestamp: number;
}

interface SessionMetrics {
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

class PerformanceMonitor {
  private processManager: ProcessManager;
  private monitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private systemMetricsCache: SystemMetrics | null = null;
  private sessionMetricsCache: Map<string, SessionMetrics> = new Map();
  private updateInterval: number = 5000; // 5秒更新一次
  private lastCpuUsage: NodeJSCpuUsage | null = null;

  constructor(processManager: ProcessManager) {
    this.processManager = processManager;
  }

  /**
   * 开始监控
   */
  startMonitoring(interval: number = 5000) {
    if (this.monitoring) return;
    
    this.monitoring = true;
    this.updateInterval = interval;
    
    // 初始化 CPU 使用率计算
    this.lastCpuUsage = process.cpuUsage();
    
    this.monitoringInterval = setInterval(async () => {
      await this.updateMetrics();
    }, this.updateInterval);
    
    console.log(`性能监控已启动，更新间隔: ${interval}ms`);
  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    if (!this.monitoring) return;
    
    this.monitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    console.log('性能监控已停止');
  }

  /**
   * 更新所有指标
   */
  async updateMetrics() {
    try {
      const systemMetrics = await this.getSystemMetrics();
      const sessionMetrics = await this.getSessionMetrics();
      
      this.systemMetricsCache = systemMetrics;
      this.sessionMetricsCache = new Map(
        sessionMetrics.map(m => [m.sessionId, m])
      );
      
      // 发送指标更新到渲染进程
      if (this.monitoring) {
        sendToRenderer(IPC_CHANNELS.SYSTEM_METRICS_UPDATE, systemMetrics);
        sendToRenderer(IPC_CHANNELS.SESSION_METRICS_UPDATE, sessionMetrics);
      }
    } catch (error) {
      console.error('更新性能指标时出错:', error);
    }
  }

  /**
   * 获取系统指标
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      // 获取 CPU 使用率
      const currentCpuUsage = process.cpuUsage();
      let cpuUsagePercent = 0;
      
      if (this.lastCpuUsage) {
        const userDiff = currentCpuUsage.user - this.lastCpuUsage.user;
        const systemDiff = currentCpuUsage.system - this.lastCpuUsage.system;
        const totalDiff = userDiff + systemDiff;
        const timeDiff = this.updateInterval * 1000; // 转换为微秒
        
        // CPU 使用率计算（近似值）
        cpuUsagePercent = (totalDiff / timeDiff) * 100;
      }
      
      this.lastCpuUsage = currentCpuUsage;
      
      // 获取内存信息
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      
      // 获取网络接口信息
      const networkInterfaces = os.networkInterfaces();
      const interfaces: Array<{
        name: string;
        ip4: string;
        ip6: string;
        mac: string;
        speed: number;
      }> = [];
      
      for (const [name, nets] of Object.entries(networkInterfaces)) {
        if (!nets) continue;
        
        for (const net of nets) {
          if (!net.internal && net.family === 'IPv4') {
            interfaces.push({
              name,
              ip4: net.address,
              ip6: '',
              mac: net.mac || 'N/A',
              speed: 0, // 需要额外库获取
            });
          }
        }
      }
      
      // 获取磁盘使用情况（简化版）
      let diskTotal = 0;
      let diskFree = 0;
      let diskUsed = 0;
      
      try {
        const stats = fs.statfsSync('/');
        diskTotal = stats.bsize * stats.blocks;
        diskFree = stats.bsize * stats.bfree;
        diskUsed = diskTotal - diskFree;
      } catch {
        // 如果无法获取磁盘信息，使用默认值
        diskTotal = 0;
        diskFree = 0;
        diskUsed = 0;
      }
      
      return {
        cpu: {
          usage: Math.min(cpuUsagePercent, 100), // 限制在 0-100%
          cores: os.cpus().length,
          model: os.cpus()[0]?.model || 'Unknown',
          speed: os.cpus()[0]?.speed || 0,
        },
        memory: {
          total: totalMem,
          used: usedMem,
          free: freeMem,
          usagePercent: (usedMem / totalMem) * 100,
        },
        disk: {
          total: diskTotal,
          used: diskUsed,
          free: diskFree,
          usagePercent: diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0,
        },
        network: {
          interfaces,
          rx_bytes: 0, // 需要额外库获取
          tx_bytes: 0, // 需要额外库获取
        },
        processes: {
          total: 0, // 需要额外库获取
          running: 0,
          sleeping: 0,
        },
        uptime: os.uptime(),
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('获取系统指标时出错:', error);
      
      // 返回基本指标作为回退
      return {
        cpu: {
          usage: 0,
          cores: os.cpus().length,
          model: os.cpus()[0]?.model || 'Unknown',
          speed: os.cpus()[0]?.speed || 0,
        },
        memory: {
          total: os.totalmem(),
          used: os.totalmem() - os.freemem(),
          free: os.freemem(),
          usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
        },
        disk: {
          total: 0,
          used: 0,
          free: 0,
          usagePercent: 0,
        },
        network: {
          interfaces: [],
          rx_bytes: 0,
          tx_bytes: 0,
        },
        processes: {
          total: 0,
          running: 0,
          sleeping: 0,
        },
        uptime: os.uptime(),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 获取会话指标
   */
  async getSessionMetrics(): Promise<SessionMetrics[]> {
    const sessions = this.processManager.getSessions();
    const metrics: SessionMetrics[] = [];
    
    for (const session of sessions) {
      try {
        // 简化版：只获取基本会话信息
        const sessionMetric: SessionMetrics = {
          sessionId: session.id,
          pid: session.pid,
          cpuUsage: 0,
          memoryUsage: 0,
          memoryRss: 0,
          memoryHeapTotal: 0,
          memoryHeapUsed: 0,
          uptime: Date.now() - new Date(session.createdAt).getTime(),
          outputLines: 0,
          status: session.status,
          lastActivity: session.lastActivity,
          timestamp: Date.now(),
        };
        
        metrics.push(sessionMetric);
      } catch (error) {
        console.error(`获取会话 ${session.id} 指标时出错:`, error);
      }
    }
    
    return metrics;
  }

  /**
   * 获取缓存的系统指标
   */
  getCachedSystemMetrics(): SystemMetrics | null {
    return this.systemMetricsCache;
  }

  /**
   * 获取缓存的会话指标
   */
  getCachedSessionMetrics(): SessionMetrics[] {
    return Array.from(this.sessionMetricsCache.values());
  }

  /**
   * 获取特定会话的指标
   */
  getCachedSessionMetricsById(sessionId: string): SessionMetrics | null {
    return this.sessionMetricsCache.get(sessionId) || null;
  }

  /**
   * 是否正在监控中
   */
  isMonitoring(): boolean {
    return this.monitoring;
  }

  /**
   * 设置更新间隔
   */
  setUpdateInterval(interval: number) {
    this.updateInterval = interval;
    
    if (this.monitoring) {
      this.stopMonitoring();
      this.startMonitoring(interval);
    }
  }
}

// TypeScript 类型定义
interface NodeJSCpuUsage {
  user: number;
  system: number;
}

export { PerformanceMonitor };
export type { SystemMetrics, SessionMetrics };