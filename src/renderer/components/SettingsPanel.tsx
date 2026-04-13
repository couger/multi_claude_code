/**
 * 设置面板
 * 整合通用/分组/远程/性能四个标签页
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Session } from '../stores/sessionStore';
import { DisplayMode } from '../constants';

// ======================== 类型定义 ========================

type TabKey = 'general' | 'groups' | 'performance';

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  sessions: Session[];
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
}

// ======================== 子组件：通用 ========================

const GeneralTab: React.FC<{
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
}> = ({ displayMode, onDisplayModeChange }) => (
  <div className="space-y-5">
    {/* 显示模式 */}
    <div className="space-y-2">
      <label className="text-xs text-dark-400">会话显示模式</label>
      <div className="flex gap-2">
        <button
          onClick={() => onDisplayModeChange(DisplayMode.THUMBNAIL)}
          className={`flex-1 text-xs py-2 rounded transition-colors ${
            displayMode === DisplayMode.THUMBNAIL
              ? 'bg-accent-primary text-dark-900'
              : 'bg-dark-900 text-dark-300 hover:bg-dark-700'
          }`}
        >
          缩略图模式
        </button>
        <button
          onClick={() => onDisplayModeChange(DisplayMode.ICON)}
          className={`flex-1 text-xs py-2 rounded transition-colors ${
            displayMode === DisplayMode.ICON
              ? 'bg-accent-primary text-dark-900'
              : 'bg-dark-900 text-dark-300 hover:bg-dark-700'
          }`}
        >
          图标模式
        </button>
      </div>
    </div>
  </div>
);

// ======================== 子组件：性能 ========================

interface SystemMetrics {
  cpu: { usage: number; cores: number; model: string };
  memory: { total: number; used: number; free: number; usagePercent: number };
  disk: { total: number; used: number; free: number; usagePercent: number };
  uptime: number;
}

const PerformanceTab: React.FC<{ visible: boolean }> = ({ visible }) => {
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
    if (visible) fetchMetrics();
  }, [visible, fetchMetrics]);

  useEffect(() => {
    if (!visible || !monitoring) return;
    const timer = setInterval(fetchMetrics, 5000);
    return () => clearInterval(timer);
  }, [visible, monitoring, fetchMetrics]);

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
    <div className="space-y-4">
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
      </div>
      {metrics ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-dark-400">CPU</span>
              <span className="text-xs text-dark-300">{metrics.cpu.usage.toFixed(1)}%</span>
            </div>
            <ProgressBar value={metrics.cpu.usage} color={metrics.cpu.usage > 80 ? '#f85149' : '#3fb950'} />
            <div className="text-xs text-dark-500">{metrics.cpu.model} · {metrics.cpu.cores} 核心</div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-dark-400">内存</span>
              <span className="text-xs text-dark-300">
                {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)} ({metrics.memory.usagePercent.toFixed(1)}%)
              </span>
            </div>
            <ProgressBar value={metrics.memory.usagePercent} color={metrics.memory.usagePercent > 80 ? '#f85149' : '#58a6ff'} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-dark-400">磁盘</span>
              <span className="text-xs text-dark-300">
                {formatBytes(metrics.disk.used)} / {formatBytes(metrics.disk.total)} ({metrics.disk.usagePercent.toFixed(1)}%)
              </span>
            </div>
            <ProgressBar value={metrics.disk.usagePercent} color={metrics.disk.usagePercent > 80 ? '#f85149' : '#d29922'} />
          </div>
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
  );
};

// ======================== 子组件：分组 ========================

