/**
 * 增强版会话卡片组件
 */

import React, { useState, useCallback } from 'react';
import { Session } from '../stores/sessionStore';

interface EnhancedSessionCardProps {
  session: Session;
  isExpanded: boolean;
  alertCount: number;
  onExpand: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onToggleNote?: (sessionId: string) => void;
  onQuickAction?: (sessionId: string, action: string) => void;
  showPerformance?: boolean;
  performanceData?: {
    cpuUsage: number;
    memoryUsage: number;
  };
  className?: string;
}

const EnhancedSessionCard: React.FC<EnhancedSessionCardProps> = ({
  session,
  isExpanded,
  alertCount,
  onExpand,
  onClose,
  onToggleNote,
  onQuickAction,
  showPerformance = false,
  performanceData,
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [noteInput, setNoteInput] = useState(session.note || '');
  const [isEditingNote, setIsEditingNote] = useState(false);

  // 状态颜色映射
  const statusColors = {
    running: 'bg-green-500',
    paused: 'bg-yellow-500',
    completed: 'bg-blue-500',
    error: 'bg-red-500',
    idle: 'bg-gray-500',
  };

  // 状态文本映射
  const statusText = {
    running: '运行中',
    paused: '已暂停',
    completed: '已完成',
    error: '错误',
    idle: '待启动',
  };

  // 处理卡片点击（展开/折叠）
  const handleCardClick = useCallback(() => {
    if (isExpanded) {
      // 如果已经展开，点击外部区域会折叠，但这里我们只处理卡片内部的逻辑
    } else {
      onExpand(session.id);
    }
  }, [isExpanded, session.id, onExpand]);

  // 处理关闭按钮点击
  const handleCloseClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose(session.id);
    },
    [session.id, onClose]
  );

  // 处理笔记按钮点击
  const handleNoteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onToggleNote) {
        onToggleNote(session.id);
      } else {
        setIsEditingNote(!isEditingNote);
      }
    },
    [session.id, onToggleNote, isEditingNote]
  );

  // 处理快速操作
  const handleQuickAction = useCallback(
    (action: string) => {
      if (onQuickAction) {
        onQuickAction(session.id, action);
      }
      setIsMenuOpen(false);
    },
    [session.id, onQuickAction]
  );

  // 保存笔记
  const handleSaveNote = useCallback(() => {
    if (noteInput !== session.note) {
      // 这里应该调用更新笔记的API
      window.electronAPI.setNote?.(session.id, noteInput);
    }
    setIsEditingNote(false);
  }, [session.id, noteInput, session.note]);

  // 计算运行时间
  const getUptime = useCallback(() => {
    const createdAt = new Date(session.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}小时${minutes}分钟`;
    }
    return `${minutes}分钟`;
  }, [session.createdAt]);

  // 格式化最后活动时间
  const formatLastActivity = useCallback(() => {
    const lastActivity = new Date(session.lastActivity);
    const now = new Date();
    const diffMs = now.getTime() - lastActivity.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}小时前`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}天前`;
  }, [session.lastActivity]);

  return (
    <div
      className={`relative rounded-lg border border-dark-700 bg-dark-800 transition-all duration-200 hover:border-dark-600 hover:shadow-lg hover:shadow-dark-900/30 ${
        isExpanded ? 'ring-2 ring-primary-500 ring-opacity-50' : ''
      } ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
    >
      {/* 会话状态指示器 */}
      <div className="absolute top-3 left-3 flex items-center">
        <div
          className={`w-2 h-2 rounded-full ${statusColors[session.status] || 'bg-gray-500'}`}
          title={statusText[session.status] || '未知'}
        />
        {alertCount > 0 && (
          <div className="ml-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" title="有待处理告警" />
        )}
      </div>

      {/* 右上角操作按钮 */}
      <div className="absolute top-2 right-2 flex items-center space-x-1">
        {isHovered && (
          <>
            {onToggleNote && (
              <button
                className="p-1 rounded-md hover:bg-dark-700 text-dark-400 hover:text-dark-300 transition-colors"
                onClick={handleNoteClick}
                title="笔记"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            <button
              className="p-1 rounded-md hover:bg-dark-700 text-dark-400 hover:text-dark-300 transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              title="更多操作"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            <button
              className="p-1 rounded-md hover:bg-red-500/20 text-dark-400 hover:text-red-400 transition-colors"
              onClick={handleCloseClick}
              title="关闭会话"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* 下拉菜单 */}
      {isMenuOpen && (
        <div className="absolute top-10 right-2 w-40 bg-dark-800 border border-dark-700 rounded-lg shadow-lg z-10 py-1">
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-dark-700 transition-colors"
            onClick={() => handleQuickAction('restart')}
          >
            重启会话
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-dark-700 transition-colors"
            onClick={() => handleQuickAction('pause')}
          >
            {session.status === 'paused' ? '恢复会话' : '暂停会话'}
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-dark-700 transition-colors"
            onClick={() => handleQuickAction('duplicate')}
          >
            复制会话
          </button>
          <div className="border-t border-dark-700 my-1" />
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-dark-700 transition-colors"
            onClick={() => handleQuickAction('export')}
          >
            导出日志
          </button>
        </div>
      )}

      {/* 卡片内容 */}
      <div className="p-4 pt-6">
        {/* 会话标题 */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-dark-100 truncate">{session.name}</h3>
          <span className="text-xs text-dark-500">{getUptime()}</span>
        </div>

        {/* 工作目录 */}
        <div className="text-xs text-dark-500 truncate mb-3" title={session.workDir}>
          <svg className="w-3 h-3 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          {session.workDir.split('/').pop() || session.workDir}
        </div>

        {/* 性能指标（如果启用） */}
        {showPerformance && performanceData && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-dark-400">CPU</span>
              <span className="text-dark-300">{performanceData.cpuUsage.toFixed(1)}%</span>
            </div>
            <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-300"
                style={{ width: `${Math.min(performanceData.cpuUsage, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs mt-2 mb-1">
              <span className="text-dark-400">内存</span>
              <span className="text-dark-300">{performanceData.memoryUsage.toFixed(1)}%</span>
            </div>
            <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-300"
                style={{ width: `${Math.min(performanceData.memoryUsage, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* 状态标签 */}
        <div className="flex items-center justify-between mb-3">
          <span className={`px-2 py-1 text-xs rounded-full ${statusColors[session.status] || 'bg-gray-500'} bg-opacity-20 text-${session.status === 'running' ? 'green' : session.status === 'error' ? 'red' : 'gray'}-400`}>
            {statusText[session.status] || '未知'}
          </span>
          <span className="text-xs text-dark-500" title="最后活动时间">
            {formatLastActivity()}
          </span>
        </div>

        {/* 笔记区域 */}
        {isEditingNote ? (
          <div className="mt-2">
            <textarea
              className="w-full px-3 py-2 text-sm bg-dark-700 border border-dark-600 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="添加笔记..."
              rows={2}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex justify-end space-x-2 mt-2">
              <button
                className="px-3 py-1 text-xs bg-dark-700 hover:bg-dark-600 rounded-md transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingNote(false);
                  setNoteInput(session.note || '');
                }}
              >
                取消
              </button>
              <button
                className="px-3 py-1 text-xs bg-primary-600 hover:bg-primary-500 rounded-md transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSaveNote();
                }}
              >
                保存
              </button>
            </div>
          </div>
        ) : session.note ? (
          <div
            className="mt-2 p-2 text-sm bg-dark-700/50 rounded-md cursor-pointer hover:bg-dark-700 transition-colors"
            onClick={handleNoteClick}
          >
            <div className="text-dark-300 line-clamp-2">{session.note}</div>
            <div className="text-xs text-dark-500 mt-1">点击编辑笔记</div>
          </div>
        ) : (
          <button
            className="mt-2 w-full py-2 text-xs text-dark-500 hover:text-dark-400 border border-dashed border-dark-600 hover:border-dark-500 rounded-md transition-colors"
            onClick={handleNoteClick}
          >
            添加笔记
          </button>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="border-t border-dark-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              className="p-1.5 rounded-md hover:bg-dark-700 text-dark-400 hover:text-dark-300 transition-colors"
              title="发送命令"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickAction('sendCommand');
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
            <button
              className="p-1.5 rounded-md hover:bg-dark-700 text-dark-400 hover:text-dark-300 transition-colors"
              title="查看日志"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickAction('viewLogs');
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          </div>
          <div className="text-xs text-dark-500">
            PID: {session.pid || 'N/A'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedSessionCard;