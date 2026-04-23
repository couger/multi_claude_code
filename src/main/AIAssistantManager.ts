/**
 * AI 助手管理器 - 负责 AI 核心功能调度
 */

import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './constants';
import { AlertType } from '../shared/constants';
import { configManager } from './ConfigManager';

export interface AIConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  apiBase: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextLength: number;
  heartbeatInterval: number;  // 心跳间隔（秒）
  heartbeatTimeout: number;   // 心跳超时（秒）
  unhealthyThreshold: number; // 连续失败次数阈值
}

export interface AIStatus {
  healthy: boolean;
  latency: number;  // 延迟（毫秒）
  lastCheck: Date | null;
  error?: string;
}

export interface AlertAnalysis {
  sessionId: string;
  type: 'confirm' | 'input' | 'error' | 'info';
  summary: string;
  action: 'auto' | 'notify' | 'ignore';
  suggestion?: string;
}

export interface AutoAnswerRule {
  id: string;
  pattern: string;
  answer: string;
  sessionPattern?: string;
  enabled: boolean;
}

const DEFAULT_AI_CONFIG: AIConfig = {
  enabled: false,
  provider: 'openai',
  apiKey: '',
  apiBase: '',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 4096,
  contextLength: 8192,
  heartbeatInterval: 30,
  heartbeatTimeout: 5,
  unhealthyThreshold: 3,
};

const DEFAULT_AUTO_ANSWER_RULES: AutoAnswerRule[] = [
  { id: '1', pattern: '创建目录|create.*directory', answer: 'Y', enabled: true },
  { id: '2', pattern: '安装依赖|install.*dependencies|npm install', answer: 'Y', enabled: true },
  { id: '3', pattern: '覆盖文件|overwrite.*file', answer: 'n', enabled: false },
];

export class AIAssistantManager {
  private config: AIConfig;
  private status: AIStatus = {
    healthy: false,
    latency: 0,
    lastCheck: null,
  };
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private mainWindow: BrowserWindow | null = null;
  private autoAnswerRules: AutoAnswerRule[] = [...DEFAULT_AUTO_ANSWER_RULES];
  private broadcastFn: (message: any) => void;

  constructor(broadcastFn: (message: any) => void) {
    this.broadcastFn = broadcastFn;
    this.config = this.loadConfig();
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  private loadConfig(): AIConfig {
    const saved = configManager.get('aiConfig');
    return saved ? { ...DEFAULT_AI_CONFIG, ...saved } : { ...DEFAULT_AI_CONFIG };
  }

  private saveConfig() {
    configManager.set('aiConfig', this.config);
  }

  getConfig(): AIConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AIConfig>) {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    if (this.config.enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  getStatus(): AIStatus {
    return { ...this.status };
  }

  // 启动 AI 助手
  start() {
    if (!this.config.enabled) return;
    this.startHeartbeat();
    console.log('[AIAssistantManager] 已启动');
  }

  // 停止 AI 助手
  stop() {
    this.stopHeartbeat();
    this.status = { healthy: false, latency: 0, lastCheck: null };
    console.log('[AIAssistantManager] 已停止');
  }

  // 心跳监控
  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    const intervalMs = this.config.heartbeatInterval * 1000;
    this.heartbeatTimer = setInterval(() => this.checkHealth(), intervalMs);
    // 立即执行一次健康检查
    this.checkHealth();
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async checkHealth() {
    if (!this.config.enabled || !this.config.apiKey) {
      this.updateStatus(false, 0, '未配置 API');
      return;
    }

    const startTime = Date.now();
    try {
      const result = await this.testConnection();
      const latency = Date.now() - startTime;

      if (result.success) {
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses++;
        this.updateStatus(true, latency);

        // 连续2次成功，恢复为健康
        if (this.consecutiveSuccesses >= 2 && !this.status.healthy) {
          this.notifyRecovery();
        }
      } else {
        this.handleHealthCheckFailure(result.error || '连接失败');
      }
    } catch (error: any) {
      this.handleHealthCheckFailure(error.message);
    }
  }

  private handleHealthCheckFailure(error: string) {
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;

    if (this.consecutiveFailures >= this.config.unhealthyThreshold && this.status.healthy) {
      this.updateStatus(false, 0, error);
      this.notifyUnhealthy(error);
    }
  }

  private updateStatus(healthy: boolean, latency: number, error?: string) {
    const changed = this.status.healthy !== healthy;
    this.status = {
      healthy,
      latency,
      lastCheck: new Date(),
      error,
    };
    if (changed) {
      this.broadcastAIStatus();
    }
  }

  private broadcastAIStatus() {
    const message = {
      channel: IPC_CHANNELS.AI_STATUS,
      data: this.status,
    };
    this.broadcastFn(message);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.AI_STATUS, this.status);
    }
  }

