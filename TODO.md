# 待实现功能

本文档记录已规划但尚未实现的功能，供后续开发参考。

---

## 已完成功能

### ✅ Electron 窗口消失 Bug 修复
- 窗口位置/大小状态检测和恢复
- 系统托盘"显示窗口"入口
- 窗口自动隐藏/恢复功能

### ✅ 系统托盘模式
- 最小化到系统托盘
- 托盘图标 + 左键/右键菜单
- 告警时托盘图标闪烁提醒

### ✅ ESC 键操作确认
- 拦截 ESC 键事件，弹出确认对话框
- 键盘导航支持（←→选择，Enter确认）
- 可选：设置中允许用户配置 ESC 行为

### ✅ 会话区域复制粘贴
- xterm.js 的 clipboard 集成
- Ctrl+C 复制选中文本
- Ctrl+V 粘贴剪贴板内容

### ✅ 告警气泡优化
- 缩小单个告警气泡的默认展示尺寸
- 鼠标悬停时展示完整内容
- 按告警级别（CRITICAL/ERROR/WARNING/INFO）显示不同颜色

### ✅ 鼠标一键消除警告
- 告警面板"全部清除"按钮

### ✅ 鼠标一键静默警告
- 静默模式切换按钮
- 静默时隐藏气泡，仅显示数字角标

### ✅ 设置页 - 告警及日志页
- 告警分级功能（严重/警告/信息/调试）
- 告警过滤规则配置
- 提醒方式配置
- 外部 Claude Code 检测设置

### ✅ 外部 Claude Code 检测
- 基础检测：路径覆盖检查（始终开启）
- 深度检测：.claude 目录状态和系统进程检查（可选）
- 创建会话时显示警告

### ✅ 多显示器支持
- 自动检测主显示器
- 可选择显示器定位

---

## P1：AI助手核心能力（本地小模型 + 语音交互）

### 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    主进程 (Main)                      │
│                                                      │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │ ProcessManager│───→│   AIAssistantManager     │   │
│  │  (会话输出)   │    │                          │   │
│  └──────────────┘    │  ┌──────────────────┐    │   │
│                      │  │ 心跳监控模块      │    │   │
│  ┌──────────────┐    │  └──────────────────┘    │   │
│  │  TrayManager │←──│  ┌──────────────────┐    │   │
│  │  (桌面通知)   │    │  │ 输出分析模块      │    │   │
│  └──────────────┘    │  └──────────────────┘    │   │
│                      │  ┌──────────────────┐    │   │
│                      │  │ 语音交互模块      │    │   │
│                      │  │  STT ← → TTS     │    │   │
│                      │  └──────────────────┘    │   │
│                      └──────────────────────────┘   │
│                              ↑↓ HTTP                │
│                       本地小模型API                   │
│                    (Ollama/vLLM/llama.cpp)           │
└─────────────────────────────────────────────────────┘
         ↕ IPC                    ↕ IPC
┌──────────────────┐    ┌──────────────────┐
│   渲染进程        │    │   渲染进程        │
│  (AI配置UI)       │    │  (告警+语音UI)    │
└──────────────────┘    └──────────────────┘
```

### 模块1：AIAssistantManager（主进程新类）

**文件**：`src/main/AIAssistantManager.ts`

**职责**：AI助手的核心调度器，协调所有AI相关功能

**关键接口**：

```typescript
class AIAssistantManager {
  private config: AIConfig;           // 从渲染进程同步的AI配置
  private healthy: boolean;           // 心跳状态
  private latency: number;            // 当前响应延迟ms
  private heartbeatTimer: Timer;      // 心跳定时器
  private outputAnalyzer: OutputAnalyzer;
  private voiceManager: VoiceManager;

  // 核心方法
  start(): void;                      // 启动助手（心跳+监听）
  stop(): void;                       // 停止
  updateConfig(config: AIConfig): void;

  // AI调用（统一入口，带超时和重试）
  async query(prompt: string, systemPrompt?: string): Promise<string>;

  // 心跳
  private startHeartbeat(interval: number): void;
  private stopHeartbeat(): void;
  private checkHealth(): Promise<boolean>;

