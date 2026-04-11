import React from 'react';

const TitleBar: React.FC = () => {
  // 检测 Electron 环境
  const isElectron = !!(window as any).electronAPI?.isElectron;
  return (
    <div className="h-8 bg-dark-800 flex items-center justify-between px-4 drag-region border-b border-dark-700">
      {/* 左侧图标和标题 */}
      <div className="flex items-center gap-2">
        <svg
          className="w-4 h-4 text-accent-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span className="text-xs text-dark-300">Claude Code CLI Manager</span>
        {/* 浏览器模式标识 */}
        {!isElectron && (
          <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded ml-2">Web</span>
        )}
      </div>

      {/* 右侧窗口控制按钮 - 仅 Electron 环境显示 */}
      {isElectron && (
        <div className="flex items-center gap-1 no-drag">
          {/* 贴边隐藏切换按钮 */}
          <button
            onClick={() => window.electronAPI.toggleAutoHideWindow()}
            className="w-6 h-6 flex items-center justify-center hover:bg-dark-600 rounded transition-colors"
            title="切换自动贴边隐藏"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7M5 9l7 7 7-7" />
            </svg>
          </button>
          {/* 一键贴边隐藏按钮 */}
          <button
            onClick={() => window.electronAPI.hideWindowToEdge()}
            className="w-6 h-6 flex items-center justify-center hover:bg-dark-600 rounded transition-colors"
            title="一键贴边隐藏"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="w-6 h-6 flex items-center justify-center hover:bg-dark-600 rounded transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI.maximizeWindow()}
            className="w-6 h-6 flex items-center justify-center hover:bg-dark-600 rounded transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            className="w-6 h-6 flex items-center justify-center hover:bg-accent-danger rounded transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default TitleBar;