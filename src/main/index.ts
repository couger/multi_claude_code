/**
 * Claude Code CLI Manager - 主进程入口 (单文件打包版本)
 */

import { app, BrowserWindow, ipcMain, dialog, screen } from 'electron';
import path from 'path';
import { IPC_CHANNELS, SessionStatus } from './constants';
import { ProcessManager } from './ProcessManager';
import { PerformanceMonitor } from './PerformanceMonitor';
import { GroupManager } from './GroupManager';

let mainWindow: any = null;
let processManager: any = null;
let performanceMonitor: any = null;
let groupManager: any = null;
let isWindowHidden = false; // 窗口是否处于隐藏状态（收起状态）
let isManuallyHidden = false; // 手动一键隐藏标志
let windowAutoHideEnabled = true;
let hideDirection = 'right'; // 隐藏方向：'right' | 'left' | 'bottom' | 'top'
let autoHideTimer: any = null; // 自动隐藏定时器
let autoHideDelayTimer: any = null; // 延迟收起定时器
let isWindowRestored = false; // 窗口是否处于滑出状态
let currentHandleSize = 10; // 把手大小（像素）
let isProgrammaticMove = false; // 标记是否为程序控制的窗口移动（防止 move 事件干扰）

// HTTP/WebSocket 服务器相关变量
let httpServer: any = null;
let wss: any = null;
let httpPort = 8888;
let httpAccessToken = '';
let allowedIPs = new Set<string>();
let httpServerEnabled = false; // Web 访问开关（默认关闭）

// WebSocket 客户端追踪
interface WsClientInfo {
  ws: any;
  ip: string;
  connectedAt: Date;
  id: string;
}
let wsClients: Map<string, WsClientInfo> = new Map();

// 滑出时的窗口尺寸（从边缘滑出的大小）
const RESTORE_SIZE = {
  width: 500,  // 滑出时窗口宽度
  height: 600, // 滑出时窗口高度
};

// 将窗口隐藏到屏幕边缘
function hideWindowToEdge(targetDisplay: any, direction: string) {
  if (!mainWindow) return;

  const currentBounds = mainWindow.getBounds();
  // 只在窗口不是隐藏状态时保存原始尺寸
  if (!isWindowHidden) {
    // 保存当前尺寸用于恢复
  }

  isWindowHidden = true;
  isManuallyHidden = true;
  isWindowRestored = false;
  hideDirection = direction;

  let newBounds;

  if (direction === 'right') {
    // 隐藏到右边缘，只留 10px 把手
    newBounds = {
      x: Math.round(targetDisplay.bounds.x + targetDisplay.bounds.width - currentHandleSize),
      y: Math.round(targetDisplay.bounds.y + (targetDisplay.bounds.height - currentBounds.height) / 2),
      width: Math.round(currentHandleSize),
      height: Math.round(currentBounds.height),
    };
  } else if (direction === 'left') {
    // 隐藏到左边缘
    newBounds = {
      x: Math.round(targetDisplay.bounds.x),
      y: Math.round(targetDisplay.bounds.y + (targetDisplay.bounds.height - currentBounds.height) / 2),
      width: Math.round(currentHandleSize),
      height: Math.round(currentBounds.height),
    };
  } else if (direction === 'bottom') {
    // 隐藏到底部边缘
    newBounds = {
      x: Math.round(targetDisplay.bounds.x + (targetDisplay.bounds.width - currentBounds.width) / 2),
      y: Math.round(targetDisplay.bounds.y + targetDisplay.bounds.height - currentHandleSize),
      width: Math.round(currentBounds.width),
      height: Math.round(currentHandleSize),
    };
  } else if (direction === 'top') {
    // 隐藏到顶部边缘
    newBounds = {
      x: Math.round(targetDisplay.bounds.x + (targetDisplay.bounds.width - currentBounds.width) / 2),
      y: Math.round(targetDisplay.bounds.y),
      width: Math.round(currentBounds.width),
      height: Math.round(currentHandleSize),
    };
  }

  if (!newBounds) return; // 安全保护

  isProgrammaticMove = true;
  mainWindow.setBounds(newBounds);
  mainWindow.setResizable(false); // 禁用系统调整大小，让我们处理鼠标事件
  mainWindow.setIgnoreMouseEvents(false); // 确保窗口接收鼠标事件
  mainWindow.setSkipTaskbar(true);
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  isProgrammaticMove = false;
}

// 点击隐藏窗口时恢复（预留函数，暂不使用）
// function restoreWindowOnClick() {
//   if (!mainWindow || !isWindowHidden) return;
//   restoreWindow();
// }

// 恢复窗口到滑出尺寸
function restoreWindow() {
  if (!mainWindow || !isWindowHidden) return;

  // 清除定时器
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  isWindowHidden = false;
  isWindowRestored = true;
  isManuallyHidden = false;
  mainWindow.setSkipTaskbar(false);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setResizable(true); // 恢复时启用调整大小

  // 恢复到滑出尺寸
  const display = require('electron').screen.getDisplayNearestPoint(mainWindow.getBounds());
  const currentBounds = mainWindow.getBounds();
  let restoreBounds;

  if (hideDirection === 'right') {
    restoreBounds = {
      x: Math.round(display.bounds.x + display.bounds.width - RESTORE_SIZE.width - 4),
      y: Math.round(currentBounds.y), // 保持当前 y 位置
      width: Math.round(RESTORE_SIZE.width),
      height: Math.round(currentBounds.height), // 保持当前高度
    };
  } else if (hideDirection === 'left') {
    restoreBounds = {
      x: Math.round(display.bounds.x + 4),
      y: Math.round(currentBounds.y),
      width: Math.round(RESTORE_SIZE.width),
      height: Math.round(currentBounds.height),
    };
  } else if (hideDirection === 'bottom') {
    restoreBounds = {
      x: Math.round(currentBounds.x),
      y: Math.round(display.bounds.y + display.bounds.height - RESTORE_SIZE.height - 4),
      width: Math.round(currentBounds.width),
      height: Math.round(RESTORE_SIZE.height),
    };
  } else if (hideDirection === 'top') {
    restoreBounds = {
      x: Math.round(currentBounds.x),
      y: Math.round(display.bounds.y + 4),
      width: Math.round(currentBounds.width),
      height: Math.round(RESTORE_SIZE.height),
    };
  }

  isProgrammaticMove = true;
  mainWindow.setBounds(restoreBounds);
  isProgrammaticMove = false;
}

