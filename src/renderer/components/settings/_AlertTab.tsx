/**
 * 设置面板 - 告警及日志标签页
 */

import React, { useEffect } from 'react';
import { AlertType, AlertSeverity, AlertNotifyMode } from '../../../shared/constants';
import { useSessionStore } from '../../stores/sessionStore';

const ALERT_TYPE_INFO: Record<string, { label: string; description: string; severity: AlertSeverity }> = {
  [AlertType.ERROR]: { label: '错误', description: '会话执行出错、崩溃、异常退出', severity: AlertSeverity.ERROR },
  [AlertType.WARNING]: { label: '警告', description: '资源占用高、网络延迟、配置异常', severity: AlertSeverity.WARNING },
  [AlertType.USER_INPUT]: { label: '等待输入', description: 'Claude Code 需要用户确认或输入', severity: AlertSeverity.WARNING },
  [AlertType.TASK_COMPLETE]: { label: '任务完成', description: '会话任务执行完毕', severity: AlertSeverity.INFO },
};

const SEVERITY_LABELS: Record<AlertSeverity, { label: string; color: string }> = {
  [AlertSeverity.CRITICAL]: { label: '严重', color: 'text-red-400' },
  [AlertSeverity.ERROR]: { label: '错误', color: 'text-red-400' },
  [AlertSeverity.WARNING]: { label: '警告', color: 'text-yellow-400' },
  [AlertSeverity.INFO]: { label: '信息', color: 'text-blue-400' },
};

const NOTIFY_MODE_LABELS: Record<AlertNotifyMode, { label: string; desc: string }> = {
  [AlertNotifyMode.NONE]: { label: '不提醒', desc: '不显示任何提醒' },
  [AlertNotifyMode.WEAK]: { label: '弱提醒', desc: '气泡通知' },
  [AlertNotifyMode.STRONG]: { label: '强提醒', desc: '弹窗 + 声音' },
};

