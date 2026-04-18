/**
 * 设置面板
 * 整合通用/分组/远程/性能四个标签页
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Session, useSessionStore } from '../stores/sessionStore';
import { DisplayMode, AlertType, AlertNotifyMode, AlertSeverity } from '../../shared/constants';

// ======================== 类型定义 ========================

type TabKey = 'general' | 'groups' | 'performance' | 'remote' | 'alerts' | 'ai';

// AI配置接口
interface AIConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  apiBase: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextLength: number;
}

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  sessions: Session[];
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  generalSettings: GeneralSettings;
  setGeneralSettings: React.Dispatch<React.SetStateAction<GeneralSettings>>;
}

// ======================== 子组件：通用 ========================

interface GeneralSettings {
  showGroupPanel: boolean;
  showPerformancePanel: boolean;
  defaultBrowseDir?: string;
  allowRemoteCreateSession?: boolean;
  terminalFontSize?: number;
  hideDirection?: 'left' | 'right';
  minimizeToTrayOnClose?: boolean;
  hideToPrimary?: boolean; // 隐藏到主显示器而非当前显示器
}

const GeneralTab: React.FC<{
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  settings: GeneralSettings;
  onSettingsChange: (settings: GeneralSettings) => void;
}> = ({ displayMode: _displayMode, onDisplayModeChange: _onDisplayModeChange, settings, onSettingsChange }) => {
  const toggleSetting = (key: keyof GeneralSettings) => {
    onSettingsChange({ ...settings, [key]: !settings[key] });
  };

  // 选择默认浏览目录
  const handleSelectDefaultBrowseDir = async () => {
    try {
      const selected = await window.electronAPI.selectWorkDir();
      if (selected) {
        const newSettings = { ...settings, defaultBrowseDir: selected };
        onSettingsChange(newSettings);
        // 通过 IPC 广播到主进程（主进程会写入 config.json）
        try {
          window.electronAPI?.broadcastGeneralSettings?.(newSettings);
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('选择默认浏览目录失败:', e);
    }
  };

  const handleClearDefaultBrowseDir = () => {
    const newSettings = { ...settings, defaultBrowseDir: undefined };
    onSettingsChange(newSettings);
    // 通过 IPC 广播到主进程
    try {
      window.electronAPI?.broadcastGeneralSettings?.(newSettings);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-5">
      {/* 主界面功能开关 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">主界面功能</label>
        <div className="space-y-3">
          {/* 分组功能开关 */}
          <div className="flex items-center justify-between p-2 bg-dark-900 rounded">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-dark-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="text-xs text-dark-200">分组</span>
            </div>
            <button
              onClick={() => toggleSetting('showGroupPanel')}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                settings.showGroupPanel ? 'bg-accent-primary' : 'bg-dark-600'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                settings.showGroupPanel ? 'left-5' : 'left-0.5'
              }`} />
            </button>
          </div>

          {/* 性能功能开关 */}
          <div className="flex items-center justify-between p-2 bg-dark-900 rounded">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-dark-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="text-xs text-dark-200">性能</span>
            </div>
            <button
              onClick={() => toggleSetting('showPerformancePanel')}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                settings.showPerformancePanel ? 'bg-accent-primary' : 'bg-dark-600'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                settings.showPerformancePanel ? 'left-5' : 'left-0.5'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* 新建会话默认浏览目录 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">新建会话 - 浏览目录起始位置</label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={settings.defaultBrowseDir || ''}
              readOnly
              placeholder="用户主目录（默认）"
              className="flex-1 px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 font-mono"
            />
            <button
              onClick={handleSelectDefaultBrowseDir}
              className="px-3 py-1.5 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600 transition-colors shrink-0"
            >
              浏览...
            </button>
            {settings.defaultBrowseDir && (
              <button
                onClick={handleClearDefaultBrowseDir}
                className="px-2 py-1.5 text-dark-500 hover:text-dark-300 transition-colors shrink-0"
                title="重置为默认"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="text-xs text-dark-500">
            设置点击"浏览"按钮时打开的起始目录，方便快速定位常用项目目录
          </div>
        </div>
      </div>

      {/* 终端字体大小 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">会话终端字体大小</label>
        <div className="flex items-center gap-3 p-2 bg-dark-900 rounded">
          <span className="text-xs text-dark-400">小</span>
          <input
            type="range"
            min="10"
            max="20"
            step="1"
            value={settings.terminalFontSize || 14}
            onChange={(e) => onSettingsChange({ ...settings, terminalFontSize: parseInt(e.target.value) })}
            className="flex-1 accent-accent-primary"
          />
          <span className="text-xs text-dark-400">大</span>
          <span className="text-xs text-dark-200 font-mono w-6 text-center">{settings.terminalFontSize || 14}px</span>
        </div>
        <div className="text-xs text-dark-500">仅影响展开后的会话终端窗口（默认14px）</div>
      </div>

      {/* 一键贴边隐藏方向 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">一键贴边隐藏方向</label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const newSettings: GeneralSettings = { ...settings, hideDirection: 'left' };
              onSettingsChange(newSettings);
              window.electronAPI?.broadcastGeneralSettings?.(newSettings);
            }}
            className={`flex-1 py-2 rounded text-xs transition-colors flex items-center justify-center gap-2 ${
              (settings.hideDirection || 'right') === 'left'
                ? 'bg-accent-primary text-dark-900'
                : 'bg-dark-900 text-dark-300 hover:bg-dark-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            左侧
          </button>
          <button
            onClick={() => {
              const newSettings: GeneralSettings = { ...settings, hideDirection: 'right' };
              onSettingsChange(newSettings);
              window.electronAPI?.broadcastGeneralSettings?.(newSettings);
            }}
            className={`flex-1 py-2 rounded text-xs transition-colors flex items-center justify-center gap-2 ${
              (settings.hideDirection || 'right') === 'right'
                ? 'bg-accent-primary text-dark-900'
                : 'bg-dark-900 text-dark-300 hover:bg-dark-700'
            }`}
          >
            右侧
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="text-xs text-dark-500">选择窗口隐藏到屏幕的哪一侧（适应扩展桌面布局）</div>
      </div>

      {/* 隐藏显示器选择 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">隐藏目标显示器</label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const newSettings: GeneralSettings = { ...settings, hideToPrimary: true };
              onSettingsChange(newSettings);
              window.electronAPI?.broadcastGeneralSettings?.(newSettings);
            }}
            className={`flex-1 py-2 rounded text-xs transition-colors ${
              settings.hideToPrimary === true
                ? 'bg-accent-primary text-dark-900'
                : 'bg-dark-900 text-dark-300 hover:bg-dark-700'
            }`}
          >
            主显示器
          </button>
          <button
            onClick={() => {
              const newSettings: GeneralSettings = { ...settings, hideToPrimary: false };
              onSettingsChange(newSettings);
              window.electronAPI?.broadcastGeneralSettings?.(newSettings);
            }}
            className={`flex-1 py-2 rounded text-xs transition-colors ${
              settings.hideToPrimary !== true
                ? 'bg-accent-primary text-dark-900'
                : 'bg-dark-900 text-dark-300 hover:bg-dark-700'
            }`}
          >
            当前显示器
          </button>
        </div>
        <div className="text-xs text-dark-500">选择窗口隐藏到哪个显示器（当前显示器指鼠标所在位置）</div>
      </div>

      {/* 关闭按钮行为 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">点击关闭按钮时</label>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const newSettings: GeneralSettings = { ...settings, minimizeToTrayOnClose: true };
              onSettingsChange(newSettings);
              window.electronAPI?.broadcastGeneralSettings?.(newSettings);
            }}
            className={`flex-1 py-2 rounded text-xs transition-colors ${
              settings.minimizeToTrayOnClose !== false
                ? 'bg-accent-primary text-dark-900'
                : 'bg-dark-900 text-dark-300 hover:bg-dark-700'
            }`}
          >
            最小化到托盘
          </button>
          <button
            onClick={() => {
              const newSettings: GeneralSettings = { ...settings, minimizeToTrayOnClose: false };
              onSettingsChange(newSettings);
              window.electronAPI?.broadcastGeneralSettings?.(newSettings);
            }}
            className={`flex-1 py-2 rounded text-xs transition-colors ${
              settings.minimizeToTrayOnClose === false
                ? 'bg-accent-primary text-dark-900'
                : 'bg-dark-900 text-dark-300 hover:bg-dark-700'
            }`}
          >
            直接退出程序
          </button>
        </div>
        <div className="text-xs text-dark-500">选择点击窗口标题栏关闭按钮时的行为</div>
      </div>
    </div>
  );
};

// ======================== 子组件：告警及日志 ========================

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

// ======================== 子组件：助手AI ========================

const AITab: React.FC = () => {
  const [config, setConfig] = useState<AIConfig>(() => {
    const saved = localStorage.getItem('aiConfig');
    return saved ? JSON.parse(saved) : {
      enabled: false,
      provider: 'openai' as const,
      apiKey: '',
      apiBase: '',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 4096,
      contextLength: 8192,
    };
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  // 提示词相关状态（暂未实现）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_promptFiles, _setPromptFiles] = useState<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_selectedPromptFile, _setSelectedPromptFile] = useState<string>('');
  const [promptContent, setPromptContent] = useState<string>('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_loadingPromptFiles, _setLoadingPromptFiles] = useState(false);

  // 保存配置
  useEffect(() => {
    localStorage.setItem('aiConfig', JSON.stringify(config));
  }, [config]);

  // 处理从文件加载提示词
  const handleLoadPromptFromFile = async () => {
    if (!window.electronAPI) {
      alert('文件选择功能仅在Electron环境中可用');
      return;
    }
    // 简化实现：如果API方法不存在，则显示错误
    alert('文件选择功能暂未实现，请直接输入提示词');
  };

  const handleTest = async () => {
    if (!config.apiKey) {
      setTestResult('error');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // 简单的测试请求
      const response = await fetch(config.apiBase || 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5,
        }),
      });
      setTestResult(response.ok ? 'success' : 'error');
    } catch {
      setTestResult('error');
    }
    setTesting(false);
  };

  return (
    <div className="space-y-5">
      {/* 启用开关 */}
      <div className="flex items-center justify-between p-2 bg-dark-900 rounded">
        <div>
          <div className="text-sm text-dark-200 font-medium">启用助手AI</div>
          <div className="text-xs text-dark-500">允许AI辅助管理会话</div>
        </div>
        <button
          onClick={() => setConfig({ ...config, enabled: !config.enabled })}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            config.enabled ? 'bg-accent-primary' : 'bg-dark-600'
          }`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            config.enabled ? 'left-5' : 'left-0.5'
          }`} />
        </button>
      </div>

      {/* 提供商选择 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">AI提供商</label>
        <div className="flex gap-2">
          <button
            onClick={() => setConfig({ ...config, provider: 'openai' })}
            className={`flex-1 text-xs py-2 rounded transition-colors ${
              config.provider === 'openai'
                ? 'bg-accent-primary text-dark-900'
                : 'bg-dark-900 text-dark-300 hover:bg-dark-700'
            }`}
          >
            OpenAI
          </button>
          <button
            onClick={() => setConfig({ ...config, provider: 'anthropic' })}
            className={`flex-1 text-xs py-2 rounded transition-colors ${
              config.provider === 'anthropic'
                ? 'bg-accent-primary text-dark-900'
                : 'bg-dark-900 text-dark-300 hover:bg-dark-700'
            }`}
          >
            Anthropic
          </button>
          <button
            onClick={() => setConfig({ ...config, provider: 'custom' })}
            className={`flex-1 text-xs py-2 rounded transition-colors ${
              config.provider === 'custom'
                ? 'bg-accent-primary text-dark-900'
                : 'bg-dark-900 text-dark-300 hover:bg-dark-700'
            }`}
          >
            自定义
          </button>
        </div>
      </div>

      {/* API密钥 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">API密钥</label>
        <div className="flex items-center gap-2">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={config.apiKey}
            onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            placeholder="sk-..."
            className="flex-1 px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none font-mono"
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="p-1.5 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors"
            title={showApiKey ? '隐藏' : '显示'}
          >
            {showApiKey ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* API基础URL（自定义时显示） */}
      {config.provider === 'custom' && (
        <div className="space-y-2">
          <label className="text-xs text-dark-400">API基础URL</label>
          <input
            type="text"
            value={config.apiBase}
            onChange={(e) => setConfig({ ...config, apiBase: e.target.value })}
            placeholder="https://api.example.com/v1"
            className="w-full px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
          />
        </div>
      )}

      {/* 模型选择 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">模型</label>
        <input
          type="text"
          value={config.model}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
          placeholder="gpt-4o"
          className="w-full px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
        />
      </div>

      {/* 参数设置 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-xs text-dark-400">温度 (0-1)</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={config.temperature}
            onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) || 0.7 })}
            className="w-full px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 focus:border-accent-primary focus:outline-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-dark-400">最大Token数</label>
          <input
            type="number"
            min="1"
            max="128000"
            value={config.maxTokens}
            onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) || 4096 })}
            className="w-full px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 focus:border-accent-primary focus:outline-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-dark-400">上下文长度</label>
          <input
            type="number"
            min="512"
            max="128000"
            value={config.contextLength}
            onChange={(e) => setConfig({ ...config, contextLength: parseInt(e.target.value) || 8192 })}
            className="w-full px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 focus:border-accent-primary focus:outline-none"
          />
        </div>
      </div>

      {/* 测试连接 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={testing || !config.apiKey}
          className="flex-1 py-2 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? '测试中...' : '测试连接'}
        </button>
        {testResult === 'success' && (
          <span className="text-xs text-green-400">✓ 连接成功</span>
        )}
        {testResult === 'error' && (
          <span className="text-xs text-red-400">✗ 连接失败</span>
        )}
      </div>

      {/* 默认提示词 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-dark-400">默认提示词</label>
          <button
            onClick={handleLoadPromptFromFile}
            disabled={false}
            className="text-xs py-1 px-2 bg-dark-700 text-dark-300 rounded hover:bg-dark-600 transition-colors disabled:opacity-50"
          >
            从文件选择
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-dark-400">提示词内容预览</label>
          <div className="relative">
            <textarea
              value={promptContent}
              onChange={(e) => setPromptContent(e.target.value)}
              placeholder="提示词内容将在此显示..."
              rows={5}
              className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none font-mono resize-none"
            />
            <div className="absolute bottom-2 right-2 text-xs text-dark-500">
              {promptContent.length} 字符
            </div>
          </div>
          <div className="text-xs text-dark-500">
            提示词将作为系统消息发送给AI助手，用于指导其行为。
          </div>
        </div>
      </div>

      {/* 说明 */}
      <div className="text-xs text-dark-500 p-2 bg-dark-900 rounded">
        <p className="mb-1">💡 说明：</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>助手AI将自动监控会话状态并在需要时提供建议</li>
          <li>API密钥仅存储在本地，不会上传到服务器</li>
          <li>后续功能将支持AI自动处理会话异常</li>
        </ul>
      </div>
    </div>
  );
};

