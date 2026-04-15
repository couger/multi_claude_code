import React, { useMemo } from 'react';
import { Session } from '../stores/sessionStore';
import { SessionStatus, DisplayMode } from '../constants';
import { useSessionStore } from '../stores/sessionStore';

// 常用参数预设颜色
const PRESET_ARGS_COLORS: Record<string, string> = {
  '--dangerously-skip-permissions': '#f85149', // 红色
  '--no-confirm': '#58a6ff', // 蓝色
  '--allow-all': '#f85149', // 红色
  '--skip-approval': '#58a6ff', // 蓝色
};

// 预设参数列表（用于快速识别）
const PRESET_ARGS = Object.keys(PRESET_ARGS_COLORS);

// 根据参数字符串生成稳定的颜色
const generateArgColor = (arg: string): string => {
  if (PRESET_ARGS_COLORS[arg]) {
    return PRESET_ARGS_COLORS[arg];
  }
  // 为其他参数生成随机但稳定的颜色
  let hash = 0;
  for (let i = 0; i < arg.length; i++) {
    hash = arg.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#3fb950', '#d29922', '#bc8cff', '#f0883e', '#f778ba', '#39d2c0', '#a371f7', '#79c0ff'];
  return colors[Math.abs(hash) % colors.length];
};

interface SessionCardProps {
  session: Session;
  displayMode: DisplayMode;
  isExpanded: boolean;
  alertCount: number;
  onClose: () => void;
  onExpand: () => void;
}

const SessionCard: React.FC<SessionCardProps> = ({
  session,
  displayMode,
  isExpanded,
  alertCount,
  onClose,
  onExpand,
}) => {
  const alerts = useSessionStore((state) => state.alerts);

  // 获取会话的最新告警
  const latestAlert = alerts
    .filter((a) => a.sessionId === session.id && !a.acknowledged)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

  // 状态颜色
  const getStatusColor = (status: SessionStatus) => {
    switch (status) {
      case SessionStatus.RUNNING:
        return 'bg-accent-success';
      case SessionStatus.PAUSED:
        return 'bg-accent-warning';
      case SessionStatus.COMPLETED:
        return 'bg-accent-primary';
      case SessionStatus.ERROR:
        return 'bg-accent-danger';
      default:
        return 'bg-dark-500';
    }
  };

  // 状态图标
  const getStatusIcon = (status: SessionStatus) => {
    switch (status) {
      case SessionStatus.RUNNING:
        return '▶';
      case SessionStatus.PAUSED:
        return '⏸';
      case SessionStatus.COMPLETED:
        return '✓';
      case SessionStatus.ERROR:
        return '⚠';
      default:
        return '○';
    }
  };

  // 图标模式
  if (displayMode === DisplayMode.ICON) {
    return (
      <div
        className={`relative p-2 rounded cursor-pointer hover:bg-dark-700 transition-all ${
          isExpanded ? 'bg-dark-700 ring-1 ring-accent-primary' : ''
        } ${latestAlert ? 'flash' : ''}`}
        onClick={onExpand}
        title={`${session.name}\n${session.note || '无注释'}`}
      >
        <div className="w-10 h-10 flex items-center justify-center bg-dark-700 rounded text-lg">
          {getStatusIcon(session.status)}
        </div>
        {alertCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent-danger text-white text-xs rounded-full flex items-center justify-center">
            {alertCount > 9 ? '9+' : alertCount}
          </span>
        )}
      </div>
    );
  }

  // 缩略图模式
  return (
    <div
      className={`group relative p-2 rounded cursor-pointer hover:bg-dark-700 transition-all ${
        isExpanded ? 'bg-dark-700 ring-1 ring-accent-primary' : ''
      } ${latestAlert ? 'pulse' : ''}`}
      onClick={onExpand}
      title={session.note || ''}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${getStatusColor(session.status)}`} />
          <span className="text-sm font-medium truncate max-w-[150px]">{session.name}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="w-5 h-5 flex items-center justify-center text-dark-400 hover:text-accent-danger hover:bg-dark-600 rounded transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 备注预览 */}
      <div className="bg-dark-900 rounded p-2 h-24 overflow-hidden text-sm">
        <div className="text-dark-200 whitespace-pre-wrap break-all h-full flex items-center justify-center">
          {session.note || session.workDir.split('/').pop() || session.workDir}
        </div>
      </div>

      {/* 底部信息 */}
      <div className="flex items-center justify-between mt-2 text-xs text-dark-500">
        <div className="flex items-center gap-1.5 truncate max-w-[180px]">
          <span className="truncate">{session.workDir.split('/').pop() || session.workDir}</span>
          {/* 参数色块显示 */}
          {session.args && (
            <div className="flex items-center gap-1 shrink-0">
              {session.args.split(' ').filter(Boolean).map((arg, idx) => {
                const color = generateArgColor(arg);
                return (
                  <span
                    key={idx}
                    className="w-3 h-3 rounded-sm shrink-0 cursor-help"
                    style={{ backgroundColor: color }}
                    title={arg}
                  />
                );
              })}
            </div>
          )}
        </div>
        <span className="shrink-0">
          {session.status === SessionStatus.RUNNING
            ? '运行中'
            : session.status === SessionStatus.COMPLETED
            ? '已完成'
            : session.status}
        </span>
      </div>

      {/* 告警角标 */}
      {alertCount > 0 && (
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-accent-danger text-white text-xs rounded-full flex items-center justify-center font-medium">
          {alertCount > 9 ? '9+' : alertCount}
        </div>
      )}

      {/* 注释提示 - 悬停时显示 */}
      {session.note && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-dark-600 text-dark-100 text-xs rounded shadow-lg whitespace-nowrap max-w-[200px] truncate opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          📝 {session.note}
        </div>
      )}
    </div>
  );
};

export default SessionCard;