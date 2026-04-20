import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// 远程访问状态类型
interface RemoteStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  token: string;
  localIPs: string[];
}

interface RemoteStatusWidgetProps {
  remoteStatus: RemoteStatus | null;
  togglingRemote: boolean;
  onToggleRemote: () => void;
  onCopyToken: () => void;
}

const RemoteStatusWidget: React.FC<RemoteStatusWidgetProps> = ({
  remoteStatus,
  togglingRemote,
  onToggleRemote,
  onCopyToken,
}) => {
  const [tokenCopied, setTokenCopied] = useState(false);
  const [copiedIP, setCopiedIP] = useState<string | null>(null);
  const [showAddresses, setShowAddresses] = useState(false);
  const addressHideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 选中的IP地址（从localStorage读取）
  const [selectedIPs, setSelectedIPs] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('remoteSelectedIPs');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // 监听localStorage变化以更新选中的IP
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'remoteSelectedIPs') {
        const saved = e.newValue;
        if (saved) {
          try {
            const parsed: string[] = JSON.parse(saved);
            setSelectedIPs(new Set(parsed));
          } catch {
            setSelectedIPs(new Set());
          }
        } else {
          setSelectedIPs(new Set());
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // 定期检查localStorage，确保与设置面板同步（因为storage事件有时不可靠）
    const interval = setInterval(() => {
      const saved = localStorage.getItem('remoteSelectedIPs');
      setSelectedIPs(prev => {
        if (saved) {
          try {
            const parsed: string[] = JSON.parse(saved);
            const newSet = new Set(parsed);
            // 只有当实际变化时才更新，避免不必要的重渲染
            if (prev.size !== newSet.size || ![...prev].every(ip => newSet.has(ip))) {
              return newSet;
            }
          } catch {
            // 如果解析失败，保持原状
          }
        } else {
          // 如果没有保存的数据，使用空集合
          if (prev.size !== 0) {
            return new Set();
          }
        }
        return prev;
      });
    }, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // 计算要显示的IP地址（根据选择过滤）
  const displayedIPs = useMemo(() => {
    if (!remoteStatus?.localIPs) return [];
    if (selectedIPs.size === 0) return remoteStatus.localIPs; // 没有选择时显示全部
    return remoteStatus.localIPs.filter(ip => selectedIPs.has(ip));
  }, [remoteStatus?.localIPs, selectedIPs]);

  if (!remoteStatus) return null;

  return (
    <div className="relative">
      {/* 第一行：网络状态 + 复制令牌 + 开关 + 下拉按钮 */}
      <div
        className="flex items-center justify-between p-2 bg-dark-900 rounded"
        onMouseEnter={() => {
          if (remoteStatus.running) {
            if (addressHideTimerRef.current) {
              clearTimeout(addressHideTimerRef.current);
              addressHideTimerRef.current = null;
            }
            setShowAddresses(true);
          }
        }}
        onMouseLeave={() => {
          if (showAddresses) {
            addressHideTimerRef.current = setTimeout(() => {
              setShowAddresses(false);
            }, 300);
          }
        }}
      >
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-dark-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
          <span className="text-xs text-dark-300">网络</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            remoteStatus.running
              ? 'bg-green-600/20 text-green-400'
              : remoteStatus.enabled
              ? 'bg-yellow-600/20 text-yellow-400'
              : 'bg-dark-600 text-dark-400'
          }`}>
            {remoteStatus.running ? '运行中' : remoteStatus.enabled ? '启动中' : '已停止'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleRemote}
            disabled={togglingRemote}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              remoteStatus.enabled ? 'bg-accent-primary' : 'bg-dark-600'
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              remoteStatus.enabled ? 'left-5' : 'left-0.5'
            }`} />
          </button>
        </div>
      </div>
      {/* 悬浮滑出地址列表 - 覆盖层方式，不影响其他元素 */}
      {remoteStatus.running && showAddresses && (
        <div
          className="absolute left-0 right-0 bottom-full mb-1 z-30 bg-dark-900 border border-dark-700 rounded shadow-lg"
          onMouseEnter={() => {
            if (addressHideTimerRef.current) {
              clearTimeout(addressHideTimerRef.current);
              addressHideTimerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            addressHideTimerRef.current = setTimeout(() => {
              setShowAddresses(false);
            }, 200);
          }}
        >
          <div className="p-2 border-b border-dark-700 flex items-center justify-between">
            <div className="text-xs text-dark-500">访问地址 {displayedIPs.length > 0 ? `(共 ${displayedIPs.length} 个)` : ''}</div>
            <button
              onClick={() => {
                onCopyToken();
                setTokenCopied(true);
                setTimeout(() => setTokenCopied(false), 2000);
              }}
              className="flex items-center gap-1 px-2 py-0.5 text-xs text-dark-400 hover:text-dark-200 bg-dark-800 rounded hover:bg-dark-700 transition-colors"
              title="复制令牌"
            >
              {tokenCopied ? (
                <>
                  <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-400">已复制</span>
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>复制令牌</span>
                </>
              )}
            </button>
          </div>
          {displayedIPs.length > 0 ? (
            <div className="max-h-48 overflow-y-auto">
              {displayedIPs.map((ip) => (
              <div key={ip} className="flex items-center justify-between p-2 hover:bg-dark-800 transition-colors border-b border-dark-800/50 last:border-b-0">
                <span className="text-xs text-dark-300 font-mono select-text">http://{ip}:{remoteStatus.port}</span>
                <button
                  onClick={async () => {
                    const url = `http://${ip}:${remoteStatus.port}/`;
                    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
                    setCopiedIP(ip);
                    setTimeout(() => setCopiedIP(null), 2000);
                  }}
                  className="p-1 rounded hover:bg-dark-700 transition-colors"
                  title="复制地址"
                >
                  {copiedIP === ip ? (
                    <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-dark-400 hover:text-dark-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
              ))}
            </div>
          ) : (
            <div className="p-3 text-xs text-dark-500 text-center">
              请在设置中选择要显示的IP地址
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RemoteStatusWidget;
