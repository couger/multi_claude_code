# 待实现功能

本文档记录已规划但尚未实现的功能，供后续开发参考。

---

## 已完成功能

### ✅ ESC发送功能优化
- 双重保障机制：通过IPC和xterm直接写入两种方式发送ESC字符
- 改进焦点管理：先让终端失去焦点，确保弹窗关闭后不会继续拦截键盘事件
- 使用setTimeout确保DOM更新后再发送

### ✅ 窗口焦点管理优化
- 新增focusRestoreTimeoutRef用于焦点恢复的定时器管理
- handleEscConfirmClose: 使用requestAnimationFrame和双重保障延迟恢复焦点
- handleSendEsc: 增强焦点管理，确保ESC字符发送后正确恢复终端焦点
- useEffect中弹窗显示/关闭时自动处理焦点切换

### ✅ 全局键盘快捷键
- Ctrl+N: 新建会话
- Ctrl+W: 关闭当前展开的会话
- Ctrl+Tab / Ctrl+Shift+Tab: 向后/向前切换会话
- Ctrl+1~9: 快速跳转到第 N 个会话

### ✅ AI助手状态灯（主界面标题栏）
- 实时显示AI连接状态：🟢健康 🟡延迟高 🔴不可用
- 鼠标悬停显示详细信息（延迟/错误原因）
- 通过ai:status IPC通道实时更新

### ✅ 自动应答规则管���UI
- SettingsPanel中新增完整的规则管理界面
- 支持增删改查操作
- 启用/禁用开关
- 正则表达式匹配模式
- 会话限定功能

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

### ✅ 语音交互 UI 实现
- 标题栏添加麦克风按钮和录音状态指示器（绿色闪烁动画）
- 添加 AI 说话时的状态指示器（蓝色闪烁动画，与录音提示对称）
- 使用 Web Speech API 实现 TTS 播放处理
- 设置面板中新增"语音"标签页，包含语音输入/输出测试功能
- 完整的语音配置界面：引擎选择、语速调节、音量调节

### ✅ 语音交互后端（VoiceManager）
- TTS 播报队列管理
- STT 识别接口（Web Speech API）
- 语音配置持久化
- IPC 通道完整实现（VOICE_START_LISTENING/VOICE_STOP_LISTENING/VOICE_SPEAK/VOICE_RESULT）
- 基础语音命令解析（静音/查询/回答）

### ✅ 会话模板功能
- TemplateManager 后端类（CRUD + 持久化）
- 完整 IPC 通道（TEMPLATE_LIST/GET/CREATE/UPDATE/DELETE/USE）
- 设置面板"模板"标签页（增删改查、使用功能）
- 使用次数统计

### ✅ 系统通知（NotificationManager）
- 完整的通知管理系统已实现
- 支持桌面原生通知（Electron Notification API）
- 告警分级通知（CRITICAL/ERROR/WARNING/INFO）
- 声音提醒配置
- AI 助手健康状态通知

### ✅ 会话导出功能
- 后端 IPC 已实现
- UI 入口已在增强卡片菜单中实现
- 支持单会话和批量导出

### ✅ AI 助手完整后端架构
- AIAssistantManager 核心调度器
- 心跳监控模块（可配置间隔、超时、阈值）
- AI 配置管理（从 ConfigManager 持久化）
- 自动应答规则引擎
- IPC 通道完整实现（AI_GET_CONFIG/AI_UPDATE_CONFIG/AI_STATUS/AI_ALERT_ANALYZED 等）

---

## 待实现功能

### 1. 终端输出搜索 ⭐⭐
- **状态**：✅ 已完成（2026-04-24）
- **功能**：
  - Ctrl+F 打开搜索栏
  - 支持正则表达式
  - 上下导航按钮
  - 实时匹配计数
- **实现**：ExpandedView 组件新增搜索栏和快捷键

### 2. 会话模板 ⭐⭐
- **状态**：✅ 已完成（2026-04-24）
- **提交**：4d7d3ed
- **功能**：
  - 保存常用配置（工作目录、启动命令）
  - 一键从模板创建会话
  - 模板管理界面（设置面板"模板"标签页）
  - 使用次数统计
- **实现**：
  - TemplateManager 后端类
  - 完整的 IPC 通道（TEMPLATE_LIST/GET/CREATE/UPDATE/DELETE/USE）
  - Preload API 和前端调用
  - 设置面板 UI（增删改查、使用功能）

### 3. 主题设置 ⭐
- **优先级**：已下调
- **功能**：
  - 窗口半透明模式（已禁用，需重新实现）
  - 终端颜色自定义
  - 预设主题选择
  - 字体大小调整
- **工作量**：约 2-3 小时

### 4. 会话历史 UI ⭐
- **优先级**：已下调
- **功能**：
  - 记录已关闭会话的输出
  - 历史列表查看界面
  - 可重新打开（基于历史配置）
- **工作量**：约 3-4 小时

### 5. 语音命令深度集成
- **状态**：✅ 已完成（2026-04-25）
- **功能**：
  - 新建会话语音命令（"新建会话"、"创建会话"）
  - 关闭会话语音命令（"关闭会话"、"结束会话"）
  - 发送输入语音命令（"发送XXX"、"输入XXX"）
  - 切换会话语音命令（"切换到第X个会话"）
  - 查询状态语音命令（"什么情况"、"状态"、"进度"）
  - 回答命令发送至活动会话
  - 控制命令（静音/取消静音）