interface Group {
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

const PRESET_COLORS = ['#f85149', '#58a6ff', '#3fb950', '#d29922', '#bc8cff', '#f0883e', '#f778ba', '#39d2c0'];
const PRESET_ICONS = ['📁', '🏷️', '⭐', '🔒', '🚀', '💡', '🎯', '📌'];

const GroupsTab: React.FC<{ visible: boolean; sessions: Session[] }> = ({ visible, sessions }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[1]);
  const [newIcon, setNewIcon] = useState(PRESET_ICONS[0]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState('');
  const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getGroups();
      setGroups(result || []);
    } catch (e) {
      console.error('获取分组失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchGroups();
      setCreating(false);
      setEditingGroupId(null);
      setAddingToGroupId(null);
    }
  }, [visible, fetchGroups]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      await window.electronAPI.createGroup({ name: newName.trim(), description: newDesc.trim(), color: newColor, icon: newIcon });
      setNewName(''); setNewDesc(''); setNewColor(PRESET_COLORS[1]); setNewIcon(PRESET_ICONS[0]); setCreating(false);
      await fetchGroups();
    } catch (e) { console.error('创建分组失败:', e); }
  }, [newName, newDesc, newColor, newIcon, fetchGroups]);

  const handleDelete = useCallback(async (groupId: string) => {
    if (!confirm('确定删除此分组？分组内的会话不会被删除。')) return;
    try { await window.electronAPI.deleteGroup(groupId); await fetchGroups(); }
    catch (e) { console.error('删除分组失败:', e); }
  }, [fetchGroups]);

  const handleStartEdit = useCallback((group: Group) => {
    setEditingGroupId(group.id); setEditName(group.name); setEditDesc(group.description); setEditColor(group.color);
  }, []);

  const handleSaveEdit = useCallback(async (groupId: string) => {
    try {
      await window.electronAPI.updateGroup(groupId, { name: editName.trim(), description: editDesc.trim(), color: editColor });
      setEditingGroupId(null); await fetchGroups();
    } catch (e) { console.error('更新分组失败:', e); }
  }, [editName, editDesc, editColor, fetchGroups]);

  const handleAddSession = useCallback(async (groupId: string, sessionId: string) => {
    try { await window.electronAPI.addSessionToGroup(groupId, sessionId); await fetchGroups(); setAddingToGroupId(null); }
    catch (e) { console.error('添加会话到分组失败:', e); }
  }, [fetchGroups]);

  const handleRemoveSession = useCallback(async (groupId: string, sessionId: string) => {
    try { await window.electronAPI.removeSessionFromGroup(groupId, sessionId); await fetchGroups(); }
    catch (e) { console.error('从分组移除会话失败:', e); }
  }, [fetchGroups]);

  const getAvailableSessions = (groupId: string) => {
    const assignedSessionIds = new Set<string>();
    groups.forEach(g => { if (g.id !== groupId) g.sessionIds.forEach(sid => assignedSessionIds.add(sid)); });
    return sessions.filter(s => !assignedSessionIds.has(s.id) || (groups.find(g => g.id === groupId)?.sessionIds || []).includes(s.id));
  };

  const getSessionName = (sessionId: string) => {
    const s = sessions.find(s => s.id === sessionId);
    return s ? (s.name || s.id.slice(0, 8)) : sessionId.slice(0, 8);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCreating(!creating)}
          className="text-xs px-3 py-1 bg-accent-primary/20 text-accent-primary rounded hover:bg-accent-primary/30 transition-colors"
        >
          {creating ? '取消' : '+ 新建分组'}
        </button>
      </div>

      {creating && (
        <div className="p-3 border border-dark-600 rounded-lg bg-dark-800/50 space-y-3">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="分组名称"
            className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none" autoFocus />
          <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="描述（可选）"
            className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-dark-400 w-8">颜色</span>
            <div className="flex gap-1.5">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-dark-400 w-8">图标</span>
            <div className="flex gap-1">
              {PRESET_ICONS.map(ic => (
                <button key={ic} onClick={() => setNewIcon(ic)}
                  className={`w-7 h-7 rounded text-sm flex items-center justify-center transition-colors ${newIcon === ic ? 'bg-dark-600 ring-1 ring-white' : 'hover:bg-dark-700'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleCreate} disabled={!newName.trim()}
            className="w-full py-2 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            创建分组
          </button>
        </div>
      )}

      {loading && groups.length === 0 ? (
        <div className="text-center text-dark-500 text-sm py-8">加载中...</div>
      ) : groups.length === 0 ? (
        <div className="text-center text-dark-500 text-sm py-8">
          <p>暂无分组</p>
          <p className="text-xs mt-1">点击"新建分组"创建</p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.id} className="border border-dark-600 rounded-lg overflow-hidden">
            {editingGroupId === group.id ? (
              <div className="p-3 bg-dark-750 space-y-2">
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-2 py-1 bg-dark-900 border border-dark-600 rounded text-xs text-dark-100 focus:border-accent-primary focus:outline-none" />
                <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="描述"
                  className="w-full px-2 py-1 bg-dark-900 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none" />
                <div className="flex gap-1">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setEditColor(c)} className={`w-4 h-4 rounded-full ${editColor === c ? 'ring-1 ring-white' : ''}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleSaveEdit(group.id)} className="flex-1 text-xs py-1 bg-accent-primary text-dark-900 rounded hover:bg-accent-primary/80">保存</button>
                  <button onClick={() => setEditingGroupId(null)} className="flex-1 text-xs py-1 bg-dark-700 text-dark-300 rounded hover:bg-dark-600">取消</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3" style={{ borderLeft: `3px solid ${group.color}` }}>
                <span className="text-sm">{group.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-dark-100 font-medium truncate">{group.name}</div>
                  {group.description && <div className="text-xs text-dark-500 truncate">{group.description}</div>}
                </div>
                <span className="text-xs text-dark-500 bg-dark-700 px-1.5 py-0.5 rounded">{group.sessionIds.length} 会话</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setAddingToGroupId(addingToGroupId === group.id ? null : group.id)}
                    className="p-1 text-dark-400 hover:text-accent-primary transition-colors" title="添加会话">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button onClick={() => handleStartEdit(group)} className="p-1 text-dark-400 hover:text-dark-200 transition-colors" title="编辑">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(group.id)} className="p-1 text-dark-400 hover:text-red-400 transition-colors" title="删除分组">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {addingToGroupId === group.id && (
              <div className="px-3 pb-2 border-t border-dark-700">
                <div className="text-xs text-dark-400 py-1.5">选择要添加的会话：</div>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {getAvailableSessions(group.id).filter(s => !group.sessionIds.includes(s.id)).length === 0 ? (
                    <div className="text-xs text-dark-500 py-2 text-center">没有可添加的会话</div>
                  ) : (
                    getAvailableSessions(group.id).filter(s => !group.sessionIds.includes(s.id)).map(s => (
                      <button key={s.id} onClick={() => handleAddSession(group.id, s.id)}
                        className="w-full text-left text-xs px-2 py-1.5 bg-dark-900 rounded hover:bg-dark-700 text-dark-300 transition-colors flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'running' ? 'bg-green-400' : s.status === 'paused' ? 'bg-yellow-400' : s.status === 'completed' ? 'bg-dark-500' : 'bg-red-400'}`} />
                        <span className="truncate">{s.name || s.id.slice(0, 8)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {group.sessionIds.length > 0 && (
              <div className="border-t border-dark-700 px-3 py-2 space-y-1">
                {group.sessionIds.map(sid => (
                  <div key={sid} className="flex items-center gap-2 text-xs group/item">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                    <span className="text-dark-300 truncate flex-1">{getSessionName(sid)}</span>
                    <button onClick={() => handleRemoveSession(group.id, sid)}
                      className="text-dark-500 hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0" title="从分组移除">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

// ======================== 子组件：远程访问 ========================

interface RemoteStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  token: string;
  localIPs: string[];
  clientCount: number;
  clients: Array<{ id: string; ip: string; connectedAt: string }>;
}

const RemoteTab: React.FC<{ visible: boolean }> = ({ visible }) => {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [portInput, setPortInput] = useState('');
  const [portError, setPortError] = useState('');
  const [toggling, setToggling] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);

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

      {/* 访问地址 */}
      {status.running && (
        <div className="space-y-2">
          <label className="text-xs text-dark-400">访问地址</label>
          <div className="space-y-1">
            {status.localIPs.map(ip => (
              <div key={ip} className="flex items-center gap-2 px-3 py-1.5 bg-dark-900 rounded text-xs">
                <span className="text-dark-500">http://</span>
                <span className="text-dark-200 font-mono">{ip}</span>
                <span className="text-dark-500">:{status.port}</span>
                <button onClick={async () => {
                  const url = `http://${ip}:${status.port}/`;
                  try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
                }} className="ml-auto text-dark-400 hover:text-accent-primary transition-colors" title="复制链接">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            ))}
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

// ======================== 主组件：SettingsPanel ========================

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'general', label: '通用', icon: '⚙' },
  { key: 'groups', label: '分组', icon: '📁' },
  { key: 'performance', label: '性能', icon: '📊' },
];

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  visible,
  onClose,
  sessions,
  displayMode,
  onDisplayModeChange,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  // 打开时重置到通用标签
  useEffect(() => {
    if (visible) setActiveTab('general');
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-800 border border-dark-600 rounded-lg w-[560px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700 shrink-0">
          <h2 className="text-sm font-medium text-dark-100">设置</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 标签页 */}
        <div className="flex border-b border-dark-700 shrink-0">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-accent-primary border-b-2 border-accent-primary'
                  : 'text-dark-400 hover:text-dark-200'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="overflow-y-auto flex-1 p-4">
          {activeTab === 'general' && (
            <GeneralTab displayMode={displayMode} onDisplayModeChange={onDisplayModeChange} />
          )}
          {activeTab === 'groups' && (
            <GroupsTab visible={visible && activeTab === 'groups'} sessions={sessions} />
          )}
          {activeTab === 'performance' && (
            <PerformanceTab visible={visible && activeTab === 'performance'} />
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
