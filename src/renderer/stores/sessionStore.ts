import { create } from 'zustand';
import { SessionStatus, AlertType, AlertSeverity, AlertNotifyMode, DisplayMode } from '../../shared/constants';

export interface Session {
  id: string;
  name: string;
  workDir: string;
  status: SessionStatus;
  note: string;
  createdAt: Date;
  lastActivity: Date;
  pid?: number;
  args?: string;
}

export interface Alert {
  id: string;
  sessionId: string;
  type: AlertType;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface AlertRule {
  type: AlertType;
  enabled: boolean;
  notifyMode: AlertNotifyMode;
}

export interface AlertConfig {
  rules: AlertRule[];
  silentMode: boolean;
}

export interface OutputChunk {
  sessionId: string;
  data: string;
  timestamp: number;
}

interface SessionStore {
  // 状态
  sessions: Session[];
  expandedSessionId: string | null;
  displayMode: DisplayMode;
  sidebarVisible: boolean;
  alerts: Alert[];
  outputBuffers: Map<string, string[]>;
  alertConfig: AlertConfig;

  // 操作
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  removeSession: (id: string) => void;
  setExpandedSession: (id: string | null) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  toggleSidebar: () => void;
  addAlert: (alert: Omit<Alert, 'id' | 'timestamp' | 'acknowledged'>) => void;
  acknowledgeAlert: (id: string) => void;
  clearAlerts: (sessionId?: string) => void;
  clearAllAlerts: () => void;
  setAlertSilentMode: (silent: boolean) => void;
  updateAlertConfig: (config: Partial<AlertConfig>) => void;
  updateAlertRule: (type: AlertType, updates: Partial<AlertRule>) => void;
  appendOutput: (sessionId: string, data: string) => void;
  clearOutput: (sessionId: string) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  // 初始状态
  sessions: [],
  expandedSessionId: null,
  displayMode: DisplayMode.THUMBNAIL,
  sidebarVisible: true,
  alerts: [],
  outputBuffers: new Map(),
  alertConfig: {
    rules: [
      { type: AlertType.ERROR, enabled: true, notifyMode: AlertNotifyMode.STRONG },
      { type: AlertType.USER_INPUT, enabled: true, notifyMode: AlertNotifyMode.WEAK },
      { type: AlertType.WARNING, enabled: true, notifyMode: AlertNotifyMode.WEAK },
      { type: AlertType.TASK_COMPLETE, enabled: true, notifyMode: AlertNotifyMode.WEAK },
    ],
    silentMode: false,
  },

  // 操作实现
  setSessions: (sessions) => set({ sessions }),

  addSession: (session) => set((state) => ({
    sessions: [...state.sessions, session],
    outputBuffers: new Map(state.outputBuffers).set(session.id, []),
  })),

  updateSession: (id, updates) => set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === id ? { ...s, ...updates } : s
    ),
  })),

  removeSession: (id) => set((state) => {
    const newBuffers = new Map(state.outputBuffers);
    newBuffers.delete(id);
    return {
      sessions: state.sessions.filter((s) => s.id !== id),
      outputBuffers: newBuffers,
      expandedSessionId: state.expandedSessionId === id ? null : state.expandedSessionId,
    };
  }),

  setExpandedSession: (id) => set({ expandedSessionId: id }),

  setDisplayMode: (mode) => set({ displayMode: mode }),

  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  addAlert: (alert) => set((state) => ({
    alerts: [
      ...state.alerts,
      {
        ...alert,
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        acknowledged: false,
      },
    ],
  })),

  acknowledgeAlert: (id) => set((state) => ({
    alerts: state.alerts.map((a) =>
      a.id === id ? { ...a, acknowledged: true } : a
    ),
  })),

  clearAlerts: (sessionId) => set((state) => ({
    alerts: sessionId
      ? state.alerts.filter((a) => a.sessionId !== sessionId)
      : [],
  })),

  clearAllAlerts: () => set({ alerts: [] }),

  setAlertSilentMode: (silent) => set((state) => ({
    alertConfig: { ...state.alertConfig, silentMode: silent },
  })),

  updateAlertConfig: (config) => set((state) => ({
    alertConfig: { ...state.alertConfig, ...config },
  })),

  updateAlertRule: (type, updates) => set((state) => ({
    alertConfig: {
      ...state.alertConfig,
      rules: state.alertConfig.rules.map((r) =>
        r.type === type ? { ...r, ...updates } : r
      ),
    },
  })),

  appendOutput: (sessionId, data) => set((state) => {
    const newBuffers = new Map(state.outputBuffers);
    const current = newBuffers.get(sessionId) || [];
    newBuffers.set(sessionId, [...current, data].slice(-1000));
    return { outputBuffers: newBuffers };
  }),

  clearOutput: (sessionId) => set((state) => {
    const newBuffers = new Map(state.outputBuffers);
    newBuffers.set(sessionId, []);
    return { outputBuffers: newBuffers };
  }),
}));