// 自动收起窗口
function autoHideWindow() {
  if (!mainWindow || !isWindowRestored) return;

  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  const currentBounds = mainWindow.getBounds();
  const display = require('electron').screen.getDisplayNearestPoint(currentBounds);
  const handleSize = currentHandleSize;

  isWindowHidden = true;
  isWindowRestored = false;
  isManuallyHidden = true;
  mainWindow.setResizable(false);
  mainWindow.setSkipTaskbar(true);
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  let hideBounds;
  if (hideDirection === 'right') {
    hideBounds = {
      x: Math.round(display.bounds.x + display.bounds.width - handleSize),
      y: Math.round(currentBounds.y),
      width: Math.round(handleSize),
      height: Math.round(currentBounds.height),
    };
  } else if (hideDirection === 'left') {
    hideBounds = {
      x: Math.round(display.bounds.x),
      y: Math.round(currentBounds.y),
      width: Math.round(handleSize),
      height: Math.round(currentBounds.height),
    };
  } else if (hideDirection === 'bottom') {
    hideBounds = {
      x: Math.round(currentBounds.x),
      y: Math.round(display.bounds.y + display.bounds.height - handleSize),
      width: Math.round(currentBounds.width),
      height: Math.round(handleSize),
    };
  } else if (hideDirection === 'top') {
    hideBounds = {
      x: Math.round(currentBounds.x),
      y: Math.round(display.bounds.y),
      width: Math.round(currentBounds.width),
      height: Math.round(handleSize),
    };
  }

  isProgrammaticMove = true;
  mainWindow.setBounds(hideBounds);
  isProgrammaticMove = false;
}

// ==================== 窗口贴边自动隐藏 ====================

