/**
 * 主进程常量 — 从 shared 统一导出
 */

import { IPC_CHANNELS, APP_CONSTANTS, SHARED_DEFAULT_CONFIG, SessionStatus, AlertType, DisplayMode } from '../shared/constants';

export { IPC_CHANNELS, APP_CONSTANTS, SessionStatus, AlertType, DisplayMode };

/**
 * 自动检测 Claude CLI 路径
 */
function detectClaudeCommand(): string {
  const { execSync } = require('child_process');
  try {
    const result = execSync('where claude 2>nul || which claude 2>/dev/null', { encoding: 'utf-8' });
    const paths: string[] = result.trim().split(/\r?\n/);
    const cmdPath = paths.find((p: string) => p.trim().endsWith('.cmd'));
    return (cmdPath || paths[0]).trim();
  } catch {
    const homeDir = require('os').homedir();
    const path = require('path');
    const candidates = [
      path.join(homeDir, '.local', 'bin', 'claude.exe'),
      path.join(homeDir, '.local', 'bin', 'claude'),
    ];
    for (const p of candidates) {
      try {
        require('fs').accessSync(p);
        return p;
      } catch { /* continue */ }
    }
    return 'claude';
  }
}

export const DEFAULT_CONFIG = {
  ...SHARED_DEFAULT_CONFIG,
  claudeCommand: detectClaudeCommand(),
};
