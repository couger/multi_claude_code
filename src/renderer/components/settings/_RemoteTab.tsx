/**
 * 设置面板 - 远程访问标签页
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GeneralSettings } from './_GeneralTab';

interface RemoteStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  token: string;
  localIPs: string[];
  clientCount: number;
  clients: Array<{ id: string; ip: string; connectedAt: string }>;
}

// @ts-ignore
const _RemoteTab: React.FC<{ visible: boolean; settings?: GeneralSettings; onSettingsChange?: (settings: GeneralSettings) => void }> = ({ visible, settings, onSettingsChange }) => {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [portInput, setPortInput] = useState('');
  const [portError, setPortError] = useState('');
  const [toggling, setToggling] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [selectedIPs, setSelectedIPs] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('remoteSelectedIPs');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [maxConnInput, setMaxConnInput] = useState<string>(() => {
    const saved = localStorage.getItem('generalSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return String(parsed.maxRemoteConnections ?? 0);
      } catch { /* ignore */ }
    }
    return '0';
  });
  const [maxConnError, setMaxConnError] = useState('');
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);

  // 保存选中的 IP 地址到 localStorage
  useEffect(() => {
    if (selectedIPs.size > 0) {
      localStorage.setItem('remoteSelectedIPs', JSON.stringify([...selectedIPs]));
    } else {
      localStorage.removeItem('remoteSelectedIPs');
    }
  }, [selectedIPs]);

  const fetchStatus = useCallback(async () => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.getRemoteStatus();
        setStatus(result);
        if (!portInput) setPortInput(String(result.port));
      } else {
        // 浏览器环境：通过HTTP API获取状态
        const response = await fetch('/api/status');
        if (response.ok) {
          const data = await response.json();
          setStatus({
            enabled: data.accessEnabled,
            running: data.status === 'online',
            port: data.port,
            token: data.accessToken,
            localIPs: data.localIPs,
            clientCount: 0,
            clients: []
          });
          if (!portInput) setPortInput(String(data.port));
        }
      }
    } catch (e) { console.error('获取远程访问状态失败:', e); }
  }, [portInput]);

  useEffect(() => {
    if (visible) {
      fetchStatus();
      refreshTimer.current = setInterval(fetchStatus, 3000);
    }
    return () => { if (refreshTimer.current) { clearInterval(refreshTimer.current); refreshTimer.current = null; } };
  }, [visible, fetchStatus]);

  const handleToggle = useCallback(async () => {
    if (!window.electronAPI) {
      alert('远程访问控制仅在Electron应用中可用');
      return;
    }
    setToggling(true);
    try {
      const result = await window.electronAPI.toggleRemote(!status?.enabled);
      if (result.success) await fetchStatus();
    } catch (e) { console.error('切换远程访问失败:', e); }
    setToggling(false);
  }, [status?.enabled, fetchStatus]);

  const handlePortChange = useCallback(async () => {
    if (!window.electronAPI) {
      alert('端口设置仅在Electron应用中可用');
      return;
    }
    const newPort = parseInt(portInput, 10);
    if (isNaN(newPort) || newPort < 1024 || newPort > 65535) { setPortError('端口范围: 1024-65535'); return; }
    setLoading(true);
    try {
      const result = await window.electronAPI.setRemotePort(newPort);
      if (result.success) { setPortError(''); await fetchStatus(); }
      else { setPortError(result.error || '设置失败'); }
    } catch { setPortError('设置失败'); }
    setLoading(false);
  }, [portInput, fetchStatus]);

  const handleRefreshToken = useCallback(async () => {
    if (!window.electronAPI) {
      alert('令牌刷新仅在Electron应用中可用');
      return;
    }
    if (!confirm('刷新令牌后，所有已连接的浏览器客户端将被断开。确定继续？')) return;
    setLoading(true);
    try { const result = await window.electronAPI.refreshToken(); if (result.success) await fetchStatus(); }
    catch (e) { console.error('刷新令牌失败:', e); }
    setLoading(false);
  }, [fetchStatus]);

  // 设置最大连接数
  const handleMaxConnChange = useCallback(async () => {
    const val = parseInt(maxConnInput, 10);
    if (isNaN(val) || val < 0 || val > 100) {
      setMaxConnError('请输入 0-100 之间的数字（0 表示不限制）');
      return;
    }
    // 保存到 localStorage 并广播
    try {
      const saved = localStorage.getItem('generalSettings');
      const settings = saved ? JSON.parse(saved) : {};
      settings.maxRemoteConnections = val;
      localStorage.setItem('generalSettings', JSON.stringify(settings));
      // 广播到主进程
      window.electronAPI?.broadcastGeneralSettings?.(settings);
      setMaxConnError('');
    } catch {
      setMaxConnError('保存失败');
    }
  }, [maxConnInput]);

  const handleCopyToken = useCallback(async () => {
    if (!status?.token) return;
    try { await navigator.clipboard.writeText(status.token); } catch {
      const input = document.createElement('input'); input.value = status.token; document.body.appendChild(input); input.select(); document.execCommand('copy'); document.body.removeChild(input);
    }
    setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2000);
  }, [status?.token]);

  const handleKick = useCallback(async (clientId: string) => {
    if (!window.electronAPI) {
      alert('客户端管理仅在Electron应用中可用');
      return;
    }
    try { await window.electronAPI.kickClient(clientId); await fetchStatus(); }
    catch (e) { console.error('断开客户端失败:', e); }
  }, [fetchStatus]);

  const handleKickAll = useCallback(async () => {
    if (!window.electronAPI) {
      alert('客户端管理仅在Electron应用中可用');
      return;
    }
    if (!confirm(`确定断开所有 ${status?.clientCount || 0} 个客户端？`)) return;
    try { await window.electronAPI.kickAllClients(); await fetchStatus(); }
    catch (e) { console.error('断开所有客户端失败:', e); }
  }, [fetchStatus, status?.clientCount]);

  // 切换单个IP的选择状态
  const handleToggleIP = useCallback((ip: string) => {
    setSelectedIPs(prev => {
      const newSet = new Set(prev);
      const isAdding = !newSet.has(ip);
      if (newSet.has(ip)) {
        newSet.delete(ip);
      } else {
        newSet.add(ip);
      }

      // 同步选中的IP到主进程（用于服务器端访问控制）
      const ipsArray = [...newSet];
      if (window.electronAPI?.setSelectedIPs) {
        window.electronAPI.setSelectedIPs(ipsArray).catch(err => {
          console.error('Failed to sync selected IPs:', err);
        });
      }

      // 兼容：异步更新服务器的IP白名单
      if (status?.running && status?.port) {
        const apiUrl = `http://localhost:${status.port}/api/${isAdding ? 'allow-ip' : 'remove-ip'}`;
        const method = isAdding ? 'POST' : 'DELETE';
        const body = isAdding ? JSON.stringify({ ip }) : undefined;
        const query = !isAdding ? `?ip=${encodeURIComponent(ip)}` : '';

        fetch(apiUrl + query, {
          method,
          headers: isAdding ? { 'Content-Type': 'application/json' } : undefined,
          body,
        }).catch(err => {
          console.error(`Failed to update IP whitelist for ${ip}:`, err);
        });
      }

      return newSet;
    });
  }, [status?.running, status?.port]);

  // 选择所有IP
  const handleSelectAllIPs = useCallback(() => {
    if (!status?.localIPs) return;
    const allIPs = new Set(status.localIPs);
    setSelectedIPs(allIPs);
    if (window.electronAPI?.setSelectedIPs) {
      window.electronAPI.setSelectedIPs([...allIPs]).catch(console.error);
    }
  }, [status?.localIPs]);

  // 清空所有IP选择
  const handleClearAllIPs = useCallback(() => {
    setSelectedIPs(new Set());
    if (window.electronAPI?.setSelectedIPs) {
      window.electronAPI.setSelectedIPs([]).catch(console.error);
    }
  }, []);

  // 获取要显示的IP地址（如果选择了某些IP，则只显示选中的；否则显示全部）
  const displayedIPs = useMemo(() => {
    if (!status?.localIPs) return [];
    if (selectedIPs.size === 0) return status.localIPs; // 没有选择时显示全部
    return status.localIPs.filter(ip => selectedIPs.has(ip));
  }, [status?.localIPs, selectedIPs]);

  if (!status) return <div className="text-center text-dark-500 text-sm py-8">加载中...</div>;

  return (
    <div className="space-y-5">
      {/* 开关 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-dark-200 font-medium">Web 远程访问</div>
          <div className="text-xs text-dark-500">允许局域网内浏览器访问应用界面</div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            status.running ? 'bg-green-600/20 text-green-400' : status.enabled ? 'bg-yellow-600/20 text-yellow-400' : 'bg-dark-600 text-dark-400'
          }`}>
            {status.running ? '运行中' : status.enabled ? '启动中...' : '已停止'}
          </span>
          <button onClick={handleToggle} disabled={toggling}
            className={`relative w-10 h-5 rounded-full transition-colors ${status.enabled ? 'bg-accent-primary' : 'bg-dark-600'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${status.enabled ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {/* 远程创建会话权限 */}
      <div className="flex items-center justify-between p-2 bg-dark-900 rounded">
        <div>
          <div className="text-xs text-dark-200">允许远程创建会话</div>
          <div className="text-xs text-dark-500">关闭后远程Web界面无法创建新会话</div>
        </div>
        <button
          onClick={() => {
            if (settings && onSettingsChange) {
              const newSettings = { ...settings, allowRemoteCreateSession: !settings.allowRemoteCreateSession };
              onSettingsChange(newSettings);
              window.electronAPI?.broadcastGeneralSettings?.(newSettings);
            }
          }}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            settings?.allowRemoteCreateSession !== false ? 'bg-accent-primary' : 'bg-dark-600'
          }`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            settings?.allowRemoteCreateSession !== false ? 'left-5' : 'left-0.5'
          }`} />
        </button>
      </div>

      {/* 端口 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">服务端口</label>
        <div className="flex items-center gap-2">
          <input type="number" value={portInput}
            onChange={(e) => { setPortInput(e.target.value); setPortError(''); }}
            className={`flex-1 px-3 py-1.5 bg-dark-900 border rounded text-sm text-dark-100 focus:outline-none ${
              portError ? 'border-red-500' : 'border-dark-600 focus:border-accent-primary'}`}
            min={1024} max={65535} disabled={!status.enabled} onKeyDown={(e) => e.stopPropagation()} />
          <button onClick={handlePortChange}
            disabled={loading || !status.enabled || !!portError || portInput === String(status.port)}
            className="px-3 py-1.5 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors disabled:opacity-50">
            应用
          </button>
        </div>
        {portError && <p className="text-xs text-red-400">{portError}</p>}
      </div>

      {/* 令牌 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">访问令牌</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-300 font-mono truncate select-all">{status.token}</div>
          <button onClick={handleCopyToken} className="px-3 py-1.5 bg-dark-700 text-dark-300 rounded text-sm hover:bg-dark-600 transition-colors shrink-0">
            {tokenCopied ? '✓ 已复制' : '复制'}
          </button>
          <button onClick={handleRefreshToken} disabled={loading}
            className="px-3 py-1.5 bg-dark-700 text-yellow-400 rounded text-sm hover:bg-dark-600 transition-colors shrink-0" title="刷新令牌">
            刷新
          </button>
        </div>
      </div>

      {/* 最大连接数 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">最大连接数</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={maxConnInput}
            onChange={(e) => { setMaxConnInput(e.target.value); setMaxConnError(''); }}
            className="flex-1 px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 focus:outline-none focus:border-accent-primary"
            min={0}
            max={100}
            placeholder="0 = 不限制"
            disabled={!status.enabled}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button onClick={handleMaxConnChange}
            disabled={loading || !status.enabled}
            className="px-3 py-1.5 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors disabled:opacity-50">
            应用
          </button>
        </div>
        {maxConnError && <p className="text-xs text-red-400">{maxConnError}</p>}
        <div className="text-xs text-dark-500">设置为 0 表示不限制，超过上限时远程客户端会收到友好提示</div>
      </div>

      {/* 访问地址 */}
      {status.running && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-dark-400">访问地址</label>
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={handleSelectAllIPs}
                className="text-dark-400 hover:text-accent-primary transition-colors"
                title="选择所有IP"
              >
                全选
              </button>
              <span className="text-dark-600">|</span>
              <button
                onClick={handleClearAllIPs}
                className="text-dark-400 hover:text-accent-primary transition-colors"
                title="清除所有选择"
              >
                清空
              </button>
            </div>
          </div>

          {/* 选择说明 */}
          <div className="text-xs text-dark-500 bg-dark-900/50 px-2 py-1 rounded">
            勾选要显示的IP地址（不勾选将显示所有地址）
          </div>

          {/* IP地址列表 */}
          <div className="space-y-1">
            {status.localIPs.map(ip => (
              <div key={ip} className="flex items-center gap-2 px-3 py-1.5 bg-dark-900 rounded text-xs hover:bg-dark-800 transition-colors">
                {/* 复选框 */}
                <input
                  type="checkbox"
                  checked={selectedIPs.has(ip)}
                  onChange={() => handleToggleIP(ip)}
                  className="w-3.5 h-3.5 accent-accent-primary bg-dark-700 border-dark-600 rounded focus:ring-0 focus:ring-offset-0"
                  id={`ip-checkbox-${ip}`}
                />

                {/* IP地址标签 */}
                <label htmlFor={`ip-checkbox-${ip}`} className="flex-1 flex items-center gap-2 cursor-pointer">
                  <span className="text-dark-500 select-text">http://</span>
                  <span className="text-dark-200 font-mono select-text">{ip}</span>
                  <span className="text-dark-500 select-text">:{status.port}</span>
                </label>

                {/* 复制按钮 */}
                <button
                  onClick={async () => {
                    const url = `http://${ip}:${status.port}/`;
                    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
                  }}
                  className="text-dark-400 hover:text-accent-primary transition-colors p-1"
                  title="复制链接"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* 显示状态 */}
          <div className="text-xs text-dark-500 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${displayedIPs.length > 0 ? 'bg-accent-primary' : 'bg-dark-600'}`} />
            <span>
              当前显示 {displayedIPs.length} 个地址
              {selectedIPs.size > 0 && `（已选择 ${selectedIPs.size} 个）`}
            </span>
          </div>
        </div>
      )}

      {/* 客户端 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-dark-400">已连接客户端 ({status.clientCount})</label>
          {status.clientCount > 0 && (
            <button onClick={handleKickAll} className="text-xs text-red-400 hover:text-red-300">全部断开</button>
          )}
        </div>
        {status.clients.length === 0 ? (
          <div className="text-xs text-dark-500 text-center py-3 bg-dark-900 rounded">暂无连接的客户端</div>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {status.clients.map((client, idx) => (
              <div key={client.id} className="flex items-center gap-2 px-3 py-2 bg-dark-900 rounded group">
                <span className="text-xs text-dark-600 w-4 text-center">{idx + 1}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                <span className="text-xs text-dark-200 font-mono flex-1 truncate">{client.ip}</span>
                <span className="text-xs text-dark-500 shrink-0">{new Date(client.connectedAt).toLocaleTimeString()}</span>
                <button onClick={() => handleKick(client.id)}
                  className="text-xs text-dark-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default _RemoteTab;