function setupWindowAutoHide() {
  if (!windowAutoHideEnabled) return;

  const checkInterval = 500; // 每 500ms 检查一次窗口位置
  const edgeThreshold = 10; // 贴边阈值（像素）

  const checkWindowPosition = () => {
    if (!mainWindow) {
      setTimeout(checkWindowPosition, checkInterval);
      return;
    }
    if (mainWindow.isMinimized()) {
      // 窗口最小化时跳过贴边检测
      setTimeout(checkWindowPosition, checkInterval);
      return;
    }
    if (isManuallyHidden || isWindowHidden || isWindowRestored) {
      // 窗口隐藏期间或已滑出状态下保持轮询，不重复触发贴边检测
      setTimeout(checkWindowPosition, checkInterval);
      return;
    }

    const bounds = mainWindow.getBounds();
    const displays = require('electron').screen.getAllDisplays();

    let isAtEdge = false;
    let edgeType: string = 'right';
    let targetDisplay = null;

    for (const display of displays) {
      const { x, y, width, height } = display.bounds;

      // 检测是否贴靠屏幕边缘
      const isAtLeft = Math.abs(bounds.x - x) < edgeThreshold;
      const isAtRight = Math.abs(bounds.x + bounds.width - (x + width)) < edgeThreshold;
      const isAtTop = Math.abs(bounds.y - y) < edgeThreshold;
      const isAtBottom = Math.abs(bounds.y + bounds.height - (y + height)) < edgeThreshold;

      if (isAtLeft || isAtRight || isAtTop || isAtBottom) {
        isAtEdge = true;
        targetDisplay = display;
        if (isAtLeft) edgeType = 'left';
        else if (isAtRight) edgeType = 'right';
        else if (isAtTop) edgeType = 'top';
        else if (isAtBottom) edgeType = 'bottom';
        break;
      }
    }

    // 只有当窗口是正常状态且贴边时才自动隐藏
    if (isAtEdge && bounds.height > 100) {
      hideWindowToEdge(targetDisplay!, edgeType);
    }

    setTimeout(checkWindowPosition, checkInterval);
  };

  // 监听鼠标位置，控制窗口的展开/收起
  const checkMousePosition = () => {
    if (!mainWindow || mainWindow.isMinimized()) return;

    const cursor = require('electron').screen.getCursorScreenPoint();
    const display = require('electron').screen.getDisplayNearestPoint(cursor);

    if (isWindowHidden) {
      // 窗口处于隐藏状态，检测鼠标是否在隐藏窗口区域内或边缘触发区域
      const winBounds = mainWindow.getBounds();
      const triggerArea = 100; // 鼠标触发恢复的区域宽度

      // 检测鼠标是否在隐藏窗口的矩形区域内（包括把手）
      const isMouseOnHandle = cursor.x >= winBounds.x && cursor.x < winBounds.x + winBounds.width &&
                              cursor.y >= winBounds.y && cursor.y < winBounds.y + winBounds.height;

      let shouldRestore = isMouseOnHandle; // 鼠标在把手上时恢复

      // 同时也检测屏幕边缘触发区域
      if (!shouldRestore && hideDirection === 'right') {
        shouldRestore = cursor.x >= display.bounds.x + display.bounds.width - triggerArea;
      } else if (!shouldRestore && hideDirection === 'left') {
        shouldRestore = cursor.x <= display.bounds.x + triggerArea;
      } else if (!shouldRestore && hideDirection === 'bottom') {
        shouldRestore = cursor.y >= display.bounds.y + display.bounds.height - triggerArea;
      } else if (!shouldRestore && hideDirection === 'top') {
        shouldRestore = cursor.y <= display.bounds.y + triggerArea;
      }

      if (shouldRestore) {
        restoreWindow();
      }
    } else if (!isWindowHidden && isWindowRestored) {
      // 窗口处于滑出状态，检测是否应该收起
      const winBounds = mainWindow.getBounds();
      const isMouseInWindow = cursor.x >= winBounds.x && cursor.x < winBounds.x + winBounds.width &&
                               cursor.y >= winBounds.y && cursor.y < winBounds.y + winBounds.height;

      // 检测鼠标是否还在边缘附近
      const display = require('electron').screen.getDisplayNearestPoint(cursor);
      let isMouseNearEdge = false;
      const edgeThreshold = 50;

      if (hideDirection === 'right') {
        isMouseNearEdge = cursor.x >= display.bounds.x + display.bounds.width - edgeThreshold;
      } else if (hideDirection === 'left') {
        isMouseNearEdge = cursor.x <= display.bounds.x + edgeThreshold;
      } else if (hideDirection === 'bottom') {
        isMouseNearEdge = cursor.y >= display.bounds.y + display.bounds.height - edgeThreshold;
      } else if (hideDirection === 'top') {
        isMouseNearEdge = cursor.y <= display.bounds.y + edgeThreshold;
      }

      // 如果鼠标离开了窗口且不在边缘附近，启动延迟收起定时器
      if (!isMouseInWindow && !isMouseNearEdge) {
        if (!autoHideDelayTimer) {
          autoHideDelayTimer = setTimeout(() => {
            // 再次检查鼠标位置，确认是否真的离开了
            const newCursor = require('electron').screen.getCursorScreenPoint();
            const newWinBounds = mainWindow.getBounds();
            const newDisplay = require('electron').screen.getDisplayNearestPoint(newCursor);
            const isMouseStillInWindow = newCursor.x >= newWinBounds.x &&
                                          newCursor.x < newWinBounds.x + newWinBounds.width &&
                                          newCursor.y >= newWinBounds.y &&
                                          newCursor.y < newWinBounds.y + newWinBounds.height;

            // 再次检查是否还在边缘附近
            let isMouseStillNearEdge = false;
            if (hideDirection === 'right') {
              isMouseStillNearEdge = newCursor.x >= newDisplay.bounds.x + newDisplay.bounds.width - edgeThreshold;
            } else if (hideDirection === 'left') {
              isMouseStillNearEdge = newCursor.x <= newDisplay.bounds.x + edgeThreshold;
            } else if (hideDirection === 'bottom') {
              isMouseStillNearEdge = newCursor.y >= newDisplay.bounds.y + newDisplay.bounds.height - edgeThreshold;
            } else if (hideDirection === 'top') {
              isMouseStillNearEdge = newCursor.y <= newDisplay.bounds.y + edgeThreshold;
            }

            if (!isMouseStillInWindow && !isMouseStillNearEdge && isWindowRestored) {
              autoHideWindow();
            }
            autoHideDelayTimer = null;
          }, 1000); // 1 秒延迟
        }
      } else {
        // 鼠标在窗口内或在边缘附近，取消收起定时器
        if (autoHideDelayTimer) {
          clearTimeout(autoHideDelayTimer);
          autoHideDelayTimer = null;
        }
      }
    }

    setTimeout(checkMousePosition, 100);
  };

  checkWindowPosition();
  checkMousePosition();
}

// 导出 sendToRenderer 供 ProcessManager 使用
export function sendToRenderer(channel: string, data: any) {
  mainWindow?.webContents.send(channel, data);
  // 同时广播到 WebSocket 客户端（浏览器远程访问）
  broadcastToWs({ channel, data });
}

// WebSocket 广播
function broadcastToWs(message: any) {
  if (!wss) return;
  const msg = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(msg);
    }
  }
}

// ==================== 主进程入口 ====================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 启用贴边隐藏功能
  setupWindowAutoHide();

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 主窗口关闭前确认（有运行中会话时弹出确认框）
  mainWindow.on('close', (e: any) => {
    if (!processManager) return;
    const runningCount = Array.from((processManager as any).sessions.values())
      .filter((s: any) => s.status === SessionStatus.RUNNING).length;
    if (runningCount > 0) {
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'question',
        title: '确认退出',
        message: `当前有 ${runningCount} 个会话正在运行。`,
        detail: '关闭窗口将终止所有运行中的会话，确定退出吗？',
        buttons: ['取消', '退出'],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice === 0) {
        e.preventDefault();
      }
    }
  });
}

