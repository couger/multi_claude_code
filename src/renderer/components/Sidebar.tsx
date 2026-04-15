import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Session } from '../stores/sessionStore';
import { SessionStatus, DisplayMode, DEFAULT_CONFIG } from '../constants';
import SessionCard from './SessionCard';

// 分组类型定义
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

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 280;

interface GeneralSettings {
  showGroupPanel: boolean;
  showPerformancePanel: boolean;
  showIconToggle: boolean;
}

interface SidebarProps {
  visible: boolean;
  sessions: Session[];
  expandedSessionId: string | null;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onCreateSession: () => void;
  onCloseSession: (id: string) => void;
  onExpandSession: (id: string) => void;
  getAlertCount: (id: string) => number;
  onShowSettings: () => void;
  generalSettings?: GeneralSettings;
}

const Sidebar: React.FC<SidebarProps> = ({
  visible,
  sessions,
  expandedSessionId,
  displayMode,
  onDisplayModeChange,
  onCreateSession,
  onCloseSession,
  onExpandSession,
  getAlertCount,
  onShowSettings,
  generalSettings,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parseInt(saved, 10))) : DEFAULT_SIDEBAR_WIDTH;
  });
  const isResizing = useRef(false);

  // 分组功能状态
  const [groups, setGroups] = useState<Group[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[0]);
  const [newGroupIcon, setNewGroupIcon] = useState(PRESET_ICONS[0]);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set()); // 展开的分组

  // 获取分组中会话的ID集合
  const groupedSessionIds = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach(g => g.sessionIds.forEach(id => ids.add(id)));
    return ids;
  }, [groups]);

  // 未分组的会话
  const ungroupedSessions = useMemo(() => {
    return sessions.filter(s => !groupedSessionIds.has(s.id));
  }, [sessions, groupedSessionIds]);

  // 切换分组展开/折叠
  const toggleGroupExpand = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  }, []);

  // 是否显示分组功能
  const showGroupFeature = generalSettings?.showGroupPanel !== false;
  // 是否显示性能功能
  const showPerformanceFeature = generalSettings?.showPerformancePanel !== false;
  // 是否显示图标切换
  const showIconToggleFeature = generalSettings?.showIconToggle !== false;

  // 性能监控状态
  const [systemMetrics, setSystemMetrics] = useState<{
    cpu: { usage: number };
    memory: { usagePercent: number };
  } | null>(null);

  // 加载性能数据
  useEffect(() => {
    if (!showPerformanceFeature) return;
    const loadMetrics = async () => {
      try {
        const data = await window.electronAPI.getSystemMetrics();
        setSystemMetrics(data);
      } catch (e) {
        console.error('加载性能指标失败:', e);
      }
    };
    loadMetrics();
    const interval = setInterval(loadMetrics, 5000);
    return () => clearInterval(interval);
  }, [showPerformanceFeature]);

  // 远程访问状态
  const [remoteStatus, setRemoteStatus] = useState<{
    enabled: boolean;
    running: boolean;
    port: number;
    token: string;
    localIPs: string[];
  } | null>(null);
  const [togglingRemote, setTogglingRemote] = useState(false);
  const [showNetworkTooltip, setShowNetworkTooltip] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  // 加载分组
  useEffect(() => {
    const loadGroups = async () => {
      try {
        const result = await window.electronAPI.getGroups();
        setGroups(result || []);
      } catch (e) {
        console.error('加载分组失败:', e);
      }
    };
    loadGroups();
    // 监听分组更新
    const interval = setInterval(loadGroups, 5000);
    return () => clearInterval(interval);
  }, []);

  // 加载远程访问状态
  useEffect(() => {
    const loadRemoteStatus = async () => {
      try {
        const result = await window.electronAPI.getRemoteStatus();
        setRemoteStatus(result);
      } catch (e) {
        console.error('加载远程状态失败:', e);
      }
    };
    loadRemoteStatus();
    const interval = setInterval(loadRemoteStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // 切换远程访问
  const handleToggleRemote = useCallback(async () => {
    if (!remoteStatus) return;
    setTogglingRemote(true);
    try {
      const result = await window.electronAPI.toggleRemote(!remoteStatus.enabled);
      if (result.success) {
        const newStatus = await window.electronAPI.getRemoteStatus();
        setRemoteStatus(newStatus);
      }
    } catch (e) {
      console.error('切换远程访问失败:', e);
    }
    setTogglingRemote(false);
  }, [remoteStatus]);

  // 复制令牌
  const handleCopyToken = useCallback(async () => {
    if (!remoteStatus?.token) return;
    try {
      await navigator.clipboard.writeText(remoteStatus.token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = remoteStatus.token;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  }, [remoteStatus?.token]);

  // 创建分组
  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim()) return;
    try {
      await window.electronAPI.createGroup({
        name: newGroupName.trim(),
        color: newGroupColor,
        icon: newGroupIcon,
        description: '',
      });
      setNewGroupName('');
      setNewGroupColor(PRESET_COLORS[0]);
      setNewGroupIcon(PRESET_ICONS[0]);
      setCreatingGroup(false);
      const result = await window.electronAPI.getGroups();
      setGroups(result || []);
    } catch (e) {
      console.error('创建分组失败:', e);
    }
  }, [newGroupName, newGroupColor, newGroupIcon]);

  // 拖拽会话到分组
  const handleDragStart = useCallback((sessionId: string) => {
    setDraggingSessionId(sessionId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroupId(groupId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverGroupId(null);
  }, []);

  const handleDrop = useCallback(async (groupId: string) => {
    if (!draggingSessionId) return;
    try {
      await window.electronAPI.addSessionToGroup(groupId, draggingSessionId);
      const result = await window.electronAPI.getGroups();
      setGroups(result || []);
    } catch (e) {
      console.error('添加会话到分组失败:', e);
    }
    setDraggingSessionId(null);
    setDragOverGroupId(null);
  }, [draggingSessionId]);

  // 自动隐藏逻辑
  const [, forceUpdate] = useState({});

  useEffect(() => {
    if (isPinned) return;

    if (isHovered) {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    } else {
      hideTimeoutRef.current = setTimeout(() => {
        forceUpdate({});
      }, DEFAULT_CONFIG.sidebarHideDelay);
    }

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isHovered, isPinned]);

  // 拖拽调整宽度
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // 持久化宽度
      setSidebarWidth(prev => {
        localStorage.setItem('sidebarWidth', String(prev));
        return prev;
      });
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [sidebarWidth]);

  const showSidebar = visible && (isPinned || isHovered);

  return (
    <>
      {/* 收起状态的侧边栏触发区域 */}
      {!showSidebar && visible && (
        <div
          className="w-12 bg-dark-800 border-r border-dark-700 flex flex-col items-center py-2 cursor-pointer hover:bg-dark-700 transition-colors"
          onMouseEnter={() => setIsHovered(true)}
          onClick={() => setIsPinned(true)}
          title="展开侧边栏"
        >
          <div className="w-8 h-8 flex items-center justify-center text-dark-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </div>
          <div className="mt-2 w-6 h-6 bg-accent-primary text-dark-900 rounded-full flex items-center justify-center text-xs font-medium">
            {sessions.length}
          </div>
          {sessions.filter(s => s.status === SessionStatus.RUNNING).length > 0 && (
            <div className="mt-2 w-3 h-3 bg-accent-success rounded-full animate-pulse" />
          )}
          {sessions.some(s => getAlertCount(s.id) > 0) && (
            <div className="mt-2 w-3 h-3 bg-accent-danger rounded-full" />
          )}
        </div>
      )}

      {/* 展开的侧边栏 */}
      {showSidebar && (
        <div
          className="bg-dark-800 border-r border-dark-700 flex flex-col slide-in relative"
          style={{ width: sidebarWidth }}
          onMouseEnter={() => {
            setIsHovered(true);
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
              hideTimeoutRef.current = null;
            }
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            if (!isPinned) {
              hideTimeoutRef.current = setTimeout(() => {
                forceUpdate({});
              }, DEFAULT_CONFIG.sidebarHideDelay);
            }
          }}
        >
          {/* 头部 */}
          <div className="p-3 border-b border-dark-700">
            {/* 性能指标 - 仅在性能功能开启时显示 */}
            {showPerformanceFeature && systemMetrics && (
              <div className="flex items-center gap-2 mb-2 text-xs text-dark-400">
                <div className="flex items-center gap-1" title={`CPU: ${systemMetrics.cpu.usage}%`}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                  <span className={`${systemMetrics.cpu.usage > 80 ? 'text-red-400' : systemMetrics.cpu.usage > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {systemMetrics.cpu.usage.toFixed(0)}%
                  </span>
                </div>
                <div className="w-px h-3 bg-dark-600" />
                <div className="flex items-center gap-1" title={`内存: ${systemMetrics.memory.usagePercent}%`}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span className={`${systemMetrics.memory.usagePercent > 80 ? 'text-red-400' : systemMetrics.memory.usagePercent > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {systemMetrics.memory.usagePercent.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-dark-200">CLI 会话</h2>
              <div className="flex items-center gap-1">
                {showIconToggleFeature && (
                  <button
                    onClick={() => onDisplayModeChange(
                      displayMode === DisplayMode.THUMBNAIL
                        ? DisplayMode.ICON
                        : DisplayMode.THUMBNAIL
                    )}
                    className={`p-1 rounded transition-colors ${
                      displayMode === DisplayMode.ICON
                        ? 'bg-accent-primary text-dark-900'
                        : 'bg-dark-700 text-dark-400 hover:bg-dark-600'
                    }`}
                    title={displayMode === DisplayMode.ICON ? '切换到缩略图模式' : '切换到图标模式'}
                  >
                    {displayMode === DisplayMode.ICON ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                      </svg>
                    )}
                  </button>
                )}
                <span className="text-xs text-dark-500 bg-dark-700 px-2 py-0.5 rounded-full">
                  {sessions.length}
                </span>
                <button
                  onClick={() => setIsPinned(!isPinned)}
                  className={`p-1 rounded transition-colors ${
                    isPinned ? 'bg-accent-primary text-dark-900' : 'bg-dark-700 text-dark-400 hover:bg-dark-600'
                  }`}
                  title={isPinned ? '取消固定' : '固定侧边栏'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
              </div>
            </div>

            <button
              onClick={onCreateSession}
              className="w-full py-2 bg-accent-primary text-dark-900 rounded hover:bg-accent-primary/80 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建会话
            </button>

            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await window.electronAPI.createSession();
                } catch (err) {
                  console.error('快速创建失败:', err);
                }
              }}
              className="w-full mt-1.5 py-1.5 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors text-xs flex items-center justify-center gap-1"
              title="使用上次目录快速创建"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              快速创建
            </button>
          </div>

          {/* 会话列表 - 仅显示未分组的会话 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {ungroupedSessions.length === 0 && groups.length === 0 ? (
              <div className="text-center text-dark-500 text-sm py-8">
                <p>暂无会话</p>
                <p className="text-xs mt-1">点击上方按钮创建</p>
              </div>
            ) : ungroupedSessions.length === 0 ? (
              <div className="text-center text-dark-500 text-sm py-4">
                <p>所有会话已分组</p>
              </div>
            ) : (
              ungroupedSessions.map((session) => (
                <div
                  key={session.id}
                  draggable
                  onDragStart={() => handleDragStart(session.id)}
                  onDragEnd={() => setDraggingSessionId(null)}
                >
                  <SessionCard
                    session={session}
                    displayMode={displayMode}
                    isExpanded={expandedSessionId === session.id}
                    alertCount={getAlertCount(session.id)}
                    onClose={() => onCloseSession(session.id)}
                    onExpand={() => onExpandSession(session.id)}
                  />
                </div>
              ))
            )}
          </div>

          {/* 分组区域 - 仅在分组功能开启时显示 */}
          {showGroupFeature && (
            <div className="border-t border-dark-700 p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-dark-400 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  分组
                  <span className="text-dark-500">({groups.length})</span>
                </span>
                <button
                  onClick={() => setCreatingGroup(!creatingGroup)}
                  className="text-xs text-accent-primary hover:text-accent-primary/80"
                  title="新建分组"
                >
                  +
                </button>
              </div>

              {/* 新建分组表单 */}
              {creatingGroup && (
                <div className="mb-2 p-2 bg-dark-900 rounded space-y-2">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="分组名称"
                    className="w-full px-2 py-1 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {PRESET_COLORS.slice(0, 6).map((c) => (
                        <button
                          key={c}
                          onClick={() => setNewGroupColor(c)}
                          className={`w-4 h-4 rounded-sm ${newGroupColor === c ? 'ring-1 ring-white' : ''}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-1">
                      {PRESET_ICONS.slice(0, 4).map((ic) => (
                        <button
                          key={ic}
                          onClick={() => setNewGroupIcon(ic)}
                          className={`w-5 h-5 rounded text-xs ${newGroupIcon === ic ? 'bg-dark-600' : 'hover:bg-dark-700'}`}
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={handleCreateGroup}
                      disabled={!newGroupName.trim()}
                      className="flex-1 py-1 bg-accent-primary text-dark-900 rounded text-xs font-medium hover:bg-accent-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      创建
                    </button>
                    <button
                      onClick={() => setCreatingGroup(false)}
                      className="px-2 py-1 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* 分组列表 - 可折叠，每个分组下显示会话 */}
              <div className="space-y-1">
                {groups.length === 0 ? (
                  <div className="text-xs text-dark-500 text-center py-2">
                    点击 + 创建分组
                  </div>
                ) : (
                  groups.map((group) => {
                    const isExpanded = expandedGroups.has(group.id);
                    const groupSessions = sessions.filter(s => group.sessionIds.includes(s.id));
                    return (
                      <div key={group.id}>
                        <div
                          className={`p-2 rounded cursor-pointer transition-colors ${
                            dragOverGroupId === group.id
                              ? 'bg-accent-primary/20 border border-accent-primary border-dashed'
                              : 'bg-dark-900 hover:bg-dark-700'
                          }`}
                          onDragOver={(e) => handleDragOver(e, group.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={() => handleDrop(group.id)}
                          onClick={() => toggleGroupExpand(group.id)}
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              className={`w-3 h-3 text-dark-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="text-sm">{group.icon}</span>
                            <span className="text-xs text-dark-200 truncate flex-1">{group.name}</span>
                            <span
                              className="w-3 h-3 rounded-sm shrink-0"
                              style={{ backgroundColor: group.color }}
                              title={group.color}
                            />
                            <span className="text-xs text-dark-500">{group.sessionIds.length}</span>
                          </div>
                          {dragOverGroupId === group.id && (
                            <div className="mt-1 text-xs text-accent-primary text-center">
                              释放以添加会话
                            </div>
                          )}
                        </div>
                        {/* 展开时显示分组内的会话 */}
                        {isExpanded && groupSessions.length > 0 && (
                          <div className="ml-4 mt-1 space-y-1 border-l-2 border-dark-600 pl-2">
                            {groupSessions.map((session) => (
                              <div
                                key={session.id}
                                draggable
                                onDragStart={() => handleDragStart(session.id)}
                                onDragEnd={() => setDraggingSessionId(null)}
                              >
                                <SessionCard
                                  session={session}
                                  displayMode={displayMode}
                                  isExpanded={expandedSessionId === session.id}
                                  alertCount={getAlertCount(session.id)}
                                  onClose={() => onCloseSession(session.id)}
                                  onExpand={() => onExpandSession(session.id)}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 底部：网络功能 + 设置按钮 + 批量操作 */}
          <div className="p-2 border-t border-dark-700 space-y-1.5">
            {/* 网络功能切换开关 */}
            {remoteStatus && (
              <div className="p-2 bg-dark-900 rounded space-y-1">
                {/* 第一行：网络状态 + 复制令牌 + 开关 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-dark-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                    <span className="text-xs text-dark-300">网络</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      remoteStatus.running
                        ? 'bg-green-600/20 text-green-400'
                        : remoteStatus.enabled
                        ? 'bg-yellow-600/20 text-yellow-400'
                        : 'bg-dark-600 text-dark-400'
                    }`}>
                      {remoteStatus.running ? '运行中' : remoteStatus.enabled ? '启动中' : '已停止'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-dark-500">复制令牌:</span>
                    <button
                      onClick={handleCopyToken}
                      className="p-1 rounded hover:bg-dark-700 transition-colors"
                      title="复制令牌"
                    >
                      {tokenCopied ? (
                        <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 text-dark-400 hover:text-dark-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={handleToggleRemote}
                      disabled={togglingRemote}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        remoteStatus.enabled ? 'bg-accent-primary' : 'bg-dark-600'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        remoteStatus.enabled ? 'left-5' : 'left-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
                {/* 第二行：访问地址 */}
                {remoteStatus.running && remoteStatus.localIPs.length > 0 && (
                  <div className="flex items-center gap-1 pt-1 border-t border-dark-700">
                    <span className="text-xs text-dark-500 shrink-0">访问地址:</span>
                    <div className="flex-1 flex items-center gap-1 overflow-x-auto">
                      {remoteStatus.localIPs.map((ip, idx) => (
                        <div key={ip} className="flex items-center gap-0.5 shrink-0">
                          <span className="text-xs text-dark-300 font-mono">http://{ip}:{remoteStatus.port}</span>
                          <button
                            onClick={async () => {
                              const url = `http://${ip}:${remoteStatus.port}/`;
                              try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
                            }}
                            className="p-0.5 rounded hover:bg-dark-700 transition-colors"
                            title="复制地址"
                          >
                            <svg className="w-3 h-3 text-dark-400 hover:text-dark-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                          {idx < remoteStatus.localIPs.length - 1 && (
                            <span className="text-dark-600 text-xs">|</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 设置按钮 - 仅在 Electron 环境中显示 */}
            {window.electronAPI && (
              <button
                onClick={onShowSettings}
                className="w-full text-xs py-1.5 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors flex items-center justify-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                设置
              </button>
            )}

            {sessions.length > 0 && (
              <div className="flex gap-1.5">
                <button
                  onClick={async () => {
                    const count = prompt('批量创建多少个会话？', '3');
                    if (!count) return;
                    const n = parseInt(count, 10);
                    if (isNaN(n) || n < 1 || n > 20) {
                      alert('请输入 1-20 之间的数字');
                      return;
                    }
                    for (let i = 0; i < n; i++) {
                      try {
                        await window.electronAPI.createSession({ name: `CLI #${sessions.length + i + 1}` });
                      } catch (e) {
                        console.error('批量创建失败:', e);
                      }
                    }
                  }}
                  className="flex-1 text-xs py-1.5 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors"
                >
                  批量创建
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`确定关闭全部 ${sessions.length} 个会话？`)) return;
                    for (const s of sessions) {
                      try {
                        await window.electronAPI.killSession(s.id);
                      } catch (e) {
                        console.error('关闭失败:', e);
                      }
                    }
                  }}
                  className="flex-1 text-xs py-1.5 bg-dark-700 text-red-400 rounded hover:bg-red-900/30 transition-colors"
                >
                  全部关闭
                </button>
              </div>
            )}

            {sessions.length > 0 && (
              <div className="flex justify-between text-xs text-dark-500">
                <span>
                  运行中: {sessions.filter((s) => s.status === SessionStatus.RUNNING).length}
                </span>
                <span>
                  已完成: {sessions.filter((s) => s.status === SessionStatus.COMPLETED).length}
                </span>
              </div>
            )}
          </div>

          {/* 拖拽调整宽度的把手 */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent-primary/30 active:bg-accent-primary/50 transition-colors z-10"
            onMouseDown={handleResizeStart}
          />
        </div>
      )}
    </>
  );
};

export default Sidebar;
