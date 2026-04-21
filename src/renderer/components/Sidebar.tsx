import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Session } from '../stores/sessionStore';
import { SessionStatus, DisplayMode } from '../../shared/constants';
import { DEFAULT_CONFIG } from '../constants';
import SessionCard from './SessionCard';
import RemoteStatusWidget from './sidebar/RemoteStatusWidget';
import GroupSection from './sidebar/GroupSection';

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 280;

interface GeneralSettings {
  showGroupPanel: boolean;
  showPerformancePanel: boolean;
  defaultBrowseDir?: string;
  allowRemoteCreateSession?: boolean;
  terminalFontSize?: number;
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

  // 是否显示分组功能
  const showGroupFeature = generalSettings?.showGroupPanel !== false;
  // 是否显示性能功能
  const showPerformanceFeature = generalSettings?.showPerformancePanel !== false;

  // 未分组会话的缓存（由 GroupSection 通过回调更新）
  const [ungroupedSessions, setUngroupedSessions] = useState<Session[]>(sessions);

  // 实际显示的会话：当分组功能关闭时显示所有会话，否则显示未分组会话
  const displayedSessions = useMemo(() => {
    return showGroupFeature ? ungroupedSessions : sessions;
  }, [showGroupFeature, ungroupedSessions, sessions]);

  // 稳定的回调引用，避免 GroupSection 的 useEffect 频繁触发
  const handleUngroupedSessionsChange = useCallback((updated: Session[]) => {
    setUngroupedSessions(updated);
  }, []);

