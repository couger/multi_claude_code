/**
 * 远程访问控制面板
 * 仅在 Electron 环境中显示，浏览器端不显示
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';

interface RemoteStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  token: string;
  localIPs: string[];
  clientCount: number;
  clients: Array<{ id: string; ip: string; connectedAt: string }>;
}

interface RemoteAccessPanelProps {
  visible: boolean;
  onClose: () => void;
}

const RemoteAccessPanel: React.FC<RemoteAccessPanelProps> = ({ visible, onClose }) => {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [portInput, setPortInput] = useState('');
  const [portError, setPortError] = useState('');
  const [portChecking, setPortChecking] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [toggling, setToggling] = useState(false);
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.getRemoteStatus();
      setStatus(result);
      if (!portInput) {
        setPortInput(String(result.port));
      }
    } catch (e) {
      console.error('获取远程访问状态失败:', e);
    }
  }, [portInput]);

  useEffect(() => {
    if (visible) {
      fetchStatus();
      // 每 3 秒自动刷新状态（更新客户端列表）
      refreshTimer.current = setInterval(fetchStatus, 3000);
    }
    return () => {
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [visible, fetchStatus]);

  // 检测端口冲突
  const checkPort = useCallback(async (port: number) => {
    if (isNaN(port) || port < 1024 || port > 65535) {
      setPortError('端口范围: 1024-65535');
      return;
    }
    setPortChecking(true);
    setPortError('');
    try {
      const result = await window.electronAPI.checkRemotePort(port);
      if (result.inUse) {
        setPortError(`端口 ${port} 已被占用`);
      } else {
        setPortError('');
      }
    } catch {
      setPortError('检测失败');
    }
    setPortChecking(false);
  }, []);

  // 修改端口
  const handlePortChange = useCallback(async () => {
    const newPort = parseInt(portInput, 10);
    if (isNaN(newPort) || newPort < 1024 || newPort > 65535) {
      setPortError('端口范围: 1024-65535');
      return;
    }
    setLoading(true);
    try {
      const result = await window.electronAPI.setRemotePort(newPort);
      if (result.success) {
        setPortError('');
        await fetchStatus();
      } else {
        setPortError(result.error || '设置失败');
      }
    } catch (e) {
      setPortError('设置失败');
    }
    setLoading(false);
  }, [portInput, fetchStatus]);

  // 开关 Web 访问
  const handleToggle = useCallback(async () => {
    setToggling(true);
    try {
      const newState = !status?.enabled;
      const result = await window.electronAPI.toggleRemote(newState);
      if (result.success) {
        await fetchStatus();
      }
    } catch (e) {
      console.error('切换远程访问失败:', e);
    }
    setToggling(false);
  }, [status?.enabled, fetchStatus]);

  // 刷新令牌
  const handleRefreshToken = useCallback(async () => {
    if (!confirm('刷新令牌后，所有已连接的浏览器客户端将被断开。确定继续？')) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.refreshToken();
      if (result.success) {
        await fetchStatus();
      }
    } catch (e) {
      console.error('刷新令牌失败:', e);
    }
    setLoading(false);
  }, [fetchStatus]);

  // 复制令牌
  const handleCopyToken = useCallback(async () => {
    if (!status?.token) return;
    try {
      await navigator.clipboard.writeText(status.token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = status.token;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  }, [status?.token]);

  // 断开指定客户端
  const handleKick = useCallback(async (clientId: string) => {
    try {
      await window.electronAPI.kickClient(clientId);
      await fetchStatus();
    } catch (e) {
      console.error('断开客户端失败:', e);
    }
  }, [fetchStatus]);

  // 断开所有客户端
  const handleKickAll = useCallback(async () => {
    if (!confirm(`确定断开所有 ${status?.clientCount || 0} 个客户端？`)) return;
    try {
      await window.electronAPI.kickAllClients();
      await fetchStatus();
    } catch (e) {
      console.error('断开所有客户端失败:', e);
    }
  }, [fetchStatus, status?.clientCount]);

  // 端口输入变化时检测冲突
  const handlePortInputChange = useCallback((value: string) => {
    setPortInput(value);
    setPortError('');
    const port = parseInt(value, 10);
    if (!isNaN(port) && port >= 1024 && port <= 65535) {
      // 延迟检测
      setTimeout(() => checkPort(port), 500);
    }
  }, [checkPort]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-800 border border-dark-600 rounded-lg w-[560px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700 shrink-0">
          <h2 className="text-sm font-medium text-dark-100 flex items-center gap-2">
            <svg className="w-4 h-4 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            远程访问控制
          </h2>
          <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-5">
          {status ? (
            <>
              {/* Web 访问开关 */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-dark-200 font-medium">Web 远程访问</div>
                  <div className="text-xs text-dark-500">
                    允许局域网内浏览器访问应用界面
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* 状态指示 */}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    status.running
                      ? 'bg-green-600/20 text-green-400'
                      : status.enabled
                        ? 'bg-yellow-600/20 text-yellow-400'
                        : 'bg-dark-600 text-dark-400'
                  }`}>
                    {status.running ? '运行中' : status.enabled ? '启动中...' : '已停止'}
                  </span>
                  <button
                    onClick={handleToggle}
                    disabled={toggling}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      status.enabled ? 'bg-accent-primary' : 'bg-dark-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        status.enabled ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* 端口设置 */}
              <div className="space-y-2">
                <label className="text-xs text-dark-400">服务端口</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={portInput}
                      onChange={(e) => handlePortInputChange(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      className={`w-full px-3 py-1.5 bg-dark-900 border rounded text-sm text-dark-100 focus:outline-none ${
                        portError ? 'border-red-500' : 'border-dark-600 focus:border-accent-primary'
                      }`}
                      min={1024}
                      max={65535}
                      disabled={!status.enabled}
                    />
                    {portChecking && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-dark-500">
                        检测中...
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handlePortChange}
                    disabled={loading || !status.enabled || !!portError || portInput === String(status.port)}
                    className="px-3 py-1.5 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    应用
                  </button>
                </div>
                {portError && (
                  <p className="text-xs text-red-400">{portError}</p>
                )}
              </div>

              {/* 访问令牌 */}
              <div className="space-y-2">
                <label className="text-xs text-dark-400">访问令牌</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-300 font-mono truncate select-all">
                    {status.token}
                  </div>
                  <button
                    onClick={handleCopyToken}
                    className="px-3 py-1.5 bg-dark-700 text-dark-300 rounded text-sm hover:bg-dark-600 transition-colors shrink-0"
                  >
                    {tokenCopied ? '✓ 已复制' : '复制'}
                  </button>
                  <button
                    onClick={handleRefreshToken}
                    disabled={loading}
                    className="px-3 py-1.5 bg-dark-700 text-yellow-400 rounded text-sm hover:bg-dark-600 transition-colors shrink-0"
                    title="刷新令牌（会断开所有客户端）"
                  >
                    刷新
                  </button>
                </div>
              </div>

              {/* 访问地址 */}
              {status.running && (
                <div className="space-y-2">
                  <label className="text-xs text-dark-400">访问地址</label>
                  <div className="space-y-1">
                    {status.localIPs.map(ip => (
                      <div
                        key={ip}
                        className="flex items-center gap-2 px-3 py-1.5 bg-dark-900 rounded text-xs"
                      >
                        <span className="text-dark-500">http://</span>
                        <span className="text-dark-200 font-mono">{ip}</span>
                        <span className="text-dark-500">:{status.port}</span>
                        <button
                          onClick={async () => {
                            const url = `http://${ip}:${status.port}/`;
                            try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
                          }}
                          className="ml-auto text-dark-400 hover:text-accent-primary transition-colors"
                          title="复制完整链接"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 已连接客户端 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-dark-400">
                    已连接客户端 ({status.clientCount})
                  </label>
                  {status.clientCount > 0 && (
                    <button
                      onClick={handleKickAll}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      全部断开
                    </button>
                  )}
                </div>

                {status.clients.length === 0 ? (
                  <div className="text-xs text-dark-500 text-center py-3 bg-dark-900 rounded">
                    暂无连接的客户端
                  </div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {status.clients.map((client, idx) => (
                      <div
                        key={client.id}
                        className="flex items-center gap-2 px-3 py-2 bg-dark-900 rounded group"
                      >
                        {/* 序号 */}
                        <span className="text-xs text-dark-600 w-4 text-center">{idx + 1}</span>
                        {/* 连接状态指示 */}
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                        {/* IP */}
                        <span className="text-xs text-dark-200 font-mono flex-1 truncate">{client.ip}</span>
                        {/* 连接时间 */}
                        <span className="text-xs text-dark-500 shrink-0">
                          {new Date(client.connectedAt).toLocaleTimeString()}
                        </span>
                        {/* 断开按钮 */}
                        <button
                          onClick={() => handleKick(client.id)}
                          className="text-xs text-dark-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          title="断开此客户端"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center text-dark-500 text-sm py-8">加载中...</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RemoteAccessPanel;
