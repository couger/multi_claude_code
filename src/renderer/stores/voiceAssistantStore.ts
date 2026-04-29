import { create } from 'zustand';

export interface VoiceMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface VoiceAssistantState {
  messages: VoiceMessage[];
  isRecording: boolean;
  isPlaying: boolean;
  isThinking: boolean;
  isCollapsed: boolean;
  conversationMode: boolean;
  conversationActive: boolean;
}

interface VoiceAssistantActions {
  addMessage: (role: VoiceMessage['role'], content: string) => void;
  clearMessages: () => void;
  setRecording: (v: boolean) => void;
  setPlaying: (v: boolean) => void;
  setThinking: (v: boolean) => void;
  setCollapsed: (v: boolean) => void;
  toggleCollapsed: () => void;
  setConversationMode: (v: boolean) => void;
  setConversationActive: (v: boolean) => void;
  loadFromStorage: () => void;
}

const STORAGE_KEY = 'voiceAssistantMessages';
const MAX_MESSAGES = 100;

const initialState: VoiceAssistantState = {
  messages: [],
  isRecording: false,
  isPlaying: false,
  isThinking: false,
  isCollapsed: false,
  conversationMode: false,
  conversationActive: false,
};

let lastMessageKey = '';

export const useVoiceAssistantStore = create<VoiceAssistantState & VoiceAssistantActions>((set, get) => ({
  ...initialState,

  addMessage: (role, content) => {
    const now = Date.now();
    const msgKey = `${role}:${content}:${Math.floor(now / 500)}`;
    if (msgKey === lastMessageKey) return;
    lastMessageKey = msgKey;

    const newMsg: VoiceMessage = {
      id: `msg_${now}_${Math.random().toString(36).slice(2, 8)}`,
      role,
      content,
      timestamp: now,
    };

    set((state) => {
      const messages = [...state.messages, newMsg].slice(-MAX_MESSAGES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      return { messages };
    });
  },

  clearMessages: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ messages: [] });
  },

  setRecording: (v) => set({ isRecording: v }),
  setPlaying: (v) => set({ isPlaying: v }),
  setThinking: (v) => set({ isThinking: v }),
  setCollapsed: (v) => set({ isCollapsed: v }),
  toggleCollapsed: () => set((s) => ({ isCollapsed: !s.isCollapsed })),
  setConversationMode: (v) => set({ conversationMode: v, conversationActive: v ? (get().conversationActive) : false }),
  setConversationActive: (v) => set({ conversationActive: v }),

  loadFromStorage: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const messages = JSON.parse(saved) as VoiceMessage[];
        set({ messages });
      }
    } catch { /* ignore */ }
  },
}));