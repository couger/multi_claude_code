/**
 * 设置面板
 * 整合通用/分组/远程/性能四个标签页
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Session, useSessionStore } from '../stores/sessionStore';
import { DisplayMode, AlertType, AlertNotifyMode, AlertSeverity } from '../../shared/constants';
import { useWhisperService } from '../hooks/useWhisperService';

// ======================== 类型定义 ========================

type TabKey = 'general' | 'groups' | 'performance' | 'remote' | 'alerts' | 'ai' | 'voice' | 'templates';

// AI配置接口（本地模型版本）
interface AIMonitoringConfig {
  enabled: boolean;
  apiUrl: string;
  modelName: string;
  heartbeatInterval: number;
  requestTimeout: number;
  unhealthyThreshold: number;
  recoverThreshold: number;
  latencyWarningThreshold: number;
}

// AI配置接口（OpenAI版本）
interface AIConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  apiKey: string;
  apiBase: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextLength: number;
}

// AI状态
interface AIStatus {
  health: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  lastHeartbeat: string | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

// 自动应答规则
interface AutoAnswerRule {
  id: string;
  pattern: string;
  answer: string;
  sessionPattern?: string;
  enabled: boolean;
}

// 通知配置
interface NotificationConfig {
  soundEnabled: boolean;
  notificationEnabled: boolean;
}

// 语音配置
interface VoiceConfig {
  ttsEngine: 'edge-tts' | 'piper' | 'web-speech';
  sttEngine: 'whisper' | 'xfyun' | 'baidu' | 'custom';
  sttApiKey?: string;        // 云服务 API Key（讯飞/百度/自定义）
  sttApiSecret?: string;   // 云服务 API Secret
  sttAppId?: string;       // 讯飞 App ID
  whisperPath?: string;   // Whisper 可执行文件路径（原生模式）
  whisperUseWasm?: boolean; // 使用 WASM 模式（默认 true）
  whisperModelId?: string;  // WASM 模型 ID
  speechRate: number;
  speechVolume: number;
  enabled: boolean;
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

// 窗口透明度滑块组件（暂时禁用）
/*
const WindowOpacitySlider: React.FC = () => {
  const [opacity, setOpacity] = useState(1.0);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    setIsElectron(window.electronAPI?.isElectron ?? false);
    if (window.electronAPI?.getWindowOpacity) {
      window.electronAPI.getWindowOpacity().then((value) => {
        setOpacity(value);
      }).catch(() => { });
    }
  }, []);

  const handleOpacityChange = async (newOpacity: number) => {
    setOpacity(newOpacity);
    if (window.electronAPI?.setWindowOpacity) {
      try {
        await window.electronAPI.setWindowOpacity(newOpacity);
      } catch (e) {
        console.error('设置窗口透明度失败:', e);
      }
    }
  };

  if (!isElectron) {
    return (
      <div className="flex items-center gap-3 p-2 bg-dark-900 rounded">
        <span className="text-xs text-dark-400">仅 Electron 环境下可用</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-2 bg-dark-900 rounded">
      <span className="text-xs text-dark-400">透明</span>
      <input
        type="range"
        min="0.3"
        max="1"
        step="0.05"
        value={opacity}
        onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
        className="flex-1 accent-accent-primary"
      />
      <span className="text-xs text-dark-400">不透明</span>
      <span className="text-xs text-dark-200 font-mono w-12 text-center">{Math.round(opacity * 100)}%</span>
    </div>
  );
};
*/

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
  const [testError, setTestError] = useState<string>('');
  const [testResponse, setTestResponse] = useState<string>('');
  const [showTestModal, setShowTestModal] = useState(false);
  
  // 自动应答规则状态
  interface AutoAnswerRule {
    id: string;
    pattern: string;
    answer: string;
    sessionPattern?: string;
    enabled: boolean;
  }
  const [autoAnswerRules, setAutoAnswerRules] = useState<AutoAnswerRule[]>([]);
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoAnswerRule | null>(null);
  
  // 新规则表单
  const [newPattern, setNewPattern] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newSessionPattern, setNewSessionPattern] = useState('');

  // 加载自动应答规则
  useEffect(() => {
    loadAutoAnswerRules();
  }, []);
  
  const loadAutoAnswerRules = async () => {
    try {
      if (window.electronAPI?.getAutoAnswerRules) {
        const rules = await window.electronAPI.getAutoAnswerRules();
        setAutoAnswerRules(rules || []);
      }
    } catch (e) {
      console.error('加载自动应答规则失败:', e);
    }
  };
  
  const handleAddRule = async () => {
    if (!newPattern || !newAnswer) {
      alert('请填写匹配模式和回答内容');
      return;
    }
    try {
      if (window.electronAPI?.addAutoAnswerRule) {
        await window.electronAPI.addAutoAnswerRule({
          pattern: newPattern,
          answer: newAnswer,
          sessionPattern: newSessionPattern || undefined,
          enabled: true,
        });
        setNewPattern('');
        setNewAnswer('');
        setNewSessionPattern('');
        setShowAddRuleModal(false);
        await loadAutoAnswerRules();
      }
    } catch (e) {
      console.error('添加规则失败:', e);
      alert('添加规则失败');
    }
  };
  
  const handleUpdateRule = async (ruleId: string, updates: Partial<AutoAnswerRule>) => {
    try {
      if (window.electronAPI?.updateAutoAnswerRule) {
        await window.electronAPI.updateAutoAnswerRule(ruleId, updates);
        setEditingRule(null);
        await loadAutoAnswerRules();
      }
    } catch (e) {
      console.error('更新规则失败:', e);
      alert('更新规则失败');
    }
  };
  
  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('确定删除此规则吗？')) return;
    try {
      if (window.electronAPI?.deleteAutoAnswerRule) {
        await window.electronAPI.deleteAutoAnswerRule(ruleId);
        await loadAutoAnswerRules();
      }
    } catch (e) {
      console.error('删除规则失败:', e);
      alert('删除规则失败');
    }
  };

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

  // 获取实际请求URL
  const getActualRequestUrl = useCallback(() => {
    if (config.provider === 'custom' && config.apiBase) {
      // 确保URL以 /chat/completions 结尾
      let base = config.apiBase.trim();
      if (base.endsWith('/')) base = base.slice(0, -1);
      if (!base.endsWith('/chat/completions')) {
        base = base + '/chat/completions';
      }
      return base;
    }
    return 'https://api.openai.com/v1/chat/completions';
  }, [config.provider, config.apiBase]);

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
      setTestError('请输入 API 密钥');
      return;
    }
    setTesting(true);
    setTestResult(null);
    setTestError('');
    setTestResponse('');

    const url = getActualRequestUrl();
    try {
      const response = await fetch(url, {
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

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setTestResult('success');
        setTestResponse(`模型: ${data.model || config.model}, 用量: ${JSON.stringify(data.usage || {})}`);
      } else {
        setTestResult('error');
        setTestError(`HTTP ${response.status}: ${data.error?.message || data.error?.type || JSON.stringify(data)}`);
      }
    } catch (err: any) {
      setTestResult('error');
      // 提供更详细的错误信息
      if (err.message === 'Failed to fetch') {
        setTestError('网络请求失败 - 请检查：1) URL是否正确 2) 网络是否可达 3) 如在浏览器中访问，可能被CORS限制');
      } else {
        setTestError(err?.message || '网络请求失败');
      }
    }
    setTesting(false);
  };

  // 如果未启用，灰色不可操作（但开关按钮可以点击）
  const isDisabled = !config.enabled;

  return (
    <div className="space-y-5">
      {/* 启用开关 - 始终可用 */}
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

      {/* 其余内容 - 禁用时灰色不可操作 */}
      <div className="space-y-5">
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
        <div className="space-y-1">
          <label className="text-xs text-dark-400">API基础URL</label>
          <input
            type="text"
            value={config.apiBase}
            onChange={(e) => setConfig({ ...config, apiBase: e.target.value })}
            placeholder="https://api.example.com/v1"
            className="w-full px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
          />
          <div className="text-xs text-dark-500">
            实际请求: {getActualRequestUrl()}
          </div>
        </div>
      )}

      {/* 非自定义时也显示URL */}
      {config.provider !== 'custom' && (
        <div className="text-xs text-dark-500">
          实际请求: {getActualRequestUrl()}
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
            onChange={(e) => {
              const val = e.target.value;
              // 只在用户完成输入时更新，允许输入空字符串
              if (val === '' || val === '.') return;
              const parsed = parseFloat(val);
              if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
                setConfig({ ...config, temperature: parsed });
              }
            }}
            onBlur={(e) => {
              // 失去焦点时确保有效值
              const parsed = parseFloat(e.target.value);
              setConfig({ ...config, temperature: isNaN(parsed) ? 0.7 : Math.max(0, Math.min(1, parsed)) });
            }}
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
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') return;
              const parsed = parseInt(val, 10);
              if (!isNaN(parsed) && parsed >= 1 && parsed <= 128000) {
                setConfig({ ...config, maxTokens: parsed });
              }
            }}
            onBlur={(e) => {
              const parsed = parseInt(e.target.value, 10);
              setConfig({ ...config, maxTokens: isNaN(parsed) || parsed < 1 ? 4096 : Math.min(128000, parsed) });
            }}
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
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') return;
              const parsed = parseInt(val, 10);
              if (!isNaN(parsed) && parsed >= 512 && parsed <= 128000) {
                setConfig({ ...config, contextLength: parsed });
              }
            }}
            onBlur={(e) => {
              const parsed = parseInt(e.target.value, 10);
              setConfig({ ...config, contextLength: isNaN(parsed) || parsed < 512 ? 8192 : Math.min(128000, parsed) });
            }}
            className="w-full px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 focus:border-accent-primary focus:outline-none"
          />
        </div>
      </div>

      {/* 测试连接 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing || !config.apiKey}
            className="flex-1 py-2 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
          {testResult && (
            <button
              onClick={() => setShowTestModal(true)}
              className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                testResult === 'success'
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'bg-red-600 text-white hover:bg-red-500'
              }`}
            >
              {testResult === 'success' ? '✓ 查看结果' : '✗ 查看结果'}
            </button>
          )}
        </div>
      </div>

      {/* 测试结果模态窗口 */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowTestModal(false)}>
          <div className="bg-dark-800 border border-dark-600 rounded-lg p-4 max-w-lg w-full mx-4 max-h-[70vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">测试结果</h3>
              <button
                onClick={() => setShowTestModal(false)}
                className="p-1 hover:bg-dark-700 rounded"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {testError && (
              <div className="text-sm text-red-400 p-3 bg-red-900/30 rounded mb-3 break-all">
                <strong className="block mb-1">错误:</strong>
                {testError}
              </div>
            )}
            {testResponse && (
              <div className="text-sm text-green-400 p-3 bg-green-900/30 rounded break-all">
                <strong className="block mb-1">响应:</strong>
                {testResponse}
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* 自动应答规则管理 */}
      <div className="border-t border-dark-700 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-dark-400 font-medium">自动应答规则</label>
          <button
            onClick={() => setShowAddRuleModal(true)}
            className="text-xs px-3 py-1.5 bg-accent-primary/20 text-accent-primary rounded hover:bg-accent-primary/30 transition-colors"
          >
            + 添加规则
          </button>
        </div>
        
        {autoAnswerRules.length === 0 ? (
          <div className="text-xs text-dark-500 text-center py-4 bg-dark-900 rounded">暂无自动应答规则</div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {autoAnswerRules.map((rule) => (
              <div key={rule.id} className="border border-dark-600 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateRule(rule.id, { enabled: !rule.enabled })}
                      className={`relative w-8 h-4 rounded-full transition-colors ${
                        rule.enabled ? 'bg-accent-primary' : 'bg-dark-600'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                        rule.enabled ? 'left-4' : 'left-0.5'
                      }`} />
                    </button>
                    <span className="text-xs text-dark-200 font-medium">
                      {rule.enabled ? '已启用' : '已禁用'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    删除
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-dark-500">匹配模式:</span>
                    <code className="ml-1 px-1.5 py-0.5 bg-dark-900 rounded text-blue-300">{rule.pattern}</code>
                  </div>
                  <div>
                    <span className="text-dark-500">自动回答:</span>
                    <code className="ml-1 px-1.5 py-0.5 bg-dark-900 rounded text-green-300">{rule.answer}</code>
                  </div>
                </div>
                
                {rule.sessionPattern && (
                  <div className="text-xs">
                    <span className="text-dark-500">限定会话:</span>
                    <span className="ml-1 text-yellow-300">{rule.sessionPattern}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <div className="text-xs text-dark-500 bg-dark-900/50 px-3 py-2 rounded">
          <p>💡 提示：匹配模式使用正则表达式，支持大小写不敏感匹配。例如："创建目录|create.*directory"</p>
        </div>
      </div>

      {/* 添加规则模态框 */}
      {showAddRuleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAddRuleModal(false)}>
          <div className="bg-dark-800 border border-dark-600 rounded-lg p-4 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-dark-100">添加自动应答规则</h3>
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="p-1 hover:bg-dark-700 rounded text-dark-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-dark-400 block mb-1">匹配模式（正则表达式）*</label>
                <input
                  type="text"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  placeholder="例如：创建目录|create.*directory"
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none font-mono"
                />
              </div>
              
              <div>
                <label className="text-xs text-dark-400 block mb-1">自动回答内容*</label>
                <input
                  type="text"
                  value={newAnswer}
                  onChange={(e) => setNewAnswer(e.target.value)}
                  placeholder="例如：Y 或 n"
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none font-mono"
                />
              </div>
              
              <div>
                <label className="text-xs text-dark-400 block mb-1">限定会话（可选）</label>
                <input
                  type="text"
                  value={newSessionPattern}
                  onChange={(e) => setNewSessionPattern(e.target.value)}
                  placeholder="例如：*test* 或特定会话名"
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none font-mono"
                />
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowAddRuleModal(false)}
                  className="flex-1 py-2 bg-dark-700 text-dark-300 rounded text-sm hover:bg-dark-600 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleAddRule}
                  className="flex-1 py-2 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors"
                >
                  添加规则
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>{/* 关闭禁用 div */}
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

// ======================== 子组件：Whisper WASM 配置 ========================

interface WhisperWasmConfigProps {
  useWasm: boolean;
  whisperPath: string;
  modelId: string;
  onUseWasmChange: (v: boolean) => void;
  onWhisperPathChange: (v: string) => void;
  onModelIdChange: (v: string) => void;
}

const WHISPER_MODELS = [
  { id: 'tiny', label: 'Tiny (75MB)', desc: '最快，多语言' },
  { id: 'base', label: 'Base (142MB)', desc: '平衡，多语言' },
  { id: 'small', label: 'Small (466MB)', desc: '较准，多语言' },
  { id: 'medium-q5_0', label: 'Medium Q5 (515MB)', desc: '量化，多语言' },
  { id: 'large-q5_0', label: 'Large Q5 (1030MB)', desc: '最准，量化，多语言' },
];

const WhisperWasmConfig: React.FC<WhisperWasmConfigProps> = ({
  useWasm, whisperPath, modelId, onUseWasmChange, onWhisperPathChange, onModelIdChange,
}) => {
  const { state: wsState, checkSupport, loadModel, clearCache } = useWhisperService();

  useEffect(() => {
    checkSupport();
  }, []);

  return (
    <div className="space-y-2 bg-dark-900 p-2 rounded">
      {/* WASM / 原生 切换 */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-dark-400 font-medium">识别模式</label>
        <button
          onClick={() => onUseWasmChange(true)}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            useWasm ? 'bg-accent-primary text-white' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
          }`}
        >
          浏览器 WASM
        </button>
        <button
          onClick={() => onUseWasmChange(false)}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            !useWasm ? 'bg-accent-primary text-white' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
          }`}
        >
          原生可执行文件
        </button>
      </div>

      {useWasm ? (
        <div className="space-y-2">
          {/* WASM 支持状态 */}
          {wsState.wasmSupported === false && (
            <div className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded">
              当前浏览器不支持 WASM 语音识别所需的特性
            </div>
          )}

          {/* 模型选择 */}
          <div className="space-y-1">
            <label className="text-xs text-dark-400">模型大小</label>
            <select
              value={modelId}
              onChange={(e) => onModelIdChange(e.target.value)}
              className="w-full px-2 py-1.5 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 focus:border-accent-primary focus:outline-none"
            >
              {WHISPER_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label} - {m.desc}</option>
              ))}
            </select>
          </div>

          {/* 加载按钮 + 进度 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadModel(modelId as any)}
              disabled={wsState.loading}
              className={`px-3 py-1.5 rounded text-xs transition-colors ${
                wsState.loading
                  ? 'bg-dark-600 text-dark-400 cursor-not-allowed'
                  : wsState.modelLoaded
                    ? 'bg-green-700 text-white hover:bg-green-600'
                    : 'bg-accent-primary text-white hover:opacity-90'
              }`}
            >
              {wsState.loading
                ? `下载中 ${wsState.loadingProgress}%`
                : wsState.modelLoaded
                  ? '已加载（重新下载）'
                  : '下载模型'}
            </button>
            {wsState.modelLoaded && wsState.currentModel && (
              <span className="text-xs text-green-400">
                {WHISPER_MODELS.find(m => m.id === wsState.currentModel)?.label || wsState.currentModel} 已就绪
              </span>
            )}
          </div>

          {/* 进度条 */}
          {wsState.loading && (
            <div className="w-full bg-dark-700 rounded-full h-1.5">
              <div
                className="bg-accent-primary h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${wsState.loadingProgress}%` }}
              />
            </div>
          )}

          {/* 错误信息 */}
          {wsState.error && (
            <div className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded break-all">
              {wsState.error}
            </div>
          )}

          {/* 清除缓存 */}
          {wsState.modelLoaded && (
            <button
              onClick={async () => { await clearCache(); }}
              className="text-xs text-dark-500 hover:text-dark-300 underline"
            >
              清除模型缓存
            </button>
          )}

          <div className="text-xs text-dark-500">
            模型文件下载后缓存在浏览器中，后续无需重复下载
          </div>
        </div>
      ) : (
        /* 原生模式：whisper.exe 路径 */
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={whisperPath}
              onChange={(e) => onWhisperPathChange(e.target.value)}
              placeholder="默认: src/whisper-bin-x64/Release/whisper-cli.exe"
              className="flex-1 px-2 py-1.5 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
            />
            <button
              onClick={async () => {
                if (window.electronAPI?.selectWhisperPath) {
                  const path = await window.electronAPI.selectWhisperPath();
                  if (path) onWhisperPathChange(path);
                }
              }}
              className="px-3 py-1.5 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600"
            >
              浏览
            </button>
          </div>
          <div className="text-xs text-dark-500">
            选择 whisper.cpp 编译后的可执行文件路径
          </div>
        </div>
      )}
    </div>
  );
};

// ======================== 子组件：语音设置 ========================

interface VoiceTabProps {
  aiEnabled: boolean;
}

const VoiceTab: React.FC<VoiceTabProps> = ({ aiEnabled }) => {
  const [config, setConfig] = useState<VoiceConfig>(() => {
    const saved = localStorage.getItem('voiceConfig');
    return saved ? JSON.parse(saved) : {
      ttsEngine: 'edge-tts' as const,
      sttEngine: 'whisper' as const,
      sttApiKey: '',
      sttApiSecret: '',
      sttAppId: '',
      speechRate: 1.0,
      speechVolume: 1.0,
      enabled: true,
    };
  });
  const [isListening, setIsListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [testText, setTestText] = useState('你好，我是你的语音助手。');
  const [testing, setTesting] = useState<'none' | 'listen' | 'speak'>('none');
  const [debugLogs, setDebugLogs] = useState<{ time: string; msg: string }[]>([]);

  // 语音识别引用
  const isListeningRef = useRef(false);

  // 环境检查状态
  const [envWarnings, setEnvWarnings] = useState<{ type: string; message: string }[]>([]);

  // 检查运行环境
  useEffect(() => {
    const warnings: { type: string; message: string }[] = [];

    // 检查 TTS 引擎可用性
    const ttsAvailable: Record<string, boolean> = {
      'edge-tts': true, // 内置
      'piper': false,   // 需要安装
      'web-speech': true, // 浏览器原生
    };

    // 检查 STT 引擎可用性
    const sttAvailable: Record<string, boolean> = {
      'whisper': config.whisperUseWasm !== false
        ? true  // WASM 模式默认可用（模型可在设置中下载）
        : !!(config.whisperPath && config.whisperPath.trim() !== ''),
      'xfyun': !!(config.sttAppId && config.sttApiKey), // 需要配置
      'baidu': !!(config.sttApiKey && config.sttApiSecret), // 需要配置
    };

    // 只添加不满足条件的警告
    if (config.ttsEngine === 'piper' && !ttsAvailable.piper) {
      warnings.push({ type: 'tts-piper', message: 'Piper 未安装，无法使用' });
    }

    // STT 警告
    if (config.sttEngine === 'whisper' && !sttAvailable.whisper) {
      warnings.push({ type: 'stt-whisper', message: 'Whisper 路径未配置，请填写可执行文件路径' });
    } else if (config.sttEngine === 'xfyun' && !sttAvailable.xfyun) {
      warnings.push({ type: 'stt-xfyun', message: '讯飞 API 未配置，请填写 AppID 和 API Key' });
    } else if (config.sttEngine === 'baidu' && !sttAvailable.baidu) {
      warnings.push({ type: 'stt-baidu', message: '百度 API 未配置，请填写 API Key 和 Secret' });
    }

    setEnvWarnings(warnings);
  }, [config.ttsEngine, config.sttEngine, config.sttApiKey, config.sttApiSecret, config.sttAppId, config.whisperPath]);

  // 合并 AI 启用状态和语音配置启用状态
  const isEnabled = aiEnabled && config.enabled;

  // 添加调试日志
  const addDebugLog = (msg: string) => {
    const now = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-50), { time: now, msg }]); // 保留最近50条
  };

  // 保存配置
  useEffect(() => {
    localStorage.setItem('voiceConfig', JSON.stringify(config));
  }, [config]);

  // 处理录音测试 - 使用 MediaRecorder 录制音频，发送到后端识别
  const handleListenTest = async () => {
    addDebugLog('开始录音测试...');

    // 获取 STT 引擎配置
    addDebugLog('STT 引擎: ' + config.sttEngine);

    if (testing === 'listen') {
      // 停止录音
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setTesting('none');
      setIsListening(false);
      isListeningRef.current = false;
      window.electronAPI?.stopListening?.();
      addDebugLog('停止录音');
      return;
    }

    try {
      setTesting('listen');
      setIsListening(true);
      isListeningRef.current = true;

      if (window.electronAPI?.startListening) {
        window.electronAPI.startListening();
      }

      // 获取麦克风权限
      addDebugLog('请求麦克风权限...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      addDebugLog('麦克风权限已获取');

      // 创建 MediaRecorder - 尝试使用支持的格式
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : undefined;
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

            mediaRecorder.onstop = async () => {
        addDebugLog('录音完成，开始识别...');

        if (audioChunks.length === 0) {
          addDebugLog('没有音频数据');
          return;
        }

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

        try {
          const webmBuffer = await audioBlob.arrayBuffer();
          addDebugLog('音频大小: ' + webmBuffer.byteLength + ' bytes');

          // 优先使用 WASM 前端识别
          const { whisperService } = await import('../services/WhisperService');
          const wsState = whisperService.getState();
          if (wsState.modelLoaded) {
            addDebugLog('使用 WASM 前端识别...');
            const text = await whisperService.transcribe(webmBuffer);
            addDebugLog('WASM 识别结果: ' + (text || '(空)'));
          } else {
            addDebugLog('发送音频到后端识别...');
            if (window.electronAPI?.recognizeAudio) {
              const result = await window.electronAPI.recognizeAudio(webmBuffer);
              addDebugLog('识别结果: ' + (result || '(空)'));
            } else {
              addDebugLog('错误: recognizeAudio API 不可用');
            }
          }
        } catch (e: any) {
          addDebugLog('识别错误: ' + e.message);
        }

        // 清理
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.onerror = (event: any) => {
        addDebugLog('录音错误: ' + event.error);
      };

      // 开始录音
      mediaRecorder.start(100); // 每 100ms 收集一次数据
      mediaRecorderRef.current = mediaRecorder;
      addDebugLog('开始录音...');
    } catch (e: any) {
      console.error('录音测试失败:', e);
      addDebugLog('错误: ' + e.message);
      setTesting('none');
      setIsListening(false);
      isListeningRef.current = false;
    }
  };

  // MediaRecorder 和 stream 引用
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 处理 TTS 播放测试 - 直接使用 Web Speech API
  const handleSpeakTest = async () => {
    addDebugLog(`开始 TTS 测试: "${testText}"`);
    if (!testText.trim()) {
      addDebugLog('错误: 测试文本为空');
      return;
    }

    try {
      setTesting('speak');
      setSpeaking(true);

      // 直接使用 Web Speech API，不通过 IPC
      if (!('speechSynthesis' in window)) {
        addDebugLog('错误: Web Speech API 不可用');
        alert('Web Speech API 不可用');
        setTesting('none');
        setSpeaking(false);
        return;
      }

      window.speechSynthesis.cancel();
      addDebugLog('已取消当前播报');

      // 获取语音列表
      let voices = window.speechSynthesis.getVoices();
      addDebugLog(`可用语音数量: ${voices.length}`);

      // 如果语音列表为空，等待加载
      if (voices.length === 0) {
        addDebugLog('等待语音加载...');
        await new Promise<void>((resolve) => {
          const onVoicesChanged = () => {
            voices = window.speechSynthesis.getVoices();
            addDebugLog(`语音已加载，��量: ${voices.length}`);
            window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
            resolve();
          };
          window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
          // 超时保护
          setTimeout(() => {
            window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
            resolve();
          }, 3000);
        });
      }

      const utterance = new SpeechSynthesisUtterance(testText);
      utterance.rate = config.speechRate;
      utterance.volume = config.speechVolume;

      // 尝试选择中文语音
      const zhVoice = voices.find(v => v.lang.startsWith('zh'));
      if (zhVoice) {
        utterance.voice = zhVoice;
        addDebugLog(`使用语音: ${zhVoice.name} (${zhVoice.lang})`);
      } else if (voices.length > 0) {
        // 使用第一个可用语音
        utterance.voice = voices[0];
        addDebugLog(`使用默认语音: ${voices[0].name} (${voices[0].lang})`);
      } else {
        addDebugLog('警告: 没有任何可用语音');
      }

      utterance.onstart = () => {
        addDebugLog('TTS 开始播放');
      };
      utterance.onend = () => {
        addDebugLog('TTS 播放完成');
        setTesting('none');
        setSpeaking(false);
      };
      utterance.onerror = (event) => {
        addDebugLog(`错误: ${event.error}`);
        alert(`TTS 播放错误: ${event.error}`);
        setTesting('none');
        setSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
      addDebugLog('speak() 已调用');
    } catch (e: any) {
      console.error('TTS播放测试失败:', e);
      addDebugLog(`异常: ${e.message}`);
      alert('语音播放测试失败');
      setTesting('none');
      setSpeaking(false);
    }
  };

  // 如果 AI 未启用，显示提示
  if (!aiEnabled) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between p-2 bg-dark-900 rounded opacity-50">
          <div>
            <div className="text-sm text-dark-200 font-medium">启用语音交互</div>
            <div className="text-xs text-dark-500">需要先在"助手AI"中启用 AI 功能</div>
          </div>
          <div className="relative w-10 h-5 rounded-full bg-dark-600">
            <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-dark-400" />
          </div>
        </div>
        <div className="text-xs text-dark-500 bg-dark-900/50 px-3 py-2 rounded">
          <p>提示：请先在"助手AI"标签页中启用 AI 功能，然后才能配置语音交互。</p>
        </div>
      </div>
    );
  }

  // 如果未启用，显示灰色不可操作的界面
  const isDisabled = !config.enabled;

  return (
    <div className="space-y-5">
      {/* 启用开关 */}
      <div className="flex items-center justify-between p-2 bg-dark-900 rounded">
        <div>
          <div className="text-sm text-dark-200 font-medium">启用语音交互</div>
          <div className="text-xs text-dark-500">允许录音和语音播报</div>
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

      {/* ========== 语音输出（TTS）区域 ========== */}
      <div className="border border-dark-600 rounded-lg p-3 space-y-3 bg-dark-800/50">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <span className="text-sm font-medium text-dark-200">语音输出 (TTS)</span>
        </div>

        {/* 环境警告 */}
        {envWarnings.filter(w => w.type.startsWith('tts')).map((w, i) => (
          <div key={i} className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded">
            {w.message}
          </div>
        ))}

        {/* TTS 引擎选择 */}
        <div className="space-y-2">
          <label className="text-xs text-dark-400">合成引擎</label>
          <select
            value={config.ttsEngine}
            onChange={(e) => setConfig({ ...config, ttsEngine: e.target.value as any })}
            className="w-full px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-dark-100 focus:border-accent-primary focus:outline-none"
          >
            <option value="edge-tts">Edge TTS (在线)</option>
            <option value="web-speech">Web Speech (浏览器)</option>
            <option value="piper">Piper (离线，需安装)</option>
          </select>
        </div>

        {/* 语速调节 */}
        <div className="space-y-2">
          <label className="text-xs text-dark-400">语速: {config.speechRate.toFixed(1)}x</label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={config.speechRate}
            onChange={(e) => setConfig({ ...config, speechRate: parseFloat(e.target.value) })}
            className="w-full accent-accent-primary"
          />
        </div>

        {/* 音量调节 */}
        <div className="space-y-2">
          <label className="text-xs text-dark-400">音量: {Math.round(config.speechVolume * 100)}%</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={config.speechVolume}
            onChange={(e) => setConfig({ ...config, speechVolume: parseFloat(e.target.value) })}
            className="w-full accent-accent-primary"
          />
        </div>

        {/* TTS 测试输入和按钮 */}
        <div className="space-y-2 pt-2 border-t border-dark-700">
          <input
            type="text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            disabled={!isEnabled || testing === 'listen'}
            placeholder="输入要播放的文本..."
            className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSpeakTest}
            disabled={!isEnabled || testing === 'listen' || !testText.trim()}
            className={`w-full py-2 rounded text-xs transition-colors flex items-center justify-center gap-2 ${
              speaking
                ? 'bg-blue-600/20 text-blue-400'
                : isEnabled && testing !== 'listen' && testText.trim()
                  ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                  : 'bg-dark-900 text-dark-500 cursor-not-allowed'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            {speaking ? '播放中...' : '测试播放'}
          </button>
        </div>
      </div>

      {/* ========== 语音输入（STT）区域 ========== */}
      <div className="border border-dark-600 rounded-lg p-3 space-y-3 bg-dark-800/50">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-4a6 6 0 01-3.162-5.288m6.162 2.288l5.272 5.272m-5.272-5.272A6 6 0 0112 5z" />
          </svg>
          <span className="text-sm font-medium text-dark-200">语音输入 (STT)</span>
        </div>

        {/* 环境警告 */}
        {envWarnings.filter(w => w.type.startsWith('stt')).map((w, i) => (
          <div key={i} className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded">
            {w.message}
          </div>
        ))}

        {/* STT 引擎选择 - 下拉选择 */}
        <div className="space-y-2">
          <label className="text-xs text-dark-400">识别引擎</label>
          <select
            value={config.sttEngine}
            onChange={(e) => setConfig({ ...config, sttEngine: e.target.value as any })}
            className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 focus:border-accent-primary focus:outline-none"
          >
            <option value="whisper">Whisper (离线)</option>
            <option value="xfyun">讯飞语音 (在线)</option>
            <option value="baidu">百度语音 (在线)</option>
            <option value="custom">自定义 API</option>
          </select>
        </div>

        {/* Whisper WASM / 原生配置 */}
        {config.sttEngine === 'whisper' && (
          <WhisperWasmConfig
            useWasm={config.whisperUseWasm !== false}
            whisperPath={config.whisperPath || ''}
            modelId={config.whisperModelId || 'base'}
            onUseWasmChange={(v) => setConfig({ ...config, whisperUseWasm: v })}
            onWhisperPathChange={(v) => setConfig({ ...config, whisperPath: v })}
            onModelIdChange={(v) => setConfig({ ...config, whisperModelId: v })}
          />
        )}

        {/* 讯飞 API 配置 */}
        {config.sttEngine === 'xfyun' && (
          <div className="space-y-2 bg-dark-900 p-2 rounded">
            <div className="text-xs text-dark-400 font-medium">讯飞 API 配置</div>
            <input
              type="text"
              value={config.sttAppId || ''}
              onChange={(e) => setConfig({ ...config, sttAppId: e.target.value })}
              placeholder="AppID"
              className="w-full px-2 py-1.5 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
            />
            <input
              type="password"
              value={config.sttApiKey || ''}
              onChange={(e) => setConfig({ ...config, sttApiKey: e.target.value })}
              placeholder="API Key"
              className="w-full px-2 py-1.5 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
            />
          </div>
        )}

        {/* 百度 API 配置 */}
        {config.sttEngine === 'baidu' && (
          <div className="space-y-2 bg-dark-900 p-2 rounded">
            <div className="text-xs text-dark-400 font-medium">百度 API 配置</div>
            <input
              type="password"
              value={config.sttApiKey || ''}
              onChange={(e) => setConfig({ ...config, sttApiKey: e.target.value })}
              placeholder="API Key"
              className="w-full px-2 py-1.5 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
            />
            <input
              type="password"
              value={config.sttApiSecret || ''}
              onChange={(e) => setConfig({ ...config, sttApiSecret: e.target.value })}
              placeholder="API Secret"
              className="w-full px-2 py-1.5 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
            />
          </div>
        )}

        {/* 自定义 API 配置 */}
        {config.sttEngine === 'custom' && (
          <div className="space-y-2 bg-dark-900 p-2 rounded">
            <div className="text-xs text-dark-400 font-medium">自定义 STT API</div>
            <input
              type="text"
              value={config.sttApiKey || ''}
              onChange={(e) => setConfig({ ...config, sttApiKey: e.target.value })}
              placeholder="API 地址"
              className="w-full px-2 py-1.5 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
            />
            <input
              type="password"
              value={config.sttApiSecret || ''}
              onChange={(e) => setConfig({ ...config, sttApiSecret: e.target.value })}
              placeholder="API Key"
              className="w-full px-2 py-1.5 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
            />
          </div>
        )}

        {/* 录音测试按钮 */}
        <div className="flex items-center gap-2 pt-2 border-t border-dark-700">
          <button
            onClick={handleListenTest}
            disabled={!isEnabled || testing === 'speak'}
            className={`flex-1 py-2 rounded text-xs transition-colors flex items-center justify-center gap-2 ${
              isListening
                ? 'bg-red-600/20 text-red-400'
                : isEnabled && testing !== 'speak'
                  ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                  : 'bg-dark-900 text-dark-500 cursor-not-allowed'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-4a6 6 0 01-3.162-5.288m6.162 2.288l5.272 5.272m-5.272-5.272A6 6 0 0112 5z" />
            </svg>
            {isListening ? '停止录音' : testing === 'listen' ? '录音中...' : '测试录音'}
          </button>
          <span className="text-xs text-dark-400">
            {isListening ? (
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />录音中</span>
            ) : null}
          </span>
        </div>
      </div>

      {/* 调试信息区域 - 公用元素 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-dark-400 font-medium">调试信息</label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const text = debugLogs.map(l => `[${l.time}] ${l.msg}`).join('\n');
                navigator.clipboard.writeText(text);
              }}
              className="text-xs text-dark-500 hover:text-dark-300"
            >
              复制
            </button>
            <button
              onClick={() => setDebugLogs([])}
              className="text-xs text-dark-500 hover:text-dark-300"
            >
              清空
            </button>
          </div>
        </div>
        <div className="bg-dark-900 rounded p-2 max-h-32 overflow-y-auto">
          {debugLogs.length === 0 ? (
            <span className="text-xs text-dark-500">暂无日志...</span>
          ) : (
            debugLogs.map((log, i) => (
              <div key={i} className="text-xs text-dark-400 font-mono py-0.5">
                <span className="text-dark-600">[{log.time}]</span> {log.msg}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ======================== 子组件：模板设置 ========================

interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  workDir: string;
  args: string;
  createdAt: string;
  updatedAt: string;
  useCount: number;
}

const TemplatesTab: React.FC = () => {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', workDir: '', args: '' });

  // 加载模板列表
  const loadTemplates = useCallback(async () => {
    if (!window.electronAPI?.templateList) return;
    try {
      const list = await window.electronAPI.templateList();
      setTemplates(list || []);
    } catch (e) {
      console.error('加载模板失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // 选择工作目录
  const handleSelectDir = async () => {
    if (!window.electronAPI?.selectWorkDir) return;
    const dir = await window.electronAPI.selectWorkDir();
    if (dir) {
      setFormData(prev => ({ ...prev, workDir: dir }));
    }
  };

  // 保存模板
  const handleSave = async () => {
    if (!formData.name || !formData.workDir) return;
    if (!window.electronAPI?.templateCreate || !window.electronAPI?.templateUpdate) return;

    try {
      if (editingId) {
        await window.electronAPI.templateUpdate(editingId, formData);
      } else {
        await window.electronAPI.templateCreate(formData);
      }
      setFormData({ name: '', description: '', workDir: '', args: '' });
      setShowForm(false);
      setEditingId(null);
      loadTemplates();
    } catch (e) {
      console.error('保存模板失败:', e);
    }
  };

  // 编辑模板
  const handleEdit = (template: TemplateItem) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      workDir: template.workDir,
      args: template.args,
    });
    setEditingId(template.id);
    setShowForm(true);
  };

  // 删除模板
  const handleDelete = async (id: string) => {
    if (!window.electronAPI?.templateDelete) return;
    if (!confirm('确定要删除这个模板吗？')) return;
    try {
      await window.electronAPI.templateDelete(id);
      loadTemplates();
    } catch (e) {
      console.error('删除模板失败:', e);
    }
  };

  // 使用模板（记录使用次数）
  const handleUse = async (id: string) => {
    if (!window.electronAPI?.templateUse) return;
    try {
      await window.electronAPI.templateUse(id);
    } catch (e) {
      console.error('使用模板失败:', e);
    }
  };

  if (loading) {
    return <div className="p-4 text-dark-400 text-sm">加载中...</div>;
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* 标题和添加按钮 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-dark-100">会话模板</h3>
        <button
          onClick={() => {
            setFormData({ name: '', description: '', workDir: '', args: '' });
            setEditingId(null);
            setShowForm(true);
          }}
          className="px-3 py-1.5 bg-accent-primary text-dark-900 rounded text-xs font-medium hover:bg-accent-primary/80 transition-colors"
        >
          + 添加模板
        </button>
      </div>

      {/* 添加/编辑表单 */}
      {showForm && (
        <div className="p-3 bg-dark-900 rounded border border-dark-600 space-y-3">
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="模板名称 *"
            className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
          />
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="描述（可选）"
            className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={formData.workDir}
              onChange={(e) => setFormData(prev => ({ ...prev, workDir: e.target.value }))}
              placeholder="工作目录 *"
              className="flex-1 px-3 py-2 bg-dark-800 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none font-mono"
            />
            <button
              onClick={handleSelectDir}
              className="px-3 py-2 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600"
            >
              浏览
            </button>
          </div>
          <input
            type="text"
            value={formData.args}
            onChange={(e) => setFormData(prev => ({ ...prev, args: e.target.value }))}
            placeholder="启动参数（可选）"
            className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none font-mono"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-3 py-1.5 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!formData.name || !formData.workDir}
              className="px-3 py-1.5 bg-accent-primary text-dark-900 rounded text-xs font-medium hover:bg-accent-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingId ? '保存修改' : '创建模板'}
            </button>
          </div>
        </div>
      )}

      {/* ���板列表 */}
      {templates.length === 0 ? (
        <div className="text-center py-8 text-dark-500 text-sm">
          暂无模板，点击"添加模板"创建第一个模板
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="p-3 bg-dark-900 rounded border border-dark-600 hover:border-dark-500 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-dark-100">{template.name}</span>
                    {template.useCount > 0 && (
                      <span className="text-xs text-dark-500">已使用 {template.useCount} 次</span>
                    )}
                  </div>
                  {template.description && (
                    <div className="text-xs text-dark-400 mt-0.5">{template.description}</div>
                  )}
                  <div className="text-xs text-dark-500 font-mono mt-1 truncate" title={template.workDir}>
                    {template.workDir}
                  </div>
                  {template.args && (
                    <div className="text-xs text-dark-500 font-mono mt-0.5 truncate" title={template.args}>
                      {template.args}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleUse(template.id)}
                    className="px-2 py-1 text-xs bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30"
                    title="使用此模板创建会话"
                  >
                    使用
                  </button>
                  <button
                    onClick={() => handleEdit(template)}
                    className="px-2 py-1 text-xs bg-dark-700 text-dark-300 rounded hover:bg-dark-600"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded hover:bg-red-600/30"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 提示 */}
      <div className="text-xs text-dark-500 bg-dark-900/50 px-3 py-2 rounded">
        <p>提示：模板可以保存常用的工作目录和启动参数，方便快速创建会话。</p>
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

  // 获取 AI 启用状态
  const [aiEnabled, setAiEnabled] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('aiConfig');
    if (saved) {
      try {
        const config = JSON.parse(saved);
        setAiEnabled(config.enabled === true);
      } catch { /* ignore */ }
    }
  }, [activeTab]); // 当切换标签页时更新

  // 打开时重置到通用标签
  useEffect(() => {
    if (visible) setActiveTab('general');
  }, [visible]);

  // 动态标签页：只在 Electron 环境中显示远程标签页
  const dynamicTabs = useMemo(() => {
    const tabs: { key: TabKey; label: string; icon: string }[] = [...TABS];
    // 添加模板标签页（在分组之后）
    tabs.splice(2, 0, { key: 'templates' as TabKey, label: '模板', icon: '📋' });
    // 检查是否是本地 Electron 环境
    if (window.electronAPI) {
      tabs.push({ key: 'remote' as TabKey, label: '网络', icon: '🌐' });
    }
    // 添加告警及日志标签页
    tabs.push({ key: 'alerts' as TabKey, label: '告警', icon: '🔔' });
    // 添加 AI 标签页（始终显示）
    tabs.push({ key: 'ai' as TabKey, label: '助手AI', icon: '🤖' });
    // 添加语音标签页（始终显示）
    tabs.push({ key: 'voice' as TabKey, label: '语音', icon: '🎤' });
    return tabs;
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-800 border border-dark-600 rounded-lg w-[800px] h-[720px] max-h-[90vh] shadow-2xl flex flex-col"
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
          {activeTab === 'voice' && (
            <VoiceTab aiEnabled={aiEnabled} />
          )}
          {activeTab === 'templates' && (
            <TemplatesTab />
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