  // AI自身异常通知
  private notifyAIUnhealthy(reason: string): void;
  private notifyAIRecovered(): void;
}
```

**AI配置迁移**：从渲染进程 `localStorage` 迁移到主进程，新增IPC通道 `ai:getConfig` / `ai:updateConfig`，渲染进程只做UI展示。

### 模块2：心跳监控

| 项目 | 方案 |
|------|------|
| 心跳频率 | 默认30秒一次，可配置 |
| 心跳方式 | 向本地模型API发一个极短请求（`max_tokens: 1`），计时延迟 |
| 判定不健康 | 连续3次超时/失败 → 标记为不健康 |
| 恢复判定 | 连续2次成功 → 恢复为健康 |
| 超时阈值 | 单次请求5秒超时（本地模型应<1s响应） |
| 延迟预警 | 延迟>3秒时通过告警系统发出WARNING（模型可能过载） |
| 不健康通知 | 通过现有 `alert:trigger` IPC发出 `AlertType.ERROR`，消息如"AI助手无响应，看守功能暂停" |
| 恢复通知 | 发出 `AlertType.TASK_COMPLETE`，"AI助手已恢复" |
| UI指示 | 渲染进程显示AI状态灯：🟢健康 🟡延迟高 🔴不可用 |

**实现位置**：AIAssistantManager内部，独立定时器，不依赖其他模块运行。

### 模块3：输出分析模块（OutputAnalyzer）

**核心流程**：

```
ProcessManager.handleOutput()
       │
       ▼
  checkAlerts()  ──→  现有正则初筛（保留，作为快路径）
       │
       ▼ 命中时
  AIAssistantManager.analyzeAlert(sessionId, matchedText)
       │
       ▼
  AI分类请求（短prompt，传入匹配到的文本片段）
       │
       ├── 分类结果：等待确认/等待输入/可忽略/需人工
       │
       ├── 生成一句话摘要（用于语音播报/通知）
       │
       └── 建议动作：auto_answer / notify / ignore
```

**AI Prompt设计**（关键：短小精悍，小模型可处理）：

```
System: 你是Claude Code会话看守助手。分析以下终端输出片段，返回JSON：
{"type":"confirm|input|error|info","summary":"一句话中文摘要","action":"auto|notify|ignore","suggestion":"建议回答内容，仅confirm类型需要"}

User: [Y/n] Do you want to create directory /tmp/test?
```

预期输出：
```json
{"type":"confirm","summary":"会话要求创建目录/tmp/test","action":"auto","suggestion":"Y"}
```

**上下文窗口管理**：

- 不把整个会话历史喂给AI，只喂命中的**短片段**（最近100-200字符）
- 为每个会话维护一个**滑动窗口摘要**：每N行输出，让AI生成一句状态描述，作为后续分析的上下文
- 摘要链：`上次摘要 + 最近新输出 → 新摘要`，控制总上下文在2K token以内

### 模块4：自动应答与用户交互

**安全策略**：

```typescript
interface AutoAnswerRule {
  pattern: string;          // 匹配模式（正则或关键词）
  answer: string;           // 自动回答内容
  sessionPattern?: string;  // 限定会话名/目录
  enabled: boolean;
}
```

预设规则（用户可在设置中增删改）：
- `创建目录` → `Y`
- `安装依赖 (npm install)` → `Y`
- `覆盖文件` → `notify`（不自动回答，通知用户）

**交互流程**：

```
AI分析结果: action=auto
  → 查规则表 → 有匹配规则 → 自动发送 → 记录日志
  → 无匹配规则 → 降级为notify

AI分析结果: action=notify
  → 触发通知链：
    1. 桌面通知（Notification API）
    2. 提示音（按优先级选不同音效）
    3. TTS语音播报摘要
    4. 等待用户响应（点击通知/语音回答）
```

### 模块5：语音交互模块（VoiceManager）

**技术选型**：

| 能力 | 方案A（浏览器原生） | 方案B（本地模型） | 推荐 |
|------|-------------------|-----------------|------|
| STT | Web Speech API | Whisper.cpp / Vosk | **B** — 离线可用、中文支持好 |
| TTS | Web Speech API | edge-tts / piper / sherpa-onnx | **B** — 更自然、可控 |

**理由**：
- Web Speech API依赖Chrome在线服务，离线不可用且中文识别差
- Whisper.cpp可本地运行tiny/base模型，延迟<1s，中文准确度好
- edge-tts免费且音质极佳，或用piper纯离线

**VoiceManager接口**：

```typescript
class VoiceManager {
  private sttEngine: STTEngine;      // 语音识别引擎
  private ttsEngine: TTSEngine;      // 语音合成引擎
  private listening: boolean;        // 是否在监听
  private wakeWordEnabled: boolean;  // 唤醒词模式

