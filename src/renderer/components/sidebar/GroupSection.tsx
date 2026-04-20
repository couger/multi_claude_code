import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Session } from '../../stores/sessionStore';
import { DisplayMode } from '../../../shared/constants';
import SessionCard from '../SessionCard';

// 分组类型定义
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
const PRESET_ICONS = ['\uD83D\uDCC1', '\uD83C\uDFF7\uFE0F', '\u2B50', '\uD83D\uDD12', '\uD83D\uDE80', '\uD83D\uDCA1', '\uD83C\uDFAF', '\uD83D\uDCCC'];

export interface GroupSectionHandle {
  ungroupedSessions: Session[];
  groupedSessionIds: Set<string>;
}

interface GroupSectionProps {
  sessions: Session[];
  expandedSessionId: string | null;
  displayMode: DisplayMode;
  getAlertCount: (id: string) => number;
  onCloseSession: (id: string) => void;
  onExpandSession: (id: string) => void;
  /** Callback providing the ungrouped sessions whenever they change */
  onUngroupedSessionsChange: (ungroupedSessions: Session[]) => void;
}

const GroupSection: React.FC<GroupSectionProps> = ({
  sessions,
  expandedSessionId,
  displayMode,
  getAlertCount,
  onCloseSession,
  onExpandSession,
  onUngroupedSessionsChange,
}) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[0]);
  const [newGroupIcon, setNewGroupIcon] = useState(PRESET_ICONS[0]);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [dragOverSessionList, setDragOverSessionList] = useState(false);
  const dragCounterRef = useRef(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupPanelCollapsed, setGroupPanelCollapsed] = useState(false);

  // 加载分组
  useEffect(() => {
    const loadGroups = async () => {
      try {
        const result = await window.electronAPI.getGroups();
        setGroups(result || []);
      } catch (e) {
        console.error('加载分组失败:', e);
      }
    };
    loadGroups();
    const interval = setInterval(loadGroups, 5000);
    return () => clearInterval(interval);
  }, []);

  // 获取分组中会话的ID集合
  const groupedSessionIds = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach(g => g.sessionIds.forEach(id => ids.add(id)));
    return ids;
  }, [groups]);

  // 未分组的会话
  const ungroupedSessions = useMemo(() => {
    return sessions.filter(s => !groupedSessionIds.has(s.id));
  }, [sessions, groupedSessionIds]);

  // 通知父组件未分组会话变化
  useEffect(() => {
    onUngroupedSessionsChange(ungroupedSessions);
  }, [ungroupedSessions, onUngroupedSessionsChange]);

  // 切换分组展开/折叠
  const toggleGroupExpand = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  }, []);

  // 创建分组
  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim()) return;
    try {
      await window.electronAPI.createGroup({
        name: newGroupName.trim(),
        color: newGroupColor,
        icon: newGroupIcon,
        description: '',
      });
      setNewGroupName('');
      setNewGroupColor(PRESET_COLORS[0]);
      setNewGroupIcon(PRESET_ICONS[0]);
      setCreatingGroup(false);
      const result = await window.electronAPI.getGroups();
      setGroups(result || []);
    } catch (e) {
      console.error('创建分组失败:', e);
    }
  }, [newGroupName, newGroupColor, newGroupIcon]);

  // 拖拽会话到分组
  const handleDragStart = useCallback((sessionId: string) => {
    setDraggingSessionId(sessionId);
    dragCounterRef.current = 0;
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingSessionId(null);
    setDragOverSessionList(false);
  }, []);

  const handleGroupDragEnter = useCallback((e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setDragOverGroupId(groupId);
  }, []);

  const handleGroupDragOver = useCallback((e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverGroupId !== groupId) {
      setDragOverGroupId(groupId);
    }
  }, [dragOverGroupId]);

  const handleGroupDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOverGroupId(null);
    }
  }, []);

  const handleDrop = useCallback(async (groupId: string) => {
    dragCounterRef.current = 0;
    if (!draggingSessionId) return;
    try {
      await window.electronAPI.addSessionToGroup(groupId, draggingSessionId);
      const result = await window.electronAPI.getGroups();
      setGroups(result || []);
    } catch (e) {
      console.error('添加会话到分组失败:', e);
    }
    setDraggingSessionId(null);
    setDragOverGroupId(null);
    setDragOverSessionList(false);
  }, [draggingSessionId]);

  // 拖拽到会话列表（从分组中移出）
  const handleSessionListDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!draggingSessionId) return;
    setDragOverSessionList(true);
  }, [draggingSessionId]);

  const handleSessionListDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (draggingSessionId) {
      setDragOverSessionList(true);
    }
  }, [draggingSessionId]);

  const handleSessionListDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    const currentTarget = e.currentTarget as Node;
    if (relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
    setDragOverSessionList(false);
  }, []);

  const handleSessionListDrop = useCallback(async () => {
    if (!draggingSessionId) return;
    const sourceGroup = groups.find(g => g.sessionIds.includes(draggingSessionId));
    if (sourceGroup) {
      try {
        await window.electronAPI.removeSessionFromGroup(sourceGroup.id, draggingSessionId);
        const result = await window.electronAPI.getGroups();
        setGroups(result || []);
      } catch (e) {
        console.error('从分组移出会话失败:', e);
      }
    }
    setDraggingSessionId(null);
    setDragOverSessionList(false);
    setDragOverGroupId(null);
  }, [draggingSessionId, groups]);

  return (
    <>
      {/* 会话列表 - 也作为从分组拖出的放置区域 */}
      <div
        className={`flex-1 overflow-y-auto p-2 space-y-2 transition-colors ${
          dragOverSessionList ? 'bg-accent-primary/10 border border-accent-primary border-dashed rounded' : ''
        }`}
        onDragEnter={handleSessionListDragEnter}
        onDragOver={handleSessionListDragOver}
        onDragLeave={handleSessionListDragLeave}
        onDrop={handleSessionListDrop}
      >
        {dragOverSessionList && draggingSessionId && (
          <div className="text-xs text-accent-primary text-center py-1 mb-1">
            释放以从分组中移出
          </div>
        )}
        {ungroupedSessions.length === 0 && groups.length === 0 ? (
          <div className="text-center text-dark-500 text-sm py-8">
            <p>暂无会话</p>
            <p className="text-xs mt-1">点击上方按钮创建</p>
          </div>
        ) : ungroupedSessions.length === 0 && !dragOverSessionList ? (
          <div className="text-center text-dark-500 text-sm py-4">
            <p>所有会话已分组</p>
          </div>
        ) : (
          ungroupedSessions.map((session) => (
            <div
              key={session.id}
              draggable
              onDragStart={() => handleDragStart(session.id)}
              onDragEnd={handleDragEnd}
            >
              <SessionCard
                session={session}
                displayMode={displayMode}
                isExpanded={expandedSessionId === session.id}
                alertCount={getAlertCount(session.id)}
                onClose={() => onCloseSession(session.id)}
                onExpand={() => onExpandSession(session.id)}
              />
            </div>
          ))
        )}
      </div>

      {/* 分组区域 */}
      <div className="border-t border-dark-700 p-2">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setGroupPanelCollapsed(!groupPanelCollapsed)}
            className="text-xs text-dark-400 flex items-center gap-1 hover:text-dark-300 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${groupPanelCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            分组
            <span className="text-dark-500">({groups.length})</span>
          </button>
          <button
            onClick={() => setCreatingGroup(!creatingGroup)}
            className="text-xs text-accent-primary hover:text-accent-primary/80"
            title="新建分组"
          >
            +
          </button>
        </div>

        {!groupPanelCollapsed && (
          <>
            {/* 新建分组表单 */}
            {creatingGroup && (
              <div className="mb-2 p-2 bg-dark-900 rounded space-y-2">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="分组名称"
                  className="w-full px-2 py-1 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {PRESET_COLORS.slice(0, 6).map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewGroupColor(c)}
                        className={`w-4 h-4 rounded-sm ${newGroupColor === c ? 'ring-1 ring-white' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {PRESET_ICONS.slice(0, 4).map((ic) => (
                      <button
                        key={ic}
                        onClick={() => setNewGroupIcon(ic)}
                        className={`w-5 h-5 rounded text-xs ${newGroupIcon === ic ? 'bg-dark-600' : 'hover:bg-dark-700'}`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={handleCreateGroup}
                    disabled={!newGroupName.trim()}
                    className="flex-1 py-1 bg-accent-primary text-dark-900 rounded text-xs font-medium hover:bg-accent-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    创建
                  </button>
                  <button
                    onClick={() => setCreatingGroup(false)}
                    className="px-2 py-1 bg-dark-700 text-dark-300 rounded text-xs hover:bg-dark-600"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* 分组列表 */}
            <div className="space-y-1">
              {groups.length === 0 ? (
                <div className="text-xs text-dark-500 text-center py-2">
                  点击 + 创建分组
                </div>
              ) : (
                groups.map((group) => {
                  const isExpanded = expandedGroups.has(group.id);
                  const groupSessions = sessions.filter(s => group.sessionIds.includes(s.id));
                  const activeSessionCount = groupSessions.length;
                  return (
                    <div key={group.id}>
                      <div
                        className={`p-2 rounded cursor-pointer transition-colors ${
                          dragOverGroupId === group.id
                            ? 'bg-accent-primary/20 border border-accent-primary border-dashed'
                            : 'bg-dark-900 hover:bg-dark-700'
                        }`}
                        onDragEnter={(e) => handleGroupDragEnter(e, group.id)}
                        onDragOver={(e) => handleGroupDragOver(e, group.id)}
                        onDragLeave={handleGroupDragLeave}
                        onDrop={() => handleDrop(group.id)}
                        onClick={() => toggleGroupExpand(group.id)}
                      >
                        <div className="flex items-center gap-2">
                          <svg
                            className={`w-3 h-3 text-dark-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="text-sm">{group.icon}</span>
                          <span className="text-xs text-dark-200 truncate flex-1">{group.name}</span>
                          <span
                            className="w-3 h-3 rounded-sm shrink-0"
                            style={{ backgroundColor: group.color }}
                            title={group.color}
                          />
                          <span className="text-xs text-dark-500">{activeSessionCount}</span>
                        </div>
                        {dragOverGroupId === group.id && (
                          <div className="mt-1 text-xs text-accent-primary text-center">
                            释放以添加会话
                          </div>
                        )}
                      </div>
                      {/* 展开时显示分组内的会话 */}
                      {isExpanded && groupSessions.length > 0 && (
                        <div className="ml-4 mt-1 space-y-1 border-l-2 border-dark-600 pl-2">
                          {groupSessions.map((session) => (
                            <div
                              key={session.id}
                              draggable
                              onDragStart={() => handleDragStart(session.id)}
                              onDragEnd={handleDragEnd}
                            >
                              <SessionCard
                                session={session}
                                displayMode={displayMode}
                                isExpanded={expandedSessionId === session.id}
                                alertCount={getAlertCount(session.id)}
                                onClose={() => onCloseSession(session.id)}
                                onExpand={() => onExpandSession(session.id)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default GroupSection;
