import React, { useEffect, useRef, useState } from 'react';
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
    addMessage,
    setRecording,
    setPlaying,
    setThinking,
    toggleCollapsed,
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

  // 加载全局配置
  useEffect(() => {
    // 添加错误边界，防止配置加载失败导致崩溃
    try {
      if (window.electronAPI?.getAIConfig) {
        window.electronAPI.getAIConfig().then((config: AIConfig) => {
          console.log('[VoiceAssistantPanel] AI配置:', config);
          setAiEnabled(config?.enabled ?? false);
        }).catch((e) => {
          console.error('[VoiceAssistantPanel] 获取AI配置失败:', e);
          setAiEnabled(true); // 默认显示面板
        });
      } else {
        console.log('[VoiceAssistantPanel] 无getAIConfig API，默认显示面板');
        setAiEnabled(true);
      }

      if (window.electronAPI?.getVoiceConfig) {
        window.electronAPI.getVoiceConfig().then((config: VoiceConfig) => {
          console.log('[VoiceAssistantPanel] 语音配置:', config);
          setVoiceEnabled(config?.enabled ?? false);
        }).catch(() => {
          setVoiceEnabled(true);
        });
      } else {
        setVoiceEnabled(true);
      }
    } catch (e) {
      console.error('[VoiceAssistantPanel] 配置加载失败:', e);
      setAiEnabled(true); // 默认显示面板
      setVoiceEnabled(true);
    }
  }, []);

  // 保存 TTS 设置
  useEffect(() => {
    try {
      localStorage.setItem('voiceAssistantTts', String(ttsEnabled));
    } catch (e) {
      console.error('[VoiceAssistantPanel] 保存TTS设置失败:', e);
    }
  }, [ttsEnabled]);

  // AI 关闭时隐藏整个面板（临时禁用以调试）
  // if (aiEnabled === false) {
  //   return null;
  // }

  console.log('[VoiceAssistantPanel] 渲染面板, aiEnabled:', aiEnabled);

  // 自动滚动到底部
  useEffect(() => {
    if (!isCollapsed && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isCollapsed]);

  // IPC 事件监听
  useEffect(() => {
    const handleVoiceResult = (data: { text: string }) => {
      addMessage('user', data.text);
      setThinking(true);
    };

    const handleVoiceCommand = async (command: any) => {
      if (command.type === 'ai_query') {
        // AI 查询命令的结果由 executeVoiceCommand 返回，这里不需要处理
        return;
      }
      setThinking(false);
      if (command.type === 'session' && command.action === 'create') {
        addMessage('system', '✓ 新会话已创建');
      } else if (command.type === 'session' && command.action === 'kill') {
        addMessage('system', '✓ 会话已关闭');
      } else if (command.type === 'control') {
        addMessage('system', command.content || '命令已执行');
      } else if (command.type === 'query') {
        addMessage('system', command.content || '查询结果');
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
  }, [addMessage, setRecording, setPlaying, setThinking]);

  // 发送文字消息
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
          await window.electronAPI?.speakText?.(result.message);
        }
      } else {
        addMessage('system', result?.message || 'AI 响应失败');
      }
    } catch (err) {
      setThinking(false);
      addMessage('system', '请求失败');
    }
  };

  // 面板内的 STT 录音
  const toggleRecording = async () => {
    if (isPanelRecording) {
      // 停止录音
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
      return;
    }

    // 开始录音
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

        // 发送到后端识别
        setThinking(true);
        try {
          const result = await window.electronAPI?.recognizeAudio?.(buffer);
          if (result) {
            addMessage('user', result);
            // 发送识别结果执行 AI 查询
            const aiResult = await window.electronAPI?.executeVoiceCommand?.({
              type: 'ai_query',
              content: result,
            });
            setThinking(false);
            if (aiResult?.success) {
              addMessage('assistant', aiResult.message || 'AI 无回复');
              if (ttsEnabled && aiResult.message) {
                await window.electronAPI?.speakText?.(aiResult.message);
              }
            } else {
              addMessage('system', aiResult?.message || 'AI 响应失败');
            }
          }
        } catch (err) {
          setThinking(false);
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setIsPanelRecording(true);
      setRecording(true);
      window.electronAPI?.startListening?.();
    } catch (err) {
      console.error('录音失败:', err);
    }
  };

  const hasActivity = isRecording || isPlaying || isThinking;
  const voiceControlsVisible = voiceEnabled !== false;

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

        <span className="text-xs text-dark-300 font-medium flex-1">语音助手</span>

        {/* 控制按钮 */}
        {voiceControlsVisible && !isCollapsed && (
          <div className="flex items-center gap-1 no-drag">
            {/* TTS 开关 */}
            <button
              onClick={(e) => { e.stopPropagation(); setTtsEnabled(!ttsEnabled); }}
              className={`p-1 rounded ${ttsEnabled ? 'text-blue-400' : 'text-dark-500'}`}
              title={ttsEnabled ? '关闭语音回答' : '开启语音回答'}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m-7.072-7.072l7.072 7.072" />
              </svg>
            </button>
            {/* STT 开关 */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleRecording(); }}
              className={`p-1 rounded ${isPanelRecording ? 'text-green-400' : 'text-dark-400'}`}
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
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* 对话区域 + 输入框 */}
      {!isCollapsed && (
        <>
          {/* 对话列表 */}
          <div className="max-h-48 overflow-y-auto px-2 pb-2 space-y-1.5">
            {messages.length === 0 ? (
              <div className="text-center text-dark-500 text-xs py-4">
                暂无对话
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`text-xs px-2 py-1 rounded ${
                    msg.role === 'user'
                      ? 'bg-green-900/20 border-l-2 border-green-500 text-green-300 ml-4 text-right'
                      : msg.role === 'assistant'
                      ? 'bg-blue-900/20 border-l-2 border-blue-500 text-blue-300 mr-4 text-left'
                      : 'text-dark-500 italic text-center text-[10px]'
                  }`}
                  style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
                >
                  {msg.role === 'user' && (
                    <span className="mr-1">🎤</span>
                  )}
                  {msg.role === 'assistant' && (
                    <span className="mr-1">🤖</span>
                  )}
                  {msg.content}
                </div>
              ))
            )}
            {/* Thinking 占位符 */}
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