  // 核心方法
  async startListening(): Promise<void>;   // 开始语音识别
  stopListening(): void;                    // 停止
  async speak(text: string): Promise<void>; // TTS播报

  // 唤醒词检测（轻量级，不用AI）
  private detectWakeWord(audioBuffer: Buffer): boolean;

  // 语音命令解析（交给AI）
  private async parseVoiceCommand(text: string): Promise<VoiceCommand>;
}

interface VoiceCommand {
  type: 'answer' | 'query' | 'control';
  target?: string;      // 会话ID或名称
  content: string;      // 回答内容或控制指令
}
```

**语音交互场景**：

1. **语音回答Claude**（最核心）：
   - AI发通知："会话3等你确认是否删除文件"
   - 用户说："确认" → STT → AI解析为`{type:'answer', target:'session-3', content:'Y'}` → 发送到pty

2. **语音查询状态**：
   - 用户说："现在什么情况" → AI从ProcessManager获取各会话状态 → 生成简短回复 → TTS播报

3. **语音控制**：
   - 用户说："静音" / "关闭会话3" → 解析为控制命令 → 执行

**唤醒词方案**：
- 持续监听太耗资源，用**按键触发**（如长按某个键或点击麦克风按钮）
- 可选：用轻量唤醒词检测库（如porcupine），说"小助手"激活

### 新增IPC通道

```typescript
// AI助手相关
AI_GET_CONFIG: 'ai:getConfig',
AI_UPDATE_CONFIG: 'ai:updateConfig',
AI_STATUS: 'ai:status',              // 主进程→渲染：AI健康状态推送
AI_ALERT_ANALYZED: 'ai:alertAnalyzed', // 主进程→渲染：AI分析后的告警