function initIPC() {
  if (!processManager) return;

  ipcMain.handle(IPC_CHANNELS.CREATE_SESSION, async (_: any, options: any) => {
    return processManager.createSession(options);
  });

  ipcMain.handle(IPC_CHANNELS.KILL_SESSION, async (_: any, sessionId: string) => {
    return processManager.killSession(sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, async () => {
    return processManager.getSessions();
  });

  ipcMain.handle(IPC_CHANNELS.GET_SESSION_OUTPUT, async (_: any, sessionId: string) => {
    return processManager.getSessionOutput(sessionId);
  });

  ipcMain.on(IPC_CHANNELS.SEND_INPUT, (_event: any, sessionId: string, data: string) => {
    processManager.sendInput(sessionId, data);
  });

  ipcMain.on(IPC_CHANNELS.RESIZE_SESSION, (_event: any, sessionId: string, cols: number, rows: number) => {
    processManager.resizeSession(sessionId, cols, rows);
  });

  ipcMain.handle(IPC_CHANNELS.SELECT_WORKDIR, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      defaultPath: app.getPath('home'),
    });
    return result.filePaths[0] || null;
  });

  ipcMain.on(IPC_CHANNELS.SET_NOTE, (_event: any, sessionId: string, note: string) => {
    processManager.setNote(sessionId, note);
  });

  // 批量操作处理
  ipcMain.handle(IPC_CHANNELS.BATCH_CREATE_SESSIONS, async (_: any, sessionsConfig: any[]) => {
    const results = [];
    for (const config of sessionsConfig) {
      try {
        const session = await processManager.createSession(config);
        results.push({ success: true, session });
      } catch (error: any) {
        results.push({ success: false, error: error?.message || String(error) });
      }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_KILL_SESSIONS, async (_: any, sessionIds: string[]) => {
    const results = [];
    for (const sessionId of sessionIds) {
      try {
        await processManager.killSession(sessionId);
        results.push({ success: true, sessionId });
      } catch (error: any) {
        results.push({ success: false, sessionId, error: error?.message || String(error) });
      }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_PAUSE_SESSIONS, async (_: any, sessionIds: string[]) => {
    const results: Array<{ success: boolean; sessionId: string; error?: string; session?: any }> = [];
    for (const sessionId of sessionIds) {
      try {
        // 这里需要实现暂停会话的功能
        // 暂时返回占位符
        results.push({ success: false, sessionId, error: '暂停功能未实现' });
      } catch (error: any) {
        results.push({ success: false, sessionId, error: error?.message || String(error) });
      }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_RESUME_SESSIONS, async (_: any, sessionIds: string[]) => {
    const results: Array<{ success: boolean; sessionId: string; error?: string; session?: any }> = [];
    for (const sessionId of sessionIds) {
      try {
        // 这里需要实现恢复会话的功能
        // 暂时返回占位符

        results.push({ success: false, sessionId, error: '恢复功能未实现' });
      } catch (error: any) {
        results.push({ success: false, sessionId, error: error?.message || String(error) });
      }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_EXPORT_LOGS, async (_: any, { sessionIds, format: _format = 'text' }: { sessionIds: string[], format: string }) => {
    const results = [];
    for (const sessionId of sessionIds) {
      try {
        const log = processManager.getSessionOutput(sessionId);
        results.push({ success: true, sessionId, log });
      } catch (error: any) {
        results.push({ success: false, sessionId, error: error?.message || String(error) });
      }
    }
    return results;
  });

  ipcMain.handle(IPC_CHANNELS.BATCH_SET_NOTES, async (_: any, { sessionIds, note }: { sessionIds: string[], note: string }) => {
    const results = [];
    for (const sessionId of sessionIds) {
      try {
        processManager.setNote(sessionId, note);
        results.push({ success: true, sessionId });
      } catch (error: any) {
        results.push({ success: false, sessionId, error: error?.message || String(error) });
      }
    }
    return results;
  });

  // 性能监控处理
  ipcMain.handle(IPC_CHANNELS.GET_SYSTEM_METRICS, async () => {
    if (!performanceMonitor) {
      throw new Error('Performance monitor not initialized');
    }
    return performanceMonitor.getSystemMetrics();
  });

  ipcMain.handle(IPC_CHANNELS.GET_SESSION_METRICS, async () => {
    if (!performanceMonitor) {
      throw new Error('Performance monitor not initialized');
    }
    return performanceMonitor.getSessionMetrics();
  });

  ipcMain.handle(IPC_CHANNELS.START_MONITORING, async (_: any, interval = 5000) => {
    if (!performanceMonitor) {
      throw new Error('Performance monitor not initialized');
    }
    performanceMonitor.startMonitoring(interval);
    return { success: true, message: '性能监控已启动', interval };
  });

  ipcMain.handle(IPC_CHANNELS.STOP_MONITORING, async () => {
    if (!performanceMonitor) {
      throw new Error('Performance monitor not initialized');
    }
    performanceMonitor.stopMonitoring();
    return { success: true, message: '性能监控已停止' };
  });

  // 分组管理处理
  ipcMain.handle(IPC_CHANNELS.CREATE_GROUP, async (_: any, options: any) => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.createGroup(options);
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_GROUP, async (_: any, { groupId, updates }: any) => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.updateGroup(groupId, updates);
  });

  ipcMain.handle(IPC_CHANNELS.DELETE_GROUP, async (_: any, groupId: string) => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.deleteGroup(groupId);
  });

  ipcMain.handle(IPC_CHANNELS.GET_GROUPS, async () => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.getGroups();
  });

  ipcMain.handle(IPC_CHANNELS.ADD_SESSION_TO_GROUP, async (_: any, { groupId, sessionId }: any) => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.addSessionToGroup(groupId, sessionId);
  });

  ipcMain.handle(IPC_CHANNELS.REMOVE_SESSION_FROM_GROUP, async (_: any, { groupId, sessionId }: any) => {
    if (!groupManager) throw new Error('Group manager not initialized');
    return groupManager.removeSessionFromGroup(groupId, sessionId);
  });

  // ========== 远程访问控制 IPC ==========

  // 获取远程访问状态
  ipcMain.handle('remote:getStatus', async () => {
    const net = require('os').networkInterfaces();
    const localIPs: string[] = [];
    for (const name in net) {
      for (const interf of net[name]) {
        if (interf.family === 'IPv4' && !interf.internal) {
          localIPs.push(interf.address);
        }
      }
    }

    // 根据 IP 去重，保留最新的连接
    const uniqueClients = new Map<string, { id: string; ip: string; connectedAt: Date }>();
    for (const client of wsClients.values()) {
      const existing = uniqueClients.get(client.ip);
      if (!existing || client.connectedAt > existing.connectedAt) {
        uniqueClients.set(client.ip, {
          id: client.id,
          ip: client.ip,
          connectedAt: client.connectedAt,
        });
      }
    }

    return {
      enabled: httpServerEnabled,
      running: !!httpServer,
      port: httpPort,
      token: httpAccessToken,
      localIPs,
      clientCount: wsClients.size, // 仍然返回实际连接数
      clients: Array.from(uniqueClients.values()).map(c => ({
        id: c.id,
        ip: c.ip,
        connectedAt: c.connectedAt.toISOString(),
      })),
    };
  });

  // 设置端口
  ipcMain.handle('remote:setPort', async (_: any, newPort: number) => {
    if (typeof newPort !== 'number' || newPort < 1024 || newPort > 65535) {
      return { success: false, error: '端口范围应为 1024-65535' };
    }
    // 检测端口是否可用
    const inUse = await checkPortInUse(newPort);
    if (inUse) {
      return { success: false, error: `端口 ${newPort} 已被占用` };
    }
    const wasRunning = !!httpServer && httpServerEnabled;
    if (httpServer) {
      stopHttpServer();
    }
    httpPort = newPort;
    if (wasRunning) {
      startHttpServer();
    }
    return { success: true, port: httpPort };
  });

  // 检测端口是否可用
  ipcMain.handle('remote:checkPort', async (_: any, port: number) => {
    const inUse = await checkPortInUse(port);
    return { port, inUse };
  });

  // 开关 Web 访问
  ipcMain.handle('remote:toggle', async (_: any, enabled: boolean) => {
    httpServerEnabled = enabled;
    if (enabled && !httpServer) {
      startHttpServer();
    } else if (!enabled && httpServer) {
      stopHttpServer();
    }
    return { success: true, enabled: httpServerEnabled, running: !!httpServer };
  });

  // 刷新令牌
  ipcMain.handle('remote:refreshToken', async () => {
    const crypto = require('crypto');
    httpAccessToken = crypto.randomBytes(16).toString('hex');
    // 持久化
    try {
      const fsModule = require('fs');
      const configDir = path.join(require('os').homedir(), '.claude-code-manager');
      const configFile = path.join(configDir, 'config.json');
      const existingConfig = fsModule.existsSync(configFile)
        ? JSON.parse(fsModule.readFileSync(configFile, 'utf-8')) : {};
      fsModule.writeFileSync(configFile,
        JSON.stringify({ ...existingConfig, accessToken: httpAccessToken }, null, 2));
    } catch { /* ignore */ }
    // 断开所有现有客户端（它们使用旧令牌）
    for (const [clientId, clientInfo] of wsClients) {
      try { clientInfo.ws.close(4003, 'Token refreshed'); } catch { /* ignore */ }
      wsClients.delete(clientId);
    }
    return { success: true, token: httpAccessToken };
  });

  // 断开指定客户端
  ipcMain.handle('remote:kickClient', async (_: any, clientId: string) => {
    const client = wsClients.get(clientId);
    if (client) {
      try { client.ws.close(4002, 'Kicked by admin'); } catch { /* ignore */ }
      wsClients.delete(clientId);
      return { success: true };
    }
    return { success: false, error: 'Client not found' };
  });

  // 断开所有客户端
  ipcMain.handle('remote:kickAll', async () => {
    for (const [_clientId, clientInfo] of wsClients) {
      try { clientInfo.ws.close(4002, 'Kicked by admin'); } catch { /* ignore */ }
    }
    wsClients.clear();
    return { success: true };
  });

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window:close', () => mainWindow?.close());

  // 展开会话时调整窗口大小（避免全屏）
  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (!mainWindow) return;
    
    // 如果窗口已最大化，先取消最大化
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }
    
    // 获取当前屏幕尺寸
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    // 计算新尺寸：屏幕的 80% 或固定值 1400x900，取较小值
    const targetWidth = Math.min(1400, Math.floor(screenWidth * 0.8));
    const targetHeight = Math.min(900, Math.floor(screenHeight * 0.8));
    
    // 计算居中位置
    const x = Math.floor((screenWidth - targetWidth) / 2);
    const y = Math.floor((screenHeight - targetHeight) / 2);
    
    // 保存原始尺寸（如果尚未保存）
    if (!mainWindow.originalBounds) {
      mainWindow.originalBounds = mainWindow.getBounds();
    }
    
    // 设置新尺寸
    mainWindow.setBounds({ x, y, width: targetWidth, height: targetHeight });
  });

  // 收起会话时恢复原始窗口大小
  ipcMain.on(IPC_CHANNELS.WINDOW_UNMAXIMIZE, () => {
    if (!mainWindow) return;
    
    // 如果窗口已最大化，先取消最大化
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }
    
    // 恢复原始尺寸
    if (mainWindow.originalBounds) {
      mainWindow.setBounds(mainWindow.originalBounds);
    } else {
      // 默认恢复为 1200x800
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
      const targetWidth = 1200;
      const targetHeight = 800;
      const x = Math.floor((screenWidth - targetWidth) / 2);
      const y = Math.floor((screenHeight - targetHeight) / 2);
      mainWindow.setBounds({ x, y, width: targetWidth, height: targetHeight });
    }
  });

  // 窗口贴边隐藏切换
  ipcMain.on('window:toggle-auto-hide', () => {
    windowAutoHideEnabled = !windowAutoHideEnabled;
    if (!windowAutoHideEnabled && isWindowHidden) {
      isWindowHidden = false;
      mainWindow.setSkipTaskbar(false);
      mainWindow.setAlwaysOnTop(false);
      // 恢复窗口大小
      mainWindow.setBounds({
        ...mainWindow.getBounds(),
        width: 1200,
        height: 800,
      });
    }
  });

  // 一键贴边隐藏（手动触发）
  ipcMain.on('window:hide-to-edge', () => {
    if (!mainWindow) return;

    const displays = require('electron').screen.getAllDisplays();
    const cursorPos = require('electron').screen.getCursorScreenPoint();

    // 检测鼠标在哪个显示器上
    let targetDisplay = displays[0];
    for (const display of displays) {
      const { x, y, width, height } = display.bounds;
      if (cursorPos.x >= x && cursorPos.x < x + width &&
          cursorPos.y >= y && cursorPos.y < y + height) {
        targetDisplay = display;
        break;
      }
    }

    // 使用统一的隐藏函数
    hideWindowToEdge(targetDisplay, 'right');
  });

  // 恢复窗口
  ipcMain.on('window:restore-window', () => {
    if (!mainWindow || !isWindowHidden) return;

    // 清除定时器
    if (autoHideDelayTimer) {
      clearTimeout(autoHideDelayTimer);
      autoHideDelayTimer = null;
    }

    restoreWindow();
  });

  // 窗口位置变化时自动恢复（从隐藏状态）
  // 注意：仅当用户手动拖动窗口时才恢复，程序控制的移动（贴边/恢复）通过 isProgrammaticMove 标记跳过
  mainWindow?.on('move', () => {
    if (isProgrammaticMove) return; // 跳过程序控制的移动
    if (isWindowHidden) {
      isWindowHidden = false;
      isManuallyHidden = false;
      isWindowRestored = false;
      mainWindow.setSkipTaskbar(false);
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setResizable(true);
    }
  });

  // 窗口点击事件 - 隐藏状态下点击窗口可恢复
  mainWindow?.on('focus', () => {
    if (isWindowHidden) {
      restoreWindow();
    }
  });
}