  // 性能监控状态
  const [systemMetrics, setSystemMetrics] = useState<{
    cpu: { usage: number };
    memory: { usagePercent: number };
    disk?: { usagePercent: number };
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_showNetworkTooltip, _setShowNetworkTooltip] = useState(false);

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
    } catch {
      const input = document.createElement('input');
      input.value = remoteStatus.token;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
  }, [remoteStatus?.token]);

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
                <div className="flex items-center gap-1" title={`CPU: ${systemMetrics.cpu.usage.toFixed(2)}%`}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                  <span className={`${systemMetrics.cpu.usage > 80 ? 'text-red-400' : systemMetrics.cpu.usage > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {systemMetrics.cpu.usage.toFixed(2)}%
                  </span>
                </div>
                <div className="w-px h-3 bg-dark-600" />
                <div className="flex items-center gap-1" title={`内存: ${systemMetrics.memory.usagePercent.toFixed(2)}%`}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span className={`${systemMetrics.memory.usagePercent > 80 ? 'text-red-400' : systemMetrics.memory.usagePercent > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {systemMetrics.memory.usagePercent.toFixed(2)}%
                  </span>
                </div>
                {systemMetrics.disk && (
                  <>
                    <div className="w-px h-3 bg-dark-600" />
                    <div className="flex items-center gap-1" title={`硬盘: ${systemMetrics.disk.usagePercent.toFixed(2)}%`}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6m-6 4h6" />
                      </svg>
                      <span className={`${systemMetrics.disk.usagePercent > 80 ? 'text-red-400' : systemMetrics.disk.usagePercent > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {systemMetrics.disk.usagePercent.toFixed(2)}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-dark-200">CLI 会话</h2>
              <div className="flex items-center gap-1">
                {/* 显示模式切换按钮 */}
                <div className="flex items-center gap-1 bg-dark-700 rounded p-0.5">
                  <button
                    onClick={() => onDisplayModeChange?.(DisplayMode.THUMBNAIL)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                      displayMode === DisplayMode.THUMBNAIL
                        ? 'bg-accent-primary text-dark-900'
                        : 'text-dark-400 hover:text-dark-200'
                    }`}
                    title="预览模式"
                  >
                    预览
                  </button>
                  <button
                    onClick={() => onDisplayModeChange?.(DisplayMode.ICON)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                      displayMode === DisplayMode.ICON
                        ? 'bg-accent-primary text-dark-900'
                        : 'text-dark-400 hover:text-dark-200'
                    }`}
                    title="图标模式"
                  >
                    图标
                  </button>
                </div>
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
              className="sidebar-create-btn w-full py-2 bg-accent-primary text-dark-900 rounded hover:bg-accent-primary/80 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建会话
            </button>

            <button
              onClick={async (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = `
                  <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  创建中...
                `;
                try {
                  // 从localStorage获取上次工作目录和参数
                  const lastWorkDir = localStorage.getItem('lastWorkDir');
                  const lastArgs = localStorage.getItem('lastArgs');

                  // 检查工作目录冲突
                  if (lastWorkDir && sessions.length > 0) {
                    const normalizedNew = lastWorkDir.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
                    const hasConflict = sessions.some(s => {
                      if (s.status === 'completed' || s.status === 'error') return false;
                      const normalizedExisting = (s.workDir || '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
                      if (!normalizedExisting) return false;
                      if (normalizedNew === normalizedExisting) return true;
                      if (normalizedNew.startsWith(normalizedExisting + '/')) return true;
                      if (normalizedExisting.startsWith(normalizedNew + '/')) return true;
                      return false;
                    });
                    if (hasConflict) {
                      const proceed = confirm(
                        '⚠️ 检测到工作目录与其他运行中的会话重叠。\n\n' +
                        '重叠的工作目录可能导致文件操作互相干扰。\n\n' +
                        '是否仍要创建此会话？'
                      );
                      if (!proceed) return;
                    }
                  }

                  await window.electronAPI.createSession({
                    workDir: lastWorkDir || undefined,
                    args: lastArgs || undefined,
                  });
                } catch (err: any) {
                  console.error('快速创建失败:', err);
                  // 显示错误提示
                  alert(`创建会话失败: ${err?.message || String(err)}`);
                } finally {
                  btn.disabled = false;
                  btn.innerHTML = originalText;
                }
              }}
              className="quick-create-btn w-full mt-1.5 py-1.5 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors text-xs flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title="使用上次目录快速创建"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              快速创建
            </button>
          </div>

          {/* 分组功能开启时：会话列表 + 分组面板由 GroupSection 管理 */}
          {showGroupFeature ? (
            <GroupSection
              sessions={sessions}
              expandedSessionId={expandedSessionId}
              displayMode={displayMode}
              getAlertCount={getAlertCount}
              onCloseSession={onCloseSession}
              onExpandSession={onExpandSession}
              onUngroupedSessionsChange={handleUngroupedSessionsChange}
            />
          ) : (
            /* 分组功能关闭时：直接显示所有会话 */
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {displayedSessions.length === 0 ? (
                <div className="text-center text-dark-500 text-sm py-8">
                  <p>暂无会话</p>
                  <p className="text-xs mt-1">点击上方按钮创建</p>
                </div>
              ) : (
                displayedSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    displayMode={displayMode}
                    isExpanded={expandedSessionId === session.id}
                    alertCount={getAlertCount(session.id)}
                    onClose={() => onCloseSession(session.id)}
                    onExpand={() => onExpandSession(session.id)}
                  />
                ))
              )}
            </div>
          )}

          {/* 批量操作按钮 */}
          {sessions.length > 0 && (
            <div className="flex gap-1.5 p-2">
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
                className="sidebar-create-btn flex-1 text-xs py-1.5 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors"
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

          {/* 底部：网络功能 + 设置按钮 */}
          <div className="p-2 border-t border-dark-700 space-y-1.5">
            {/* 网络功能切换开关 */}
            <RemoteStatusWidget
              remoteStatus={remoteStatus}
              togglingRemote={togglingRemote}
              onToggleRemote={handleToggleRemote}
              onCopyToken={handleCopyToken}
            />

            {/* 设置按钮 - 仅在真正的 Electron 环境中显示 */}
            {window.electronAPI?.isElectron === true && (
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
