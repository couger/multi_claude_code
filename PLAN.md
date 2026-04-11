# Claude Code CLI 管理器 - 项目方案

## 项目概述

**项目名称**: Claude Code CLI Manager (CCCM)  
**目标**: 将多个 Claude Code CLI 窗口集成在一个桌面应用界面中，提供统一管理、实时监控和便捷操作。

## 需求分析与评估

### 核心需求 (优先实现)

| 需求 | 可行性 | 实现难度 | 优先级 |
|------|--------|----------|--------|
| 新建 Claude Code CLI 任务窗口 | ✅ 高 | 中 | P0 |
| 实时显示 CLI 输出内容 | ✅ 高 | 中 | P0 |
| 点击缩略图展开全尺寸 | ✅ 高 | 低 | P0 |
| 关闭 CLI 任务 | ✅ 高 | 低 | P0 |
| 下拉滚动条容纳多任务 | ✅ 高 | 低 | P0 |
| 收纳隐藏到侧边栏 | ✅ 高 | 中 | P1 |

### 扩展需求 (后续实现)

| 需求 | 可行性 | 实现难度 | 优先级 |
|------|--------|----------|--------|
| 拖拽已有 CLI 窗口到应用 | ⚠️ 中 | 高 | P2 |
| 缩略图刷新显示 | ✅ 高 | 中 | P1 |
| 添加注释/标签 | ✅ 高 | 低 | P1 |
| 图标仅显示模式 | ✅ 高 | 低 | P2 |
| 告警提醒功能 | ✅ 高 | 中 | P2 |

### 需求调整说明

1. **拖拽已有 CLI 窗口**: 原需求较难实现，因为无法直接"捕获"已运行的独立进程窗口。建议改为：
   - 提供"导入"功能，记录 CLI 的工作目录和启动参数
   - 在应用内重新启动该 CLI 实例
   - 或者通过进程列表选择并附加到已运行的进程

2. **缩略图实现**: 
   - 方案A: 定期截图（消耗资源较大）
   - 方案B: 实时渲染缩小版（推荐）
   - 方案C: 仅显示最后几行输出的预览

3. **告警功能**: 预留接口，优先实现核心功能

## 技术选型

### 推荐方案: Electron + TypeScript + React

**理由:**
1. **Electron**: 成熟稳定，跨平台，丰富的窗口管理 API
2. **TypeScript**: 类型安全，与前端生态无缝集成
3. **React**: 组件化开发，状态管理方便

### 备选方案: Tauri

**优点**: 包体积小(~10MB vs Electron ~150MB)，性能更好  
**缺点**: 生态较新，Rust 后端学习曲线陡峭

### 最终推荐: Electron

考虑到项目需要大量窗口管理、进程管理和 UI 交互，Electron 的成熟度和文档更占优势。

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron Main Process                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  Process Manager │  │  Window Manager  │  │  IPC Handler │ │
│  │  - spawn CLI     │  │  - create window │  │  - events    │ │
│  │  - kill CLI      │  │  - sidebar       │  │  - commands  │ │
│  │  - monitor       │  │  - thumbnails    │  │              │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ IPC
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Renderer Process (React)                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Sidebar Panel (可隐藏)                                   ││
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                        ││
│  │  │ CLI │ │ CLI │ │ CLI │ │ CLI │  ... (滚动列表)         ││
│  │  │  1  │ │  2  │ │  3  │ │  4  │                        ││
│  │  └─────┘ └─────┘ └─────┘ └─────┘                        ││
│  │  [缩略图模式] [图标模式] [添加+]                          ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Expanded View (点击缩略图后显示)                         ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │  CLI #2 - Full Size                                  │││
│  │  │  [实时输出内容]                                       │││
│  │  │  [操作按钮: 关闭/最小化/笔记]                          │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 核心模块设计

### 1. Process Manager (进程管理器)

```typescript
// src/main/ProcessManager.ts
interface CLISession {
  id: string;
  name: string;
  workDir: string;
  process: ChildProcess;
  pty?: IPty;  // 使用 node-pty 支持 TTY
  status: 'running' | 'paused' | 'completed' | 'error';
  output: string[];  // 输出缓冲区
  note?: string;     // 用户注释
  createdAt: Date;
  lastActivity: Date;
}

class ProcessManager {
  private sessions: Map<string, CLISession> = new Map();
  
  // 创建新的 CLI 会话
  async createSession(options: CreateSessionOptions): Promise<CLISession>;
  
  // 终止会话
  async killSession(id: string): Promise<void>;
  
  // 获取会话列表
  getSessions(): CLISession[];
  
  // 获取会话输出
  getSessionOutput(id: string): string[];
  
  // 向会话发送输入
  sendInput(id: string, data: string): void;
}
```

### 2. Window Manager (窗口管理器)

