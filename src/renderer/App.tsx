import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useSessionStore } from './stores/sessionStore';
import Sidebar from './components/Sidebar';
import ExpandedView from './components/ExpandedView';
import TitleBar from './components/TitleBar';
import AlertManager from './components/AlertManager';
import CreateSessionDialog from './components/CreateSessionDialog';
import SettingsPanel from './components/SettingsPanel';
import { SessionStatus } from '../shared/constants';
import { whisperService } from './services/WhisperService';
import { useVoiceAssistantStore } from './stores/voiceAssistantStore';
import ErrorBoundary from './components/ErrorBoundary';

interface GeneralSettings {
  showGroupPanel: boolean;
  showPerformancePanel: boolean;
  defaultBrowseDir?: string;
  allowRemoteCreateSession?: boolean;
  terminalFontSize?: number;
}

const App: React.FC = () => {
  const {
    sessions,
    expandedSessionId,
    sidebarVisible,
    displayMode,
    setSessions,
    addSession,
    updateSession,
    removeSession,
    setExpandedSession,
    appendOutput,
    addAlert,
    setDisplayMode,
  } = useSessionStore();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // 防止 StrictMode 双重执行
  const listenersInitialized = useRef(false);

  // 自动加载已保存的 Whisper WASM 模型（仅在设置中启用 WASM 时加载）
  useEffect(() => {
    try {
      const savedModelId = localStorage.getItem('whisperWasm.modelId');
      if (savedModelId) {
        whisperService.checkSupport().then(supported => {
          if (supported) {
            whisperService.loadModel(savedModelId as any).catch(() => {
              // 加载失败时清除已保存的模型 ID，避免下次继续尝试
              localStorage.removeItem('whisperWasm.modelId');
            });
          }
        }).catch(() => { /* WASM 支持检查失败，静默降级 */ });
      }
    } catch {
      // 如果 WASM 模块加载失败，清除相关状态
      localStorage.removeItem('whisperWasm.modelId');
    }
    // 加载语音助手消息历史
    try {
      useVoiceAssistantStore.getState().loadFromStorage();
    } catch { /* ignore */ }
  }, []);

  // 通用设置状态
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(() => {
    const saved = localStorage.getItem('generalSettings');
    return saved ? JSON.parse(saved) : {
      showGroupPanel: true,
      showPerformancePanel: true,
    };
  });

  // 保存通用设置
  useEffect(() => {
    localStorage.setItem('generalSettings', JSON.stringify(generalSettings));
    // 广播设置到远程Web客户端
    try {
      window.electronAPI?.broadcastGeneralSettings?.(generalSettings);
    } catch { /* ignore */ }
  }, [generalSettings]);

  // 监听远程推送的通用设置更新（浏览器环境）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'generalSettings' && e.newValue) {
        try {
          const newSettings = JSON.parse(e.newValue);
          setGeneralSettings(newSettings);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // 定期检查（storage事件在同一个页面不触发）
    const interval = setInterval(() => {
      const saved = localStorage.getItem('generalSettings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.showGroupPanel !== generalSettings.showGroupPanel ||
              parsed.showPerformancePanel !== generalSettings.showPerformancePanel) {
            setGeneralSettings(parsed);
          }
        } catch { /* ignore */ }
      }
    }, 2000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [generalSettings]);

  // 初始化 IPC 监听
  useEffect(() => {
    // 防止 StrictMode 双重执行
    if (listenersInitialized.current) return;
    listenersInitialized.current = true;

    // 加载已有会话
    window.electronAPI.getSessions().then((loadedSessions) => {
      setSessions(loadedSessions.map((s: any) => ({
        ...s,
        createdAt: new Date(s.createdAt),
        lastActivity: new Date(s.lastActivity),
      })));
    });

    // 监听会话创建
    const handleCreated = (session: any) => {
      addSession({
        ...session,
        createdAt: new Date(session.createdAt),
        lastActivity: new Date(session.lastActivity),
      });
    };

    // 监听输出 — 节流写入 store，避免高频输出导致过多重渲染
    const outputBuffer = new Map<string, string[]>();
    let outputFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushOutput = () => {
      outputFlushTimer = null;
      for (const [id, chunks] of outputBuffer) {
        if (chunks.length > 0) {
          appendOutput(id, chunks.join(''));
        }
        outputBuffer.set(id, []);
      }
    };

    const handleOutput = (data: any) => {
      let chunks = outputBuffer.get(data.id);
      if (!chunks) {
        chunks = [];
        outputBuffer.set(data.id, chunks);
      }
      chunks.push(data.data);
      if (!outputFlushTimer) {
        outputFlushTimer = setTimeout(flushOutput, 100);
      }
    };

    const handleStatus = (data: any) => {
      updateSession(data.id, { status: data.status });
    };

    const handleClosed = (data: any) => {
      removeSession(data.id);
    };

    const handleAlert = (alert: any) => {
      addAlert({
        sessionId: alert.sessionId,
        type: alert.type,
        message: alert.message,
      });
    };

    const handleTrayCreate = () => {
      setShowCreateDialog(true);
    };

    window.electronAPI.onSessionCreated(handleCreated);
    window.electronAPI.onSessionOutput(handleOutput);
    window.electronAPI.onSessionStatus(handleStatus);
    window.electronAPI.onSessionClosed(handleClosed);
    window.electronAPI.onAlert(handleAlert);
    window.electronAPI.onTrayCreateSession?.(handleTrayCreate);

    return () => {
      window.electronAPI.removeListener('session:created', handleCreated);
      window.electronAPI.removeListener('session:outputChunk', handleOutput);
      window.electronAPI.removeListener('session:status', handleStatus);
      window.electronAPI.removeListener('session:closed', handleClosed);
      window.electronAPI.removeListener('alert:trigger', handleAlert);
    };
  }, []);

  // 获取展开的会话
  const expandedSession = expandedSessionId
    ? sessions.find((s) => s.id === expandedSessionId)
    : null;

  // 处理创建新会话（带选项）
  const handleCreateSessionWithOptions = useCallback(async (options: { name?: string; workDir?: string; args?: string }) => {
    try {
      await window.electronAPI.createSession(options);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  }, []);

  // 处理关闭会话（带确认）
  const handleCloseSession = useCallback(async (sessionId: string) => {
    const session = useSessionStore.getState().sessions.find(s => s.id === sessionId);
    if (session && session.status === SessionStatus.RUNNING) {
      if (!confirm(`确定终止会话 "${session.name}" 吗？正在运行的任务将被中断。`)) return;
    }
    try {
      await window.electronAPI.killSession(sessionId);
    } catch (error) {
      console.error('Failed to kill session:', error);
    }
  }, []);

  // 处理展开会话（自动最大化窗口）
  const handleExpandSession = useCallback((sessionId: string) => {
    setExpandedSession(sessionId);
    try { window.electronAPI.maximizeForSession(); } catch { /* ignore */ }
  }, [setExpandedSession]);

  // 处理折叠会话（恢复窗口大小）
  const handleCollapseSession = useCallback(() => {
    setExpandedSession(null);
    try { window.electronAPI.unmaximizeForSession(); } catch { /* ignore */ }
  }, [setExpandedSession]);

  // 获取会话的未确认告警数
  const getSessionAlertCount = useCallback(
    (sessionId: string) => {
      return useSessionStore
        .getState()
        .alerts.filter((a) => a.sessionId === sessionId && !a.acknowledged)
        .length;
    },
    []
  );

  return (
    <ErrorBoundary>
    <div className="h-screen flex flex-col bg-dark-900 text-dark-100 overflow-hidden">
      {/* 标题栏 */}
      <TitleBar />

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 侧边栏 */}
        <Sidebar
          visible={sidebarVisible}
          sessions={sessions}
          expandedSessionId={expandedSessionId}
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
          onCreateSession={() => setShowCreateDialog(true)}
          onCloseSession={handleCloseSession}
          onExpandSession={handleExpandSession}
          getAlertCount={getSessionAlertCount}
          onShowSettings={() => setShowSettings(true)}
          generalSettings={generalSettings}
        />

        {/* 展开视图 */}
        {expandedSession && (
          <ExpandedView
            session={expandedSession}
            onClose={handleCloseSession}
            onCollapse={handleCollapseSession}
            terminalFontSize={generalSettings.terminalFontSize}
          />
        )}

        {/* 空状态提示 */}
        {!expandedSession && sessions.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-dark-400">
              <svg
                className="w-16 h-16 mx-auto mb-4 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-lg mb-2">暂无 CLI 会话</p>
              <p className="text-sm">点击侧边栏的 "+" 按钮创建新会话</p>
            </div>
          </div>
        )}
      </div>

      {/* 告警管理器 */}
      <AlertManager />

      {/* 创建会话对话框 */}
      <CreateSessionDialog
        visible={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreateSessionWithOptions}
      />

      {/* 设置面板 - 仅在真正的 Electron 环境中显示 */}
      {window.electronAPI?.isElectron === true && (
        <SettingsPanel
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          sessions={sessions}
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
          generalSettings={generalSettings}
          setGeneralSettings={setGeneralSettings}
        />
      )}
  </div>
    </ErrorBoundary>
  );
};

export default App;
