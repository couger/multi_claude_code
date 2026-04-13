@echo off
chcp 65001 >nul 2>&1
title Claude Code CLI Manager - 启动中...
echo 正在启动 Claude Code CLI Manager...
echo.
cd /d "%~dp0"

:: 清除 ELECTRON_RUN_AS_NODE 环境变量（VS Code 终端可能设置）
set ELECTRON_RUN_AS_NODE=

:: 启动开发服务器
npx vite

pause