```typescript
// src/main/WindowManager.ts
class WindowManager {
  private mainWindow: BrowserWindow;
  private sidebarVisible: boolean = true;
  private expandedSessionId: string | null = null;
  
  // 显示/隐藏侧边栏
  toggleSidebar(): void;
  
  // 展开会话
  expandSession(sessionId: string): void;
  
  // 折叠会话
  collapseSession(): void;
  
  // 设置显示模式 (缩略图/图标)
  setDisplayMode(mode: 'thumbnail' | 'icon'): void;
}
```

### 3. IPC Handler (通信处理器)

```typescript
// src/main/IPCHandler.ts
// 主进程与渲染进程通信的通道定义
const IPC_CHANNELS = {
  // 渲染 -> 主进程
  CREATE_SESSION: 'cli:create',
  KILL_SESSION: 'cli:kill',
  SEND_INPUT: 'cli:input',
  EXPAND_SESSION: 'ui:expand',
  COLLAPSE_SESSION: 'ui:collapse',
  SET_NOTE: 'cli:note',
  SET_DISPLAY_MODE: 'ui:mode',
  
  // 主进程 -> 渲染
  SESSION_CREATED: 'cli:created',
  SESSION_OUTPUT: 'cli:output',
  SESSION_STATUS: 'cli:status',
  SESSION_CLOSED: 'cli:closed',
  ALERT: 'ui:alert',
};
```

### 4. React 组件结构

```
src/renderer/
├── App.tsx
├── components/
│   ├── Sidebar/
│   │   ├── Sidebar.tsx          # 侧边栏容器
│   │   ├── SessionCard.tsx      # CLI 会话卡片
│   │   ├── ThumbnailView.tsx    # 缩略图视图
│   │   ├── IconView.tsx         # 图标视图
│   │   └── AddButton.tsx        # 添加按钮
│   ├── ExpandedView/
│   │   ├── ExpandedView.tsx     # 展开视图
│   │   ├── Terminal.tsx         # 终端组件
│   │   └── Toolbar.tsx          # 工具栏
│   ├── Alerts/
│   │   └── AlertManager.tsx     # 告警管理
│   └── common/
│       ├── Tooltip.tsx          # 注释提示
│       └── ScrollContainer.tsx  # 滚动容器
├── hooks/
│   ├── useSessions.ts           # 会话状态管理
│   ├── useIPC.ts                # IPC 通信
│   └── useAlerts.ts             # 告警状态
└── stores/
    └── sessionStore.ts          # Zustand 状态管理
```

## 界面设计

### 侧边栏布局 (默认状态)

```
┌────────────────────────────────────────────────────┐
│                                                    │
│    ┌──────────────────────────────────┐            │
│    │  [≡] Claude Code CLI Manager     │            │
│    └──────────────────────────────────┘            │
│                                                    │
│    ┌──────────────────────────────────┐            │
│    │ [缩略图] [图标]       [+] 新建    │            │
│    └──────────────────────────────────┘            │
│                                                    │
│    ┌──────────────────────────────────┐            │
│    │ ┌────────┐ ┌────────┐            │            │
│    │ │ CLI #1 │ │ CLI #2 │            │            │
│    │ │ ▶运行中│ │ ⏸暂停  │            │            │
│    │ │ [缩略图]│ │ [缩略图]│            │            │
│    │ │ [x]    │ │ [x]    │            │            │
│    │ └────────┘ └────────┘            │            │
│    │ ┌────────┐ ┌────────┐            │            │
│    │ │ CLI #3 │ │ CLI #4 │  ▼滚动     │            │
│    │ │ ✓完成  │ │ ⚠错误  │            │            │
│    │ └────────┘ └────────┘            │            │
│    └──────────────────────────────────┘            │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 展开视图布局

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────┐    │
│  │  CLI #2 - "项目重构任务"                    [—] [x]  │    │
│  │  ──────────────────────────────────────────────────  │    │
│  │  📁 D:\Projects\my-app                              │    │
│  │  ──────────────────────────────────────────────────  │    │
│  │  $ claude                                           │    │
│  │  > 正在分析项目结构...                               │    │
│  │  > 发现 3 个需要重构的模块                           │    │
│  │  > [实时输出继续...]                                 │    │
│  │                                                      │    │
│  │                                                      │    │
│  │                                                      │    │
│  │  ──────────────────────────────────────────────────  │    │
│  │  [暂停] [终止] [重启]        [添加笔记] [导出日志]    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐               │
│  │ CLI #1 │ │ CLI #3 │ │ CLI #4 │ │ CLI #5 │               │
│  └────────┘ └────────┘ └────────┘ └────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 侧边栏隐藏模式

```
┌───┐
│ C │  ← 鼠标悬停时滑出
│ L │
│ I │
│ 1 │
│ 2 │
│ 3 │
│ 4 │
│ + │
└───┘
```

## 告警功能设计

### 告警类型

```typescript
enum AlertType {
  USER_INPUT = 'user_input',      // 需要用户输入
  TASK_COMPLETE = 'task_complete', // 任务完成
  ERROR = 'error',                 // 严重错误
  WARNING = 'warning',             // 警告
}

