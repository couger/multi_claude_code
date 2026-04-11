import React, { useState, useEffect, useRef } from 'react';
import { Session } from '../stores/sessionStore';
import { SessionStatus, DisplayMode, DEFAULT_CONFIG } from '../constants';
import SessionCard from './SessionCard';

interface SidebarProps {
  visible: boolean;
  sessions: Session[];
  expandedSessionId: string | null;
  onCreateSession: () => void;
  onCloseSession: (id: string) => void;
  onExpandSession: (id: string) => void;
  getAlertCount: (id: string) => number;
  onShowPerformance: () => void;
  onShowGroups: () => void;
  onShowRemoteAccess?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  visible,
  sessions,
  expandedSessionId,
  onCreateSession,
  onCloseSession,
  onExpandSession,
  getAlertCount,
  onShowPerformance,
  onShowGroups,
  onShowRemoteAccess,
}) => {
  const [displayMode, setDisplayMode] = useState<DisplayMode>(DisplayMode.THUMBNAIL);
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 自动隐藏逻辑 - 触发 forceUpdate 来重新渲染
  const [, forceUpdate] = useState({});

  useEffect(() => {
    if (isPinned) return;

    if (isHovered) {
      // 鼠标悬停时，清除隐藏定时器
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    } else {
      // 鼠标离开后，延迟隐藏
      hideTimeoutRef.current = setTimeout(() => {
        forceUpdate({}); // 触发重新渲染，隐藏侧边栏
      }, DEFAULT_CONFIG.sidebarHideDelay);
    }

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [isHovered, isPinned]);

  // 判断是否显示侧边栏
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
          {/* 展开指示器 */}
          <div className="w-8 h-8 flex items-center justify-center text-dark-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </div>

          {/* 会话数量指示 */}
          <div className="mt-2 w-6 h-6 bg-accent-primary text-dark-900 rounded-full flex items-center justify-center text-xs font-medium">
            {sessions.length}
          </div>

          {/* 运行中会话指示 */}
          {sessions.filter(s => s.status === SessionStatus.RUNNING).length > 0 && (
            <div className="mt-2 w-3 h-3 bg-accent-success rounded-full animate-pulse" />
          )}

          {/* 告警指示 */}
          {sessions.some(s => getAlertCount(s.id) > 0) && (
            <div className="mt-2 w-3 h-3 bg-accent-danger rounded-full" />
          )}
        </div>
      )}

      {/* 展开的侧边栏 */}
      {showSidebar && (
        <div
          className="w-[280px] bg-dark-800 border-r border-dark-700 flex flex-col slide-in"
          onMouseEnter={() => {
            setIsHovered(true);
            // 清除任何待处理的隐藏定时器
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
              hideTimeoutRef.current = null;
            }
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            if (!isPinned) {
              // 鼠标离开后，延迟隐藏
              hideTimeoutRef.current = setTimeout(() => {
                forceUpdate({}); // 触发重新渲染
              }, DEFAULT_CONFIG.sidebarHideDelay);
            }
          }}
        >
          {/* 头部 */}
          <div className="p-3 border-b border-dark-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-dark-200">CLI 会话</h2>
              <div className="flex items-center gap-1">
                <span className="text-xs text-dark-500 bg-dark-700 px-2 py-0.5 rounded-full">
                  {sessions.length}
                </span>
                {/* 固定按钮 */}
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

            {/* 显示模式切换 */}
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setDisplayMode(DisplayMode.THUMBNAIL)}
                className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                  displayMode === DisplayMode.THUMBNAIL
                    ? 'bg-accent-primary text-dark-900'
                    : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                }`}
              >
                缩略图
              </button>
              <button
                onClick={() => setDisplayMode(DisplayMode.ICON)}
                className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                  displayMode === DisplayMode.ICON
                    ? 'bg-accent-primary text-dark-900'
                    : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                }`}
              >
                图标
              </button>
            </div>

            {/* 添加按钮 */}
            <button
              onClick={onCreateSession}
              className="w-full py-2 bg-accent-primary text-dark-900 rounded hover:bg-accent-primary/80 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建会话
            </button>

            {/* 快速创建按钮（不显示对话框） */}
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await window.electronAPI.createSession();
                } catch (err) {
                  console.error('快速创建失败:', err);
                }
              }}
              className="w-full py-1.5 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors text-xs flex items-center justify-center gap-1"
              title="使用上次目录快速创建"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              快速创建
            </button>
          </div>

          {/* 会话列表 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {sessions.length === 0 ? (
              <div className="text-center text-dark-500 text-sm py-8">
                <p>暂无会话</p>
                <p className="text-xs mt-1">点击上方按钮创建</p>
              </div>
            ) : (
              sessions.map((session) => (
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

          {/* 工具栏 */}
          <div className="p-2 border-t border-dark-700 space-y-1.5">
            <div className="flex gap-1.5">
              <button
                onClick={onShowPerformance}
                className="flex-1 text-xs py-1.5 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors flex items-center justify-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                性能
              </button>
              <button
                onClick={onShowGroups}
                className="flex-1 text-xs py-1.5 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors flex items-center justify-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                分组
              </button>
              {window.electronAPI?.isElectron && onShowRemoteAccess && (
                <button
                  onClick={onShowRemoteAccess}
                  className="flex-1 text-xs py-1.5 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors flex items-center justify-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  远程
                </button>
              )}
            </div>
          </div>

          {/* 批量操作栏 */}
          {sessions.length > 0 && (
            <div className="p-2 border-t border-dark-700 space-y-1.5">
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
              <div className="flex justify-between text-xs text-dark-500">
                <span>
                  运行中: {sessions.filter((s) => s.status === SessionStatus.RUNNING).length}
                </span>
                <span>
                  已完成: {sessions.filter((s) => s.status === SessionStatus.COMPLETED).length}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default Sidebar;