import React, { createContext, useContext, useState, useEffect } from 'react';

type WebSocketConfig = {
  ip: string;
  port: string;
  setConfig: (ip: string, port: string) => void;
  swapTrafficStats: boolean;
  setSwapTrafficStats: (swap: boolean) => void;
};

const WebSocketConfigContext = createContext<WebSocketConfig & { isConfigLocked: boolean }>({
  ip: '',
  port: '',
  setConfig: () => {},
  isConfigLocked: false,
  swapTrafficStats: false,
  setSwapTrafficStats: () => {},
});

export const useWebSocketConfig = () => useContext(WebSocketConfigContext);

const resolveConfigHost = (host: string) => {
  const trimmedHost = String(host || '').trim();
  const pageHost = typeof window !== 'undefined' ? window.location.hostname : '';

  if (trimmedHost && trimmedHost !== '0.0.0.0' && trimmedHost !== '::') {
    return trimmedHost;
  }

  if (pageHost && pageHost !== 'localhost' && pageHost !== '127.0.0.1' && pageHost !== '::1') {
    return pageHost;
  }

  return localStorage.getItem('modem_ip') || '192.168.123.1';
};

export const WebSocketConfigProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [isConfigLocked, setIsConfigLocked] = useState(false);
  const [swapTrafficStats, setSwapTrafficStats] = useState(false);

  useEffect(() => {
    // 检查public/config.json
    fetch('/config.json', { cache: 'no-store' })
      .then(async res => {
        if (res.ok) {
          const json = await res.json();
          if (json && json.status === 'true' && json.at && json.at.host && json.at.port) {
            setIp(resolveConfigHost(json.at.host));
            setPort(String(json.at.port));
            setIsConfigLocked(true);
            return;
          }
        }
        // fallback to localStorage
        setIp(localStorage.getItem('modem_ip') || '192.168.1.1');
        setPort(localStorage.getItem('modem_port') || '8765');
        setIsConfigLocked(false);
      })
      .catch(() => {
        setIp(localStorage.getItem('modem_ip') || '192.168.1.1');
        setPort(localStorage.getItem('modem_port') || '8765');
        setIsConfigLocked(false);
      });
    
    // 加载反转上下行统计设置
    const savedSwapTrafficStats = localStorage.getItem('modem_swap_traffic_stats');
    if (savedSwapTrafficStats !== null) {
      setSwapTrafficStats(savedSwapTrafficStats === 'true');
    }
  }, []);

  const setConfig = (newIp: string, newPort: string) => {
    if (isConfigLocked) return;
    setIp(newIp);
    setPort(newPort);
    localStorage.setItem('modem_ip', newIp);
    localStorage.setItem('modem_port', newPort);
  };

  const handleSetSwapTrafficStats = (swap: boolean) => {
    setSwapTrafficStats(swap);
    localStorage.setItem('modem_swap_traffic_stats', swap.toString());
  };

  return (
    <WebSocketConfigContext.Provider value={{ 
      ip, 
      port, 
      setConfig, 
      isConfigLocked, 
      swapTrafficStats, 
      setSwapTrafficStats: handleSetSwapTrafficStats 
    }}>
      {children}
    </WebSocketConfigContext.Provider>
  );
};
