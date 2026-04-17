/**
 * 窗口管理器 - 处理窗口贴边隐藏、自动恢复等功能
 */

import { BrowserWindow, screen } from 'electron';

/**
 * 窗口隐藏方向
 */
export type HideDirection = 'right' | 'left' | 'bottom' | 'top';

/**
 * 窗口管理器状态
 */
export interface WindowManagerState {
  isWindowHidden: boolean;
  isManuallyHidden: boolean;
  isWindowRestored: boolean;
  windowAutoHideEnabled: boolean;
  hideDirection: HideDirection;
  currentHandleSize: number;
  isProgrammaticMove: boolean;
}

/**
 * 窗口管理器配置
 */
export interface WindowManagerConfig {
  restoreWidth?: number;
  restoreHeight?: number;
  handleSize?: number;
  edgeThreshold?: number;
  autoHideDelayMs?: number;
}

/**
 * 窗口管理器
 */
export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private autoHideTimer: ReturnType<typeof setTimeout> | null = null;
  private autoHideDelayTimer: ReturnType<typeof setTimeout> | null = null;

  // 状态变量
  private state: WindowManagerState = {
    isWindowHidden: false,
    isManuallyHidden: false,
    isWindowRestored: false,
    windowAutoHideEnabled: true,
    hideDirection: 'right',
    currentHandleSize: 10,
    isProgrammaticMove: false,
  };

  // 配置
  private config: Required<WindowManagerConfig> = {
    restoreWidth: 500,
    restoreHeight: 600,
    handleSize: 10,
    edgeThreshold: 10,
    autoHideDelayMs: 1000,
  };

  constructor(mainWindow: BrowserWindow, config?: WindowManagerConfig) {
    this.mainWindow = mainWindow;
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.state.currentHandleSize = this.config.handleSize;
  }

  /**
   * 获取当前状态
   */
  getState(): WindowManagerState {
    return { ...this.state };
  }

  /**
   * 设置窗口自动隐藏功能开关
   */
  setAutoHideEnabled(enabled: boolean): void {
    this.state.windowAutoHideEnabled = enabled;
  }

  /**
   * 切换窗口自动隐藏功能
   */
  toggleAutoHide(): void {
    this.state.windowAutoHideEnabled = !this.state.windowAutoHideEnabled;
  }

  /**
   * 将窗口隐藏到屏幕边缘
   */
  hideToEdge(direction: HideDirection = 'right'): void {
    if (!this.mainWindow) return;

    const currentBounds = this.mainWindow.getBounds();
    const targetDisplay = screen.getDisplayNearestPoint(this.mainWindow.getBounds());

    this.state.isWindowHidden = true;
    this.state.isManuallyHidden = true;
    this.state.isWindowRestored = false;
    this.state.hideDirection = direction;

    let newBounds;
    const handleSize = this.config.handleSize;

    if (direction === 'right') {
      // 隐藏到右边缘，只留把手大小
      newBounds = {
        x: Math.round(targetDisplay.bounds.x + targetDisplay.bounds.width - handleSize),
        y: Math.round(targetDisplay.bounds.y + (targetDisplay.bounds.height - currentBounds.height) / 2),
        width: Math.round(handleSize),
        height: Math.round(currentBounds.height),
      };
    } else if (direction === 'left') {
      // 隐藏到左边缘
      newBounds = {
        x: Math.round(targetDisplay.bounds.x),
        y: Math.round(targetDisplay.bounds.y + (targetDisplay.bounds.height - currentBounds.height) / 2),
        width: Math.round(handleSize),
        height: Math.round(currentBounds.height),
      };
    } else if (direction === 'bottom') {
      // 隐藏到底部边缘
      newBounds = {
        x: Math.round(targetDisplay.bounds.x + (targetDisplay.bounds.width - currentBounds.width) / 2),
        y: Math.round(targetDisplay.bounds.y + targetDisplay.bounds.height - handleSize),
        width: Math.round(currentBounds.width),
        height: Math.round(handleSize),
      };
    } else if (direction === 'top') {
      // 隐藏到顶部边缘
      newBounds = {
        x: Math.round(targetDisplay.bounds.x + (targetDisplay.bounds.width - currentBounds.width) / 2),
        y: Math.round(targetDisplay.bounds.y),
        width: Math.round(currentBounds.width),
        height: Math.round(handleSize),
      };
    }

    if (!newBounds) return; // 安全保护

    this.state.isProgrammaticMove = true;
    this.mainWindow.setBounds(newBounds);
    this.mainWindow.setResizable(false); // 禁用系统调整大小，让我们处理鼠标事件
    this.mainWindow.setIgnoreMouseEvents(false); // 确保窗口接收鼠标事件
    this.mainWindow.setSkipTaskbar(true);
    this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
    this.state.isProgrammaticMove = false;
  }

  /**
   * 恢复窗口到滑出尺寸
   */
  restore(): void {
    if (!this.mainWindow || !this.state.isWindowHidden) return;

    // 清除定时器
    this.clearTimers();

    this.state.isWindowHidden = false;
    this.state.isWindowRestored = true;
    this.state.isManuallyHidden = false;
    this.mainWindow.setSkipTaskbar(false);
    this.mainWindow.setAlwaysOnTop(false);
    this.mainWindow.setResizable(true); // 恢复时启用调整大小

    // 恢复到滑出尺寸
    const display = screen.getDisplayNearestPoint(this.mainWindow.getBounds());
    const currentBounds = this.mainWindow.getBounds();
    let restoreBounds;

    if (this.state.hideDirection === 'right') {
      restoreBounds = {
        x: Math.round(display.bounds.x + display.bounds.width - this.config.restoreWidth - 4),
        y: Math.round(currentBounds.y), // 保持当前 y 位置
        width: Math.round(this.config.restoreWidth),
        height: Math.round(currentBounds.height), // 保持当前高度
      };
    } else if (this.state.hideDirection === 'left') {
      restoreBounds = {
        x: Math.round(display.bounds.x + 4),
        y: Math.round(currentBounds.y),
        width: Math.round(this.config.restoreWidth),
        height: Math.round(currentBounds.height),
      };
    } else if (this.state.hideDirection === 'bottom') {
      restoreBounds = {
        x: Math.round(currentBounds.x),
        y: Math.round(display.bounds.y + display.bounds.height - this.config.restoreHeight - 4),
        width: Math.round(currentBounds.width),
        height: Math.round(this.config.restoreHeight),
      };
    } else if (this.state.hideDirection === 'top') {
      restoreBounds = {
        x: Math.round(currentBounds.x),
        y: Math.round(display.bounds.y + 4),
        width: Math.round(currentBounds.width),
        height: Math.round(this.config.restoreHeight),
      };
    }

    this.state.isProgrammaticMove = true;
    this.mainWindow.setBounds(restoreBounds!);
    this.state.isProgrammaticMove = false;
  }

  /**
   * 自动收起窗口
   */
  private autoHide(): void {
    if (!this.mainWindow || !this.state.isWindowRestored) return;

    this.clearTimers();

    const currentBounds = this.mainWindow.getBounds();
    const display = screen.getDisplayNearestPoint(currentBounds);
    const handleSize = this.config.handleSize;

    this.state.isWindowHidden = true;
    this.state.isWindowRestored = false;
    this.state.isManuallyHidden = true;
    this.mainWindow.setResizable(false);
    this.mainWindow.setSkipTaskbar(true);
    this.mainWindow.setAlwaysOnTop(true, 'screen-saver');

    let hideBounds;
    if (this.state.hideDirection === 'right') {
      hideBounds = {
        x: Math.round(display.bounds.x + display.bounds.width - handleSize),
        y: Math.round(currentBounds.y),
        width: Math.round(handleSize),
        height: Math.round(currentBounds.height),
      };
    } else if (this.state.hideDirection === 'left') {
      hideBounds = {
        x: Math.round(display.bounds.x),
        y: Math.round(currentBounds.y),
        width: Math.round(handleSize),
        height: Math.round(currentBounds.height),
      };
    } else if (this.state.hideDirection === 'bottom') {
      hideBounds = {
        x: Math.round(currentBounds.x),
        y: Math.round(display.bounds.y + display.bounds.height - handleSize),
        width: Math.round(currentBounds.width),
        height: Math.round(handleSize),
      };
    } else if (this.state.hideDirection === 'top') {
      hideBounds = {
        x: Math.round(currentBounds.x),
        y: Math.round(display.bounds.y),
        width: Math.round(currentBounds.width),
        height: Math.round(handleSize),
      };
    }

    this.state.isProgrammaticMove = true;
    this.mainWindow.setBounds(hideBounds!);
    this.state.isProgrammaticMove = false;
  }

  /**
   * 设置窗口贴边自动隐藏功能
   */
  setupAutoHide(): void {
    if (!this.state.windowAutoHideEnabled) return;

    const checkInterval = 500; // 每 500ms 检查一次窗口位置
    const edgeThreshold = this.config.edgeThreshold;

    const checkWindowPosition = () => {
      if (!this.mainWindow) {
        setTimeout(checkWindowPosition, checkInterval);
        return;
      }
      if (this.mainWindow.isMinimized()) {
        // 窗口最小化时跳过贴边检测
        setTimeout(checkWindowPosition, checkInterval);
        return;
      }
      if (this.state.isManuallyHidden || this.state.isWindowHidden || this.state.isWindowRestored) {
        // 窗口隐藏期间或已滑出状态下保持轮询，不重复触发贴边检测
        setTimeout(checkWindowPosition, checkInterval);
        return;
      }

      const bounds = this.mainWindow.getBounds();
      const displays = screen.getAllDisplays();

      let isAtEdge = false;
      let edgeType: HideDirection = 'right';

      for (const display of displays) {
        const { x, y, width, height } = display.bounds;

        // 检测是否贴靠屏幕边缘
        const isAtLeft = Math.abs(bounds.x - x) < edgeThreshold;
        const isAtRight = Math.abs(bounds.x + bounds.width - (x + width)) < edgeThreshold;
        const isAtTop = Math.abs(bounds.y - y) < edgeThreshold;
        const isAtBottom = Math.abs(bounds.y + bounds.height - (y + height)) < edgeThreshold;

        if (isAtLeft || isAtRight || isAtTop || isAtBottom) {
          isAtEdge = true;
          if (isAtLeft) edgeType = 'left';
          else if (isAtRight) edgeType = 'right';
          else if (isAtTop) edgeType = 'top';
          else if (isAtBottom) edgeType = 'bottom';
          break;
        }
      }

      // 只有当窗口是正常状态且贴边时才自动隐藏
      if (isAtEdge && bounds.height > 100) {
        this.hideToEdge(edgeType);
      }

      setTimeout(checkWindowPosition, checkInterval);
    };

    // 监听鼠标位置，控制窗口的展开/收起
    const checkMousePosition = () => {
      if (!this.mainWindow || this.mainWindow.isMinimized()) return;

      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);

      if (this.state.isWindowHidden) {
        // 窗口处于隐藏状态，检测鼠标是否在隐藏窗口区域内或边缘触发区域
        const winBounds = this.mainWindow.getBounds();
        const triggerArea = 100; // 鼠标触发恢复的区域宽度

        // 检测鼠标是否在隐藏窗口的矩形区域内（包括把手）
        const isMouseOnHandle = cursor.x >= winBounds.x && cursor.x < winBounds.x + winBounds.width &&
                                cursor.y >= winBounds.y && cursor.y < winBounds.y + winBounds.height;

        let shouldRestore = isMouseOnHandle; // 鼠标在把手上时恢复

        // 同时也检测屏幕边缘触发区域
        if (!shouldRestore && this.state.hideDirection === 'right') {
          shouldRestore = cursor.x >= display.bounds.x + display.bounds.width - triggerArea;
        } else if (!shouldRestore && this.state.hideDirection === 'left') {
          shouldRestore = cursor.x <= display.bounds.x + triggerArea;
        } else if (!shouldRestore && this.state.hideDirection === 'bottom') {
          shouldRestore = cursor.y >= display.bounds.y + display.bounds.height - triggerArea;
        } else if (!shouldRestore && this.state.hideDirection === 'top') {
          shouldRestore = cursor.y <= display.bounds.y + triggerArea;
        }

        if (shouldRestore) {
          this.restore();
        }
      } else if (!this.state.isWindowHidden && this.state.isWindowRestored) {
        // 窗口处于滑出状态，检测是否应该收起
        const winBounds = this.mainWindow.getBounds();
        const isMouseInWindow = cursor.x >= winBounds.x && cursor.x < winBounds.x + winBounds.width &&
                                 cursor.y >= winBounds.y && cursor.y < winBounds.y + winBounds.height;

        // 检测鼠标是否还在边缘附近
        const display = screen.getDisplayNearestPoint(cursor);
        let isMouseNearEdge = false;
        const edgeThreshold = 50;

        if (this.state.hideDirection === 'right') {
          isMouseNearEdge = cursor.x >= display.bounds.x + display.bounds.width - edgeThreshold;
        } else if (this.state.hideDirection === 'left') {
          isMouseNearEdge = cursor.x <= display.bounds.x + edgeThreshold;
        } else if (this.state.hideDirection === 'bottom') {
          isMouseNearEdge = cursor.y >= display.bounds.y + display.bounds.height - edgeThreshold;
        } else if (this.state.hideDirection === 'top') {
          isMouseNearEdge = cursor.y <= display.bounds.y + edgeThreshold;
        }

        // 如果鼠标离开了窗口且不在边缘附近，启动延迟收起定时器
        if (!isMouseInWindow && !isMouseNearEdge) {
          if (!this.autoHideDelayTimer) {
            this.autoHideDelayTimer = setTimeout(() => {
              // 再次检查鼠标位置，确认是否真的离开了
              const newCursor = screen.getCursorScreenPoint();
              const newWinBounds = this.mainWindow!.getBounds();
              const newDisplay = screen.getDisplayNearestPoint(newCursor);
              const isMouseStillInWindow = newCursor.x >= newWinBounds.x &&
                                            newCursor.x < newWinBounds.x + newWinBounds.width &&
                                            newCursor.y >= newWinBounds.y &&
                                            newCursor.y < newWinBounds.y + newWinBounds.height;

              // 再次检查是否还在边缘附近
              let isMouseStillNearEdge = false;
              if (this.state.hideDirection === 'right') {
                isMouseStillNearEdge = newCursor.x >= newDisplay.bounds.x + newDisplay.bounds.width - edgeThreshold;
              } else if (this.state.hideDirection === 'left') {
                isMouseStillNearEdge = newCursor.x <= newDisplay.bounds.x + edgeThreshold;
              } else if (this.state.hideDirection === 'bottom') {
                isMouseStillNearEdge = newCursor.y >= newDisplay.bounds.y + newDisplay.bounds.height - edgeThreshold;
              } else if (this.state.hideDirection === 'top') {
                isMouseStillNearEdge = newCursor.y <= newDisplay.bounds.y + edgeThreshold;
              }

              if (!isMouseStillInWindow && !isMouseStillNearEdge && this.state.isWindowRestored) {
                this.autoHide();
              }
              this.autoHideDelayTimer = null;
            }, this.config.autoHideDelayMs);
          }
        } else {
          // 鼠标在窗口内或在边缘附近，取消收起定时器
          if (this.autoHideDelayTimer) {
            clearTimeout(this.autoHideDelayTimer);
            this.autoHideDelayTimer = null;
          }
        }
      }

      setTimeout(checkMousePosition, 100);
    };

    checkWindowPosition();
    checkMousePosition();
  }

  /**
   * 处理窗口移动事件
   */
  handleWindowMove(): void {
    if (this.state.isProgrammaticMove) return; // 跳过程序控制的移动
    if (this.state.isWindowHidden) {
      this.state.isWindowHidden = false;
      this.state.isManuallyHidden = false;
      this.state.isWindowRestored = false;
      if (this.mainWindow) {
        this.mainWindow.setSkipTaskbar(false);
        this.mainWindow.setAlwaysOnTop(false);
        this.mainWindow.setResizable(true);
      }
    }
  }

  /**
   * 处理窗口获得焦点事件
   */
  handleWindowFocus(): void {
    if (this.state.isWindowHidden) {
      this.restore();
    }
  }

  /**
   * 清理所有定时器
   */
  private clearTimers(): void {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
    if (this.autoHideDelayTimer) {
      clearTimeout(this.autoHideDelayTimer);
      this.autoHideDelayTimer = null;
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.clearTimers();
    this.mainWindow = null;
  }
}