const AlertsTab: React.FC = () => {
  const alertConfig = useSessionStore((state) => state.alertConfig);
  const updateAlertRule = useSessionStore((state) => state.updateAlertRule);
  const updateAlertConfig = useSessionStore((state) => state.updateAlertConfig);
  const alerts = useSessionStore((state) => state.alerts);
  const clearAllAlerts = useSessionStore((state) => state.clearAllAlerts);

  const unackCount = alerts.filter(a => !a.acknowledged).length;

  // 保存配置到 localStorage
  useEffect(() => {
    localStorage.setItem('alertConfig', JSON.stringify(alertConfig));
  }, [alertConfig]);

  return (
    <div className="space-y-5">
      {/* 告警统计 */}
      <div className="flex items-center justify-between p-2 bg-dark-900 rounded">
        <div>
          <div className="text-sm text-dark-200 font-medium">当前告警状态</div>
          <div className="text-xs text-dark-500">未确认告警: {unackCount} 个</div>
        </div>
        <button
          onClick={clearAllAlerts}
          disabled={unackCount === 0}
          className="text-xs px-3 py-1.5 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          清除全部
        </button>
      </div>

      {/* 静默模式 */}
      <div className="flex items-center justify-between p-2 bg-dark-900 rounded">
        <div>
          <div className="text-sm text-dark-200 font-medium">静默模式</div>
          <div className="text-xs text-dark-500">开启后仅显示数字角标，不显示告警气泡</div>
        </div>
        <button
          onClick={() => updateAlertConfig({ silentMode: !alertConfig.silentMode })}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            alertConfig.silentMode ? 'bg-accent-primary' : 'bg-dark-600'
          }`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            alertConfig.silentMode ? 'left-5' : 'left-0.5'
          }`} />
        </button>
      </div>

      {/* 外部 Claude Code 检测 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">外部 Claude Code 检测</label>
        <div className="space-y-2">
          {/* 基础检测 - 始终开启 */}
          <div className="flex items-center justify-between p-2 bg-dark-900 rounded opacity-60">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-dark-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div className="text-xs text-dark-200">基础检测（路径覆盖）</div>
                <div className="text-xs text-dark-500">检测工作目录是否与现有会话重叠</div>
              </div>
            </div>
            <span className="text-xs text-dark-400 bg-dark-700 px-2 py-0.5 rounded">始终开启</span>
          </div>

          {/* 深度检测 - 可开关 */}
          <div className="flex items-center justify-between p-2 bg-dark-900 rounded">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-dark-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <div>
                <div className="text-xs text-dark-200">深度检测</div>
                <div className="text-xs text-dark-500">检测 .claude 目录和系统进程</div>
              </div>
            </div>
            <button
              onClick={() => updateAlertConfig({
                externalDetection: {
                  ...alertConfig.externalDetection,
                  deep: !alertConfig.externalDetection?.deep,
                },
              })}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                alertConfig.externalDetection?.deep ? 'bg-accent-primary' : 'bg-dark-600'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                alertConfig.externalDetection?.deep ? 'left-5' : 'left-0.5'
              }`} />
            </button>
          </div>
        </div>
        <div className="text-xs text-dark-500">
          深度检测可能需要系统权限，且无法检测所有启动方式
        </div>
      </div>

      {/* 告警分级与过滤 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">告警分级与过滤</label>
        <div className="text-xs text-dark-500 mb-2">选择需要接收的告警类型，并配置提醒方式</div>
        <div className="space-y-2">
          {alertConfig.rules.map((rule) => {
            const info = ALERT_TYPE_INFO[rule.type];
            if (!info) return null;
            const severityInfo = SEVERITY_LABELS[info.severity];
            return (
              <div key={rule.type} className="border border-dark-600 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  {/* 启用开关 */}
                  <button
                    onClick={() => updateAlertRule(rule.type as AlertType, { enabled: !rule.enabled })}
                    className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
                      rule.enabled ? 'bg-accent-primary' : 'bg-dark-600'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                      rule.enabled ? 'left-4' : 'left-0.5'
                    }`} />
                  </button>

                  {/* 告警信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-dark-200">{info.label}</span>
                      <span className={`text-xs ${severityInfo.color}`}>[{severityInfo.label}]</span>
                    </div>
                    <div className="text-xs text-dark-500">{info.description}</div>
                  </div>

                  {/* 提醒方式选择 */}
                  <div className="flex gap-1 flex-shrink-0">
                    {(Object.values(AlertNotifyMode) as AlertNotifyMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => updateAlertRule(rule.type as AlertType, { notifyMode: mode })}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          rule.notifyMode === mode
                            ? 'bg-accent-primary text-dark-900'
                            : 'bg-dark-700 text-dark-400 hover:bg-dark-600'
                        }`}
                        title={NOTIFY_MODE_LABELS[mode].desc}
                      >
                        {NOTIFY_MODE_LABELS[mode].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 告警方式说明 */}
      <div className="text-xs text-dark-500 p-3 bg-dark-900 rounded">
        <p className="mb-1.5 font-medium text-dark-400">提醒方式说明：</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-dark-300 w-16">不提醒</span>
            <span>完全忽略该类型告警</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-dark-300 w-16">弱提醒</span>
            <span>右下角气泡通知，可手动关闭</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-dark-300 w-16">强提醒</span>
            <span>弹出通知 + 声音提示，适合重要告警</span>
          </div>
        </div>
      </div>

      {/* 最近告警历史 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">最近告警记录</label>
        {alerts.length === 0 ? (
          <div className="text-xs text-dark-500 text-center py-4 bg-dark-900 rounded">暂无告警记录</div>
        ) : (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {alerts.slice(-20).reverse().map((alert) => {
              const info = ALERT_TYPE_INFO[alert.type];
              return (
                <div
                  key={alert.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                    alert.acknowledged ? 'bg-dark-900 text-dark-500' : 'bg-dark-800 text-dark-300'
                  }`}
                >
                  <span className={alert.acknowledged ? 'opacity-50' : ''}>{info?.label || alert.type}</span>
                  <span className="flex-1 truncate">{alert.message}</span>
                  <span className="text-dark-600 flex-shrink-0">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertsTab;
