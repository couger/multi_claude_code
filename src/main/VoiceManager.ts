/**
 * 语音交互管理器 - TTS 播报 + STT 识别
 */

import { sendToRenderer } from './index';
import { IPC_CHANNELS } from './constants';
import { configManager } from './ConfigManager';

interface VoiceConfig {
  ttsEngine: 'edge-tts' | 'piper' | 'web-speech';
  sttEngine: 'web-speech' | 'whisper';
  speechRate: number;
  speechVolume: number;
  speechVoice: string;
  enabled: boolean;
}

interface VoiceCommand {
  type: 'answer' | 'query' | 'control';
  target?: string;
  content: string;
}

const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  ttsEngine: 'web-speech',
  sttEngine: 'web-speech',
  speechRate: 1.0,
  speechVolume: 1.0,
  speechVoice: '',
  enabled: true,
};

class VoiceManager {
  private config: VoiceConfig;
  private speaking: boolean = false;
  private listening: boolean = false;
  private pendingQueue: string[] = [];

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): VoiceConfig {
    const saved = configManager.get('voiceConfig');
    return saved ? { ...DEFAULT_VOICE_CONFIG, ...saved } : DEFAULT_VOICE_CONFIG;
  }

  private saveConfig(): void {
    configManager.set('voiceConfig', this.config);
  }

  updateConfig(config: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();
  }

  getConfig(): VoiceConfig {
    return { ...this.config };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  async speak(text: string): Promise<void> {
    if (!this.config.enabled) return;
    if (!text || text.trim().length === 0) return;

    this.pendingQueue.push(text);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.speaking || this.pendingQueue.length === 0) return;

    const text = this.pendingQueue.shift();
    if (!text) return;

    this.speaking = true;
    try {
      await this.doSpeak(text);
    } catch (e) {
      console.error('[VoiceManager] TTS 播报失败:', e);
    } finally {
      this.speaking = false;
      this.processQueue();
    }
  }

  private async doSpeak(text: string): Promise<void> {
    switch (this.config.ttsEngine) {
      case 'edge-tts':
        await this.speakWithEdgeTTS(text);
        break;
      case 'piper':
        await this.speakWithPiper(text);
        break;
      case 'web-speech':
      default:
        this.speakWithWebSpeech(text);
        break;
    }
  }

  private async speakWithEdgeTTS(text: string): Promise<void> {
    // edge-tts 需要额外安装，这里先检查是否可用
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const edgeTTS = require('edge-tts');
      const communicate = new edgeTTS.Communicate(text, 'zh-CN-XiaoxiaoNeural');
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        communicate.on('data', (chunk: Buffer) => chunks.push(chunk));
        communicate.on('end', resolve);
        communicate.on('error', reject);
      });

      const audioData = Buffer.concat(chunks);
      sendToRenderer(IPC_CHANNELS.VOICE_SPEAK, { text, audioBase64: audioData.toString('base64') });
    } catch (e) {
      console.warn('[VoiceManager] edge-tts 不可用，回退到 Web Speech API');
      this.speakWithWebSpeech(text);
    }
  }

  private async speakWithPiper(text: string): Promise<void> {
    // Piper 需要本地安装，暂时回退到 Web Speech API
    console.warn('[VoiceManager] piper 暂未实现，回退到 Web Speech API');
    this.speakWithWebSpeech(text);
  }

  private speakWithWebSpeech(text: string): void {
    // 通知渲染进程进行 TTS 播报
    sendToRenderer(IPC_CHANNELS.VOICE_SPEAK, {
      text,
      config: {
        rate: this.config.speechRate,
        volume: this.config.speechVolume,
        voice: this.config.speechVoice,
      },
    });
  }

  stopSpeaking(): void {
    this.pendingQueue = [];
    this.speaking = false;
    sendToRenderer(IPC_CHANNELS.VOICE_SPEAK, { action: 'stop' });
  }

  // ========== STT 语音识别 ==========

  startListening(): void {
    if (!this.config.enabled || this.listening) return;
    this.listening = true;
    sendToRenderer(IPC_CHANNELS.VOICE_START_LISTENING, {
      engine: this.config.sttEngine,
    });
  }

  stopListening(): void {
    if (!this.listening) return;
    this.listening = false;
    sendToRenderer(IPC_CHANNELS.VOICE_STOP_LISTENING, {});
  }

  isListening(): boolean {
    return this.listening;
  }

  // 处理从渲染进程收到的语音识别结果
  handleVoiceResult(text: string): void {
    if (!text || text.trim().length === 0) return;

    sendToRenderer(IPC_CHANNELS.VOICE_RESULT, { text });
    this.parseVoiceCommand(text).then(command => {
      if (command) {
        // VOICE_COMMAND 通道暂未定义，注释掉或改用其他通道
        // sendToRenderer(IPC_CHANNELS.VOICE_COMMAND, command);
      }
    }).catch(e => console.error('[VoiceManager] 解析语音命令失败:', e));
  }

  private async parseVoiceCommand(text: string): Promise<VoiceCommand | null> {
    const lowerText = text.toLowerCase();

    // 控制命令
    if (lowerText.includes('静音') || lowerText.includes('关闭声音')) {
      this.config.enabled = false;
      this.saveConfig();
      return { type: 'control', content: '已关闭语音' };
    }
    if (lowerText.includes('取消静音') || lowerText.includes('开启声音')) {
      this.config.enabled = true;
      this.saveConfig();
      return { type: 'control', content: '已开启语音' };
    }

    // 查询命令
    if (lowerText.includes('什么情况') || lowerText.includes('状态') || lowerText.includes('进度')) {
      return { type: 'query', content: text };
    }

    // 回答命令 - 尝试解析会话目标
    const answerMatch = text.match(/(确认|是|否|取消|yes|no|y|n|[\w]+)/i);
    if (answerMatch) {
      return {
        type: 'answer',
        content: answerMatch[1].toLowerCase() === '是' || answerMatch[1].toLowerCase() === 'yes' || answerMatch[1].toLowerCase() === 'y' ? 'y' :
                 answerMatch[1].toLowerCase() === '否' || answerMatch[1].toLowerCase() === 'no' || answerMatch[1].toLowerCase() === 'n' ? 'n' : answerMatch[1],
      };
    }

    return { type: 'answer', content: text };
  }
}

export const voiceManager = new VoiceManager();