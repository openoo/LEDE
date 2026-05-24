import wsService from '@/services/websocket';

let currentATListener: ((msg: string) => void) | null = null;
const atQueue: (() => Promise<any>)[] = [];
let atBusy = false;

// 全局 group 状态管理
let currentGroup: string | null = null;
let groupReadyPromise: Promise<string> | null = null;
let groupReadyResolve: ((group: string) => void) | null = null;
let lastGroupKey: string | null = null;

function genMsgId() {
  return Date.now().toString() + Math.random().toString(16).slice(2);
}

// 将二进制数据编码为十六进制字符串（小写）
function hexEncode(bytes: number[]): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] & 0xff;
    out += hex[(b >> 4) & 0x0f] + hex[b & 0x0f];
  }
  return out;
}

// 生成基于多步变换的 msg_id 校验字符串
function generateMsgIdCheck(msgId: string): string {
  if (!msgId) return '';
  // 1) 去空白
  const trimmed = msgId.trim();
  if (!trimmed) return '';

  // 使用字节数组进行后续运算
  const buf: number[] = Array.from(trimmed).map((ch) => ch.charCodeAt(0) & 0xff);
  const n = buf.length;

  // 2) 反转（异或交换实现）
  let i = 0;
  let j = n - 1;
  while (i < j) {
    buf[i] ^= buf[j];
    buf[j] ^= buf[i];
    buf[i] ^= buf[j];
    i++; j--;
  }

  // 3) 全体字符按位异或掩码
  const mask = 0x5a;
  for (let k = 0; k < n; k++) {
    buf[k] = (buf[k] ^ mask) & 0xff;
  }

  // 4) 环形左移 3 位（按字节内比特）
  for (let k = 0; k < n; k++) {
    const b = buf[k] & 0xff;
    buf[k] = ((b << 3) | (b >>> 5)) & 0xff;
  }

  // 5) 与长度和固定盐交织 + 末尾追加一个简单校验位（异或累加）
  const salt = ['h', 'v'];
  const interm: number[] = [];
  for (let k = 0; k < n; k++) {
    interm.push(buf[k]);
    interm.push('0'.charCodeAt(0) + (n % 10));
    interm.push(salt[k % 2].charCodeAt(0));
  }
  let acc = 0;
  for (let k = 0; k < n; k++) acc ^= buf[k] & 0xff;
  interm.push('a'.charCodeAt(0) + (acc % 26));

  // 6) 十六进制编码为可打印字符串（小写）
  return hexEncode(interm);
}

export function sendATQueued(cmd: string, expectOKOnly = false): Promise<string> {
  if (!cmd) return Promise.resolve('');
  const msgId = genMsgId();
  return new Promise((resolve, reject) => {
    atQueue.push(() => sendATTransaction(cmd, msgId, expectOKOnly).then(resolve, reject));
    processATQueue();
  });
}
function processATQueue() {
  if (atBusy || atQueue.length === 0) return;
  atBusy = true;
  const task = atQueue.shift();
  task!().finally(() => {
    atBusy = false;
    processATQueue();
  });
}
function sendATTransaction(cmd: string, msgId: string, expectOKOnly = false): Promise<string> {
  return new Promise((resolve, reject) => {
    let timeout: any;
    if (currentATListener) {
      // 兼容老逻辑，移除旧的 listener
      wsService.removeListener(currentATListener);
      currentATListener = null;
    }
    let buffer = '';
    const handle = (msg: string) => {
      try {
        const obj = JSON.parse(msg);
        if (obj.msg_id !== msgId) return; // 只处理自己id的响应
        const expectedCheck = generateMsgIdCheck(msgId);
        if (obj.msg_check !== expectedCheck) return; // 需要同时校验msg_check
        buffer += (buffer ? '\n' : '') + (obj.result || '');
        if (/OK/.test(buffer) || 
          /ERROR/.test(buffer) ||
          /BUSY/.test(buffer)) {
          clearTimeout(timeout);
          wsService.removeATListener(msgId);
          currentATListener = null;
          resolve(buffer);
        }
      } catch {
        // 非JSON格式，忽略
      }
    };
    currentATListener = handle;
    wsService.addATListener(msgId, handle);
    // 新增：支持 AT 命令被中断时立即 reject
    const interruptHandler = (msg: string) => {
      clearTimeout(timeout);
      wsService.removeATListener(msgId);
      currentATListener = null;
      reject(msg || 'AT命令被中断/页面切换');
    };
    // 兼容 wsService.clearAllATListeners 主动回调
    wsService.addATListener(msgId, (msg: string) => {
      try { handle(msg); } catch (e) {}
      if (msg && /中断|取消/.test(msg)) interruptHandler(msg);
    });
    timeout = setTimeout(() => {
      wsService.removeATListener(msgId);
      currentATListener = null;
      reject('AT命令超时');
    }, 6000);
    wsService.send(JSON.stringify({ msg_id: msgId, cmd_to_send: cmd }));
  });
}

