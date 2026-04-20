/**
 * 配置文件管理器 — 统一读写 ~/.claude-code-manager/config.json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { AppConfig } from '../shared/types';

const CONFIG_DIR = path.join(os.homedir(), '.claude-code-manager');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

class ConfigManager {
  private cache: AppConfig | undefined;

  /** 确保配置目录存在 */
  private ensureDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  /** 读取完整配置（带缓存） */
  load(): AppConfig {
    if (this.cache) return this.cache;
    const fallback: AppConfig = {};
    try {
      this.ensureDir();
      if (fs.existsSync(CONFIG_FILE)) {
        this.cache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      } else {
        this.cache = fallback;
      }
    } catch {
      this.cache = fallback;
    }
    return this.cache!;
  }

  /** 保存完整配置 */
  save(config: AppConfig): void {
    try {
      this.ensureDir();
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      this.cache = config;
    } catch (e) {
      console.error('配置文件写入失败:', e);
    }
  }

  /** 获取单个配置值 */
  get<K extends keyof AppConfig>(key: K): AppConfig[K] | undefined {
    return this.load()[key];
  }

  /** 设置单个配置值 */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    const config = this.load();
    config[key] = value;
    this.save(config);
  }

  /** 删除单个配置值 */
  delete(key: keyof AppConfig): void {
    const config = this.load();
    delete config[key];
    this.save(config);
  }

  /** 批量更新 */
  update(updates: Partial<AppConfig>): void {
    const config = this.load();
    Object.assign(config, updates);
    this.save(config);
  }

  /** 清除缓存（下次读取时重新从磁盘加载） */
  invalidate(): void {
    this.cache = undefined;
  }
}

export const configManager = new ConfigManager();