- **实现**：
  - VoiceManager 扩展命令解析
  - 新增 IPC 通道 VOICE_COMMAND、VOICE_EXECUTE_COMMAND
  - TitleBar 监听命令并执行
  - **语音识别（STT）实现**：使用 MediaRecorder 录制音频，发送到后端识别
  - 支持多种识别引擎：
    - Whisper 离线识别（默认）
    - 讯飞在线识别
    - 百度在线识别
  - 前端使用 MediaRecorder 录制 webm/opus 音频
  - 新增 IPC 通道 VOICE_RECOGNIZE、VOICE_AUDIO_DATA
  - Settings 面板新增 STT 引擎选择 UI

---

## 架构优化

### 窗口行为统一管理
- **状态**：已完成
- WindowManager 统一管理窗口状态

---

*最后更新：2026-04-29*

---

## 当前开发进度

**已完成**: 黑屏修复 + WASM 崩溃修复 + 语音助手面板完善 + 连续对话模式 + STT 测试 WASM 优先

---

## 未完成任务

### 1. 黑屏问题排查与修复 ⭐⭐⭐
- **状态**：✅ 已完成（2026-04-29）
- **修复内容**：
  - 新增 ErrorBoundary 组件包裹 App 和 VoiceAssistantPanel，防止单个组件崩溃导致全屏黑屏
  - Whisper WASM 自动加载添加 try-catch 保护，加载失败时清除已保存模型 ID
  - VoiceAssistantPanel 配置加载已有完善的 try-catch 降级处理
  - useSyncExternalStore snapshot 缓存（之前已完成）
  - WASM 包动态 import（之前已完成）

### 2. 解决 WASM 识别导致崩溃问题 ⭐⭐⭐
- **状态**：✅ 已完成（2026-04-29）
- **修复内容**：
  - 音频大小限制：最大 10MB（截断）、最小 1000 字节（跳过）
  - convertFromArrayBuffer 添加 15 秒超时保护
  - whisper.transcribe 添加 30 秒超时保护
  - 线程数限制为 max 2，减少 WASM 并发压力
  - 转录结果空值校验
  - 超时/崩溃后自动 unloadModel 重置状态

### 3. 语音助手面板功能完善
- **状态**：✅ 已完成（2026-04-29）
- **修复内容**：
  - STT/文字输入发送后自动聚焦输入框
  - 会话事件（创建/关闭/控制/查询）支持 TTS 播报
  - ttsEnabledRef 确保 IPC 回调获取最新 TTS 设置
  - STT 识别错误处理：区分 ERROR: 前缀错误并友好提示
  - 识别失败时显示 ⚠️ 警告消息

### 4. Whisper WASM 前端集成
- **状态**：✅ 已完成（2026-04-29）
- **功能**：
  - 浏览器端集成 @timur00kh/whisper.wasm
  - 支持 WebM/Opus 音频格式识别
  - 已添加超时保护、大小限制、崩溃恢复机制

### 5. WASM 崩溃根因分析与修复 ⭐⭐⭐
- **状态**：✅ 已完成（2026-04-29）
- **根因**：`@timur00kh/whisper.wasm` 的 `convertFromArrayBuffer` 对 webm/opus 音频解码不稳定，WASM 内存越界导致渲染进程直接崩溃（非 JS 异常，ErrorBoundary 无法拦截）
- **修复方案**：绕过 `convertFromArrayBuffer`，用浏览器原生 `AudioContext.decodeAudioData()` 解码 webm/opus → 重采样到 16kHz → 直传 Float32Array 给 `whisper.transcribe`
- **崩溃防护**：
  - 主进程 `render-process-gone` 自动重载页面（最多 2 次），`did-finish-load` 后重置计数
  - WhisperService 新增 `crashed` 状态，崩溃后拒绝再次调用 WASM，重新加载模型后重置
  - SettingsPanel 环境检查显示 WASM 崩溃警告
  - 单线程模式（threads: 1）降低并发风险

### 6. 连续对话模式
- **状态**：✅ 已完成（2026-04-29）
- **功能**：
  - VoiceAssistantPanel 新增"连续对话"开关
  - 本地 Web Speech API TTS（`speakLocal`），可检测 `onend` 事件
  - TTS 结束后自动开始聆听 → 识别 → AI 回复 → TTS → 循环
  - 状态栏显示当前状态（聆听中/思考中/播报中/等待开始）
  - 开始/结束对话控制按钮
  - 麦克风权限失败自动停止并提示

### 7. STT 测试前端 WASM 优先
- **状态**：✅ 已完成（2026-04-29）
- **功能**：
  - SettingsPanel VoiceTab 新增 `useWhisperService` hook
  - 根据 `whisperUseWasm` 配置和 WASM 模型加载状态自动选择引擎
  - WASM 已加载 → 前端识别；未加载 → 提示并回退后端；原生模式 → 后端识别
  - WASM 识别失败时自动回退到后端

### 8. 错误边界（ErrorBoundary）
- **状态**：✅ 已完成（2026-04-29）
- **功能**：
  - 捕获 React 渲染错误，显示恢复界面
  - App 根组件包裹，防止单组件崩溃导致全屏黑屏
  - VoiceAssistantPanel 单独包裹（Sidebar 中），fallback 为 null