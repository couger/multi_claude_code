import React from 'react';
import { Session } from '../stores/sessionStore';
import { SessionStatus, DisplayMode } from '../constants';
import { useSessionStore } from '../stores/sessionStore';

// 移除 ANSI 转义序列的函数
const stripAnsi = (str: string): string => {
  // 更全面的 ANSI 转义码正则表达式
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /[\x1b\x9b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\[?\?[0-9;]*[a-zA-Z]|\[?>[0-9;]*[a-zA-Z]|\[?[\d;]*[a-zA-Z]|\[>[\d;]*[a-zA-Z]/g;
  return str.replace(ansiRegex, '');
};

// 移除控制字符
const stripControlChars = (str: string): string => {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
};

// 清理输出内容用于预览
const cleanOutput = (output: string[]): string => {
  const cleaned = output
    .map(chunk => stripControlChars(stripAnsi(chunk)))
    .join('')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0)
    .slice(-6)
    .join('\n');
  return cleaned;
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
  const outputBuffers = useSessionStore((state) => state.outputBuffers);
  const alerts = useSessionStore((state) => state.alerts);
  const output = outputBuffers.get(session.id) || [];

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

      {/* 缩略图预览 */}
      <div className="bg-dark-900 rounded p-2 h-24 overflow-hidden terminal-container text-xs">
        <div className="text-dark-300 font-mono whitespace-pre-wrap break-all">
          {cleanOutput(output)}
          {session.status === SessionStatus.RUNNING && (
            <span className="inline-block w-1.5 h-3 bg-accent-primary ml-0.5 animate-pulse" />
          )}
        </div>
      </div>

      {/* 底部信息 */}
      <div className="flex items-center justify-between mt-2 text-xs text-dark-500">
        <span className="truncate max-w-[100px]">{session.workDir.split('/').pop() || session.workDir}</span>
        <span>
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