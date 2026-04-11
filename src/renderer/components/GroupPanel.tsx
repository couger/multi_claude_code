/**
 * 分组管理面板组件
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Session } from '../stores/sessionStore';

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

interface GroupPanelProps {
  visible: boolean;
  onClose: () => void;
  sessions: Session[];
}

const PRESET_COLORS = [
  '#f85149', // red
  '#58a6ff', // blue
  '#3fb950', // green
  '#d29922', // yellow
  '#bc8cff', // purple
  '#f0883e', // orange
  '#f778ba', // pink
  '#39d2c0', // cyan
];

const PRESET_ICONS = ['📁', '🏷️', '⭐', '🔒', '🚀', '💡', '🎯', '📌'];

const GroupPanel: React.FC<GroupPanelProps> = ({ visible, onClose, sessions }) => {
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
      await window.electronAPI.createGroup({
        name: newName.trim(),
        description: newDesc.trim(),
        color: newColor,
        icon: newIcon,
      });
      setNewName('');
      setNewDesc('');
      setNewColor(PRESET_COLORS[1]);
      setNewIcon(PRESET_ICONS[0]);
      setCreating(false);
      await fetchGroups();
    } catch (e) {
      console.error('创建分组失败:', e);
    }
  }, [newName, newDesc, newColor, newIcon, fetchGroups]);

  const handleDelete = useCallback(async (groupId: string) => {
    if (!confirm('确定删除此分组？分组内的会话不会被删除。')) return;
    try {
      await window.electronAPI.deleteGroup(groupId);
      await fetchGroups();
    } catch (e) {
      console.error('删除分组失败:', e);
    }
  }, [fetchGroups]);

  const handleStartEdit = useCallback((group: Group) => {
    setEditingGroupId(group.id);
    setEditName(group.name);
    setEditDesc(group.description);
    setEditColor(group.color);
  }, []);

  const handleSaveEdit = useCallback(async (groupId: string) => {
    try {
      await window.electronAPI.updateGroup(groupId, {
        name: editName.trim(),
        description: editDesc.trim(),
        color: editColor,
      });
      setEditingGroupId(null);
      await fetchGroups();
    } catch (e) {
      console.error('更新分组失败:', e);
    }
  }, [editName, editDesc, editColor, fetchGroups]);

  const handleAddSession = useCallback(async (groupId: string, sessionId: string) => {
    try {
      await window.electronAPI.addSessionToGroup(groupId, sessionId);
      await fetchGroups();
      setAddingToGroupId(null);
    } catch (e) {
      console.error('添加会话到分组失败:', e);
    }
  }, [fetchGroups]);

  const handleRemoveSession = useCallback(async (groupId: string, sessionId: string) => {
    try {
      await window.electronAPI.removeSessionFromGroup(groupId, sessionId);
      await fetchGroups();
    } catch (e) {
      console.error('从分组移除会话失败:', e);
    }
  }, [fetchGroups]);

  if (!visible) return null;

  // 获取某分组中尚未加入其他分组的会话（可添加的会话）
  const getAvailableSessions = (groupId: string) => {
    const assignedSessionIds = new Set<string>();
    groups.forEach(g => {
      if (g.id !== groupId) {
        g.sessionIds.forEach(sid => assignedSessionIds.add(sid));
      }
    });
    return sessions.filter(s => !assignedSessionIds.has(s.id) || (groups.find(g => g.id === groupId)?.sessionIds || []).includes(s.id));
  };

  // 获取会话名称
  const getSessionName = (sessionId: string) => {
    const s = sessions.find(s => s.id === sessionId);
    return s ? (s.name || s.id.slice(0, 8)) : sessionId.slice(0, 8);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-dark-800 border border-dark-600 rounded-lg w-[520px] max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700 shrink-0">
          <h2 className="text-sm font-medium text-dark-100 flex items-center gap-2">
            <svg className="w-4 h-4 text-accent-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            分组管理
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreating(!creating)}
              className="text-xs px-3 py-1 bg-accent-primary/20 text-accent-primary rounded hover:bg-accent-primary/30 transition-colors"
            >
              {creating ? '取消' : '+ 新建分组'}
            </button>
            <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* 创建新分组表单 */}
          {creating && (
            <div className="p-4 border-b border-dark-700 bg-dark-800/50">
              <div className="space-y-3">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="分组名称"
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
                  autoFocus
                />
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="描述（可选）"
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded text-sm text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
                />
                {/* 颜色选择 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dark-400 w-8">颜色</span>
                  <div className="flex gap-1.5">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setNewColor(c)}
                        className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? 'ring-2 ring-white scale-125' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                {/* 图标选择 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dark-400 w-8">图标</span>
                  <div className="flex gap-1">
                    {PRESET_ICONS.map(ic => (
                      <button
                        key={ic}
                        onClick={() => setNewIcon(ic)}
                        className={`w-7 h-7 rounded text-sm flex items-center justify-center transition-colors ${newIcon === ic ? 'bg-dark-600 ring-1 ring-white' : 'hover:bg-dark-700'}`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="w-full py-2 bg-accent-primary text-dark-900 rounded text-sm font-medium hover:bg-accent-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建分组
                </button>
              </div>
            </div>
          )}

          {/* 分组列表 */}
          <div className="p-4 space-y-3">
            {loading && groups.length === 0 ? (
              <div className="text-center text-dark-500 text-sm py-8">加载中...</div>
            ) : groups.length === 0 ? (
              <div className="text-center text-dark-500 text-sm py-8">
                <p>暂无分组</p>
                <p className="text-xs mt-1">点击"新建分组"创建</p>
              </div>
            ) : (
              groups.map((group) => (
                <div
                  key={group.id}
                  className="border border-dark-600 rounded-lg overflow-hidden"
                >
                  {/* 分组头部 */}
                  {editingGroupId === group.id ? (
                    <div className="p-3 bg-dark-750 space-y-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1 bg-dark-900 border border-dark-600 rounded text-xs text-dark-100 focus:border-accent-primary focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="描述"
                        className="w-full px-2 py-1 bg-dark-900 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
                      />
                      <div className="flex gap-1">
                        {PRESET_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => setEditColor(c)}
                            className={`w-4 h-4 rounded-full ${editColor === c ? 'ring-1 ring-white' : ''}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(group.id)}
                          className="flex-1 text-xs py-1 bg-accent-primary text-dark-900 rounded hover:bg-accent-primary/80"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingGroupId(null)}
                          className="flex-1 text-xs py-1 bg-dark-700 text-dark-300 rounded hover:bg-dark-600"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 p-3"
                      style={{ borderLeft: `3px solid ${group.color}` }}
                    >
                      <span className="text-sm">{group.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-dark-100 font-medium truncate">{group.name}</div>
                        {group.description && (
                          <div className="text-xs text-dark-500 truncate">{group.description}</div>
                        )}
                      </div>
                      <span className="text-xs text-dark-500 bg-dark-700 px-1.5 py-0.5 rounded">
                        {group.sessionIds.length} 会话
                      </span>
                      {/* 操作按钮 */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setAddingToGroupId(addingToGroupId === group.id ? null : group.id)}
                          className="p-1 text-dark-400 hover:text-accent-primary transition-colors"
                          title="添加会话"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleStartEdit(group)}
                          className="p-1 text-dark-400 hover:text-dark-200 transition-colors"
                          title="编辑"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(group.id)}
                          className="p-1 text-dark-400 hover:text-red-400 transition-colors"
                          title="删除分组"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 添加会话下拉 */}
                  {addingToGroupId === group.id && (
                    <div className="px-3 pb-2 border-t border-dark-700">
                      <div className="text-xs text-dark-400 py-1.5">选择要添加的会话：</div>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {getAvailableSessions(group.id)
                          .filter(s => !group.sessionIds.includes(s.id))
                          .length === 0 ? (
                          <div className="text-xs text-dark-500 py-2 text-center">没有可添加的会话</div>
                        ) : (
                          getAvailableSessions(group.id)
                            .filter(s => !group.sessionIds.includes(s.id))
                            .map(s => (
                              <button
                                key={s.id}
                                onClick={() => handleAddSession(group.id, s.id)}
                                className="w-full text-left text-xs px-2 py-1.5 bg-dark-900 rounded hover:bg-dark-700 text-dark-300 transition-colors flex items-center gap-2"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  s.status === 'running' ? 'bg-green-400' :
                                  s.status === 'paused' ? 'bg-yellow-400' :
                                  s.status === 'completed' ? 'bg-dark-500' :
                                  'bg-red-400'
                                }`} />
                                <span className="truncate">{s.name || s.id.slice(0, 8)}</span>
                              </button>
                            ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* 分组中的会话列表 */}
                  {group.sessionIds.length > 0 && (
                    <div className="border-t border-dark-700 px-3 py-2 space-y-1">
                      {group.sessionIds.map(sid => (
                        <div
                          key={sid}
                          className="flex items-center gap-2 text-xs group/item"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: group.color }}
                          />
                          <span className="text-dark-300 truncate flex-1">{getSessionName(sid)}</span>
                          <button
                            onClick={() => handleRemoveSession(group.id, sid)}
                            className="text-dark-500 hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0"
                            title="从分组移除"
                          >
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
        </div>
      </div>
    </div>
  );
};

export default GroupPanel;
