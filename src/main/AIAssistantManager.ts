/**
 * AI 助手管理器 - 核心调度器
 */

import { sendToRenderer } from './index';
import { IPC_CHANNELS } from './constants';
import { configManager } from './ConfigManager';
import { AlertType } from '../shared/constants';
import type { AIConfig, AIStatus, AIAlertAnalysis, AutoAnswerRule } from '../shared/types';
import { AIHealthStatus } from '../shared/types';
import type { SessionInfo } from '../shared/types';

const DEFAULT_AI_CONFIG: AIConfig = {
  apiUrl: 'http://localhost:11434',
  modelName: 'llama3',
  heartbeatInterval: 30000,
  requestTimeout: 5000,
  unhealthyThreshold: 3,
  recoverThreshold: 2,
  latencyWarningThreshold: 3000,
  enabled: false,
};

class AIAssistantManager {
  private config: AIConfig;
  private health: AIHealthStatus = AIHealthStatus.UNHEALTHY;
  private latency: number = 0;
  private lastHeartbeat: Date | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures: number = 0;
  private consecutiveSuccesses: number = 0;
  private autoAnswerRules: AutoAnswerRule[] = [];
  private started: boolean = false;

  constructor() {
    this.config = this.loadConfig();
    this.loadAutoAnswerRules();
  }

  private loadConfig(): AIConfig {
    const saved = configManager.get('aiConfig');
    return saved ? { ...DEFAULT_AI_CONFIG, ...saved } : DEFAULT_AI_CONFIG;
  }

  private loadAutoAnswerRules(): void {
    const saved = configManager.get('autoAnswerRules') as AutoAnswerRule[] | undefined;
    this.autoAnswerRules = saved && saved.length > 0 ? saved : this.getDefaultAutoAnswerRules();
  }

  private getDefaultAutoAnswerRules(): AutoAnswerRule[] {
    return [
      { id: '1', pattern: 'create directory', answer: 'Y', enabled: true },
      { id: '2', pattern: 'npm install', answer: 'Y', enabled: true },
      { id: '3', pattern: 'overwrite', answer: 'y', sessionPattern: undefined, enabled: false },
    ];
  }

  private saveConfig(): void {
    configManager.set('aiConfig', this.config);
  }

  private saveAutoAnswerRules(): void {
    configManager.set('autoAnswerRules', this.autoAnswerRules);
  }

  start(): void {
    if (this.started || !this.config.enabled) return;
    this.started = true;
    this.startHeartbeat();
    console.log('[AIAssistant] 启动成功');
  }

  stop(): void {
    this.stopHeartbeat();
    this.started = false;
    console.log('[AIAssistant] 已停止');
  }

  updateConfig(config: Partial<AIConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();
    if (!this.config.enabled && this.started) {
      this.stop();
    } else if (this.config.enabled && !this.started) {
      this.start();
    } else if (this.config.enabled && this.started) {
      this.stopHeartbeat();
      this.startHeartbeat();
    }
  }

  getConfig(): AIConfig {
    return { ...this.config };
  }

  getStatus(): AIStatus {
    return {
      health: this.health,
      latency: this.latency,
      lastHeartbeat: this.lastHeartbeat?.toISOString() || null,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
    };
  }

  getAutoAnswerRules(): AutoAnswerRule[] {
    return [...this.autoAnswerRules];
  }

  updateAutoAnswerRules(rules: AutoAnswerRule[]): void {
    this.autoAnswerRules = rules;
    this.saveAutoAnswerRules();
  }

  async query(prompt: string, systemPrompt?: string): Promise<string> {
    const startTime = Date.now();
    try {
      const response = await this.makeRequest(prompt, systemPrompt);
      this.latency = Date.now() - startTime;
      this.handleHealthChange(true);
      return response;
    } catch (error) {
      this.latency = Date.now() - startTime;
      this.handleHealthChange(false);
      throw error;
    }
  }

  private async makeRequest(prompt: string, systemPrompt?: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeout);

