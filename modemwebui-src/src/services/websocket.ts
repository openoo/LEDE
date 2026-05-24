// 优化后的 WebSocket 单例服务，支持断线重连、并发复用、连接状态管理
class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private listeners: ((msg: string) => void)[] = [];
  private atListeners: Map<string, (msg: string) => void> = new Map();
  private url: string = '';
  private reconnectTimer: any = null;
  private isManuallyClosed = false;
  private status: 'idle' | 'connecting' | 'open' | 'closed' = 'idle';
  private onOpenCallbacks: (() => void)[] = [];
  private connectId: number = 0; // 新增：连接ID

  private constructor() {}

  public static getInstance() {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public connect(url: string) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.url = url;
    this.isManuallyClosed = false;
    this.createWebSocket();
  }

  private createWebSocket() {
    this.connectId += 1; // 每次新建连接自增
    this.status = 'connecting';
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.status = 'open';
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      // 执行所有onOpen回调
      this.onOpenCallbacks.forEach(cb => {
        try { cb(); } catch (e) { console.error('[WebSocket] onOpen回调异常', e); }
      });
      this.onOpenCallbacks = [];
    };
    this.ws.onclose = (e) => {
      this.status = 'closed';
      this.ws = null;
      // 断开时清理所有 AT 命令监听，防止死等
      this.clearAllATListeners('WebSocket断开，命令取消');
      if (!this.isManuallyClosed) {
        this.reconnectTimer = setTimeout(() => this.createWebSocket(), 3000);
      }
    };
    this.ws.onerror = (e) => {
      this.ws?.close();
    };
    this.ws.onmessage = (event) => {
      // 优先分发给 atListeners（按 id 匹配）
      try {
        const obj = JSON.parse(event.data);
        if (obj && obj.msg_id && this.atListeners.has(obj.msg_id)) {
          this.atListeners.get(obj.msg_id)?.(event.data);
          return;
        }
      } catch {
        // 非 JSON 格式，忽略
      }
      // 兼容原有 listeners
      this.listeners.forEach((cb) => cb(event.data));
    };
  }

  public send(msg: string | object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (typeof msg === 'object') {
        this.ws.send(JSON.stringify(msg));
      } else {
        this.ws.send(msg);
      }
    }
  }

  public addListener(cb: (msg: string) => void) {
    this.listeners.push(cb);
  }

  public removeListener(cb: (msg: string) => void) {
    this.listeners = this.listeners.filter((fn) => fn !== cb);
  }

  public addATListener(id: string, cb: (msg: string) => void) {
    this.atListeners.set(id, cb);
  }
  
  public removeATListener(id: string) {
    this.atListeners.delete(id);
  }

  // 新增：清理所有 AT 命令监听
  public clearAllATListeners(msg?: string) {
    this.atListeners.forEach((cb, id) => {
      try { cb(msg || 'AT命令被中断/页面切换'); } catch (e) {}
    });
    this.atListeners.clear();
  }

  public close() {
    this.isManuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.status = 'closed';
  }

  public getStatus() {
    return this.status;
  }

  public addOnOpenCallback(cb: () => void) {
    this.onOpenCallbacks.push(cb);
  }

  // 新增：移除 onOpen 回调
  public removeOnOpenCallback(cb: () => void) {
    this.onOpenCallbacks = this.onOpenCallbacks.filter(fn => fn !== cb);
  }

  public getConnectId() {
    return this.connectId;
  }
}

export default WebSocketService.getInstance();
