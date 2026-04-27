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
  const [showEscConfirm, setShowEscConfirm] = useState(false);
  const [escConfirmFocus, setEscConfirmFocus] = useState<'continue' | 'send'>('continue');
  const escConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const escConfirmRef = useRef<HTMLDivElement>(null);

  // 搜索状态
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [matches, setMatches] = useState<number[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const decorationRefs = useRef<any[]>([]);

  // Output is now written directly to xterm via IPC listener, not through Zustand store
  // This avoids creating thousands of Map copies and React re-renders on every PTY chunk

  // 处理ESC确认弹窗关闭
  const handleEscConfirmClose = useCallback(() => {
    setShowEscConfirm(false);
    if (escConfirmTimerRef.current) clearTimeout(escConfirmTimerRef.current);
    // 延迟恢复焦点确保弹窗已关闭
    setTimeout(() => {
      xtermRef.current?.focus();
    }, 50);
  }, []);

  // 处理发送ESC
  const handleSendEsc = useCallback(() => {
    // 先关闭弹窗
    setShowEscConfirm(false);
    if (escConfirmTimerRef.current) clearTimeout(escConfirmTimerRef.current);

    // 发送ESC字符 - 使用 requestAnimationFrame 确保终端焦点已恢复
    requestAnimationFrame(() => {
      window.electronAPI.sendInput(session.id, '\x1b');
      // 延迟恢复终端焦点，确保字符已发送
      setTimeout(() => {
        xtermRef.current?.focus();
      }, 50);
    });
  }, [session.id]);

  // ESC确认弹窗键盘导航
  useEffect(() => {
    if (!showEscConfirm) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setEscConfirmFocus(prev => prev === 'continue' ? 'send' : 'continue');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (escConfirmFocus === 'continue') {
          handleEscConfirmClose();
        } else {
          handleSendEsc();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleEscConfirmClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showEscConfirm, escConfirmFocus, handleEscConfirmClose, handleSendEsc]);

  // 显示ESC确认弹窗时重置焦点
  useEffect(() => {
    if (showEscConfirm) {
      setEscConfirmFocus('continue');
    }
  }, [showEscConfirm]);

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

      // 处理输入 - 拦截 ESC 键
      terminal.onData((data) => {
        if (data === '\x1b' || data === '\x1b\x1b') {
          // ESC 键被按下，显示确认对话框
          setShowEscConfirm(true);
          // 让终端失去焦点，确保弹窗能接收键盘事件
          terminal.blur();
          if (escConfirmTimerRef.current) clearTimeout(escConfirmTimerRef.current);
          escConfirmTimerRef.current = setTimeout(() => setShowEscConfirm(false), 5000);
          return;
        }
        window.electronAPI.sendInput(session.id, data);
      });

      // 处理键盘快捷键 - Ctrl+C 复制（禁用默认复制）
      terminal.onKey(({ domEvent, key }) => {
        // Ctrl+C 复制选中文本
        if (domEvent.ctrlKey && (domEvent.key === 'c' || domEvent.key === 'C')) {
          const selection = terminal.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection).catch(() => { /* ignore */ });
          }
          return;
        }
        // Ctrl+V 粘贴 - 只阻止默认行为，避免 onData 重复处理
        if (domEvent.ctrlKey && (domEvent.key === 'v' || domEvent.key === 'V')) {
          domEvent.preventDefault();
          // 不在这里处理，让 onData 处理粘贴事件
          return;
        }
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

  // 监听新输出 — 直接写入 xterm，绕过 Zustand store 避免不必要的重渲染
  const handleOutput = useCallback((data: any) => {
    if (data.id === session.id && xtermRef.current) {
      xtermRef.current.write(data.data);
    }
  }, [session.id]);

  useEffect(() => {
    window.electronAPI.onSessionOutput(handleOutput);
    return () => {
      window.electronAPI.removeListener('session:outputChunk', handleOutput);
    };
  }, [handleOutput]);

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

  // 执行搜索
  const performSearch = useCallback(() => {
    if (!xtermRef.current || !searchTerm) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    try {
      const buffer = xtermRef.current.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buffer.length; i++) {
        lines.push(buffer.getLine(i)?.translateToString() || '');
      }
      const fullText = lines.join('\n');

      const regex = isRegex
        ? new RegExp(searchTerm, 'gi')
        : new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      const found: number[] = [];
      let match;
      while ((match = regex.exec(fullText)) !== null) {
        found.push(match.index);
      }

      setMatches(found);
      setCurrentMatchIndex(found.length > 0 ? 0 : -1);
    } catch (e) {
      setMatches([]);
      setCurrentMatchIndex(-1);
    }
  }, [searchTerm, isRegex]);

  // 搜索输入变化
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setTimeout(performSearch, 0);
  };

  // 切换正则模式
  const toggleRegex = () => {
    setIsRegex(!isRegex);
    setTimeout(performSearch, 0);
  };

  // 上一条匹配
  const prevMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev <= 0 ? matches.length - 1 : prev - 1));
  };

  // 下一条匹配
  const nextMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev >= matches.length - 1 ? 0 : prev + 1));
  };

  // 关闭搜索
  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchTerm('');
    setMatches([]);
    setCurrentMatchIndex(-1);
  };

  // 搜索快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        e.preventDefault();
        closeSearch();
      }
      if (isSearchOpen && !showEscConfirm) {
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          prevMatch();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          nextMatch();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, showEscConfirm, matches.length]);

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
          {/* 复制按钮 */}
          <button
            onClick={async () => {
              const selection = xtermRef.current?.getSelection();
              if (selection) {
                try { await navigator.clipboard.writeText(selection); } catch { /* ignore */ }
              }
            }}
            className="p-1.5 hover:bg-dark-700 rounded transition-colors"
            title="复制选中内容"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>

          {/* 粘贴按钮 */}
          <button
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text && xtermRef.current) {
                  window.electronAPI.sendInput(session.id, text);
                }
              } catch { /* ignore */ }
            }}
            className="p-1.5 hover:bg-dark-700 rounded transition-colors"
            title="粘贴剪贴板内容"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </button>

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

          {/* 搜索按钮 */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className={`p-1.5 rounded transition-colors ${
              isSearchOpen ? 'bg-accent-primary text-dark-900' : 'hover:bg-dark-700'
            }`}
            title="搜索 (Ctrl+F)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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

      {/* 搜索栏 */}
      {isSearchOpen && (
        <div className="p-2 bg-dark-800 border-b border-dark-700 flex items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="搜索终端输出..."
            className="flex-1 bg-dark-700 border border-dark-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent-primary"
            autoFocus
          />
          <button
            onClick={toggleRegex}
            className={`px-2 py-1 rounded text-xs font-mono ${
              isRegex ? 'bg-accent-primary text-dark-900' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
            }`}
            title="正则表达式模式"
          >
            .*
          </button>
          <div className="flex items-center gap-1 text-xs text-dark-400 min-w-[80px]">
            {matches.length > 0 ? (
              <>
                <button onClick={prevMatch} className="p-1 hover:bg-dark-700 rounded" title="上一�� (Shift+Enter)">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <span className="px-1">{currentMatchIndex + 1}/{matches.length}</span>
                <button onClick={nextMatch} className="p-1 hover:bg-dark-700 rounded" title="下一个 (Enter)">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </>
            ) : (
              <span className="px-1">{searchTerm ? '无匹配' : '输入搜索'}</span>
            )}
          </div>
          <button
            onClick={closeSearch}
            className="p-1.5 hover:bg-dark-700 rounded transition-colors"
            title="关闭搜索 (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 终端区域 */}
      <div className="flex-1 p-4 overflow-hidden relative">
        <div
          ref={terminalRef}
          className="w-full h-full rounded border border-dark-700 terminal-container"
        />

        {/* ESC 确认弹窗 */}
        {showEscConfirm && (
          <div
            ref={escConfirmRef}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-dark-800 border border-dark-600 rounded-lg shadow-2xl p-4 z-50 min-w-[280px]"
          >
            <p className="text-sm text-dark-100 mb-3">检测到 ESC 键，是否发送到终端？</p>
            <p className="text-xs text-dark-500 mb-3">ESC 可能中断当前 Claude Code 正在执行的任务</p>
            <div className="flex gap-2">
              <button
                onClick={handleEscConfirmClose}
                className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                  escConfirmFocus === 'continue'
                    ? 'bg-accent-primary text-dark-900 ring-2 ring-accent-primary ring-offset-2 ring-offset-dark-800'
                    : 'bg-dark-700 text-dark-200 hover:bg-dark-600'
                }`}
              >
                继续工作
                <span className="ml-1 text-dark-400 text-[10px]">←</span>
              </button>
              <button
                onClick={handleSendEsc}
                className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                  escConfirmFocus === 'send'
                    ? 'bg-accent-danger text-white ring-2 ring-accent-danger ring-offset-2 ring-offset-dark-800'
                    : 'bg-red-600/80 text-white hover:bg-red-500'
                }`}
              >
                发送 ESC
                <span className="ml-1 text-dark-200 text-[10px]">→</span>
              </button>
            </div>
            <p className="text-xs text-dark-600 mt-2 text-center">
              ← → 选择 · Enter 确认 · Esc 取消
            </p>
          </div>
        )}
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