/**
 * 系统托盘管理器
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, screen, dialog } from 'electron';
import path from 'path';
import type { WindowManager } from './WindowManager';
import type { ProcessManager } from './ProcessManager';
import { configManager } from './ConfigManager';
import { IPC_CHANNELS, APP_CONSTANTS } from './constants';
import { SessionStatus } from '../shared/constants';

let tray: Tray | null = null;

function createTrayIcon() {
  const iconSize = 16;
  const canvas = Buffer.alloc(iconSize * iconSize * 4);
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = (y * iconSize + x) * 4;
      if (dist < 6.5) {
        canvas[offset] = 0x58;
        canvas[offset + 1] = 0xa6;
        canvas[offset + 2] = 0xff;
        canvas[offset + 3] = 255;
      } else if (dist < 7.5) {
        const alpha = Math.floor(255 * (7.5 - dist));
        canvas[offset] = 0x58;
        canvas[offset + 1] = 0xa6;
        canvas[offset + 2] = 0xff;
        canvas[offset + 3] = alpha;
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: iconSize, height: iconSize });
}

export function createTray(
  mainWindow: BrowserWindow,
  windowManager: WindowManager,
  processManager: ProcessManager,
  options: {
    hideToPrimary: boolean;
    minimizeToTrayOnClose: boolean;
    onUpdateMinimizeToTray: (val: boolean) => void;
  }
): Tray {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Claude Code CLI Manager');

  updateTrayMenu(mainWindow, windowManager, processManager, options);

  tray.on('click', () => {
    const isWindowHidden = windowManager.isHidden();
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      if (isWindowHidden) {
        windowManager.restore();
        mainWindow.focus();
      } else {
        mainWindow.hide();
      }
    } else {
      ensureWindowVisible(mainWindow, windowManager);
      mainWindow.show();
      mainWindow.focus();
    }
  });

  tray.on('right-click', () => {
    updateTrayMenu(mainWindow, windowManager, processManager, options);
  });

  return tray;
}

export function updateTrayMenu(
  mainWindow: BrowserWindow,
  windowManager: WindowManager,
  processManager: ProcessManager,
  options: {
    hideToPrimary: boolean;
    minimizeToTrayOnClose: boolean;
    onUpdateMinimizeToTray: (val: boolean) => void;
  }
) {
  if (!tray) return;

  const runningCount = Array.from((processManager as any).sessions.values())
    .filter((s: any) => s.status === SessionStatus.RUNNING).length;

  const isVisible = mainWindow.isVisible() && !mainWindow.isMinimized() && !windowManager.isHidden();
  const openAtLogin = app.getLoginItemSettings().openAtLogin;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? '隐藏窗口' : '显示窗口',
      click: () => {
        if (isVisible) {
          mainWindow.hide();
        } else {
          ensureWindowVisible(mainWindow, windowManager);
          if (windowManager.isHidden()) windowManager.restore();
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
        updateTrayMenu(mainWindow, windowManager, processManager, options);
      },
    },
    {
      label: '新建会话',
      click: () => {
        ensureWindowVisible(mainWindow, windowManager);
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send(IPC_CHANNELS.TRAY_CREATE_SESSION);
      },
    },
    { type: 'separator' },
    {
      label: `运行中会话: ${runningCount}`,
      enabled: false,
    },
    {
      label: '一键贴边隐藏',
      click: () => {
        let targetDisplay: Electron.Display;
        if (options.hideToPrimary) {
          targetDisplay = screen.getPrimaryDisplay();
        } else {
          targetDisplay = getDisplayAtCursor();
        }
        windowManager.hideToEdge('right', targetDisplay);
        updateTrayMenu(mainWindow, windowManager, processManager, options);
      },
    },
    { type: 'separator' },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked, openAsHidden: false });
      },
    },
    {
      label: '关闭时最小化到托盘',
      type: 'checkbox',
      checked: options.minimizeToTrayOnClose,
      click: (menuItem) => {
        options.onUpdateMinimizeToTray(menuItem.checked);
        configManager.set('minimizeToTrayOnClose', menuItem.checked);
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        processManager.cleanup();
        processManager.killAllSessions();
        windowManager.cleanup();
        destroyTray();
        app.exit(0);
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export function getDisplayAtCursor(): Electron.Display {
  const displays = screen.getAllDisplays();
  const cursorPos = screen.getCursorScreenPoint();
  for (const display of displays) {
    const { x, y, width, height } = display.bounds;
    if (cursorPos.x >= x && cursorPos.x < x + width && cursorPos.y >= y && cursorPos.y < y + height) {
      return display;
    }
  }
  return displays[0];
}

export function ensureWindowVisible(mainWindow: BrowserWindow, windowManager?: WindowManager) {
  const bounds = mainWindow.getBounds();
  const displays = screen.getAllDisplays();
  let isVisible = false;
  for (const display of displays) {
    const { x, y, width, height } = display.workArea;
    if (bounds.x + bounds.width > x && bounds.x < x + width &&
        bounds.y + bounds.height > y && bounds.y < y + height &&
        bounds.width > 50 && bounds.height > 50) {
      isVisible = true;
      break;
    }
  }
  if (!isVisible) {
    windowManager?.resetHiddenState();
    const primary = screen.getPrimaryDisplay();
    const { width: sw, height: sh } = primary.workAreaSize;
    mainWindow.setBounds({
      x: primary.workArea.x + Math.floor((sw - APP_CONSTANTS.DEFAULT_WINDOW_WIDTH) / 2),
      y: primary.workArea.y + Math.floor((sh - APP_CONSTANTS.DEFAULT_WINDOW_HEIGHT) / 2),
      width: APP_CONSTANTS.DEFAULT_WINDOW_WIDTH,
      height: APP_CONSTANTS.DEFAULT_WINDOW_HEIGHT,
    });
    mainWindow.show();
    mainWindow.focus();
  }
}
