import React, { useState, useEffect, useRef } from 'react';
import { whisperService } from '../services/WhisperService';

// Web Speech API TTS 类型扩展
interface SpeechSynthesisVoice {
  name: string;
  lang: string;
  localService?: boolean;
}

const TitleBar: React.FC = () => {
  // 检测 Electron 环境
  const isElectron = !!(window as any).electronAPI?.isElectron;
  
  // 麦克风状态
  const [isListening, setIsListening] = useState(false);
  // 识别中状态
  const [isTranscribing, setIsTranscribing] = useState(false);
  // 语音合成状态
  const [isSpeaking, setIsSpeaking] = useState(false);
  // 当前正在播报的文本
  const [speakingText, setSpeakingText] = useState('');

  // Web Speech API 引用
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // MediaRecorder 引用
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // 使用 ref 跟踪监听状态，避免闭包问题
  const isListeningRef = useRef(false);

  // 启动录音和语音识别
  const startRecording = async () => {
    console.log('[TitleBar] startRecording 被调用');

    if (window.electronAPI.startListening) {
      window.electronAPI.startListening();
      setIsListening(true);
      isListeningRef.current = true;
    }

    try {
      // 获取麦克风权限
      console.log('[TitleBar] 请求麦克风权限...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log('[TitleBar] 麦克风权限已获取');

      // 创建 MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('[TitleBar] 录音完成，开始识别...');

        if (audioChunks.length === 0) {
          console.log('[TitleBar] 没有音频数据');
          return;
        }

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

        try {
          const arrayBuffer = await audioBlob.arrayBuffer();

          // 优先使用前端 WASM 转录
          const wsState = whisperService.getState();
          if (wsState.modelLoaded) {
            setIsTranscribing(true);
            console.log('[TitleBar] 使用 WASM 前端识别...');
            const text = await whisperService.transcribe(arrayBuffer);
            setIsTranscribing(false);
            if (text) {
              console.log('[TitleBar] WASM 识别结果:', text);
              if (window.electronAPI?.sendVoiceResult) {
                window.electronAPI.sendVoiceResult(text);
              }
            } else {
              console.log('[TitleBar] WASM 识别无结果，回退到后端');
              if (window.electronAPI?.recognizeAudio) {
                await window.electronAPI.recognizeAudio(arrayBuffer);
              }
            }
          } else {
            // 回退到后端 IPC 识别
            console.log('[TitleBar] WASM 模型未加载，使用后端识别...');
            if (window.electronAPI?.recognizeAudio) {
              const result = await window.electronAPI.recognizeAudio(arrayBuffer);
              console.log('[TitleBar] 后端识别结果:', result);
            }
          }
        } catch (e: any) {
          setIsTranscribing(false);
          console.error('[TitleBar] 识别错误:', e);
        }

        // 清理
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.onerror = (event: any) => {
        console.error('[TitleBar] 录音错误:', event.error);
      };

      // 开始录音
      mediaRecorder.start(100); // 每 100ms 收集一次数据
      mediaRecorderRef.current = mediaRecorder;
      console.log('[TitleBar] 开始录音...');
    } catch (e) {
      console.error('[TitleBar] 启动录音失败:', e);
    }
  };

  // 停止录音
  const stopRecording = () => {
    // 停止 MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    isListeningRef.current = false;

    if (window.electronAPI.stopListening) {
      window.electronAPI.stopListening();
      setIsListening(false);
    }
  };
  // TTS 播报 - 使用 Web Speech API
  const speakText = (text: string, config?: { rate?: number; volume?: number; voice?: string }) => {
    console.log('[TitleBar] speakText 被调用, text:', text);

    if (!('speechSynthesis' in window)) {
      console.error('[TitleBar] Web Speech API 不可用');
      return;
    }

    window.speechSynthesis.cancel();

    // 获取语音列表
    let voices = window.speechSynthesis.getVoices();
    console.log('[TitleBar] 可用语音数量:', voices.length);

    // 如果语音列表为空，等待加载
    if (voices.length === 0) {
      console.log('[TitleBar] 等待语音加载...');
      const waitForVoices = () => {
        voices = window.speechSynthesis.getVoices();
        console.log('[TitleBar] 语音已加载, 数量:', voices.length);
      };
      window.speechSynthesis.addEventListener('voiceschanged', waitForVoices);
      // 等待最多 3 秒
      setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', waitForVoices);
      }, 3000);
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = config?.rate ?? 1.0;
    utterance.volume = config?.volume ?? 1.0;

    // 设置中文语音
    if (config?.voice && config.voice !== '') {
      const matched = voices.find(v => v.name.includes(config.voice!) || v.lang.includes(config.voice!));
      if (matched) utterance.voice = matched;
    } else {
      const zhVoice = voices.find(v => v.lang.startsWith('zh'));
      if (zhVoice) utterance.voice = zhVoice;
    }

    utterance.onstart = () => {
      console.log('[TitleBar] TTS 开始播放');
      setIsSpeaking(true);
      setSpeakingText(text);
    };
    utterance.onend = () => {
      console.log('[TitleBar] TTS 播放完成');
      setIsSpeaking(false);
      setSpeakingText('');
    };
    utterance.onerror = (event) => {
      console.error('[TitleBar] TTS 播放错误:', event.error);
      setIsSpeaking(false);
      setSpeakingText('');
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  // 停止播报
  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setSpeakingText('');
  };

  // 监听主进程发来的 VOICE_SPEAK 事件
  useEffect(() => {
    if (!isElectron) return;

    const handleVoiceSpeak = (data: any) => {
      // 停止指令
      if (data.action === 'stop') {
        stopSpeaking();
        return;
      }

      // 如果有 base64 音频数据，使用 Audio API 播放
      if (data.audioBase64) {
        playAudioFromBase64(data.audioBase64);
        return;
      }

      // 播报文本
      if (data.text) {
        speakText(data.text, data.config);
      }
    };

    // 播放 base64 音频
    const playAudioFromBase64 = async (base64: string) => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const audioBuffer = await audioContext.decodeAudioData(audioBytes.buffer);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        setIsSpeaking(true);
        setSpeakingText('正在播放...');

        source.onended = () => {
          setIsSpeaking(false);
          setSpeakingText('');
        };

        source.start(0);
      } catch (e) {
        console.error('播放音频失败:', e);
        setIsSpeaking(false);
        setSpeakingText('');
      }
    };

    const handleVoiceStartListening = () => {
      setIsListening(true);
    };

    const handleVoiceStopListening = () => {
      setIsListening(false);
    };

    // 处理语音命令
    const handleVoiceCommand = async (command: any) => {
      if (!window.electronAPI?.executeVoiceCommand) return;
      try {
        const result = await window.electronAPI.executeVoiceCommand(command);
        if (result.success) {
          speakText(result.message || '命令已执行');
        } else {
          speakText(result.message || '命令执行失败');
        }
      } catch (e) {
        console.error('执行语音命令失败:', e);
        speakText('命令执行失败');
      }
    };

    window.electronAPI.onVoiceSpeak?.(handleVoiceSpeak);
    window.electronAPI.onVoiceStartListening?.(handleVoiceStartListening);
    window.electronAPI.onVoiceStopListening?.(handleVoiceStopListening);
    window.electronAPI.onVoiceCommand?.(handleVoiceCommand);

    return () => {
      window.electronAPI.removeListener?.('voice:speak', handleVoiceSpeak);
      window.electronAPI.removeListener?.('voice:startListening', handleVoiceStartListening);
      window.electronAPI.removeListener?.('voice:stopListening', handleVoiceStopListening);
      window.electronAPI.removeListener?.('voice:command', handleVoiceCommand);
      stopSpeaking();
    };
  }, [isElectron]);

  // 组件卸载时停止播报和语音识别
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="h-8 bg-dark-800 flex items-center justify-between px-4 drag-region border-b border-dark-700">
      {/* 左侧图标和标题 */}
      <div className="flex items-center gap-2">
        <svg
          className="w-4 h-4 text-accent-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span className="text-xs text-dark-300">Claude Code CLI Manager</span>
        {/* 浏览器模式标识 */}
        {!isElectron && (
          <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded ml-2">Web</span>
        )}
      </div>

      {/* 右侧窗口控制按钮 - 仅 Electron 环境显示 */}
      {isElectron && (
        <div className="flex items-center gap-1 no-drag">
          {/* 语音状态指示器 - 录音中 */}
          {isListening && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-green-900/30 rounded">
              <svg className="w-3 h-3 text-green-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m-7.072-7.072l7.072 7.072" />
              </svg>
              <span className="text-[10px] text-green-300">录音中...</span>
            </div>
          )}
          {/* 语音状态指示器 - 识别中 */}
          {isTranscribing && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-900/30 rounded">
              <svg className="w-3 h-3 text-yellow-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-[10px] text-yellow-300">识别中...</span>
            </div>
          )}
          {/* 语音状态指示器 - AI说话中 */}
          {isSpeaking && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-900/30 rounded">
              <svg className="w-3 h-3 text-blue-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m-7.072-7.072l7.072 7.072" />
              </svg>
              <span className="text-[10px] text-blue-300 truncate max-w-[120px] overflow-hidden whitespace-nowrap" title={speakingText}>
                播放中...
              </span>
            </div>
          )}
          {/* 一键贴边隐藏按钮 */}
          <button
            onClick={() => window.electronAPI.hideWindowToEdge()}
            className="w-6 h-6 flex items-center justify-center hover:bg-dark-600 rounded transition-colors"
            title="一键贴边隐藏"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI.minimizeWindow()}
            className="w-6 h-6 flex items-center justify-center hover:bg-dark-600 rounded transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI.maximizeWindow()}
            className="w-6 h-6 flex items-center justify-center hover:bg-dark-600 rounded transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          </button>
          <button
            onClick={() => window.electronAPI.closeWindow()}
            className="w-6 h-6 flex items-center justify-center hover:bg-accent-danger rounded transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default TitleBar;