// ======================== 子组件：性能 ========================

interface SystemMetrics {
  cpu: { usage: number; cores: number; model: string };
  memory: { total: number; used: number; free: number; usagePercent: number };
  disk: { total: number; used: number; free: number; usagePercent: number };
  uptime: number;
}

const PerformanceTab: React.FC<{ visible: boolean }> = ({ visible }) => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await window.electronAPI.getSystemMetrics();
      setMetrics(data);
    } catch (e) {
      console.error('获取性能指标失败:', e);
    }
  }, []);

  const toggleMonitoring = useCallback(async () => {
    setLoading(true);
    try {
      if (monitoring) {
        await window.electronAPI.stopMonitoring();
        setMonitoring(false);
      } else {
        await window.electronAPI.startMonitoring(5000);
        setMonitoring(true);
      }
    } catch (e) {
      console.error('切换监控状态失败:', e);
    }
    setLoading(false);
  }, [monitoring]);

  useEffect(() => {
    if (visible) fetchMetrics();
  }, [visible, fetchMetrics]);

  useEffect(() => {
    if (!visible || !monitoring) return;
    const timer = setInterval(fetchMetrics, 5000);
    return () => clearInterval(timer);
  }, [visible, monitoring, fetchMetrics]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const ProgressBar: React.FC<{ value: number; color: string }> = ({ value, color }) => (
    <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={toggleMonitoring}
          disabled={loading}
          className={`text-xs px-3 py-1 rounded transition-colors ${
            monitoring
              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
              : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
          }`}
        >
          {monitoring ? '停止监控' : '开始监控'}
        </button>
        <button
          onClick={fetchMetrics}
          className="text-xs px-2 py-1 bg-dark-700 text-dark-300 rounded hover:bg-dark-600"
        >
          刷新
        </button>
      </div>
      {metrics ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-dark-400">CPU</span>
              <span className="text-xs text-dark-300">{metrics.cpu.usage.toFixed(1)}%</span>
            </div>
            <ProgressBar value={metrics.cpu.usage} color={metrics.cpu.usage > 80 ? '#f85149' : '#3fb950'} />
            <div className="text-xs text-dark-500">{metrics.cpu.model} · {metrics.cpu.cores} 核心</div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-dark-400">内存</span>
              <span className="text-xs text-dark-300">
                {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)} ({metrics.memory.usagePercent.toFixed(1)}%)
              </span>
            </div>
            <ProgressBar value={metrics.memory.usagePercent} color={metrics.memory.usagePercent > 80 ? '#f85149' : '#58a6ff'} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-dark-400">磁盘</span>
              <span className="text-xs text-dark-300">
                {formatBytes(metrics.disk.used)} / {formatBytes(metrics.disk.total)} ({metrics.disk.usagePercent.toFixed(1)}%)
              </span>
            </div>
            <ProgressBar value={metrics.disk.usagePercent} color={metrics.disk.usagePercent > 80 ? '#f85149' : '#d29922'} />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-dark-400">系统运行时间</span>
            <span className="text-dark-300">{formatUptime(metrics.uptime)}</span>
          </div>
        </>
      ) : (
        <div className="text-center text-dark-500 text-sm py-8">
          <p>点击"刷新"获取系统指标</p>
          <p className="text-xs mt-1">或开启自动监控</p>
        </div>
      )}
    </div>
  );
};

