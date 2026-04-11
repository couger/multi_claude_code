import React, { useEffect, useCallback, useState } from 'react';
import { useSessionStore } from './stores/sessionStore';
import Sidebar from './components/Sidebar';
import ExpandedView from './components/ExpandedView';
import TitleBar from './components/TitleBar';
import AlertManager from './components/AlertManager';
import PerformancePanel from './components/PerformancePanel';
import GroupPanel from './components/GroupPanel';
import RemoteAccessPanel from './components/RemoteAccessPanel';
import CreateSessionDialog from './components/CreateSessionDialog';

const App: React.FC = () => {
  const {
    sessions,
    expandedSessionId,
    sidebarVisible,
    setSessions,
    addSession,
    updateSession,
    removeSession,
    setExpandedSession,
    appendOutput,
    addAlert,
  } = useSessionStore();

  const [showPerformance, setShowPerformance] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [showRemoteAccess, setShowRemoteAccess] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // 初始化 IPC 监听
  useEffect(() => {
    // 加载已有会话
    window.electronAPI.getSessions().then((loadedSessions) => {
      setSessions(loadedSessions.map((s: any) => ({
        ...s,
        createdAt: new Date(s.createdAt),
        lastActivity: new Date(s.lastActivity),
      })));
    });

    // 监听会话创建
    window.electronAPI.onSessionCreated((session: any) => {
      addSession({
        ...session,
        createdAt: new Date(session.createdAt),
        lastActivity: new Date(session.lastActivity),
      });
    });

    // 监听输出
    window.electronAPI.onSessionOutput((data: any) => {
      appendOutput(data.id, data.data);
    });

    // 监听状态变化
    window.electronAPI.onSessionStatus((data: any) => {
      updateSession(data.id, { status: data.status });
    });

    // 监听会话关闭
    window.electronAPI.onSessionClosed((data: any) => {
      removeSession(data.id);
    });

    // 监听告警
    window.electronAPI.onAlert((alert: any) => {
      addAlert({
        sessionId: alert.sessionId,
        type: alert.type,
        message: alert.message,
      });
    });

    return () => {
      window.electronAPI.removeAllListeners('session:created');
      window.electronAPI.removeAllListeners('session:outputChunk');
      window.electronAPI.removeAllListeners('session:status');
      window.electronAPI.removeAllListeners('session:closed');
      window.electronAPI.removeAllListeners('alert:trigger');
    };
  }, []);

  // 获取展开的会话
  const expandedSession = expandedSessionId
    ? sessions.find((s) => s.id === expandedSessionId)
    : null;

  // 处理创建新会话（带选项）
  const handleCreateSessionWithOptions = useCallback(async (options: { name?: string; workDir?: string }) => {
    try {
      await window.electronAPI.createSession(options);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  }, []);

  // 处理关闭会话
  const handleCloseSession = useCallback(async (sessionId: string) => {
    try {
      await window.electronAPI.killSession(sessionId);
    } catch (error) {
      console.error('Failed to kill session:', error);
    }
  }, []);

  // 处理展开会话
  const handleExpandSession = useCallback((sessionId: string) => {
    setExpandedSession(sessionId);
  }, [setExpandedSession]);

  // 处理折叠会话
  const handleCollapseSession = useCallback(() => {
    setExpandedSession(null);
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
          onCreateSession={() => setShowCreateDialog(true)}
          onCloseSession={handleCloseSession}
          onExpandSession={handleExpandSession}
          getAlertCount={getSessionAlertCount}
          onShowPerformance={() => setShowPerformance(true)}
          onShowGroups={() => setShowGroups(true)}
          onShowRemoteAccess={() => setShowRemoteAccess(true)}
        />

        {/* 展开视图 */}
        {expandedSession && (
          <ExpandedView
            session={expandedSession}
            onClose={handleCloseSession}
            onCollapse={handleCollapseSession}
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

      {/* 性能监控面板 */}
      <PerformancePanel
        visible={showPerformance}
        onClose={() => setShowPerformance(false)}
      />

      {/* 分组管理面板 */}
      <GroupPanel
        visible={showGroups}
        onClose={() => setShowGroups(false)}
        sessions={sessions}
      />

      {/* 远程访问控制面板（仅 Electron 端显示） */}
      {window.electronAPI?.isElectron && (
        <RemoteAccessPanel
          visible={showRemoteAccess}
          onClose={() => setShowRemoteAccess(false)}
        />
      )}

    {/* 创建会话对话框 */}
    <CreateSessionDialog
      visible={showCreateDialog}
      onClose={() => setShowCreateDialog(false)}
      onCreate={handleCreateSessionWithOptions}
    />
  </div>
  );
};

export default App;