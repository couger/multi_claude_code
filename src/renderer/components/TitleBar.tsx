import React, { useState, useEffect, useRef } from 'react';

// Web Speech API 类型扩展
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
  // 语音合成状态
  const [isSpeaking, setIsSpeaking] = useState(false);
  // 当前正在播报的文本
  const [speakingText, setSpeakingText] = useState('');
  
  // Web Speech API 引用
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 启动录音
  const startRecording = () => {
    if (window.electronAPI.startListening) {
      window.electronAPI.startListening();
      setIsListening(true);
    }
  };

  // 停止录音
  const stopRecording = () => {
    if (window.electronAPI.stopListening) {
      window.electronAPI.stopListening();
      setIsListening(false);
    }
  };

  // TTS 播报 - 使用 Web Speech API
  const speakText = (text: string, config?: { rate?: number; volume?: number; voice?: string }) => {
    if (!('speechSynthesis' in window)) {
      console.warn('[TitleBar] Web Speech API 不可用');
      return;
    }

    // 停止当前播报
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = config?.rate ?? 1.0;
    utterance.volume = config?.volume ?? 1.0;

    // 设置中文语音
    if (config?.voice && config.voice !== '') {
      const voices = window.speechSynthesis.getVoices();
      const matched = voices.find(v => v.name.includes(config.voice!) || v.lang.includes(config.voice!));
      if (matched) utterance.voice = matched;
    } else {
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(v => v.lang.startsWith('zh'));
      if (zhVoice) utterance.voice = zhVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setSpeakingText(text);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setSpeakingText('');
    };
    utterance.onerror = () => {
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
      // 播报文本
      if (data.text) {
        speakText(data.text, data.config);
      }
    };

    const handleVoiceStartListening = () => {
      setIsListening(true);
    };

    const handleVoiceStopListening = () => {
      setIsListening(false);
    };

    window.electronAPI.onVoiceSpeak?.(handleVoiceSpeak);
    window.electronAPI.onVoiceStartListening?.(handleVoiceStartListening);
    window.electronAPI.onVoiceStopListening?.(handleVoiceStopListening);

    return () => {
      window.electronAPI.removeListener?.('voice:speak', handleVoiceSpeak);
      window.electronAPI.removeListener?.('voice:startListening', handleVoiceStartListening);
      window.electronAPI.removeListener?.('voice:stopListening', handleVoiceStopListening);
      stopSpeaking();
    };
  }, [isElectron]);

  // 组件卸载时停止播报
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
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
          {/* 麦克风按钮 - 语音交互 */}
          <button
            onClick={isListening ? stopRecording : startRecording}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
              isListening ? 'bg-green-600 text-white' : 'hover:bg-dark-600'
            }`}
            title={isListening ? '点击停止录音' : '点击开始语音输入'}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-4a6 6 0 01-3.162-5.288m6.162 2.288l5.272 5.272m-5.272-5.272A6 6 0 0112 5z" />
            </svg>
          </button>
          {/* 语音状态指示器 - 录音中 */}
          {isListening && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-green-900/30 rounded">
              <svg className="w-3 h-3 text-green-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m-7.072-7.072l7.072 7.072" />
              </svg>
              <span className="text-[10px] text-green-300">录音中...</span>
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