// ==================== HTTP/WebSocket 服务器 ====================

// 检测端口是否被占用
function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '0.0.0.0');
  });
}

// 辅助函数：收集请求体
function collectBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: any) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

// 辅助函数：代理请求到 Vite 开发服务器
function proxyToVite(req: any, res: any) {
  const http = require('http');
  const viteUrl = new URL(req.url!, `http://localhost:5173`);
  const options = {
    hostname: 'localhost',
    port: 5173,
    path: viteUrl.pathname + viteUrl.search,
    method: req.method,
    headers: { ...req.headers, host: 'localhost:5173' },
  };
  const proxy = http.request(options, (proxyRes: any) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxy.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway - Vite dev server not available');
  });
  req.pipe(proxy);
}

async function startHttpServer() {
  if (httpServer) return;

  const http = require('http');
  const url = require('url');
  const crypto = require('crypto');
  const WebSocket = require('ws');

  // 生成或加载访问令牌（持久化到配置文件）
  const fsModule = require('fs');
  const osModule = require('os');
  const configDir = path.join(osModule.homedir(), '.claude-code-manager');
  const configFile = path.join(configDir, 'config.json');
  try {
    if (!fsModule.existsSync(configDir)) {
      fsModule.mkdirSync(configDir, { recursive: true });
    }
    if (fsModule.existsSync(configFile)) {
      const config = JSON.parse(fsModule.readFileSync(configFile, 'utf-8'));
      if (config.accessToken) {
        httpAccessToken = config.accessToken;
      }
    }
  } catch { /* ignore */ }
  if (!httpAccessToken) {
    httpAccessToken = crypto.randomBytes(16).toString('hex');
  }
  // 保存令牌到配置文件
  try {
    const existingConfig = fsModule.existsSync(configFile)
      ? JSON.parse(fsModule.readFileSync(configFile, 'utf-8')) : {};
    fsModule.writeFileSync(configFile,
      JSON.stringify({ ...existingConfig, accessToken: httpAccessToken }, null, 2));
  } catch { /* ignore */ }

  const server = http.createServer(async (req: any, res: any) => {
    const parsedUrl = url.parse(req.url!, true);
    const clientIP = req.socket.remoteAddress || 'unknown';
    const headers = req.headers;
    const method = req.method;

    // 允许跨域
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // 验证令牌
    const authHeader = headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    const ipAllowed = allowedIPs.has(clientIP);
    // 从查询参数中获取 token
    const queryToken = parsedUrl.query?.token || '';
    const isAuthed = token === httpAccessToken || queryToken === httpAccessToken || ipAllowed;

    // ---- 公开端点 ----

    // 健康检查端点 - 对所有IP开放
    if (pathname === '/api/status') {
      const interfaces = require('os').networkInterfaces();
      const localIPs: string[] = [];
      for (const name in interfaces) {
        for (const net of interfaces[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            localIPs.push(net.address);
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        version: '0.1.0',
        localIPs,
        port: httpPort,
        accessEnabled: true,
        accessToken: httpAccessToken,
        clientIP,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // 如果启用了IP白名单功能，检查客户端IP是否被允许
    // 注意：allowedIPs 应该包含用户选择的IP地址
    if (allowedIPs.size > 0 && !allowedIPs.has(clientIP)) {
      // IP不在白名单中，拒绝访问（除了/login.html和/api/allow-ip等特殊端点）
      if (pathname !== '/login.html' && pathname !== '/api/allow-ip' && pathname !== '/api/remove-ip') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'IP address not allowed' }));
        return;
      }
    }

    // ---- 前端页面代理（浏览器远程访问） ----

    // 根路径和前端资源 - 需要认证
    if (pathname === '/' || pathname === '/index.html') {
      if (!isAuthed) {
        res.writeHead(302, { Location: '/login.html' });
        res.end();
        return;
      }
      proxyToVite(req, res);
      return;
    }

    // 前端静态资源（JS/CSS/等） - 不需要认证
    if (pathname.startsWith('/@') || pathname.startsWith('/src/') ||
        pathname.startsWith('/node_modules/') || pathname.endsWith('.js') ||
        pathname.endsWith('.css') || pathname.endsWith('.map') ||
        pathname.endsWith('.svg') || pathname.endsWith('.png') ||
        pathname.endsWith('.ico') || pathname.endsWith('.woff') ||
        pathname.endsWith('.woff2') || pathname.startsWith('/__')) {
      proxyToVite(req, res);
      return;
    }

    // 登录页面
    if (pathname === '/login.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getLoginPage());
      return;
    }

    // 登录验证
    if (pathname === '/api/login' && method === 'POST') {
      const body = await collectBody(req);
      try {
        const { token: inputToken } = JSON.parse(body);
        if (inputToken === httpAccessToken) {
          allowedIPs.add(clientIP);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid token' }));
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    // ---- 需要认证的 API 端点 ----
    if (!isAuthed) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // 获取会话列表
    if (pathname === '/api/sessions' && method === 'GET') {
      const sessions = processManager.getSessions();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions }));
      return;
    }

    // 创建新会话
    if (pathname === '/api/sessions' && method === 'POST') {
      const body = await collectBody(req);
      try {
        const options = JSON.parse(body);
        const session = await processManager.createSession(options);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ session }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err?.message || 'Failed to create session' }));
      }
      return;
    }

    // 获取会话输出
    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/output')) {
      const sessionId = pathname.split('/')[3];
      const output = processManager.getSessionOutput(sessionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessionId, output }));
      return;
    }

    // 向会话发送输入
    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/input') && method === 'POST') {
      const body = await collectBody(req);
      try {
        const data = JSON.parse(body);
        const sessionId = pathname.split('/')[3];
        processManager.sendInput(sessionId, data.input);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    // 设置会话备注
    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/note') && method === 'POST') {
      const body = await collectBody(req);
      try {
        const { note } = JSON.parse(body);
        const sessionId = pathname.split('/')[3];
        processManager.setNote(sessionId, note);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    // 调整终端大小
    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/resize') && method === 'POST') {
      const body = await collectBody(req);
      try {
        const { cols, rows } = JSON.parse(body);
        const sessionId = pathname.split('/')[3];
        processManager.resizeSession(sessionId, cols, rows);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    // 关闭会话
    if (pathname?.startsWith('/api/sessions/') && pathname.endsWith('/close') && method === 'POST') {
      const sessionId = pathname.split('/')[3];
      try {
        await processManager.killSession(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to close session' }));
      }
      return;
    }

    // 添加 IP 到白名单
    if (pathname === '/api/allow-ip' && method === 'POST') {
      const body = await collectBody(req);
      try {
        const { ip } = JSON.parse(body);
        allowedIPs.add(ip);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ip }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
      }
      return;
    }

    // 移除 IP 从白名单
    if (pathname === '/api/remove-ip' && method === 'DELETE') {
      const { ip } = query;
      if (ip && typeof ip === 'string') {
        allowedIPs.delete(ip);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ip }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'IP not specified' }));
      }
      return;
    }

    // 其他请求代理到 Vite
    proxyToVite(req, res);
  });

  // WebSocket 服务器
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws: any, req: any) => {
    const parsedUrl = url.parse(req.url!, true);
    const token = parsedUrl.query?.token || '';
    const clientIP = req.socket.remoteAddress || 'unknown';

    // 如果启用了IP白名单（allowedIPs不为空），检查客户端IP是否被允许
    if (allowedIPs.size > 0 && !allowedIPs.has(clientIP)) {
      // IP不在白名单中，拒绝连接（即使有有效令牌）
      ws.close(4003, 'IP address not allowed');
      return;
    }
    
    // 检查令牌（如果IP在白名单中或没有启用白名单，需要有效令牌）
    if (token !== httpAccessToken) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    // 生成客户端 ID 并追踪
    const clientId = crypto.randomBytes(8).toString('hex');
    const clientInfo: WsClientInfo = {
      ws,
      ip: clientIP,
      connectedAt: new Date(),
      id: clientId,
    };
    wsClients.set(clientId, clientInfo);

    console.log(`WebSocket client connected from ${clientIP} (id: ${clientId}), total: ${wsClients.size}`);

    // 发送当前所有会话状态
    if (processManager) {
      const sessions = processManager.getSessions();
      ws.send(JSON.stringify({
        channel: 'session:list',
        data: { sessions },
      }));
    }

    ws.on('message', (message: any) => {
      try {
        const msg = JSON.parse(message.toString());
        // 处理来自浏览器的 WebSocket 命令
        handleWsMessage(ws, msg);
      } catch (e) {
        console.error('Invalid WebSocket message:', e);
      }
    });

    ws.on('close', () => {
      wsClients.delete(clientId);
      console.log(`WebSocket client disconnected from ${clientIP} (id: ${clientId}), total: ${wsClients.size}`);
    });
  });

  // 尝试启动服务器
  server.on('error', (err: any) => {
    console.error('HTTP server error:', err);
    if (err.code === 'EADDRINUSE') {
      httpPort = Math.floor(Math.random() * 5000) + 10000;
      setTimeout(() => startHttpServer(), 1000);
    }
  });

  server.listen(httpPort, () => {
    console.log(`HTTP/WebSocket server started on port ${httpPort}`);
    console.log(`Access token: ${httpAccessToken}`);

    const interfaces = require('os').networkInterfaces();
    const localIPs: string[] = [];
    for (const name in interfaces) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          localIPs.push(net.address);
        }
      }
    }

    localIPs.forEach(ip => {
      console.log(`Access via: http://${ip}:${httpPort}`);
    });
  });

  httpServer = server;
}