    try {
      const body: Record<string, unknown> = {
        model: this.config.modelName,
        prompt: prompt,
        stream: false,
        options: { num_predict: 50, temperature: 0.3 },
      };
      if (systemPrompt) body.system = systemPrompt;

      const response = await fetch(`${this.config.apiUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json() as { response?: string };
      return data.response || '';
    } finally {
      clearTimeout(timeout);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.checkHealth().catch(e => console.error('[AIAssistant] 心跳检查失败:', e));
    }, this.config.heartbeatInterval);
    this.checkHealth().catch(e => console.error('[AIAssistant] 初始心跳失败:', e));
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async checkHealth(): Promise<boolean> {
    const startTime = Date.now();
    try {
      const result = await this.makeRequest('ok');
      this.latency = Date.now() - startTime;
      const healthy = result.length > 0;
      this.handleHealthChange(healthy);
      return healthy;
    } catch (error) {
      this.latency = Date.now() - startTime;
      this.handleHealthChange(false);
      return false;
    }
  }

  private handleHealthChange(success: boolean): void {
    if (success) {
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;
      this.lastHeartbeat = new Date();

      if (this.consecutiveSuccesses >= this.config.recoverThreshold && this.health !== AIHealthStatus.HEALTHY) {
        this.updateHealth(AIHealthStatus.HEALTHY);
        this.notifyAIRecovered();
      } else if (this.latency > this.config.latencyWarningThreshold && this.health === AIHealthStatus.HEALTHY) {
        this.updateHealth(AIHealthStatus.DEGRADED);
      }
    } else {
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;

      if (this.consecutiveFailures >= this.config.unhealthyThreshold && this.health !== AIHealthStatus.UNHEALTHY) {
        this.updateHealth(AIHealthStatus.UNHEALTHY);
        this.notifyAIUnhealthy('连续多次请求失败');
      }
    }
  }

  private updateHealth(health: AIHealthStatus): void {
    this.health = health;
    this.broadcastStatus();
  }

  private broadcastStatus(): void {
    sendToRenderer(IPC_CHANNELS.AI_STATUS, this.getStatus());
  }

  private notifyAIUnhealthy(reason: string): void {
    sendToRenderer(IPC_CHANNELS.ALERT, {
      sessionId: '',
      type: AlertType.ERROR,
      message: `AI助手不可用: ${reason}，看门功能暂停`,
    });
  }

  private notifyAIRecovered(): void {
    sendToRenderer(IPC_CHANNELS.ALERT, {
      sessionId: '',
      type: AlertType.TASK_COMPLETE,
      message: 'AI助手已恢复',
    });
  }

  async analyzeAlert(sessionId: string, text: string): Promise<AIAlertAnalysis | null> {
    if (!this.config.enabled || this.health === AIHealthStatus.UNHEALTHY) {
      return null;
    }

    const systemPrompt = `你是Claude Code会话看守助手。分析以下终端输出片段，返回JSON：
{"type":"confirm|input|error|info","summary":"一句话中文摘要","action":"auto|notify|ignore","suggestion":"建议回答内容仅confirm类型需要"}

注意：仅对需要用户确认的类型返回suggestion`;

    try {
      const result = await this.query(text, systemPrompt);
      const parsed = this.parseAIResponse(result);
      if (parsed) {
        sendToRenderer(IPC_CHANNELS.AI_ALERT_ANALYZED, { sessionId, ...parsed });
        return { sessionId, ...parsed };
      }
    } catch (e) {
      console.error('[AIAssistant] 分析告警失败:', e);
    }
    return null;
  }

  private parseAIResponse(response: string): AIAlertAnalysis['type'] extends infer T ? Pick<AIAlertAnalysis, 'type' | 'summary' | 'action' | 'suggestion'> | null : never {
    try {
      const match = response.match(/\{[^}]+\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        if (obj.type && obj.summary && obj.action) {
          return {
            type: obj.type,
            summary: obj.summary,
            action: obj.action,
            suggestion: obj.suggestion,
          };
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  findAutoAnswer(sessionName: string, matchedText: string): string | null {
    for (const rule of this.autoAnswerRules) {
      if (!rule.enabled) continue;
      if (rule.sessionPattern && !sessionName.toLowerCase().includes(rule.sessionPattern.toLowerCase())) {
        continue;
      }
      if (new RegExp(rule.pattern, 'i').test(matchedText)) {
        return rule.answer;
      }
    }
    return null;
  }

  cleanup(): void {
    this.stop();
  }
}

export const aiAssistantManager = new AIAssistantManager();