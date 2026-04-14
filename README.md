# Multi-Claude Code Manager

一个基于 Electron 的 CLI 会话管理工具，用于管理和监控多个命令行会话。

## 功能特性

- **多会话管理**：创建、管理和监控多个 CLI 会话
- **双显示模式**：支持缩略图模式和图标模式切换
- **实时输出预览**：查看会话的实时输出内容
- **会话分组**：将相关会话分组管理
- **性能监控**：实时监控系统资源使用情况（CPU、内存、磁盘）
- **远程访问**：支持通过 Web 浏览器远程访问应用界面
- **告警系统**：实时显示会话状态变化和任务完成通知
- **批量操作**：支持批量创建、暂停、恢复和导出会话

## 技术栈

- **前端**：React + TypeScript + Tailwind CSS
- **后端**：Electron + Node.js
- **状态管理**：Zustand
- **构建工具**：Vite

## 项目结构

```
multi_claude_code/
├── src/
│   ├── main/           # Electron 主进程代码
│   │   ├── index.ts    # 主进程入口
│   │   ├── ProcessManager.ts  # 进程管理
│   │   ├── GroupManager.ts    # 分组管理
│   │   └── PerformanceMonitor.ts # 性能监控
│   ├── renderer/       # 渲染进程代码
│   │   ├── App.tsx     # 主应用组件
│   │   ├── components/ # React 组件
│   │   ├── stores/     # Zustand 状态管理
│   │   └── styles/     # 样式文件
│   └── preload/        # 预加载脚本
├── package.json        # 项目依赖和脚本
├── tsconfig.json       # TypeScript 配置
├── vite.config.ts      # Vite 配置
└── tailwind.config.js  # Tailwind CSS 配置
```

## 快速开始

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```

### 构建应用
```bash
npm run build
```

### 生产模式
```bash
npm run start
```

## 使用说明

### 创建会话
1. 点击侧边栏的"新建会话"按钮
2. 输入会话名称（可选）
3. 选择工作目录（可选）
4. 点击创建

### 切换显示模式
- 点击侧边栏顶部的显示模式切换按钮在缩略图模式和图标模式之间切换
- 缩略图模式：显示会话的备注预览
- 图标模式：紧凑显示，适合大量会话

### 会话管理
- **展开会话**：点击会话卡片查看详细输出
- **关闭会话**：点击会话卡片右上角的关闭按钮
- **设置备注**：在会话详情中设置备注信息
- **批量操作**：在设置面板中进行批量操作

### 远程访问
1. 在设置面板的"网络"标签页中启用远程访问
2. 设置访问端口（默认：3000）
3. 复制访问令牌和访问地址
4. 在局域网内的浏览器中访问

## 配置说明

### 环境变量
- `PORT`：HTTP 服务器端口（默认：3000）
- `NODE_ENV`：运行环境（development/production）

### 快捷键
- `Ctrl/Cmd + N`：新建会话
- `Ctrl/Cmd + ,`：打开设置面板
- `Esc`：关闭当前展开的会话

## 开发指南

### 代码规范
- 使用 TypeScript 严格模式
- 遵循 React Hooks 最佳实践
- 使用 Tailwind CSS 进行样式设计
- 组件使用函数式组件和 TypeScript 接口

### 状态管理
- 使用 Zustand 进行全局状态管理
- 会话状态存储在 `sessionStore.ts` 中
- 使用 Immer 进行不可变状态更新

### IPC 通信
- 主进程和渲染进程通过预定义通道通信
- IPC 通道定义在 `src/main/constants.ts` 和 `src/renderer/constants.ts` 中
- 使用类型安全的 IPC 处理函数

## 故障排除

### 常见问题
1. **会话无法创建**：检查工作目录权限和路径有效性
2. **远程访问无法连接**：检查防火墙设置和端口占用
3. **性能监控不显示**：检查系统权限和 Node.js 版本

### 日志查看
- 开发模式：查看终端输出
- 生产模式：日志文件位于 `logs/` 目录

## 许可证

本项目基于 MIT 许可证开源。

## 贡献指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 更新日志

### v1.0.0
- 初始版本发布
- 基础会话管理功能
- 双显示模式支持
- 远程访问功能
- 性能监控面板