// 处理来自浏览器的 WebSocket 命令
function handleWsMessage(ws: any, msg: any) {
  const { action, id, data } = msg;
  if (!processManager) return;

  (async () => {
    try {
      let result: any;
      switch (action) {
        case 'session:create':
          result = await processManager.createSession(data || {});
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true, session: result } }));
          break;
        case 'session:kill':
          await processManager.killSession(data.sessionId);
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        case 'session:list':
          result = processManager.getSessions();
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { sessions: result } }));
          break;
        case 'session:output':
          result = processManager.getSessionOutput(data.sessionId);
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { output: result } }));
          break;
        case 'session:input':
          processManager.sendInput(data.sessionId, data.input);
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        case 'session:note':
          processManager.setNote(data.sessionId, data.note);
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        case 'session:resize':
          processManager.resizeSession(data.sessionId, data.cols, data.rows);
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        // 性能监控
        case 'metrics:system':
          result = performanceMonitor ? await performanceMonitor.getSystemMetrics() : {};
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: result }));
          break;
        case 'metrics:session':
          result = performanceMonitor ? await performanceMonitor.getSessionMetrics() : [];
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { metrics: result } }));
          break;
        case 'metrics:start':
          if (performanceMonitor) performanceMonitor.startMonitoring(data?.interval || 5000);
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        case 'metrics:stop':
          if (performanceMonitor) performanceMonitor.stopMonitoring();
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: true } }));
          break;
        // 分组管理
        case 'group:create':
          result = groupManager ? groupManager.createGroup(data) : null;
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { group: result } }));
          break;
        case 'group:update':
          result = groupManager ? groupManager.updateGroup(data.groupId, data.updates) : null;
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { group: result } }));
          break;
        case 'group:delete':
          result = groupManager ? groupManager.deleteGroup(data.groupId) : false;
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: result } }));
          break;
        case 'group:list':
          result = groupManager ? groupManager.getGroups() : [];
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { groups: result } }));
          break;
        case 'group:addSession':
          result = groupManager ? groupManager.addSessionToGroup(data.groupId, data.sessionId) : false;
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: result } }));
          break;
        case 'group:removeSession':
          result = groupManager ? groupManager.removeSessionFromGroup(data.groupId, data.sessionId) : false;
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { success: result } }));
          break;
        default:
          ws.send(JSON.stringify({ channel: 'ws:response', id, data: { error: 'Unknown action' } }));
      }
    } catch (err: any) {
      ws.send(JSON.stringify({ channel: 'ws:response', id, data: { error: err?.message || String(err) } }));
    }
  })();
}

