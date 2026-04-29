/**
 * 语音交互管理器 - TTS 播报 + STT 识别
 */

import { app, sendToRenderer } from './index';
import path from 'path';
import { IPC_CHANNELS } from './constants';
import { configManager } from './ConfigManager';

interface VoiceConfig {
  ttsEngine: 'edge-tts' | 'piper' | 'web-speech';
  sttEngine: 'whisper' | 'xfyun' | 'baidu' | 'custom';
  sttApiKey?: string;
  sttApiSecret?: string;
  sttAppId?: string;
  whisperPath?: string;
  speechRate: number;
  speechVolume: number;
  speechVoice: string;
  enabled: boolean;
}

interface VoiceCommand {
  type: 'answer' | 'query' | 'control' | 'session' | 'ai_query';
  action?: string;
  target?: string;
  payload?: any;
  content: string;
}

const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  ttsEngine: 'edge-tts',
  sttEngine: 'whisper',  // 默认使用 Whisper 离线
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
        sendToRenderer(IPC_CHANNELS.VOICE_COMMAND, command);
      }
    }).catch(e => console.error('[VoiceManager] 解析语音命令失败:', e));
  }

  private async parseVoiceCommand(text: string): Promise<VoiceCommand | null> {
    const lowerText = text.toLowerCase();

    // 会话控制命令
    if (lowerText.includes('新建会话') || lowerText.includes('创建会话') || lowerText.includes('新开一个')) {
      return { type: 'session', action: 'create', content: '正在创建新会话' };
    }

    if (lowerText.includes('关闭会话') || lowerText.includes('结束会话') || lowerText.includes('停止会话')) {
      return { type: 'session', action: 'kill', target: 'current', content: '正在关闭会话' };
    }

    if (lowerText.includes('发送') || lowerText.includes('输入')) {
      // 提取要发送的内容
      const match = text.match(/发送[：:](.+)|输入[：:](.+)/i);
      if (match) {
        const input = match[1] || match[2];
        return { type: 'session', action: 'send', content: input, payload: { input } };
      }
    }

    // 切换到第N个会话
    const sessionMatch = text.match(/切换.*?第[一二三三四五六七八九十\d]+[个]?|到第[一二三三四五六七八九十\d]+[个]?/i);
    if (sessionMatch) {
      const numMatch = text.match(/[一二三三四五六七八九十\d]+/);
      if (numMatch) {
        const num = parseInt(numMatch[0].replace(/[一二三四五六七八九十]/g, (c: string) => '一二三四五六七八九十'.indexOf(c).toString()));
        return { type: 'session', action: 'switch', target: num.toString(), content: `切换到第${num}个会话` };
      }
    }

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
    if (lowerText.includes('什么情况') || lowerText.includes('状态') || lowerText.includes('进度') || lowerText.includes('有多少')) {
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

    // 无法识别的命令 → 发送到 AI 模型处理
    return { type: 'ai_query', content: text };
  }

  // ========== 音频识别 ==========

  // 识别音频数据（接收前端发来的 ArrayBuffer/Buffer）
  async recognizeAudio(audioBuffer: Buffer): Promise<string> {
    if (!this.config.enabled) return '';

    console.log('[VoiceManager] 开始识别音频, 引擎:', this.config.sttEngine, '大小:', audioBuffer.length);

    try {
      let result = '';
      switch (this.config.sttEngine) {
        case 'whisper':
          result = await this.recognizeWithWhisper(audioBuffer);
          break;
        case 'xfyun':
          result = await this.recognizeWithXfyun(audioBuffer);
          break;
        case 'baidu':
          result = await this.recognizeWithBaidu(audioBuffer);
          break;
        case 'custom':
          result = await this.recognizeWithCustom(audioBuffer);
          break;
        default:
          console.error('[VoiceManager] 未知的 STT 引擎:', this.config.sttEngine);
      }

      console.log('[VoiceManager] 识别结果:', result);
      return result;
    } catch (e: any) {
      console.error('[VoiceManager] 识别失败:', e);
      return 'ERROR:' + (e.message || '未知错误');
    }
  }

  // Whisper 离线识别
  private async recognizeWithWhisper(audioBuffer: Buffer): Promise<string> {
    try {
      // 尝试使用 whisper-node（Node.js 封装）
      const whisper = require('whisper-node');
      const result = await whisper.transcribe(audioBuffer);
      return result.text || '';
    } catch (e) {
      console.warn('[VoiceManager] whisper-node 不可用，尝试 whisper.cpp');

      // 如果 whisper-node 不可用，尝试使用命令行调用 whisper.cpp
      try {
        return await this.recognizeWithWhisperCpp(audioBuffer);
      } catch (e2: any) {
        console.error('[VoiceManager] Whisper 识别失败:', e2.message || e2);
        return 'ERROR:Whisper-' + (e2.message || String(e2));
      }
    }
  }

  // 使用 whisper.cpp 进行识别
  private async recognizeWithWhisperCpp(audioBuffer: Buffer): Promise<string> {
    const fs = require('fs');
    const os = require('os');
    const { execSync } = require('child_process');

    // 使用配置的 whisper 路径
    // app.getAppPath() 可能返回项目目录或 dist-electron，需要判断
    let appPath = app.getAppPath();
    // 如果在 dist-electron 目录，向上两级
    if (appPath.endsWith('dist-electron')) {
      appPath = path.join(appPath, '..', '..');
    }
    const defaultWhisperPath = path.join(appPath, 'src', 'whisper-bin-x64', 'Release', 'whisper-cli.exe');
    const whisperExe = this.config.whisperPath || defaultWhisperPath;
    const whisperDir = path.dirname(whisperExe) || '.';
    const modelPath = path.join(whisperDir, 'models', 'ggml-base.bin');

    console.log('[VoiceManager] App路径:', appPath);
    console.log('[VoiceManager] Whisper 路径:', whisperExe);
    console.log('[VoiceManager] 模型路径:', modelPath);
    console.log('[VoiceManager] 可执行文件存在:', fs.existsSync(whisperExe));
    console.log('[VoiceManager] 模型文件存在:', fs.existsSync(modelPath));

    const tempDir = os.tmpdir();
    const tempAudioPath = path.join(tempDir, `claude_voice_${Date.now()}.webm`);
    let wavPath = tempAudioPath;

    // 检测音频格式 - webm 文件头是 1a45dfa3
    const audioHeader = audioBuffer.slice(0, 4);
    const headerHex = audioHeader.toString('hex');
    const isWebM = headerHex === '1a45dfa3' || headerHex.startsWith('1a45df');
    console.log('[VoiceManager] 音频文件头:', headerHex);
    console.log('[VoiceManager] 检测到音频格式:', isWebM ? 'webm' : 'unknown');

    try {
      fs.writeFileSync(tempAudioPath, audioBuffer);
      console.log('[VoiceManager] 音频文件已保存:', tempAudioPath, '大小:', audioBuffer.length);
      console.log('[VoiceManager] 音频文件头:', audioBuffer.slice(0, 20).toString('hex').substring(0, 40));

      // 如果是 webm 格式，尝试转换为 wav
      if (isWebM) {
        const tempWavPath = path.join(tempDir, `claude_voice_${Date.now()}.wav`);
        
        // 检查 ffmpeg 是否可用
        let ffmpegPath = 'ffmpeg';
        try {
          execSync('ffmpeg -version', { stdio: 'ignore' });
        } catch {
          console.warn('[VoiceManager] ffmpeg 不可用，尝试直接使用 webm');
          // 没有 ffmpeg，尝试直接用 webm（可能某些版本的 whisper 支持）
        }

        if (fs.existsSync(tempWavPath)) {
          try { fs.unlinkSync(tempWavPath); } catch { /* ignore */ }
        }

        try {
          // 使用 ffmpeg 将 webm 转换为 wav
          const convertCmd = `ffmpeg -y -i "${tempAudioPath}" -ar 16000 -ac 1 -acodec pcm_s16le "${tempWavPath}"`;
          console.log('[VoiceManager] 转换命令:', convertCmd);
          execSync(convertCmd, { stdio: 'ignore', timeout: 30000 });
          
          if (fs.existsSync(tempWavPath) && fs.statSync(tempWavPath).size > 0) {
            wavPath = tempWavPath;
            console.log('[VoiceManager] 音频转换成功:', wavPath);
          } else {
            console.warn('[VoiceManager] 转换后的文件不存在或为空');
          }
        } catch (convertError: any) {
          console.error('[VoiceManager] 音频转换失败:', convertError.message);
          // 转换失败，继续尝试使用原始文件
        }
      }

      // 调用 whisper-cli.exe，设置 UTF-8 编码以支持中文
      const cmd = `chcp 65001 >nul && "${whisperExe}" -m "${modelPath}" -f "${wavPath}" -l zh --no-timestamps`;
      console.log('[VoiceManager] 执行命令:', cmd);

      let output = '';
      try {
        output = execSync(cmd, {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 30000,
          encoding: 'utf-8',
          windowsHide: true,
        });
      } catch (execError: any) {
        // 如果执行失败，检查是否有 stderr 输出
        if (execError.stderr) {
          console.error('[VoiceManager] whisper stderr:', execError.stderr);
        }
        // 尝试捕获 stdout（即使有错误也可能返回部分结果）
        output = execError.stdout || '';
        console.error('[VoiceManager] whisper 执行错误:', execError.message);
      }
      
      console.log('[VoiceManager] whisper 原始输出(hex):', Buffer.from(output).toString('hex').substring(0, 100));
      console.log('[VoiceManager] whisper 原始输出(utf8):', output);

      // 过滤噪声，只保留实际转录文本
      const filtered = this.filterWhisperOutput(output);
      if (filtered) {
        return filtered;
      }
      
      // 如果输出为空，尝试其他方法
      if (!output || !output.trim()) {
        console.warn('[VoiceManager] whisper 无输出，可能格式不支持');
        // 尝试添加 --verbose 参数获取更多信息
        try {
          const verboseCmd = `"${whisperExe}" -m "${modelPath}" -f "${wavPath}" -l zh --no-timestamps --verbose`;
          const verboseOutput = execSync(verboseCmd, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 30000,
            encoding: 'utf-8',
          });
          console.log('[VoiceManager] whisper verbose 输出:', verboseOutput);
          const filteredVerbose = this.filterWhisperOutput(verboseOutput);
          if (filteredVerbose) {
            return filteredVerbose;
          }
        } catch { /* ignore */ }
      }
      
      return ''; // 无有效输出返回空字符串
    } catch (e: any) {
      // 即使出错，也可能捕获到部分输出
      if (e.stdout) {
        const filtered = this.filterWhisperOutput(e.stdout);
        if (filtered) return filtered;
      }
      console.error('[VoiceManager] whisper 调用失败:', e.message);
      return ''; // 出错时返回空字符串，不返回错误信息
    } finally {
      // 清理临时文件
      try {
        if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
        if (wavPath !== tempAudioPath && fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      } catch (e) { /* ignore */ }
    }
  }

  // 过滤 whisper-cli 输出的技术噪声
  private filterWhisperOutput(rawOutput: string): string {
    if (!rawOutput || !rawOutput.trim()) return '';

    // 先检查是否包含中文字符，如果有中文直接返回原始输出
    const hasChinese = /[\u4e00-\u9fa5]/.test(rawOutput);
    if (hasChinese) {
      // 清理时间戳格式，保留中文内容
      const cleanText = rawOutput
        .replace(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/gm, '')
        .replace(/^\s+|\s+$/g, '');
      if (cleanText) {
        console.log('[VoiceManager] 检测到中文识别结果:', cleanText);
        return cleanText;
      }
    }

    const lines = rawOutput.trim().split('\n');
    const noisePatterns = [
      /whisper/i,
      /ggml/i,
      /system_info/i,
      /loading/i,
      /processing/i,
      /initial/i,
      /cuda/i,
      /opencl/i,
      /metal/i,
      /blas/i,
      /coreml/i,
      /backend/i,
      /vocab/i,
      /buffer/i,
      /encode/i,
      /decode/i,
      /error:/i,
      /^$/,
    ];

    const meaningfulLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return !noisePatterns.some((pattern) => pattern.test(trimmed));
    });

    if (meaningfulLines.length === 0) return '';

    // 清理时间戳格式 [00:00:00.000 --> 00:00:05.000]
    const cleanLines = meaningfulLines.map((line) =>
      line.replace(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/, '').trim()
    ).filter(Boolean);

    return cleanLines.join(' ');
  }

  // 讯飞语音识别
  private async recognizeWithXfyun(audioBuffer: Buffer): Promise<string> {
    const crypto = require('crypto');
    const https = require('https');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    if (!this.config.sttAppId || !this.config.sttApiKey) {
      console.error('[VoiceManager] 讯飞识别需要配置 AppID 和 API Key');
      return '';
    }

    const host = 'iat-api.xfyun.cn';
    const path2 = '/v2/iat';
    const algorithm = 'hmac-sha256';
    const headers = `host: ${host}\ndate: ${new Date().toUTCString()}\nPOST ${path2} HTTP/1.1`;
    const signatureSha = crypto.createHmac(algorithm, this.config.sttApiKey).update(headers).digest('base64');
    const authorizationOrigin = `api_key="${this.config.sttApiKey}", algorithm="${algorithm}", headers="host date request-line", signature="${signatureSha}"`;
    const authorization = Buffer.from(authorizationOrigin).toString('base64');

    return new Promise((resolve, reject) => {
      const options = {
        hostname: host,
        port: 443,
        path: path2,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorization,
          'Host': host,
          'Date': new Date().toUTCString(),
          'Path': path2,
        },
      };

      const req = https.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.code === 0 && result.data && result.data.result) {
              let text = '';
              for (const ws of result.data.result.ws) {
                for (const cw of ws.cw) {
                  text += cw.w;
                }
              }
              resolve(text);
            } else {
              console.error('[VoiceManager] 讯飞识别失败:', result);
              resolve('');
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);

      // 构建讯飞请求体
      const requestBody = {
        common: { app_id: this.config.sttAppId },
        business: {
          language: 'zh_cn',
          domain: 'iat',
          accent: 'mandarin',
          sample_rate: 16000,
          format: 'wav',
          codec: 'raw',
        },
        data: {
          status: 2,
          format: 'audio/wav;codecs=opus',
          audio: audioBuffer.toString('base64'),
        },
      };

      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }

  // 百度语音识别
  private async recognizeWithBaidu(audioBuffer: Buffer): Promise<string> {
    const crypto = require('crypto');
    const https = require('https');

    if (!this.config.sttApiKey || !this.config.sttApiSecret) {
      console.error('[VoiceManager] 百度识别需要配置 API Key 和 Secret');
      return '';
    }

    // 先获取 access_token
    const tokenHost = 'aip.baidubce.com';
    const tokenPath = `/oauth/2.0/token?grant_type=client_credentials&client_id=${this.config.sttApiKey}&client_secret=${this.config.sttApiSecret}`;

    const tokenResponse = await new Promise<string>((resolve, reject) => {
      const options = {
        hostname: tokenHost,
        port: 443,
        path: tokenPath,
        method: 'GET',
      };

      const req = https.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.end();
    });

    let accessToken = '';
    try {
      const tokenResult = JSON.parse(tokenResponse);
      accessToken = tokenResult.access_token;
    } catch (e) {
      console.error('[VoiceManager] 获取百度 token 失败:', tokenResponse);
      return '';
    }

    // 调用识别 API
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'vop.baidu.com',
        port: 443,
        path: `/server_api?dev_pid=1537&cuid=claude_code&token=${accessToken}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.err_no === 0 && result.result) {
              resolve(result.result[0]);
            } else {
              console.error('[VoiceManager] 百度识别失败:', result);
              resolve('');
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);

      const requestBody = {
        format: 'wav',
        rate: 16000,
        channel: 1,
        speech: audioBuffer.toString('base64'),
        len: audioBuffer.length,
      };

      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }

  // 自定义 API 识别
  private async recognizeWithCustom(audioBuffer: Buffer): Promise<string> {
    const apiUrl = this.config.sttApiKey; // 使用 sttApiKey 存储 API 地址
    const apiKey = this.config.sttApiSecret; // 使用 sttApiSecret 存储 API Key

    if (!apiUrl || !apiKey) {
      console.error('[VoiceManager] 自定义 API 未配置');
      return '';
    }

    try {
      const https = require('https');
      const url = new URL(apiUrl);

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      };

      return new Promise((resolve, reject) => {
        const req = https.request(options, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              // 尝���通用解析
              if (result.text) {
                resolve(result.text);
              } else if (result.result) {
                resolve(result.result);
              } else if (result.data && result.data.text) {
                resolve(result.data.text);
              } else {
                resolve(data); // 返回原始数据
              }
            } catch (e) {
              resolve(data); // 返回原始数据
            }
          });
        });

        req.on('error', reject);

        // 发送音频数据
        const requestBody = {
          audio: audioBuffer.toString('base64'),
          format: 'wav',
          rate: 16000,
        };

        req.write(JSON.stringify(requestBody));
        req.end();
      });
    } catch (e) {
      console.error('[VoiceManager] 自定义 API 调用失败:', e);
      return '';
    }
  }
}

export { VoiceManager };
export const voiceManager = new VoiceManager();