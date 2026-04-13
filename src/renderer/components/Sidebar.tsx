import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Session } from '../stores/sessionStore';
import { SessionStatus, DisplayMode, DEFAULT_CONFIG } from '../constants';
import SessionCard from './SessionCard';

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 280;

interface SidebarProps {
  visible: boolean;
  sessions: Session[];
  expandedSessionId: string | null;
  displayMode: DisplayMode;
  onCreateSession: () => void;
  onCloseSession: (id: string) => void;
  onExpandSession: (id: string) => void;
  getAlertCount: (id: string) => number;
  onShowSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  visible,
  sessions,
  expandedSessionId,
  displayMode,
  onCreateSession,
  onCloseSession,
  onExpandSession,
  getAlertCount,
  onShowSettings,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parseInt(saved, 10))) : DEFAULT_SIDEBAR_WIDTH;
  });
  const isResizing = useRef(false);

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
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-dark-200">CLI 会话</h2>
              <div className="flex items-center gap-1">
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

          {/* 底部：设置按钮 + 批量操作 */}
          <div className="p-2 border-t border-dark-700 space-y-1.5">
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
