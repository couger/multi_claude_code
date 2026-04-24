/**
 * 会话模板管理器
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { SessionTemplate } from '../shared/types';

interface TemplateData {
  templates: SessionTemplate[];
  version: string;
  lastUpdated: string;
}

class TemplateManager {
  private templates: Map<string, SessionTemplate> = new Map();
  private dataDir: string;
  private dataFile: string;
  private version = '1.0.0';

  constructor() {
    // 创建数据目录
    this.dataDir = path.join(os.homedir(), '.claude-code-manager', 'templates');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.dataFile = path.join(this.dataDir, 'templates.json');
    this.loadTemplates();
  }

  /**
   * 获取所有模板
   */
  getAll(): SessionTemplate[] {
    return Array.from(this.templates.values())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * 获取模板
   */
  get(id: string): SessionTemplate | null {
    return this.templates.get(id) || null;
  }

  /**
   * 创建模板
   */
  create(options: {
    name: string;
    description?: string;
    workDir: string;
    args: string;
  }): SessionTemplate {
    const id = uuidv4();
    const now = new Date().toISOString();

    const template: SessionTemplate = {
      id,
      name: options.name,
      description: options.description || '',
      workDir: options.workDir,
      args: options.args,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    };

    this.templates.set(id, template);
    this.saveTemplates();

    return template;
  }

  /**
   * 更新模板
   */
  update(id: string, updates: Partial<Omit<SessionTemplate, 'id' | 'createdAt'>>): SessionTemplate | null {
    const template = this.templates.get(id);
    if (!template) return null;

    const updatedTemplate: SessionTemplate = {
      ...template,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.templates.set(id, updatedTemplate);
    this.saveTemplates();

    return updatedTemplate;
  }

  /**
   * 删除模板
   */
  delete(id: string): boolean {
    if (!this.templates.has(id)) return false;

    this.templates.delete(id);
    this.saveTemplates();

    return true;
  }

  /**
   * 增加使用次数
   */
  incrementUseCount(id: string): SessionTemplate | null {
    const template = this.templates.get(id);
    if (!template) return null;

    template.useCount += 1;
    template.updatedAt = new Date().toISOString();
    this.templates.set(id, template);
    this.saveTemplates();

    return template;
  }

  /**
   * 加载模板数据
   */
  private loadTemplates() {
    if (!fs.existsSync(this.dataFile)) {
      console.log('模板数据文件不存在，跳过加载');
      return;
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf-8'));
      const templateData = data as TemplateData;

      // 验证版本
      if (templateData.version !== this.version) {
        console.warn(`模板数据版本不匹配: ${templateData.version} -> ${this.version}`);
      }

      // 加载模板
      this.templates.clear();
      for (const template of templateData.templates) {
        this.templates.set(template.id, template);
      }

      console.log(`已加载 ${this.templates.size} 个模板`);
    } catch (error) {
      console.error('加载模板数据时出错:', error);
    }
  }

  /**
   * 保存模板数据
   */
  private saveTemplates() {
    try {
      const templateData: TemplateData = {
        templates: Array.from(this.templates.values()),
        version: this.version,
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(this.dataFile, JSON.stringify(templateData, null, 2));
    } catch (error) {
      console.error('保存模板数据时出错:', error);
    }
  }
}

export { TemplateManager };
export const templateManager = new TemplateManager();