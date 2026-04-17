import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Session } from '../stores/sessionStore';
import { SessionStatus } from '../../shared/constants';
import { useSessionStore } from '../stores/sessionStore';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface ExpandedViewProps {
  session: Session;
  onClose: (id: string) => void;
  onCollapse: () => void;
  terminalFontSize?: number;
}

const ExpandedView: React.FC<ExpandedViewProps> = ({ session, onClose, onCollapse, terminalFontSize }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [note, setNote] = useState(session.note);
  const [isEditingNote, setIsEditingNote] = useState(false);

  const outputBuffers = useSessionStore((state) => state.outputBuffers);
  const output = outputBuffers.get(session.id) || [];

  // 调整终端尺寸
  const resizeTerminal = useCallback(() => {
    if (!fitAddonRef.current || !xtermRef.current) return;

    try {
      fitAddonRef.current.fit();
      const dims = fitAddonRef.current.proposeDimensions();
      if (dims && dims.cols && dims.rows && dims.cols > 0 && dims.rows > 0) {
        window.electronAPI.resizeSession(session.id, dims.cols, dims.rows);
      }
    } catch (e) {
      // 忽略错误
    }
  }, [session.id]);

  // 初始化终端
  useEffect(() => {
    if (!terminalRef.current) return;

    // 确保容器有尺寸
    const container = terminalRef.current;
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      // 等待容器渲染
      const timer = setTimeout(() => {
        if (terminalRef.current) {
          initTerminal();
        }
      }, 100);
      return () => clearTimeout(timer);
    }

    initTerminal();

    function initTerminal() {
      if (!terminalRef.current || xtermRef.current) return;

      const terminal = new Terminal({
        theme: {
          background: '#0d1117',
          foreground: '#c9d1d9',
          cursor: '#58a6ff',
          cursorAccent: '#0d1117',
          selectionBackground: '#264f78',
          black: '#0d1117',
          red: '#f85149',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39c5cf',
          white: '#f0f6fc',
          brightBlack: '#484f58',
          brightRed: '#ff7b72',
          brightGreen: '#7ee787',
          brightYellow: '#e3b341',
          brightBlue: '#79c0ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#56d4dd',
          brightWhite: '#f0f6fc',
        },
        fontFamily: '"Cascadia Code", "Fira Code", Consolas, Monaco, monospace',
        fontSize: terminalFontSize || 14,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 10000,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      terminal.open(terminalRef.current);

      // 延迟 fit 以确保容器尺寸正确
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims && dims.cols && dims.rows && dims.cols > 0 && dims.rows > 0) {
            window.electronAPI.resizeSession(session.id, dims.cols, dims.rows);
          }
        } catch (e) {
          // 忽略
        }
      });

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // 处理输入
      terminal.onData((data) => {
        window.electronAPI.sendInput(session.id, data);
      });

      // 加载已有输出
      window.electronAPI.getSessionOutput(session.id).then((savedOutput) => {
        if (savedOutput && terminal) {
          terminal.write(savedOutput);
        }
      });
    }

    return () => {
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      }
    };
  }, [session.id, terminalFontSize]);

  // 窗口大小调整
  useEffect(() => {
    const handleResize = () => {
      resizeTerminal();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [resizeTerminal]);

  // 监听新输出
  useEffect(() => {
    if (!xtermRef.current) return;

    // 写入最新的输出
    const lastChunk = output[output.length - 1];
    if (lastChunk) {
      xtermRef.current.write(lastChunk);
    }
  }, [output]);

  // 状态颜色
  const getStatusColor = (status: SessionStatus) => {
    switch (status) {
      case SessionStatus.RUNNING:
        return 'text-accent-success';
      case SessionStatus.PAUSED:
        return 'text-accent-warning';
      case SessionStatus.COMPLETED:
        return 'text-accent-primary';
      case SessionStatus.ERROR:
        return 'text-accent-danger';
      default:
        return 'text-dark-400';
    }
  };

  // 保存注释
  const handleSaveNote = () => {
    window.electronAPI.setNote(session.id, note);
    // 更新本地状态
    useSessionStore.getState().updateSession(session.id, { note });
    setIsEditingNote(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-dark-900 fade-in">
      {/* 头部工具栏 */}
      <div className="h-12 bg-dark-800 border-b border-dark-700 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          {/* 返回按钮 */}
          <button
            onClick={onCollapse}
            className="p-1.5 hover:bg-dark-700 rounded transition-colors"
            title="返回列表"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* 会话名称 */}
          <h2 className="text-sm font-medium">{session.name}</h2>

          {/* 状态 */}
          <span className={`text-xs ${getStatusColor(session.status)}`}>
            {session.status === SessionStatus.RUNNING
              ? '● 运行中'
              : session.status === SessionStatus.COMPLETED
              ? '✓ 已完成'
              : session.status === SessionStatus.ERROR
              ? '⚠ 错误'
              : '○ ' + session.status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 注释按钮 */}
          <button
            onClick={() => setIsEditingNote(!isEditingNote)}
            className={`p-1.5 rounded transition-colors ${
              isEditingNote ? 'bg-accent-primary text-dark-900' : 'hover:bg-dark-700'
            }`}
            title="添加注释"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>

          {/* 关闭按钮 */}
          <button
            onClick={() => onClose(session.id)}
            className="p-1.5 hover:bg-accent-danger rounded transition-colors"
            title="终止会话"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 注释编辑区 */}
      {isEditingNote && (
        <div
          className="p-3 bg-dark-800 border-b border-dark-700"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onFocus={() => {
                // 让 xterm 释放焦点
                if (xtermRef.current) {
                  xtermRef.current.blur();
                }
              }}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="添加注释..."
              className="flex-1 bg-dark-700 border border-dark-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent-primary"
              autoFocus
            />
            <button
              onClick={handleSaveNote}
              className="px-3 py-1.5 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {/* 终端区域 */}
      <div className="flex-1 p-4 overflow-hidden">
        <div
          ref={terminalRef}
          className="w-full h-full rounded border border-dark-700 terminal-container"
        />
      </div>

      {/* 底部状态栏 */}
      <div className="h-8 bg-dark-800 border-t border-dark-700 flex items-center justify-between px-4 text-xs text-dark-500">
        <div className="flex items-center gap-4">
          <span title={session.workDir}>📁 {session.workDir.split('/').pop() || session.workDir}</span>
          <span>PID: {session.pid || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>创建: {new Date(session.createdAt).toLocaleString()}</span>
          <span>活动: {new Date(session.lastActivity).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

export default ExpandedView;