/**
 * 重置 groupReady 状态（如切换IP/port时调用）
 */
export function resetGroupReady() {
  currentGroup = null;
  groupReadyPromise = null;
  groupReadyResolve = null;
  lastGroupKey = null;
}

function getGroupStorageKey(ip: string, port: string) {
  return `modem_cmd_group_${ip}_${port}`;
}

// 获取当前已识别的group，始终优先等groupReadyPromise，保证并发安全
export async function getCurrentGroupAsync(ip?: string, port?: string): Promise<string> {
  if (groupReadyPromise) {
    const group = await groupReadyPromise;
    return group ?? 'Quectel_AT';
  }
  if (currentGroup) return currentGroup;
  // cold start兜底
  if (ip && port) {
    const key = getGroupStorageKey(ip, port);
    const stored = localStorage.getItem(key);
    if (stored) return stored;
  }
  return 'Quectel_AT';
}

// 串行化group识别流程，保证同一ip/port下只会有一个groupReadyPromise
export async function ensureGroupReady(ip: string, port: string): Promise<string> {
  const groupKey = ip + ':' + port;
  if (currentGroup && lastGroupKey === groupKey) {
    return currentGroup;
  }
  if (!groupReadyPromise || lastGroupKey !== groupKey) {
    groupReadyPromise = new Promise(resolve => {
      groupReadyResolve = resolve;
    });
    lastGroupKey = groupKey;
    // 连接好后自动发ATI
    if (!wsService.getStatus || wsService.getStatus() !== 'open') {
      await new Promise<void>(resolve => wsService.addOnOpenCallback(resolve));
    }
    const atiRaw = await sendATQueued('ATI', true);
    const { parseATISystemInfo, setRememberedCommandGroup } = await import('@/utils/atModule');
    const { detectedGroup } = parseATISystemInfo(atiRaw);
    currentGroup = detectedGroup || 'Quectel_AT';
    setRememberedCommandGroup(ip, port, currentGroup);
    localStorage.setItem(getGroupStorageKey(ip, port), currentGroup);
    groupReadyResolve && groupReadyResolve(currentGroup);
  }
  const group = await groupReadyPromise;
  return group ?? 'Quectel_AT';
}

/**
 * 全局安全AT命令发送器，确保WebSocket连接和group识别后再发送AT命令。
 * @param cmd AT命令字符串
 * @param options { expectOKOnly, ip, port }
 * @returns Promise<string>
 */
export async function safeSendAT(cmd: string, options?: {
  expectOKOnly?: boolean;
  ip?: string;
  port?: string;
}): Promise<string> {
  // 1. 等待WebSocket连接和group识别
  let group = 'Quectel_AT';
  if (options?.ip && options?.port) {
    group = await ensureGroupReady(options.ip, options.port);
  } else {
    // 没有ip/port时只保证WebSocket连接
    if (!wsService.getStatus || wsService.getStatus() !== 'open') {
      await new Promise<void>(resolve => wsService.addOnOpenCallback(resolve));
    }
  }
  // 2. 发送AT命令
  return sendATQueued(cmd, options?.expectOKOnly);
} 
