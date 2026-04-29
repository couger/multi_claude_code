import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useVoiceAssistantStore } from '../../stores/voiceAssistantStore';

interface VoiceConfig {
  enabled: boolean;
}

interface AIConfig {
  enabled: boolean;
}

const VoiceAssistantPanel: React.FC = () => {
  const {
    messages,
    isRecording,
    isPlaying,
    isThinking,
    isCollapsed,
    conversationMode,
    conversationActive,
    addMessage,
    setRecording,
    setPlaying,
    setThinking,
    toggleCollapsed,
    clearMessages,
    setConversationMode,
    setConversationActive,
  } = useVoiceAssistantStore();

  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('voiceAssistantTts');
      return saved ? saved === 'true' : false;
    } catch {
      return false;
    }
  });
  const [isPanelRecording, setIsPanelRecording] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const ttsEnabledRef = useRef(ttsEnabled);
  ttsEnabledRef.current = ttsEnabled;
  const conversationActiveRef = useRef(conversationActive);
  conversationActiveRef.current = conversationActive;
  const isPanelRecordingRef = useRef(isPanelRecording);
  isPanelRecordingRef.current = isPanelRecording;

  // ==================== 本地 TTS（Web Speech API）====================

  const speakLocal = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.volume = 1.0;

    // 尝试选择中文语音
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith('zh'));
    if (zhVoice) utterance.voice = zhVoice;

    utterance.onstart = () => {
      setPlaying(true);
    };

    utterance.onend = () => {
      setPlaying(false);
      // 连续对话模式：TTS 结束后自动开始监听
      if (conversationActiveRef.current && !isPanelRecordingRef.current) {
        setTimeout(() => {
          startRecording();
        }, 500);
      }
    };

    utterance.onerror = (e) => {
      console.error('[VoicePanel] TTS error:', e.error);
      setPlaying(false);
    };

    window.speechSynthesis.speak(utterance);
  }, [setPlaying]);

  // ==================== 录音逻辑 ====================

  const startRecording = async () => {
    if (isPanelRecordingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const buffer = await blob.arrayBuffer();
        setIsPanelRecording(false);
        setRecording(false);
        window.electronAPI?.stopListening?.();

        if (buffer.byteLength < 1000) {
          // 录音太短，可能是误触，连续模式下重新开始监听
          if (conversationActiveRef.current) {
            setTimeout(() => startRecording(), 800);
          }
          return;
        }

        setThinking(true);
        try {
          const result = await window.electronAPI?.recognizeAudio?.(buffer);
          if (result && result !== '' && !result.startsWith('ERROR:')) {
            addMessage('user', result);
            const aiResult = await window.electronAPI?.executeVoiceCommand?.({
              type: 'ai_query',
              content: result,
            });
            setThinking(false);
            if (aiResult?.success) {
              addMessage('assistant', aiResult.message || 'AI 无回复');
              if (ttsEnabledRef.current && aiResult.message) {
                speakLocal(aiResult.message);
                return; // speakLocal.onend 会重启录音
              }
            } else {
              addMessage('system', aiResult?.message || 'AI 响应失败');
            }
          } else if (result && result.startsWith('ERROR:')) {
            addMessage('system', `⚠️ ${result.slice(6) || '识别失败'}`);
            setThinking(false);
          } else {
            setThinking(false);
          }
        } catch {
          setThinking(false);
          addMessage('system', '⚠️ 识别出错，请重试');
        }

        // 清理流
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }

        // 非 TTS 路径：连续模式下重新开始监听
        if (conversationActiveRef.current && !isPanelRecordingRef.current) {
          setTimeout(() => startRecording(), 800);
        }
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setIsPanelRecording(true);
      setRecording(true);
      window.electronAPI?.startListening?.();
    } catch (err) {
      console.error('录音失败:', err);
      addMessage('system', '⚠️ 麦克风访问失败，请检查权限设置');
      // 连续对话模式下停止，避免静默失败
      if (conversationActiveRef.current) {
        setConversationActive(false);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsPanelRecording(false);
    setRecording(false);
    window.electronAPI?.stopListening?.();
  };

  const toggleRecording = async () => {
    if (isPanelRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  // ==================== 连续对话控制 ====================

  const toggleConversationMode = () => {
    const next = !conversationMode;
    setConversationMode(next);
    if (!next) {
      // 关闭连续对话模式
      setConversationActive(false);
      if (isPanelRecording) stopRecording();
    }
  };

  const startConversation = async () => {
    setConversationActive(true);
    if (!isPanelRecording) {
      await startRecording();
    }
  };

  const stopConversation = () => {
    setConversationActive(false);
    if (isPanelRecording) stopRecording();
    window.speechSynthesis.cancel();
    setPlaying(false);
  };

  // ==================== 文字消息发送 ====================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputRef.current?.value.trim();
    if (!text) return;
    inputRef.current!.value = '';
    addMessage('user', text);
    setThinking(true);

    try {
      const result = await window.electronAPI?.executeVoiceCommand?.({
        type: 'ai_query',
        content: text,
      });
      setThinking(false);
      if (result?.success) {
        addMessage('assistant', result.message || 'AI 无回复');
        if (ttsEnabled && result.message) {
          speakLocal(result.message);
          return; // speakLocal.onend 处理后续
        }
      } else {
        addMessage('system', result?.message || 'AI 响应失败');
      }
      inputRef.current?.focus();
    } catch {
      setThinking(false);
      addMessage('system', '请求失败');
      inputRef.current?.focus();
    }
  };

  // ==================== 配置加载 ====================

  useEffect(() => {
    try {
      const savedAIConfig = localStorage.getItem('aiConfig');
      if (savedAIConfig) {
        try {
          const config = JSON.parse(savedAIConfig);
          setAiEnabled(config?.enabled === true);
        } catch {
          setAiEnabled(true);
        }
      } else {
        if (window.electronAPI?.getAIConfig) {
          window.electronAPI.getAIConfig().then((config: AIConfig) => {
            setAiEnabled(config?.enabled ?? false);
          }).catch(() => {
            setAiEnabled(true);
          });
        } else {
          setAiEnabled(true);
        }
      }

      const savedVoiceConfig = localStorage.getItem('voiceConfig');
      if (savedVoiceConfig) {
        try {
          const config = JSON.parse(savedVoiceConfig);
          setVoiceEnabled(config?.enabled ?? true);
        } catch {
          setVoiceEnabled(true);
        }
      } else {
        if (window.electronAPI?.getVoiceConfig) {
          window.electronAPI.getVoiceConfig().then((config: VoiceConfig) => {
            setVoiceEnabled(config?.enabled ?? false);
          }).catch(() => {
            setVoiceEnabled(true);
          });
        } else {
          setVoiceEnabled(true);
        }
      }
    } catch {
      setAiEnabled(true);
      setVoiceEnabled(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('voiceAssistantTts', String(ttsEnabled));
  }, [ttsEnabled]);

  // 自动滚动
  useEffect(() => {
    if (!isCollapsed && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isCollapsed]);

  // ==================== IPC 事件监听 ====================

  useEffect(() => {
    const handleVoiceResult = (data: { text: string }) => {
      addMessage('user', data.text);
      setThinking(true);
    };

    const handleVoiceCommand = async (command: any) => {
      if (command.type === 'ai_query') return;
      setThinking(false);

      let message = '';
      if (command.type === 'session' && command.action === 'create') {
        message = '新会话已创建';
        addMessage('system', `✓ ${message}`);
      } else if (command.type === 'session' && command.action === 'kill') {
        message = '会话已关闭';
        addMessage('system', `✓ ${message}`);
      } else if (command.type === 'control') {
        message = command.content || '命令已执行';
        addMessage('system', message);
      } else if (command.type === 'query') {
        message = command.content || '查询结果';
        addMessage('system', message);
      }

      if (message && ttsEnabledRef.current) {
        speakLocal(message);
      }
    };

    const handleVoiceSpeak = (data: any) => {
      if (data.action === 'stop') {
        setPlaying(false);
        return;
      }
      if (data.text) {
        addMessage('assistant', data.text);
        setThinking(false);
        setPlaying(true);
      }
    };

    const handleStartListening = () => setRecording(true);
    const handleStopListening = () => setRecording(false);

    window.electronAPI?.onVoiceResult?.(handleVoiceResult);
    window.electronAPI?.onVoiceCommand?.(handleVoiceCommand);
    window.electronAPI?.onVoiceSpeak?.(handleVoiceSpeak);
    window.electronAPI?.onVoiceStartListening?.(handleStartListening);
    window.electronAPI?.onVoiceStopListening?.(handleStopListening);

    return () => {
      window.electronAPI?.removeListener?.('voice:result', handleVoiceResult);
      window.electronAPI?.removeListener?.('voice:command', handleVoiceCommand);
      window.electronAPI?.removeListener?.('voice:speak', handleVoiceSpeak);
      window.electronAPI?.removeListener?.('voice:startListening', handleStartListening);
      window.electronAPI?.removeListener?.('voice:stopListening', handleStopListening);
    };
  }, [addMessage, setRecording, setPlaying, setThinking, speakLocal]);

  // 清理：面板卸载时停止录音
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // ==================== 渲染 ====================

  const hasActivity = isRecording || isPlaying || isThinking;
  const voiceControlsVisible = voiceEnabled !== false;
  const stateLabel = isRecording ? '聆听中...' : isThinking ? '思考中...' : isPlaying ? '播报中...' : conversationActive ? '等待开始...' : '';

  return (
    <div
      className={`border-b border-dark-700 transition-all duration-200 ${
        isRecording ? 'pulse-green' : isPlaying ? 'pulse-blue' : ''
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-dark-800/50"
        onClick={toggleCollapsed}
      >
        {/* 状态指示灯 */}
        <div className="flex items-center gap-1">
          {isRecording && (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
          {isPlaying && (
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          )}
          {isThinking && (
            <span className="flex gap-0.5">
              <span className="thinking-dot text-yellow-400" />
              <span className="thinking-dot text-yellow-400" />
              <span className="thinking-dot text-yellow-400" />
            </span>
          )}
          {!hasActivity && (
            <svg className="w-4 h-4 text-dark-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-4a6 6 0 01-3.162-5.288m6.162 2.288l5.272 5.272m-5.272-5.272A6 6 0 0112 5z" />
            </svg>
          )}
        </div>

        <span className="text-xs text-dark-300 font-medium flex-1">
          语音助手
          {conversationActive && (
            <span className="ml-1 text-green-400 text-[10px]">● 连续对话</span>
          )}
        </span>

        {/* 清理历史按钮 */}
        {messages.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); clearMessages(); }}
            className="p-1 rounded text-dark-500 hover:text-dark-300 hover:bg-dark-800"
            title="清理对话历史"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}

        {/* 控制按钮 */}
        {voiceControlsVisible && !isCollapsed && (
          <div className="flex items-center gap-1 no-drag">
            {/* 连续对话模式开关 */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleConversationMode(); }}
              className={`p-1 rounded transition-colors ${
                conversationMode ? 'text-cyan-400 bg-cyan-900/30' : 'text-dark-500 hover:text-dark-300'
              }`}
              title={conversationMode ? '连续对话：开（点击关闭）' : '连续对话：关（点击开启）'}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
            {/* TTS 开关 */}
            <button
              onClick={(e) => { e.stopPropagation(); setTtsEnabled(!ttsEnabled); }}
              className={`p-1 rounded transition-colors ${ttsEnabled ? 'text-green-400 bg-green-900/30' : 'text-dark-500 hover:text-dark-300'}`}
              title={ttsEnabled ? '语音输出：开（点击关闭）' : '语音输出：关（点击开启）'}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m-7.072-7.072l7.072 7.072" />
              </svg>
            </button>
            {/* STT 录音按钮 */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleRecording(); }}
              className={`p-1 rounded transition-colors ${isPanelRecording ? 'text-red-400 bg-red-900/30' : 'text-dark-400 hover:text-dark-200'}`}
              title={isPanelRecording ? '停止录音' : '开始录音'}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-4a6 6 0 01-3.162-5.288m6.162 2.288l5.272 5.272m-5.272-5.272A6 6 0 0112 5z" />
              </svg>
            </button>
          </div>
        )}

        <svg
          className={`w-3 h-3 text-dark-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* 对话区域 */}
      {!isCollapsed && (
        <>
          {/* 连续对话控制栏 */}
          {conversationMode && (
            <div className="px-2 pb-1">
              <div className="flex items-center gap-2 bg-dark-800 rounded px-2 py-1">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  conversationActive ? 'bg-green-500 animate-pulse' : 'bg-dark-500'
                }`} />
                <span className="text-[10px] text-dark-300 flex-1">
                  {stateLabel || '连续对话待机'}
                </span>
                {!conversationActive ? (
                  <button
                    onClick={startConversation}
                    className="px-2 py-0.5 bg-green-700 text-white rounded text-[10px] hover:bg-green-600"
                  >
                    开始
                  </button>
                ) : (
                  <button
                    onClick={stopConversation}
                    className="px-2 py-0.5 bg-red-700 text-white rounded text-[10px] hover:bg-red-600"
                  >
                    结束
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 对话列表 */}
          <div className="max-h-48 overflow-y-auto px-2 pb-2 space-y-1.5">
            {messages.length === 0 ? (
              <div className="text-center text-dark-500 text-xs py-4">
                {conversationMode ? '点击「开始」发起对话' : '点击麦克风按钮开始语音输入'}
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`text-xs px-2 py-1 rounded ${
                    msg.role === 'user'
                      ? 'bg-green-900/20 border-l-2 border-green-500 text-green-300 ml-4'
                      : msg.role === 'assistant'
                      ? 'bg-blue-900/20 border-l-2 border-blue-500 text-blue-300 mr-4'
                      : 'text-dark-500 italic text-center text-[10px]'
                  }`}
                >
                  {msg.role === 'user' && <span className="mr-1">{'🎤'}</span>}
                  {msg.role === 'assistant' && <span className="mr-1">{'🤖'}</span>}
                  {msg.content}
                </div>
              ))
            )}
            {isThinking && (
              <div className="flex items-center gap-1 text-dark-400 text-xs px-2">
                <span className="thinking-dot text-yellow-400" />
                <span className="thinking-dot text-yellow-400" />
                <span className="thinking-dot text-yellow-400" />
                <span className="ml-1">正在思考...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 文字输入框 */}
          <form onSubmit={handleSubmit} className="flex gap-1 px-2 pb-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="输入消息..."
              className="flex-1 px-2 py-1 bg-dark-900 border border-dark-600 rounded text-xs text-dark-100 placeholder-dark-500 focus:border-accent-primary focus:outline-none"
            />
            <button
              type="submit"
              className="px-2 py-1 bg-accent-primary text-white rounded text-xs hover:opacity-90"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default VoiceAssistantPanel;
