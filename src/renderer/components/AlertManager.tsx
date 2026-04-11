import React, { useEffect, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { AlertType } from '../constants';

interface AlertNotification {
  id: string;
  sessionId: string;
  type: AlertType;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

const AlertManager: React.FC = () => {
  const alerts = useSessionStore((state) => state.alerts);
  const acknowledgeAlert = useSessionStore((state) => state.acknowledgeAlert);
  const sessions = useSessionStore((state) => state.sessions);
  const [visibleAlerts, setVisibleAlerts] = useState<AlertNotification[]>([]);

  // 获取未确认的告警，显示最新的 3 个
  useEffect(() => {
    const unacknowledged = alerts
      .filter((a) => !a.acknowledged)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 3);
    setVisibleAlerts(unacknowledged);
  }, [alerts]);

  // 告警颜色和图标
  const getAlertStyle = (type: AlertType) => {
    switch (type) {
      case AlertType.USER_INPUT:
        return {
          bg: 'bg-accent-warning',
          icon: '✋',
          text: 'text-dark-900',
        };
      case AlertType.TASK_COMPLETE:
        return {
          bg: 'bg-accent-success',
          icon: '✓',
          text: 'text-dark-900',
        };
      case AlertType.ERROR:
        return {
          bg: 'bg-accent-danger',
          icon: '⚠',
          text: 'text-white',
        };
      case AlertType.WARNING:
        return {
          bg: 'bg-accent-warning',
          icon: '⚠',
          text: 'text-dark-900',
        };
      default:
        return {
          bg: 'bg-dark-600',
          icon: 'ℹ',
          text: 'text-dark-100',
        };
    }
  };

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {visibleAlerts.map((alert) => {
        const style = getAlertStyle(alert.type);
        const session = sessions.find((s) => s.id === alert.sessionId);

        return (
          <div
            key={alert.id}
            className={`${style.bg} ${style.text} rounded-lg shadow-lg p-3 min-w-[280px] max-w-[400px] fade-in`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <span className="text-lg">{style.icon}</span>
                <div>
                  <p className="text-sm font-medium">{session?.name || '未知会话'}</p>
                  <p className="text-xs opacity-80 mt-0.5">{alert.message}</p>
                </div>
              </div>
              <button
                onClick={() => acknowledgeAlert(alert.id)}
                className="p-1 hover:bg-black/20 rounded transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AlertManager;