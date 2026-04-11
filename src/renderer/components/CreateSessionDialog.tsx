/**
 * 创建会话对话框
 */

import React, { useState, useEffect, useCallback } from 'react';

interface CreateSessionDialogProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (options: { name?: string; workDir?: string }) => void;
}

const CreateSessionDialog: React.FC<CreateSessionDialogProps> = ({
  visible,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [workDir, setWorkDir] = useState('');
  const [lastWorkDir, setLastWorkDir] = useState('');
  const [useLastDir, setUseLastDir] = useState(true);
  const [loading, setLoading] = useState(false);

  // 加载上次工作目录
  useEffect(() => {
    if (visible) {
      // 从 localStorage 加载上次工作目录
      const saved = localStorage.getItem('lastWorkDir');
      if (saved) {
        setLastWorkDir(saved);
        setWorkDir(saved);
      }
      // 重置状态
      setName('');
      setUseLastDir(true);
    }
  }, [visible]);

  // 选择工作目录
  const handleSelectDir = useCallback(async () => {
    try {
      const selected = await window.electronAPI.selectWorkDir();
      if (selected) {
        setWorkDir(selected);
        setUseLastDir(false);
      }
    } catch (e) {
      console.error('选择目录失败:', e);
    }
  }, []);

  // 创建会话
  const handleCreate = useCallback(async () => {
    setLoading(true);
    try {
      const finalWorkDir = useLastDir && lastWorkDir ? lastWorkDir : workDir;
      
      // 保存到 localStorage
      if (finalWorkDir) {
        localStorage.setItem('lastWorkDir', finalWorkDir);
      }
      
      onCreate({
        name: name.trim() || undefined,
        workDir: finalWorkDir || undefined,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }, [name, workDir, lastWorkDir, useLastDir, onCreate, onClose]);

  // 快速创建（使用上次目录）
  const handleQuickCreate = useCallback(async () => {
    setLoading(true);
    try {
      const finalWorkDir = lastWorkDir || workDir;
      if (finalWorkDir) {
        localStorage.setItem('lastWorkDir', finalWorkDir);
      }
      onCreate({ workDir: finalWorkDir || undefined });
      onClose();
    } finally {
      setLoading(false);
    }
  }, [lastWorkDir, workDir, onCreate, onClose]);

  // 键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !loading) {
      handleCreate();
    }
    e.stopPropagation();
  }, [onClose, handleCreate, loading]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-dark-800 border border-dark-600 rounded-lg w-[420px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <h2 className="text-sm font-medium text-dark-100">新建 CLI 会话</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {/* 会话名称（可选） */}
          <div className="space-y-1.5">
            <label className="text-xs text-dark-400">会话名称（可选）</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="如：项目开发、代码审查..."
              className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-accent-primary"
            />
          </div>

          {/* 工作目录选择 */}
          <div className="space-y-2">
            <label className="text-xs text-dark-400">工作目录</label>
            
            {/* 选项：与上次相同 */}
            {lastWorkDir && (
              <label className="flex items-center gap-2 p-2 bg-dark-900 rounded cursor-pointer hover:bg-dark-700 transition-colors">
                <input
                  type="radio"
                  checked={useLastDir}
                  onChange={() => {
                    setUseLastDir(true);
                    setWorkDir(lastWorkDir);
                  }}
                  className="w-3.5 h-3.5 accent-accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-dark-200">与上次相同</div>
                  <div className="text-xs text-dark-500 truncate font-mono">{lastWorkDir}</div>
                </div>
              </label>
            )}

            {/* 选项：手动指定 */}
            <label className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-dark-700 transition-colors ${
              !lastWorkDir ? 'bg-dark-900' : useLastDir ? 'bg-dark-700' : 'bg-dark-900'
            }`}>
              <input
                type="radio"
                checked={!useLastDir || !lastWorkDir}
                onChange={() => setUseLastDir(false)}
                className="w-3.5 h-3.5 accent-accent-primary"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-dark-200">手动指定</div>
              </div>
            </label>

            {/* 目录选择输入 */}
            {(!useLastDir || !lastWorkDir) && (
              <div className="flex gap-2 ml-6">
                <input
                  type="text"
                  value={workDir}
                  onChange={(e) => setWorkDir(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="选择或输入目录路径..."
                  className="flex-1 px-3 py-1.5 bg-dark-900 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:outline-none focus:border-accent-primary font-mono"
                />
                <button
                  onClick={handleSelectDir}
                  className="px-3 py-1.5 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600 transition-colors shrink-0"
                >
                  浏览...
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between p-4 border-t border-dark-700">
          {/* 快速创建按钮 */}
          <button
            onClick={handleQuickCreate}
            disabled={loading}
            className="text-xs text-dark-400 hover:text-dark-200 transition-colors disabled:opacity-50"
          >
            快速创建（默认目录）
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-dark-700 text-dark-300 rounded text-sm hover:bg-dark-600 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="px-4 py-2 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors disabled:opacity-50"
            >
              {loading ? '创建中...' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateSessionDialog;