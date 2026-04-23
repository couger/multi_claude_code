/**
 * 通知管理器 - 桌面通知 + 提示音
 */

import { Notification, nativeImage, NativeImage } from 'electron';
import { AlertType, AlertSeverity } from '../shared/constants';
import { configManager } from './ConfigManager';

interface NotificationConfig {
  soundEnabled: boolean;
  notificationEnabled: boolean;
}

const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  soundEnabled: true,
  notificationEnabled: true,
};

class NotificationManager {
  private config: NotificationConfig;
  private lastNotificationTime: Map<string, number> = new Map();
  private cooldownMs = 5000; // 同一会话通知冷却时间

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): NotificationConfig {
    const saved = configManager.get('notificationConfig');
    return saved ? { ...DEFAULT_NOTIFICATION_CONFIG, ...saved } : DEFAULT_NOTIFICATION_CONFIG;
  }

  private saveConfig(): void {
    configManager.set('notificationConfig', this.config);
  }

  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();
  }

  getConfig(): NotificationConfig {
    return { ...this.config };
  }

  notify(sessionId: string, type: AlertType, message: string): void {
    const now = Date.now();
    const lastTime = this.lastNotificationTime.get(sessionId) || 0;
    if (now - lastTime < this.cooldownMs) return;
    this.lastNotificationTime.set(sessionId, now);

    if (this.config.notificationEnabled) {
      this.showDesktopNotification(type, message);
    }

    if (this.config.soundEnabled) {
      this.playAlertSound(type);
    }
  }

  private showDesktopNotification(type: AlertType, message: string): void {
    const severity = this.getSeverity(type);
    const title = this.getTitle(type);

    try {
      const notification = new Notification({
        title,
        body: message,
        icon: this.createNotificationIcon(severity),
        silent: !this.config.soundEnabled,
      });

      notification.show();
    } catch (e) {
      console.error('[NotificationManager] 显示通知失败:', e);
    }
  }

  private getSeverity(type: AlertType): AlertSeverity {
    switch (type) {
      case AlertType.ERROR:
        return AlertSeverity.ERROR;
      case AlertType.WARNING:
        return AlertSeverity.WARNING;
      case AlertType.USER_INPUT:
        return AlertSeverity.WARNING;
      case AlertType.TASK_COMPLETE:
        return AlertSeverity.INFO;
      default:
        return AlertSeverity.INFO;
    }
  }

  private getTitle(type: AlertType): string {
    switch (type) {
      case AlertType.ERROR:
        return '❌ 错误';
      case AlertType.WARNING:
        return '⚠️ 警告';
      case AlertType.USER_INPUT:
        return '⏳ 需要输入';
      case AlertType.TASK_COMPLETE:
        return '✅ 任务完成';
      default:
        return '通知';
    }
  }

  private createNotificationIcon(severity: AlertSeverity): NativeImage | undefined {
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);

    let r: number, g: number, b: number;
    switch (severity) {
      case AlertSeverity.ERROR:
        r = 239; g = 68; b = 68; // 红色
        break;
      case AlertSeverity.WARNING:
        r = 234; g = 179; b = 8; // 黄色
        break;
      case AlertSeverity.INFO:
        r = 34; g = 197; b = 94; // 绿色
        break;
      default:
        r = 148; g = 163; b = 184; // 灰色
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - 7.5;
        const dy = y - 7.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const offset = (y * size + x) * 4;
        if (dist < 7) {
          canvas[offset] = r;
          canvas[offset + 1] = g;
          canvas[offset + 2] = b;
          canvas[offset + 3] = 255;
        }
      }
    }

    try {
      return nativeImage.createFromBuffer(canvas, { width: size, height: size });
    } catch {
      return undefined;
    }
  }

  private playAlertSound(type: AlertType): void {
    // 使用系统默认提示音
    try {
      if (Notification.isSupported()) {
        // 静默发送通知，只为触发声音
        const notification = new Notification({ silent: false });
        notification.show();
      }
    } catch (e) {
      console.error('[NotificationManager] 播放提示音失败:', e);
    }
  }
}

export const notificationManager = new NotificationManager();