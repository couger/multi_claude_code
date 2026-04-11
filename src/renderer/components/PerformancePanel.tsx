/**
 * 性能监控面板组件
 */

import React, { useEffect, useState, useCallback } from 'react';

interface SystemMetrics {
  cpu: { usage: number; cores: number; model: string };
  memory: { total: number; used: number; free: number; usagePercent: number };
  disk: { total: number; used: number; free: number; usagePercent: number };
  uptime: number;
}

interface PerformancePanelProps {
  visible: boolean;
  onClose: () => void;
}

const PerformancePanel: React.FC<PerformancePanelProps> = ({ visible, onClose }) => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await window.electronAPI.getSystemMetrics();
      setMetrics(data);
    } catch (e) {
      console.error('获取性能指标失败:', e);
    }
  }, []);

  const toggleMonitoring = useCallback(async () => {
    setLoading(true);
    try {
      if (monitoring) {
        await window.electronAPI.stopMonitoring();
        setMonitoring(false);
      } else {
        await window.electronAPI.startMonitoring(5000);
        setMonitoring(true);
      }
    } catch (e) {
      console.error('切换监控状态失败:', e);
    }
    setLoading(false);
  }, [monitoring]);

  useEffect(() => {
    if (visible) {
      fetchMetrics();
    }
  }, [visible, fetchMetrics]);

  // 定时刷新
  useEffect(() => {
    if (!visible || !monitoring) return;
    const timer = setInterval(fetchMetrics, 5000);
    return () => clearInterval(timer);
  }, [visible, monitoring, fetchMetrics]);

  if (!visible) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const ProgressBar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
    <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-800 border border-dark-600 rounded-lg w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <h2 className="text-sm font-medium text-dark-100 flex items-center gap-2">
            <svg className="w-4 h-4 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            性能监控
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMonitoring}
              disabled={loading}
              className={`text-xs px-3 py-1 rounded transition-colors ${
                monitoring
                  ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                  : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
              }`}
            >
              {monitoring ? '停止监控' : '开始监控'}
            </button>
            <button
              onClick={fetchMetrics}
              className="text-xs px-2 py-1 bg-dark-700 text-dark-300 rounded hover:bg-dark-600"
            >
              刷新
            </button>
            <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {metrics ? (
            <>
              {/* CPU */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-400">CPU</span>
                  <span className="text-xs text-dark-300">{metrics.cpu.usage.toFixed(1)}%</span>
                </div>
                <ProgressBar value={metrics.cpu.usage} color={metrics.cpu.usage > 80 ? '#f85149' : '#3fb950'} />
                <div className="text-xs text-dark-500">
                  {metrics.cpu.model} · {metrics.cpu.cores} 核心
                </div>
              </div>

              {/* 内存 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-400">内存</span>
                  <span className="text-xs text-dark-300">
                    {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)} ({metrics.memory.usagePercent.toFixed(1)}%)
                  </span>
                </div>
                <ProgressBar value={metrics.memory.usagePercent} color={metrics.memory.usagePercent > 80 ? '#f85149' : '#58a6ff'} />
              </div>

              {/* 磁盘 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dark-400">磁盘</span>
                  <span className="text-xs text-dark-300">
                    {formatBytes(metrics.disk.used)} / {formatBytes(metrics.disk.total)} ({metrics.disk.usagePercent.toFixed(1)}%)
                  </span>
                </div>
                <ProgressBar value={metrics.disk.usagePercent} color={metrics.disk.usagePercent > 80 ? '#f85149' : '#d29922'} />
              </div>

              {/* 运行时间 */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-dark-400">系统运行时间</span>
                <span className="text-dark-300">{formatUptime(metrics.uptime)}</span>
              </div>
            </>
          ) : (
            <div className="text-center text-dark-500 text-sm py-8">
              <p>点击"刷新"获取系统指标</p>
              <p className="text-xs mt-1">或开启自动监控</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PerformancePanel;