interface Alert {
  sessionId: string;
  type: AlertType;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}
```

### 告警显示方式

| 告警类型 | 角标 | 闪光 | 放大 | 声音 |
|----------|------|------|------|------|
| 用户输入 | ✅ 红点 | ✅ | ✅ | ✅ 可选 |
| 任务完成 | ✅ 绿勾 | - | - | ✅ 可选 |
| 错误 | ✅ 红叉 | ✅ | ✅ | ✅ 默认 |
| 警告 | ✅ 黄叹 | - | - | ✅ 可选 |

### 告警检测逻辑

```typescript
// 通过监控 CLI 输出来检测告警事件
const ALERT_PATTERNS = {
  user_input: [
    /\?\s*$/,                           // 等待输入
    /\[Y\/n\]/,                         // 确认提示
    /please.*input/i,                   // 请求输入
  ],
  task_complete: [
    /task.*complete/i,
    /完成/,
    /done\./i,
    /finished/i,
  ],
  error: [
    /error:/i,
    /fatal:/i,
    /exception/i,
    /failed/i,
  ],
};
```

## 项目目录结构

```
multi_claude_code/
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── src/
│   ├── main/                      # 主进程
│   │   ├── index.ts              # 入口
│   │   ├── ProcessManager.ts     # 进程管理
│   │   ├── WindowManager.ts      # 窗口管理
│   │   ├── IPCHandler.ts         # IPC处理
│   │   ├── AlertManager.ts       # 告警管理
│   │   └── store/
│   │       └── sessions.ts       # 会话持久化
│   ├── renderer/                  # 渲染进程
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Sidebar/
│   │   │   ├── ExpandedView/
│   │   │   ├── Alerts/
│   │   │   └── common/
│   │   ├── hooks/
│   │   ├── stores/
│   │   └── styles/
│   │       └── tailwind.css
│   ├── shared/                    # 共享类型
│   │   ├── types.ts
│   │   └── constants.ts
│   └── preload/
│       └── index.ts              # 预加载脚本
├── assets/
│   └── icons/
├── config/
│   └── default.json
└── scripts/
    └── dev.js
```

## 依赖清单

```json
{
  "dependencies": {
    "electron": "^28.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.5.0",
    "node-pty": "^1.0.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "electron-builder": "^24.0.0",
    "tailwindcss": "^3.4.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0"
  }
}
```

## 实现计划

### 阶段一: 核心功能 (MVP)

1. **项目初始化**
   - Electron + React + TypeScript 搭建
   - 基础窗口结构

2. **进程管理**
   - CLI 会话创建
   - 输出捕获和显示
   - 会话关闭

3. **基础 UI**
   - 侧边栏容器
   - CLI 卡片列表
   - 展开视图
   - 滚动支持

### 阶段二: 交互优化

1. **侧边栏行为**
   - 自动隐藏/显示
   - 悬停滑出

2. **视图模式**
   - 缩略图模式
   - 图标模式
   - 切换功能

3. **注释功能**
   - 添加/编辑注释
   - 悬停显示

### 阶段三: 高级功能

1. **告警系统**
   - 输出监控
   - 告警触发
   - 视觉/声音提示

2. **会话管理**
   - 持久化存储
   - 重启恢复
   - 导入/导出

3. **高级交互**
   - 拖拽排序
   - 快捷键
   - 批量操作

## 验证方案

### 开发环境测试

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 测试核心功能:
# 1. 点击"+"创建新 CLI 会话
# 2. 观察实时输出显示
# 3. 点击缩略图展开/折叠
# 4. 点击"关闭"按钮终止会话
# 5. 测试侧边栏隐藏/显示
```

### 构建发布

```bash
# 构建生产版本
npm run build

# 打包
npm run package
```

## 待确认事项

1. **CLI 启动命令**: 默认使用 `claude` 命令，是否需要自定义？

2. **工作目录**: 新建 CLI 时如何选择工作目录？
   - 选项A: 默认用户主目录
   - 选项B: 弹出文件夹选择对话框
   - 选项C: 记住上次目录

3. **最大会话数**: 是否限制同时运行的 CLI 数量？

4. **输出缓冲**: 输出内容保留多少？
   - 选项A: 全部保留（内存占用大）
   - 选项B: 最近 N 行
   - 选项C: 保存到文件，按需加载

5. **主题**: 是否需要深色/浅色主题切换？