// 语音交互相关
VOICE_START_LISTENING: 'voice:startListening',
VOICE_STOP_LISTENING: 'voice:stopListening',
VOICE_SPEAK: 'voice:speak',
VOICE_RESULT: 'voice:result',         // 主进程→渲染：语音识别结果
VOICE_COMMAND: 'voice:command',       // 主进程→渲染：解析后的语音命令
```

### 配置UI增强（渲染进程）

现有AITab需要增加：
1. **心跳配置**：心跳间隔、超时阈值、不健康判定次数
2. **自动应答规则表**：增删改预设规则
3. **语音设置**：STT/TTS引擎选择、唤醒词开关、语音速度/音量
4. **AI状态灯**：实时显示🟢/🟡/🔴，点击可查看延迟详情

### 依赖项与风险

| 项目 | 依赖 | 风险 | 缓解 |
|------|------|------|------|
| 本地模型 | 用户自行部署Ollama/vLLM | 未安装则AI功能不可用 | 心跳失败时降级为纯规则模式，不阻塞基础功能 |
| Whisper.cpp | whisper.cpp Node绑定 或 调用本地API | 编译/安装复杂 | 优先用Ollama的whisper模型（复用同一服务），或提供Web Speech API回退 |
| TTS | edge-tts(npm) 或 piper | edge-tts需联网 | piper作为离线备选 |
| 性能 | 语音+AI同时运行 | CPU/内存占用 | 语音检测用VAD（静音跳过），AI推理串行化（排队处理） |

### 实施步骤

1. **Step 1**：AIAssistantManager骨架 + 心跳监控 + 配置迁移（从localStorage到主进程）
2. **Step 2**：输出分析模块 + 自动应答规则
3. **Step 3**：桌面通知 + 提示音分级
4. **Step 4**：TTS语音播报（单向：AI→用户）
5. **Step 5**：STT语音识别 + 语音命令→操作会话（双向交互）

每步独立可测试，Step 1-3 构成看守闭环，Step 4-5 加上语音能力。

---

## 高优先级

### 1. ESC 发送功能优化
- **问题描述**：ESC 确认后发送 ESC 字符到终端功能不稳定
- **当前状态**：已实现 UI 和逻辑，但发送效果不理想
- **修复方向**：
  - 调查 xterm.js 与 node-pty 的 ESC 字符传递机制
  - 考虑使用不同的发送方式
- **工作量**：约 2-3 小时

### 2. 窗口焦点管理优化
- **问题描述**：ESC 确认弹窗关闭后焦点恢复到终端
- **当前状态**：已实现，但可能存在边缘情况
- **修复方向**：
  - 确保 focus() 调用时机正确
  - 处理多种弹窗关闭场景
- **工作量**：约 1-2 小时

---

## 中优先级

### 3. 全局键盘快捷键
- **快捷键列表**：
  - `Ctrl+N` — 新建会话
  - `Ctrl+W` — 关闭当前会话
  - `Ctrl+Tab` / `Ctrl+Shift+Tab` — 切换会话
  - `Ctrl+1~9` — 快速跳转到第 N 个会话
- **实现方式**：渲染进程 `keydown` 事件监听
- **工作量**：约 2 小时

### 4. Web 访问响应式适配
- **目标**：浏览器访问时适配电脑/平板/手机
- **改动**：
  - 侧边栏：移动端改为底部抽屉或汉堡菜单
  - 终端：xterm 触摸滚动和缩放优化
  - 按钮尺寸：增大触摸目标
  - 展开视图：移动端全屏
- **工作量**：约 4-6 小时

### 5. 会话"自动批准"功能
- **背景**：Claude Code CLI 执行某些操作时需要用户确认
- **当前状态**：已有 `--dangerously-skip-permissions` 参数透传，缺少应用级自动确认
- **实现方式**：
  - 方式A：如果 CLI 支持 `--auto-approve` 参数，直接添加
  - 方式B：监听输出，自动发送确认指令
- **工作量**：方式A 约 1-2 小时，方式B 约 4-6 小时

### 6. 终端输出搜索
- **功能**：在展开视图中搜索输出内容
- **特性**：
  - 支持正则表达式
  - 高亮匹配结果
  - 上下导航按钮
- **工作量**：约 2-3 小时

---

## 低优先级

### 7. 系统通知
- **功能**：
  - 任务完成时发送桌面通知（OS 级别）
  - 需要用户输入时提醒
  - 可配置通知开关
- **工作量**：约 1-2 小时

### 8. 会话模板
- **功能**：
  - 保存常用配置（工作目录、环境变量、启动命令）
  - 一键从模板创建会话
  - 模板管理界面
- **工作量**：约 2-3 小时

### 9. 会话历史
- **当前状态**：已有持久化存储，缺少 UI 展示
- **功能**：
  - 记录已关闭会话的输出
  - 历史列表查看界面
  - 可重新打开（基于历史配置）
- **工作量**：约 3-4 小时

### 10. 主题设置
- **功能**：
  - 终端颜色自定义
  - 预设主题选择
  - 字体大小调整
- **工作量**：约 2-3 小时

### 11. 会话导出
- **当前状态**：后端 IPC 已实现，缺少 UI 入口
- **功能**：
  - 在活跃组件中添加"导出日志"按钮
  - 支持带时间戳格式
  - 批量导出
- **工作量**：约 1-2 小时

---

## 架构优化

### 窗口行为统一管理
- **状态**：已完成
- WindowManager 统一管理窗口状态
- 移除 index.ts 中的重复窗口状态变量

---

## 待实现功能

### 1. 语音交互 UI 实现 ⭐⭐⭐
- **当前状态**：后端 VoiceManager 完整，缺少前端 UI 元素
- **功能**：
 - 标题栏添加麦克风按钮（启动/停止录音）
 - 语音状态指示器（显示录音中、播放中等状态）
 - 设置面板中添加语音配置项（TTS/STT 引擎、语速、音量等）
- **工作量**：约 3-4 小时
- **优先级**：高

### 2. AI 助手 UI 集成 ⭐⭐⭐
- **当前状态**：后端 AIManager 完整，但主界面上没有显示其运行状态
- **功能**：
 - 主界面添加 AI 状态指示器（是否启用、连接状态）
 - 自动应答规则管理界面
 - AI 分析日志展示面板
- **工作量**：约 3-4 小时
- **优先级**：高

### 3. 终端输入字符重复问题修复 ⭐⭐
- **当前状态**：已设置 `TERM=vt100`，但仍偶发
- **功能**：
 - 完全消除重复字符现象
 - 可能需要调整 xterm.js 配置或 pty 选项
- **工作量**：约 2-3 小时
- **优先级**：中

---

## 已完成功能（更新至 2026-04-23）

### ✅ 窗口贴边隐藏功能优化
- 自动滑出后鼠标移开不会自动收起
- 取消勾选时窗口恢复到默认大小（1200x800）
- 托盘菜单添加"贴边隐藏"开关选项

### ✅ CMD 窗口隐藏
- VBS 脚本启动时不显示命令行窗口

### ✅ 开发模式自动构建
- `npm run dev` 会先执行 `build:electron`

### ✅ AI 助手功能集成
- 自动应答规则检查（优先级高于 AI 分析）
- AI 分析告警 + 自动回答/通知

---

*最后更新：2026-04-23*