// 登录页面 HTML
function getLoginPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code CLI Manager - 登录</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 40px; width: 400px; max-width: 90vw; }
    h1 { text-align: center; margin-bottom: 8px; font-size: 20px; color: #58a6ff; }
    p { text-align: center; color: #8b949e; margin-bottom: 24px; font-size: 14px; }
    .input-group { margin-bottom: 16px; }
    label { display: block; margin-bottom: 6px; font-size: 13px; color: #8b949e; }
    input { width: 100%; padding: 10px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 14px; outline: none; }
    input:focus { border-color: #58a6ff; }
    button { width: 100%; padding: 10px; background: #58a6ff; color: #0d1117; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #79c0ff; }
    .error { color: #f85149; text-align: center; margin-top: 12px; font-size: 13px; display: none; }
    .info { color: #8b949e; text-align: center; margin-top: 16px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🖥️ Claude Code CLI Manager</h1>
    <p>请输入访问令牌以登录</p>
    <div class="input-group">
      <label for="token">访问令牌</label>
      <input type="text" id="token" placeholder="在此输入令牌..." autofocus />
    </div>
    <button onclick="login()">登 录</button>
    <div class="error" id="error">令牌无效，请重试</div>
    <div class="info">令牌显示在应用启动日志中</div>
  </div>
  <script>
    document.getElementById('token').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
    async function login() {
      const token = document.getElementById('token').value.trim();
      const errEl = document.getElementById('error');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          window.location.href = '/?token=' + encodeURIComponent(token);
        } else {
          errEl.style.display = 'block';
        }
      } catch (e) {
        errEl.textContent = '网络错误';
        errEl.style.display = 'block';
      }
    }
  </script>
</body>
</html>`;
}

function stopHttpServer() {
  if (wss) {
    for (const client of wss.clients) {
      client.close();
    }
    wss.close();
    wss = null;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
  console.log('HTTP/WebSocket server stopped');
}

// ==================== 主进程入口 ====================

// 单实例锁 - 阻止重复启动
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    // 用户尝试启动第二个实例时，聚焦到已有窗口
    if (mainWindow) {
      if (isWindowHidden) {
        restoreWindow();
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

console.log('Electron app object:', app);
console.log('app.whenReady:', app?.whenReady);

if (!app || !app.whenReady) {
  console.error('Electron app object is not properly initialized!');
  process.exit(1);
}

app.whenReady().then(() => {
  console.log('Electron app is ready');
  processManager = new ProcessManager();
  performanceMonitor = new PerformanceMonitor(processManager);
  groupManager = new GroupManager();
  createWindow();
  initIPC();
  
  if (httpServerEnabled) {
    startHttpServer();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (httpServerEnabled) {
        startHttpServer();
      }
    }
  });
});

app.on('before-quit', () => {
  stopHttpServer();
});

app.on('window-all-closed', () => {
  if (processManager) {
    processManager.killAllSessions();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});