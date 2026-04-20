/**
 * 设置面板 - 通用设置标签页
 */

import React from 'react';
import { DisplayMode } from '../../../shared/constants';

export interface GeneralSettings {
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

export default GeneralTab;