  private notifyUnhealthy(reason: string) {
    const message = {
      channel: IPC_CHANNELS.ALERT,
      data: {
        sessionId: 'ai-assistant',
        type: AlertType.ERROR,
        message: `AI 助手无响应: ${reason}，看守功能暂停`,
        timestamp: new Date(),
      },
    };
    this.broadcastFn(message);
  }

  private notifyRecovery() {
    const message = {
      channel: IPC_CHANNELS.ALERT,
      data: {
        sessionId: 'ai-assistant',
        type: AlertType.TASK_COMPLETE,
        message: 'AI 助手已恢复，看守功能继续运行',
        timestamp: new Date(),
      },
    };
    this.broadcastFn(message);
  }

  // 测试 AI 连接
  async testConnection(): Promise<{ success: boolean; error?: string; response?: any }> {
    if (!this.config.apiKey) {
      return { success: false, error: 'API Key 未配置' };
    }

    const url = this.getRequestUrl();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.provider === 'anthropic' ? {
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
          } : {
            'Authorization': `Bearer ${this.config.apiKey}`,
          }),
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return { success: true, response: data };
      } else {
        const data = await response.json().catch(() => ({}));
        return { success: false, error: `HTTP ${response.status}: ${data.error?.message || JSON.stringify(data)}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private getRequestUrl(): string {
    if (this.config.provider === 'anthropic') {
      return 'https://api.anthropic.com/v1/messages';
    }
    let base = this.config.apiBase || 'https://api.openai.com/v1/chat/completions';
    if (base.endsWith('/')) base = base.slice(0, -1);
    if (!base.includes('/chat/completions')) {
      base = base + '/chat/completions';
    }
    return base;
  }

  // AI 查询
  async query(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.config.enabled || !this.status.healthy) {
      return '';
    }

    const url = this.getRequestUrl();
    const isAnthropic = this.config.provider === 'anthropic';

    const body = isAnthropic ? {
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
    } : {
      model: this.config.model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(isAnthropic ? {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      } : {
        'Authorization': `Bearer ${this.config.apiKey}`,
      }),
    };

    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return isAnthropic ? data.content?.[0]?.text : data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      console.error('[AIAssistantManager] 查询失败:', error);
      return '';
    }
  }

  // 分析告警
  async analyzeAlert(sessionId: string, text: string): Promise<AlertAnalysis | null> {
    if (!this.config.enabled || !this.status.healthy) {
      return null;
    }

    const systemPrompt = `你是 Claude Code 会话看守助手。分析以下终端输出片段，返回 JSON：
{"type":"confirm|input|error|info","summary":"一句话中文摘要","action":"auto|notify|ignore","suggestion":"建议回答内容，仅confirm类型需要"}

注意：只返回 JSON，不要其他内容。`;

    const result = await this.query(text, systemPrompt);
    if (!result) return null;

    try {
      const parsed = JSON.parse(result);
      const analysis: AlertAnalysis = {
        sessionId,
        type: parsed.type || 'info',
        summary: parsed.summary || '',
        action: parsed.action || 'notify',
        suggestion: parsed.suggestion,
      };

      // 检查是否需要自动回答
      if (analysis.action === 'auto' && analysis.suggestion) {
        const matched = this.checkAutoAnswerRules(text);
        if (matched) {
          return { ...analysis, action: 'auto', suggestion: matched };
        }
      }

      // 通知渲染进程
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(IPC_CHANNELS.AI_ALERT_ANALYZED, analysis);
      }

      return analysis;
    } catch {
      return null;
    }
  }

  // 自动应答规则
  private checkAutoAnswerRules(text: string): string | null {
    for (const rule of this.autoAnswerRules) {
      if (!rule.enabled) continue;
      try {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(text)) {
          return rule.answer;
        }
      } catch {
        // 忽略无效正则
      }
    }
    return null;
  }

  getAutoAnswerRules(): AutoAnswerRule[] {
    return [...this.autoAnswerRules];
  }

  updateAutoAnswerRule(ruleId: string, updates: Partial<AutoAnswerRule>) {
    const index = this.autoAnswerRules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.autoAnswerRules[index] = { ...this.autoAnswerRules[index], ...updates };
    }
  }

  addAutoAnswerRule(rule: Omit<AutoAnswerRule, 'id'>) {
    this.autoAnswerRules.push({ ...rule, id: Date.now().toString() });
  }

  deleteAutoAnswerRule(ruleId: string) {
    this.autoAnswerRules = this.autoAnswerRules.filter(r => r.id !== ruleId);
  }

  cleanup() {
    this.stop();
  }
}

export const aiAssistantManager = new AIAssistantManager(() => {});