// ======================== 子组件：分组 ========================

interface Group {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
  order: number;
  collapsed: boolean;
}

const PRESET_COLORS = ['#f85149', '#58a6ff', '#3fb950', '#d29922', '#bc8cff', '#f0883e', '#f778ba', '#39d2c0'];
const PRESET_ICONS = ['📁', '🏷️', '⭐', '🔒', '🚀', '💡', '🎯', '📌'];

const GroupsTab: React.FC<{ visible: boolean; sessions: Session[] }> = ({ visible, sessions }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[1]);
  const [newIcon, setNewIcon] = useState(PRESET_ICONS[0]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editColor, setEditColor] = useState('');
  const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getGroups();
      setGroups(result || []);
    } catch (e) {
      console.error('获取分组失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchGroups();
      setCreating(false);
      setEditingGroupId(null);
      setAddingToGroupId(null);
    }
  }, [visible, fetchGroups]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      await window.electronAPI.createGroup({ name: newName.trim(), description: newDesc.trim(), color: newColor, icon: newIcon });
      setNewName(''); setNewDesc(''); setNewColor(PRESET_COLORS[1]); setNewIcon(PRESET_ICONS[0]); setCreating(false);
      await fetchGroups();
    } catch (e) { console.error('创建分组失败:', e); }
  }, [newName, newDesc, newColor, newIcon, fetchGroups]);

  const handleDelete = useCallback(async (groupId: string) => {
    if (!confirm('确定删除此分组？分组内的会话不会被删除。')) return;
    try { await window.electronAPI.deleteGroup(groupId); await fetchGroups(); }
    catch (e) { console.error('删除分组失败:', e); }
  }, [fetchGroups]);

  const handleStartEdit = useCallback((group: Group) => {
    setEditingGroupId(group.id); setEditName(group.name); setEditDesc(group.description); setEditColor(group.color);
  }, []);

  const handleSaveEdit = useCallback(async (groupId: string) => {
    try {
      await window.electronAPI.updateGroup(groupId, { name: editName.trim(), description: editDesc.trim(), color: editColor });
      setEditingGroupId(null); await fetchGroups();
    } catch (e) { console.error('更新分组失败:', e); }
  }, [editName, editDesc, editColor, fetchGroups]);

  const handleAddSession = useCallback(async (groupId: string, sessionId: string) => {
    try { await window.electronAPI.addSessionToGroup(groupId, sessionId); await fetchGroups(); setAddingToGroupId(null); }
    catch (e) { console.error('添加会话到分组失败:', e); }
  }, [fetchGroups]);

  const handleRemoveSession = useCallback(async (groupId: string, sessionId: string) => {
    try { await window.electronAPI.removeSessionFromGroup(groupId, sessionId); await fetchGroups(); }
    catch (e) { console.error('从分组移除会话失败:', e); }
  }, [fetchGroups]);

  const getAvailableSessions = (groupId: string) => {
    const assignedSessionIds = new Set<string>();
    groups.forEach(g => { if (g.id !== groupId) g.sessionIds.forEach(sid => assignedSessionIds.add(sid)); });
    return sessions.filter(s => !assignedSessionIds.has(s.id) || (groups.find(g => g.id === groupId)?.sessionIds || []).includes(s.id));
  };

  const getSessionName = (sessionId: string) => {
    const s = sessions.find(s => s.id === sessionId);
    return s ? (s.name || s.id.slice(0, 8)) : sessionId.slice(0, 8);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCreating(!creating)}
          className="text-xs px-3 py-1 bg-accent-primary/20 text-accent-primary rounded hover:bg-accent-primary/30 transition-colors"
        >
          {creating ? '取消' : '+ 新建分组'}
        </button>
      </div>

      {creating && (
        <div className="p-3 border border-dark-600 rounded-lg bg-dark-800/50 space-y-3">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="分组名称"
            className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none" autoFocus />
          <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="描述（可选）"
            className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-dark-400 w-8">颜色</span>
            <div className="flex gap-1.5">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-dark-400 w-8">图标</span>
            <div className="flex gap-1">
              {PRESET_ICONS.map(ic => (
                <button key={ic} onClick={() => setNewIcon(ic)}
                  className={`w-7 h-7 rounded text-sm flex items-center justify-center transition-colors ${newIcon === ic ? 'bg-dark-600 ring-1 ring-white' : 'hover:bg-dark-700'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleCreate} disabled={!newName.trim()}
            className="w-full py-2 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            创建分组
          </button>
        </div>
      )}

      {loading && groups.length === 0 ? (
        <div className="text-center text-dark-500 text-sm py-8">加载中...</div>
      ) : groups.length === 0 ? (
        <div className="text-center text-dark-500 text-sm py-8">
          <p>暂无分组</p>
          <p className="text-xs mt-1">点击"新建分组"创建</p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.id} className="border border-dark-600 rounded-lg overflow-hidden">
            {editingGroupId === group.id ? (
              <div className="p-3 bg-dark-750 space-y-2">
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-2 py-1 bg-dark-900 border border-dark-600 rounded text-xs text-dark-100 focus:border-accent-primary focus:outline-none" />
                <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="描述"
                  className="w-full px-2 py-1 bg-dark-900 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none" />
                <div className="flex gap-1">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setEditColor(c)} className={`w-4 h-4 rounded-full ${editColor === c ? 'ring-1 ring-white' : ''}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleSaveEdit(group.id)} className="flex-1 text-xs py-1 bg-accent-primary text-dark-900 rounded hover:bg-accent-primary/80">保存</button>
                  <button onClick={() => setEditingGroupId(null)} className="flex-1 text-xs py-1 bg-dark-700 text-dark-300 rounded hover:bg-dark-600">取消</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3" style={{ borderLeft: `3px solid ${group.color}` }}>
                <span className="text-sm">{group.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-dark-100 font-medium truncate">{group.name}</div>
                  {group.description && <div className="text-xs text-dark-500 truncate">{group.description}</div>}
                </div>
                <span className="text-xs text-dark-500 bg-dark-700 px-1.5 py-0.5 rounded">{group.sessionIds.length} 会话</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setAddingToGroupId(addingToGroupId === group.id ? null : group.id)}
                    className="p-1 text-dark-400 hover:text-accent-primary transition-colors" title="添加会话">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button onClick={() => handleStartEdit(group)} className="p-1 text-dark-400 hover:text-dark-200 transition-colors" title="编辑">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(group.id)} className="p-1 text-dark-400 hover:text-red-400 transition-colors" title="删除分组">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {addingToGroupId === group.id && (
              <div className="px-3 pb-2 border-t border-dark-700">
                <div className="text-xs text-dark-400 py-1.5">选择要添加的会话：</div>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {getAvailableSessions(group.id).filter(s => !group.sessionIds.includes(s.id)).length === 0 ? (
                    <div className="text-xs text-dark-500 py-2 text-center">没有可添加的会话</div>
                  ) : (
                    getAvailableSessions(group.id).filter(s => !group.sessionIds.includes(s.id)).map(s => (
                      <button key={s.id} onClick={() => handleAddSession(group.id, s.id)}
                        className="w-full text-left text-xs px-2 py-1.5 bg-dark-900 rounded hover:bg-dark-700 text-dark-300 transition-colors flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'running' ? 'bg-green-400' : s.status === 'paused' ? 'bg-yellow-400' : s.status === 'completed' ? 'bg-dark-500' : 'bg-red-400'}`} />
                        <span className="truncate">{s.name || s.id.slice(0, 8)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {group.sessionIds.length > 0 && (
              <div className="border-t border-dark-700 px-3 py-2 space-y-1">
                {group.sessionIds.map(sid => (
                  <div key={sid} className="flex items-center gap-2 text-xs group/item">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                    <span className="text-dark-300 truncate flex-1">{getSessionName(sid)}</span>
                    <button onClick={() => handleRemoveSession(group.id, sid)}
                      className="text-dark-500 hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0" title="从分组移除">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

// ======================== 子组件：远程访问 ========================

interface RemoteStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  token: string;
  localIPs: string[];
  clientCount: number;
  clients: Array<{ id: string; ip: string; connectedAt: string }>;
}

// @ts-ignore
const _RemoteTab: React.FC<{ visible: boolean; settings?: GeneralSettings; onSettingsChange?: (settings: GeneralSettings) => void }> = ({ visible, settings, onSettingsChange }) => {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [portInput, setPortInput] = useState('');
  const [portError, setPortError] = useState('');
  const [toggling, setToggling] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [selectedIPs, setSelectedIPs] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('remoteSelectedIPs');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [maxConnInput, setMaxConnInput] = useState<string>(() => {
    const saved = localStorage.getItem('generalSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return String(parsed.maxRemoteConnections ?? 0);
      } catch { /* ignore */ }
    }
    return '0';
  });
  const [maxConnError, setMaxConnError] = useState('');
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);

  // 保存选中的 IP 地址到 localStorage
  useEffect(() => {
    if (selectedIPs.size > 0) {
      localStorage.setItem('remoteSelectedIPs', JSON.stringify([...selectedIPs]));
    } else {
      localStorage.removeItem('remoteSelectedIPs');
    }
  }, [selectedIPs]);

  const fetchStatus = useCallback(async () => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.getRemoteStatus();
        setStatus(result);
        if (!portInput) setPortInput(String(result.port));
      } else {
        // 浏览器环境：通过HTTP API获取状态
        const response = await fetch('/api/status');
        if (response.ok) {
          const data = await response.json();
          setStatus({
            enabled: data.accessEnabled,
            running: data.status === 'online',
            port: data.port,
            token: data.accessToken,
            localIPs: data.localIPs,
            clientCount: 0,
            clients: []
          });
          if (!portInput) setPortInput(String(data.port));
        }
      }
    } catch (e) { console.error('获取远程访问状态失败:', e); }
  }, [portInput]);

  useEffect(() => {
    if (visible) {
      fetchStatus();
      refreshTimer.current = setInterval(fetchStatus, 3000);
    }
    return () => { if (refreshTimer.current) { clearInterval(refreshTimer.current); refreshTimer.current = null; } };
  }, [visible, fetchStatus]);

  const handleToggle = useCallback(async () => {
    if (!window.electronAPI) {
      alert('远程访问控制仅在Electron应用中可用');
      return;
    }
    setToggling(true);
    try {
      const result = await window.electronAPI.toggleRemote(!status?.enabled);
      if (result.success) await fetchStatus();
    } catch (e) { console.error('切换远程访问失败:', e); }
    setToggling(false);
  }, [status?.enabled, fetchStatus]);

  const handlePortChange = useCallback(async () => {
    if (!window.electronAPI) {
      alert('端口设置仅在Electron应用中可用');
      return;
    }
    const newPort = parseInt(portInput, 10);
    if (isNaN(newPort) || newPort < 1024 || newPort > 65535) { setPortError('端口范围: 1024-65535'); return; }
    setLoading(true);
    try {
      const result = await window.electronAPI.setRemotePort(newPort);
      if (result.success) { setPortError(''); await fetchStatus(); }
      else { setPortError(result.error || '设置失败'); }
    } catch { setPortError('设置失败'); }
    setLoading(false);
  }, [portInput, fetchStatus]);

  const handleRefreshToken = useCallback(async () => {
    if (!window.electronAPI) {
      alert('令牌刷新仅在Electron应用中可用');
      return;
    }
    if (!confirm('刷新令牌后，所有已连接的浏览器客户端将被断开。确定继续？')) return;
    setLoading(true);
    try { const result = await window.electronAPI.refreshToken(); if (result.success) await fetchStatus(); }
    catch (e) { console.error('刷新令牌失败:', e); }
    setLoading(false);
  }, [fetchStatus]);

  // 设置最大连接数
  const handleMaxConnChange = useCallback(async () => {
    const val = parseInt(maxConnInput, 10);
    if (isNaN(val) || val < 0 || val > 100) {
      setMaxConnError('请输入 0-100 之间的数字（0 表示不限制）');
      return;
    }
    // 保存到 localStorage 并广播
    try {
      const saved = localStorage.getItem('generalSettings');
      const settings = saved ? JSON.parse(saved) : {};
      settings.maxRemoteConnections = val;
      localStorage.setItem('generalSettings', JSON.stringify(settings));
      // 广播到主进程
      window.electronAPI?.broadcastGeneralSettings?.(settings);
      setMaxConnError('');
    } catch {
      setMaxConnError('保存失败');
    }
  }, [maxConnInput]);

  const handleCopyToken = useCallback(async () => {
    if (!status?.token) return;
    try { await navigator.clipboard.writeText(status.token); } catch {
      const input = document.createElement('input'); input.value = status.token; document.body.appendChild(input); input.select(); document.execCommand('copy'); document.body.removeChild(input);
    }
    setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2000);
  }, [status?.token]);

  const handleKick = useCallback(async (clientId: string) => {
    if (!window.electronAPI) {
      alert('客户端管理仅在Electron应用中可用');
      return;
    }
    try { await window.electronAPI.kickClient(clientId); await fetchStatus(); }
    catch (e) { console.error('断开客户端失败:', e); }
  }, [fetchStatus]);

  const handleKickAll = useCallback(async () => {
    if (!window.electronAPI) {
      alert('客户端管理仅在Electron应用中可用');
      return;
    }
    if (!confirm(`确定断开所有 ${status?.clientCount || 0} 个客户端？`)) return;
    try { await window.electronAPI.kickAllClients(); await fetchStatus(); }
    catch (e) { console.error('断开所有客户端失败:', e); }
  }, [fetchStatus, status?.clientCount]);

  // 切换单个IP的选择状态
  const handleToggleIP = useCallback((ip: string) => {
    setSelectedIPs(prev => {
      const newSet = new Set(prev);
      const isAdding = !newSet.has(ip);
      if (newSet.has(ip)) {
        newSet.delete(ip);
      } else {
        newSet.add(ip);
      }

      // 同步选中的IP到主进程（用于服务器端访问控制）
      const ipsArray = [...newSet];
      if (window.electronAPI?.setSelectedIPs) {
        window.electronAPI.setSelectedIPs(ipsArray).catch(err => {
          console.error('Failed to sync selected IPs:', err);
        });
      }

      // 兼容：异步更新服务器的IP白名单
      if (status?.running && status?.port) {
        const apiUrl = `http://localhost:${status.port}/api/${isAdding ? 'allow-ip' : 'remove-ip'}`;
        const method = isAdding ? 'POST' : 'DELETE';
        const body = isAdding ? JSON.stringify({ ip }) : undefined;
        const query = !isAdding ? `?ip=${encodeURIComponent(ip)}` : '';

        fetch(apiUrl + query, {
          method,
          headers: isAdding ? { 'Content-Type': 'application/json' } : undefined,
          body,
        }).catch(err => {
          console.error(`Failed to update IP whitelist for ${ip}:`, err);
        });
      }

      return newSet;
    });
  }, [status?.running, status?.port]);

  // 选择所有IP
  const handleSelectAllIPs = useCallback(() => {
    if (!status?.localIPs) return;
    const allIPs = new Set(status.localIPs);
    setSelectedIPs(allIPs);
    if (window.electronAPI?.setSelectedIPs) {
      window.electronAPI.setSelectedIPs([...allIPs]).catch(console.error);
    }
  }, [status?.localIPs]);

  // 清空所有IP选择
  const handleClearAllIPs = useCallback(() => {
    setSelectedIPs(new Set());
    if (window.electronAPI?.setSelectedIPs) {
      window.electronAPI.setSelectedIPs([]).catch(console.error);
    }
  }, []);

  // 获取要显示的IP地址（如果选择了某些IP，则只显示选中的；否则显示全部）
  const displayedIPs = useMemo(() => {
    if (!status?.localIPs) return [];
    if (selectedIPs.size === 0) return status.localIPs; // 没有选择时显示全部
    return status.localIPs.filter(ip => selectedIPs.has(ip));
  }, [status?.localIPs, selectedIPs]);

  if (!status) return <div className="text-center text-dark-500 text-sm py-8">加载中...</div>;

  return (
    <div className="space-y-5">
      {/* 开关 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-dark-200 font-medium">Web 远程访问</div>
          <div className="text-xs text-dark-500">允许局域网内浏览器访问应用界面</div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            status.running ? 'bg-green-600/20 text-green-400' : status.enabled ? 'bg-yellow-600/20 text-yellow-400' : 'bg-dark-600 text-dark-400'
          }`}>
            {status.running ? '运行中' : status.enabled ? '启动中...' : '已停止'}
          </span>
          <button onClick={handleToggle} disabled={toggling}
            className={`relative w-10 h-5 rounded-full transition-colors ${status.enabled ? 'bg-accent-primary' : 'bg-dark-600'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${status.enabled ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {/* 远程创建会话权限 */}
      <div className="flex items-center justify-between p-2 bg-dark-900 rounded">
        <div>
          <div className="text-xs text-dark-200">允许远程创建会话</div>
          <div className="text-xs text-dark-500">关闭后远程Web界面无法创建新会话</div>
        </div>
        <button
          onClick={() => {
            if (settings && onSettingsChange) {
              const newSettings = { ...settings, allowRemoteCreateSession: !settings.allowRemoteCreateSession };
              onSettingsChange(newSettings);
              window.electronAPI?.broadcastGeneralSettings?.(newSettings);
            }
          }}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            settings?.allowRemoteCreateSession !== false ? 'bg-accent-primary' : 'bg-dark-600'
          }`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            settings?.allowRemoteCreateSession !== false ? 'left-5' : 'left-0.5'
          }`} />
        </button>
      </div>

      {/* 端口 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">服务端口</label>
        <div className="flex items-center gap-2">
          <input type="number" value={portInput}
            onChange={(e) => { setPortInput(e.target.value); setPortError(''); }}
            className={`flex-1 px-3 py-1.5 bg-dark-900 border rounded text-sm text-dark-100 focus:outline-none ${
              portError ? 'border-red-500' : 'border-dark-600 focus:border-accent-primary'}`}
            min={1024} max={65535} disabled={!status.enabled} onKeyDown={(e) => e.stopPropagation()} />
          <button onClick={handlePortChange}
            disabled={loading || !status.enabled || !!portError || portInput === String(status.port)}
            className="px-3 py-1.5 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors disabled:opacity-50">
            应用
          </button>
        </div>
        {portError && <p className="text-xs text-red-400">{portError}</p>}
      </div>

      {/* 令牌 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">访问令牌</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-300 font-mono truncate select-all">{status.token}</div>
          <button onClick={handleCopyToken} className="px-3 py-1.5 bg-dark-700 text-dark-300 rounded text-sm hover:bg-dark-600 transition-colors shrink-0">
            {tokenCopied ? '✓ 已复制' : '复制'}
          </button>
          <button onClick={handleRefreshToken} disabled={loading}
            className="px-3 py-1.5 bg-dark-700 text-yellow-400 rounded text-sm hover:bg-dark-600 transition-colors shrink-0" title="刷新令牌">
            刷新
          </button>
        </div>
      </div>

      {/* 最大连接数 */}
      <div className="space-y-2">
        <label className="text-xs text-dark-400">最大连接数</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={maxConnInput}
            onChange={(e) => { setMaxConnInput(e.target.value); setMaxConnError(''); }}
            className="flex-1 px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 focus:outline-none focus:border-accent-primary"
            min={0}
            max={100}
            placeholder="0 = 不限制"
            disabled={!status.enabled}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button onClick={handleMaxConnChange}
            disabled={loading || !status.enabled}
            className="px-3 py-1.5 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors disabled:opacity-50">
            应用
          </button>
        </div>
        {maxConnError && <p className="text-xs text-red-400">{maxConnError}</p>}
        <div className="text-xs text-dark-500">设置为 0 表示不限制，超过上限时远程客户端会收到友好提示</div>
      </div>

      {/* 访问地址 */}
      {status.running && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-dark-400">访问地址</label>
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={handleSelectAllIPs}
                className="text-dark-400 hover:text-accent-primary transition-colors"
                title="选择所有IP"
              >
                全选
              </button>
              <span className="text-dark-600">|</span>
              <button
                onClick={handleClearAllIPs}
                className="text-dark-400 hover:text-accent-primary transition-colors"
                title="清除所有选择"
              >
                清空
              </button>
            </div>
          </div>
          
          {/* 选择说明 */}
          <div className="text-xs text-dark-500 bg-dark-900/50 px-2 py-1 rounded">
            勾选要显示的IP地址（不勾选将显示所有地址）
          </div>
          
          {/* IP地址列表 */}
          <div className="space-y-1">
            {status.localIPs.map(ip => (
              <div key={ip} className="flex items-center gap-2 px-3 py-1.5 bg-dark-900 rounded text-xs hover:bg-dark-800 transition-colors">
                {/* 复选框 */}
                <input
                  type="checkbox"
                  checked={selectedIPs.has(ip)}
                  onChange={() => handleToggleIP(ip)}
                  className="w-3.5 h-3.5 accent-accent-primary bg-dark-700 border-dark-600 rounded focus:ring-0 focus:ring-offset-0"
                  id={`ip-checkbox-${ip}`}
                />
                
                {/* IP地址标签 */}
                <label htmlFor={`ip-checkbox-${ip}`} className="flex-1 flex items-center gap-2 cursor-pointer">
                  <span className="text-dark-500 select-text">http://</span>
                  <span className="text-dark-200 font-mono select-text">{ip}</span>
                  <span className="text-dark-500 select-text">:{status.port}</span>
                </label>
                
                {/* 复制按钮 */}
                <button
                  onClick={async () => {
                    const url = `http://${ip}:${status.port}/`;
                    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
                  }}
                  className="text-dark-400 hover:text-accent-primary transition-colors p-1"
                  title="复制链接"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          
          {/* 显示状态 */}
          <div className="text-xs text-dark-500 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${displayedIPs.length > 0 ? 'bg-accent-primary' : 'bg-dark-600'}`} />
            <span>
              当前显示 {displayedIPs.length} 个地址
              {selectedIPs.size > 0 && `（已选择 ${selectedIPs.size} 个）`}
            </span>
          </div>
        </div>
      )}

      {/* 客户端 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-dark-400">已连接客户端 ({status.clientCount})</label>
          {status.clientCount > 0 && (
            <button onClick={handleKickAll} className="text-xs text-red-400 hover:text-red-300">全部断开</button>
          )}
        </div>
        {status.clients.length === 0 ? (
          <div className="text-xs text-dark-500 text-center py-3 bg-dark-900 rounded">暂无连接的客户端</div>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {status.clients.map((client, idx) => (
              <div key={client.id} className="flex items-center gap-2 px-3 py-2 bg-dark-900 rounded group">
                <span className="text-xs text-dark-600 w-4 text-center">{idx + 1}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                <span className="text-xs text-dark-200 font-mono flex-1 truncate">{client.ip}</span>
                <span className="text-xs text-dark-500 shrink-0">{new Date(client.connectedAt).toLocaleTimeString()}</span>
                <button onClick={() => handleKick(client.id)}
                  className="text-xs text-dark-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ======================== 主组件：SettingsPanel ========================

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'general', label: '通用', icon: '⚙' },
  { key: 'groups', label: '分组', icon: '📁' },
  { key: 'performance', label: '性能', icon: '📊' },
];

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  visible,
  onClose,
  sessions,
  displayMode,
  onDisplayModeChange,
  generalSettings,
  setGeneralSettings,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  // 打开时重置到通用标签
  useEffect(() => {
    if (visible) setActiveTab('general');
  }, [visible]);

  // 动态标签页：只在 Electron 环境中显示远程标签页
  const dynamicTabs = useMemo(() => {
    const tabs: { key: TabKey; label: string; icon: string }[] = [...TABS];
    // 检查是否是本地 Electron 环境
    if (window.electronAPI) {
      tabs.push({ key: 'remote' as TabKey, label: '网络', icon: '🌐' });
    }
    // 添加告警及日志标签页
    tabs.push({ key: 'alerts' as TabKey, label: '告警', icon: '🔔' });
    // 添加 AI 标签页（始终显示）
    tabs.push({ key: 'ai' as TabKey, label: '助手AI', icon: '🤖' });
    return tabs;
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-800 border border-dark-600 rounded-lg w-[560px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700 shrink-0">
          <h2 className="text-sm font-medium text-dark-100">设置</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 标签页 */}
        <div className="flex border-b border-dark-700 shrink-0">
          {dynamicTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-accent-primary border-b-2 border-accent-primary'
                  : 'text-dark-400 hover:text-dark-200'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="overflow-y-auto flex-1 p-4">
          {activeTab === 'general' && (
            <GeneralTab
              displayMode={displayMode}
              onDisplayModeChange={onDisplayModeChange}
              settings={generalSettings}
              onSettingsChange={setGeneralSettings}
            />
          )}
          {activeTab === 'groups' && (
            <GroupsTab visible={visible && activeTab === 'groups'} sessions={sessions} />
          )}
          {activeTab === 'performance' && (
            <PerformanceTab visible={visible && activeTab === 'performance'} />
          )}
          {activeTab === 'remote' && window.electronAPI && (
            <_RemoteTab
              visible={visible && activeTab === 'remote'}
              settings={generalSettings}
              onSettingsChange={setGeneralSettings}
            />
          )}
          {activeTab === 'alerts' && (
            <AlertsTab />
          )}
          {activeTab === 'ai' && (
            <AITab />
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
