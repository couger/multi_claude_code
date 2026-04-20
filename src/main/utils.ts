/**
 * 主进程共享工具函数
 */

import os from 'os';

/** 获取本机所有 IPv4 地址（去重） */
export function getLocalIPv4s(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name in interfaces) {
    const nets = interfaces[name];
    if (!nets) continue;
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}
