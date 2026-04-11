/**
 * 分组管理器
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { sendToRenderer } from './index';
import { IPC_CHANNELS } from './constants';

export interface Group {
  id: string;
  name: string;
  description: string;
  color: string; // 颜色标识，用于UI显示
  icon: string; // 图标标识
  sessionIds: string[]; // 组内的会话ID列表
  createdAt: Date;
  updatedAt: Date;
  order: number; // 排序序号
  collapsed: boolean; // 是否折叠
}

export interface GroupData {
  groups: Group[];
  version: string;
  lastUpdated: Date;
}

class GroupManager {
  private groups: Map<string, Group> = new Map();
  private dataDir: string;
  private dataFile: string;
  private version = '1.0.0';

  constructor() {
    // 创建数据目录
    this.dataDir = path.join(os.homedir(), '.claude-code-manager', 'groups');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    this.dataFile = path.join(this.dataDir, 'groups.json');
    this.loadGroups();
  }

  /**
   * 创建新分组
   */
  createGroup(options: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
  }): Group {
    const id = uuidv4();
    const now = new Date();
    
    const group: Group = {
      id,
      name: options.name,
      description: options.description || '',
      color: options.color || '#3b82f6', // 默认蓝色
      icon: options.icon || '📁',
      sessionIds: [],
      createdAt: now,
      updatedAt: now,
      order: this.groups.size,
      collapsed: false,
    };
    
    this.groups.set(id, group);
    this.saveGroups();
    
    // 通知渲染进程
    sendToRenderer(IPC_CHANNELS.GROUP_CREATED, group);
    
    return group;
  }

  /**
   * 更新分组
   */
  updateGroup(id: string, updates: Partial<Omit<Group, 'id' | 'createdAt' | 'sessionIds'>>): Group | null {
    const group = this.groups.get(id);
    if (!group) return null;
    
    const updatedGroup = {
      ...group,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.groups.set(id, updatedGroup);
    this.saveGroups();
    
    // 通知渲染进程
    sendToRenderer(IPC_CHANNELS.GROUP_UPDATED, updatedGroup);
    
    return updatedGroup;
  }

  /**
   * 删除分组
   */
  deleteGroup(id: string): boolean {
    const group = this.groups.get(id);
    if (!group) return false;
    
    // 从所有其他组中移除对这个组的引用（如果有）
    // 注意：这里不需要，因为组之间没有引用关系
    
    this.groups.delete(id);
    this.saveGroups();
    
    // 重新排序剩余的组
    this.reorderAllGroups();
    
    // 通知渲染进程
    sendToRenderer(IPC_CHANNELS.GROUP_DELETED, { id });
    
    return true;
  }

  /**
   * 获取所有分组
   */
  getGroups(): Group[] {
    return Array.from(this.groups.values())
      .sort((a, b) => a.order - b.order);
  }

  /**
   * 获取分组
   */
  getGroup(id: string): Group | null {
    return this.groups.get(id) || null;
  }

  /**
   * 添加会话到分组
   */
  addSessionToGroup(groupId: string, sessionId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;
    
    // 检查会话是否已经在组中
    if (group.sessionIds.includes(sessionId)) {
      return false;
    }
    
    // 从其他组中移除该会话（一个会话只能属于一个组）
    this.removeSessionFromAllGroups(sessionId);
    
    // 添加到目标组
    group.sessionIds.push(sessionId);
    group.updatedAt = new Date();
    
    this.groups.set(groupId, group);
    this.saveGroups();
    
    // 通知渲染进程
    sendToRenderer(IPC_CHANNELS.SESSION_GROUP_CHANGED, {
      sessionId,
      groupId,
      action: 'added',
    });
    
    return true;
  }

  /**
   * 从分组中移除会话
   */
  removeSessionFromGroup(groupId: string, sessionId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;
    
    const index = group.sessionIds.indexOf(sessionId);
    if (index === -1) return false;
    
    group.sessionIds.splice(index, 1);
    group.updatedAt = new Date();
    
    this.groups.set(groupId, group);
    this.saveGroups();
    
    // 通知渲染进程
    sendToRenderer(IPC_CHANNELS.SESSION_GROUP_CHANGED, {
      sessionId,
      groupId: null,
      action: 'removed',
    });
    
    return true;
  }

  /**
   * 从所有分组中移除会话
   */
  removeSessionFromAllGroups(sessionId: string): boolean {
    let removed = false;
    
    for (const group of this.groups.values()) {
      const index = group.sessionIds.indexOf(sessionId);
      if (index !== -1) {
        group.sessionIds.splice(index, 1);
        group.updatedAt = new Date();
        removed = true;
      }
    }
    
    if (removed) {
      this.saveGroups();
    }
    
    return removed;
  }

  /**
   * 获取会话所属的分组
   */
  getGroupForSession(sessionId: string): Group | null {
    for (const group of this.groups.values()) {
      if (group.sessionIds.includes(sessionId)) {
        return group;
      }
    }
    return null;
  }

  /**
   * 重新排序分组
   */
  reorderGroups(groupIds: string[]): boolean {
    // 验证所有分组ID都存在
    for (const groupId of groupIds) {
      if (!this.groups.has(groupId)) {
        return false;
      }
    }
    
    // 更新排序序号
    groupIds.forEach((groupId, index) => {
      const group = this.groups.get(groupId);
      if (group) {
        group.order = index;
        this.groups.set(groupId, group);
      }
    });
    
    this.saveGroups();
    return true;
  }

  /**
   * 重新排序组内的会话
   */
  reorderSessionsInGroup(groupId: string, sessionIds: string[]): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;
    
    // 验证会话ID都在组内
    for (const sessionId of sessionIds) {
      if (!group.sessionIds.includes(sessionId)) {
        return false;
      }
    }
    
    // 验证会话ID数量匹配
    if (sessionIds.length !== group.sessionIds.length) {
      return false;
    }
    
    group.sessionIds = sessionIds;
    group.updatedAt = new Date();
    
    this.groups.set(groupId, group);
    this.saveGroups();
    
    return true;
  }

  /**
   * 切换分组折叠状态
   */
  toggleGroupCollapsed(groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;
    
    group.collapsed = !group.collapsed;
    group.updatedAt = new Date();
    
    this.groups.set(groupId, group);
    this.saveGroups();
    
    return true;
  }

  /**
   * 加载分组数据
   */
  private loadGroups() {
    if (!fs.existsSync(this.dataFile)) {
      // 创建默认分组
      this.createDefaultGroups();
      return;
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf-8'));
      const groupData = data as GroupData;
      
      // 验证版本
      if (groupData.version !== this.version) {
        console.warn(`分组数据版本不匹配: ${groupData.version} -> ${this.version}`);
        // 这里可以添加数据迁移逻辑
      }
      
      // 加载分组
      this.groups.clear();
      for (const group of groupData.groups) {
        // 转换日期字符串为Date对象
        const loadedGroup: Group = {
          ...group,
          createdAt: new Date(group.createdAt),
          updatedAt: new Date(group.updatedAt),
        };
        this.groups.set(loadedGroup.id, loadedGroup);
      }
      
      console.log(`已加载 ${this.groups.size} 个分组`);
    } catch (error) {
      console.error('加载分组数据时出错:', error);
      this.createDefaultGroups();
    }
  }

  /**
   * 保存分组数据
   */
  private saveGroups() {
    try {
      const groupData: GroupData = {
        groups: Array.from(this.groups.values()),
        version: this.version,
        lastUpdated: new Date(),
      };
      
      fs.writeFileSync(this.dataFile, JSON.stringify(groupData, null, 2));
    } catch (error) {
      console.error('保存分组数据时出错:', error);
    }
  }

  /**
   * 创建默认分组
   */
  private createDefaultGroups() {
    console.log('创建默认分组');
    
    const now = new Date();
    
    const defaultGroups: Group[] = [
      {
        id: 'default-group-1',
        name: '开发任务',
        description: '用于开发相关的CLI会话',
        color: '#3b82f6',
        icon: '💻',
        sessionIds: [],
        createdAt: now,
        updatedAt: now,
        order: 0,
        collapsed: false,
      },
      {
        id: 'default-group-2',
        name: '系统管理',
        description: '系统管理和维护任务',
        color: '#10b981',
        icon: '🔧',
        sessionIds: [],
        createdAt: now,
        updatedAt: now,
        order: 1,
        collapsed: false,
      },
      {
        id: 'default-group-3',
        name: '数据分析',
        description: '数据处理和分析任务',
        color: '#8b5cf6',
        icon: '📊',
        sessionIds: [],
        createdAt: now,
        updatedAt: now,
        order: 2,
        collapsed: false,
      },
      {
        id: 'default-group-4',
        name: '待处理',
        description: '未分类的会话',
        color: '#6b7280',
        icon: '📁',
        sessionIds: [],
        createdAt: now,
        updatedAt: now,
        order: 3,
        collapsed: false,
      },
    ];
    
    for (const group of defaultGroups) {
      this.groups.set(group.id, group);
    }
    
    this.saveGroups();
  }

  /**
   * 重新排序所有分组（修复顺序）
   */
  private reorderAllGroups() {
    const groups = Array.from(this.groups.values())
      .sort((a, b) => a.order - b.order);
    
    groups.forEach((group, index) => {
      group.order = index;
      this.groups.set(group.id, group);
    });
    
    this.saveGroups();
  }
}

export { GroupManager };