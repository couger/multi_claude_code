import React, { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { AlertType, AlertNotifyMode, AlertSeverity, ALERT_SEVERITY_MAP } from '../../shared/constants';

const AlertManager: React.FC = () => {
  const alerts = useSessionStore((state) => state.alerts);
  const alertConfig = useSessionStore((state) => state.alertConfig);
  const acknowledgeAlert = useSessionStore((state) => state.acknowledgeAlert);
  const clearAllAlerts = useSessionStore((state) => state.clearAllAlerts);
  const setAlertSilentMode = useSessionStore((state) => state.setAlertSilentMode);
  const sessions = useSessionStore((state) => state.sessions);
  const [expanded, setExpanded] = useState(false);

  // 根据配置过滤和排序告警
  const unacknowledgedAlerts = alerts
    .filter((a) => {
      const rule = alertConfig.rules.find(r => r.type === a.type);
      return !a.acknowledged && rule && rule.enabled && rule.notifyMode !== AlertNotifyMode.NONE;
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const alertCount = unacknowledgedAlerts.length;

  // 按告警严重等级获取颜色样式
  const getAlertStyle = (alert: { type: AlertType }) => {
    const severity = ALERT_SEVERITY_MAP[alert.type] || AlertSeverity.INFO;
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return { bg: 'bg-red-600', icon: '🔴', text: 'text-white', ring: 'ring-red-400' };
      case AlertSeverity.ERROR:
        return { bg: 'bg-red-500', icon: '⚠️', text: 'text-white', ring: 'ring-red-400' };
      case AlertSeverity.WARNING:
        return { bg: 'bg-yellow-500', icon: '⚠', text: 'text-dark-900', ring: 'ring-yellow-400' };
      case AlertSeverity.INFO:
      default:
        return { bg: 'bg-blue-500', icon: 'ℹ', text: 'text-white', ring: 'ring-blue-400' };
    }
  };

  const getMostSevereAlert = (): { type: AlertType } => {
    const priorityOrder = [AlertType.ERROR, AlertType.WARNING, AlertType.USER_INPUT, AlertType.TASK_COMPLETE];
    for (const type of priorityOrder) {
      const alert = unacknowledgedAlerts.find(a => a.type === type);
      if (alert) return alert;
    }
    return { type: AlertType.WARNING };
  };

  if (alertCount === 0) return null;

  const summaryStyle = getAlertStyle(getMostSevereAlert());
  const isSilent = alertConfig.silentMode;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-1.5">
      {/* 汇总气泡 - 统一切换按钮 */}
      <div
        className={`${summaryStyle.bg} ${summaryStyle.text} rounded-full shadow-lg px-3 py-1.5 fade-in cursor-pointer hover:shadow-xl transition-all flex items-center gap-2 ${
          isSilent ? 'ring-2 ring-offset-2 ring-offset-dark-900 ' + summaryStyle.ring : ''
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        {/* 静默/非静默切换图标 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAlertSilentMode(!isSilent);
          }}
          className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
            isSilent ? 'bg-dark-700/50 text-dark-300' : 'bg-white/20 text-inherit'
          }`}
          title={isSilent ? '点击取消静默' : '点击开启静默'}
        >
          {isSilent ? (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
        </button>
        <span className="text-sm">{summaryStyle.icon}</span>
        <span className="text-xs font-medium">{alertCount}</span>
        <span className="text-xs opacity-70">
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* 展开的告警列表 */}
      {expanded && (
        <div className="space-y-1 max-h-[40vh] overflow-y-auto">
          {/* 操作按钮行 */}
          <div className="flex gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); clearAllAlerts(); setExpanded(false); }}
              className="flex-1 px-2 py-1 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600 transition-colors"
            >
              全部清除
            </button>
          </div>

          {/* 告警条目 - 紧凑版 */}
          {unacknowledgedAlerts.map((alert) => {
            const style = getAlertStyle(alert);
            const session = sessions.find((s) => s.id === alert.sessionId);

            return (
              <div
                key={alert.id}
                className={`${style.bg} ${style.text} rounded shadow-md px-3 py-1.5 min-w-[200px] max-w-[300px] fade-in`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm flex-shrink-0">{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium truncate block">{session?.name || '未知会话'}</span>
                    <span className="text-xs opacity-70 truncate block">{alert.message}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); acknowledgeAlert(alert.id); }}
                    className="p-0.5 hover:bg-black/20 rounded transition-colors flex-shrink-0"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AlertManager;
