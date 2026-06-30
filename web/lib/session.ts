// Client-side manager for one Hangar session: a single WebSocket shared by all
// terminals (tabs) + the file tree. Terminal output is routed by terminalId;
// everything else (status/ready/dir/file/error) goes to control listeners.
export type ControlMsg = Record<string, unknown> & { type: string };

export class HangarSession {
  private ws: WebSocket;
  private dataCbs = new Map<string, (b64: string) => void>();
  private listeners = new Set<(m: ControlMsg) => void>();
  sandboxId: string | null = null;

  constructor(url: string, auth: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () =>
      this.ws.send(JSON.stringify({ type: "start", auth, cols: 80, rows: 24 }));
    this.ws.onmessage = (ev) => {
      let m: ControlMsg;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.type === "data") {
        this.dataCbs.get(m.terminalId as string)?.(m.data as string);
        return;
      }
      if (m.type === "ready") this.sandboxId = (m.sandboxId as string) ?? null;
      this.listeners.forEach((l) => l(m));
    };
    this.ws.onclose = () => this.listeners.forEach((l) => l({ type: "_closed" }));
    this.ws.onerror = () => this.listeners.forEach((l) => l({ type: "_error" }));
  }

  /** Subscribe to control messages; returns an unsubscribe fn. */
  on(cb: (m: ControlMsg) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
  onData(id: string, cb: (b64: string) => void) {
    this.dataCbs.set(id, cb);
  }
  offData(id: string) {
    this.dataCbs.delete(id);
  }

  private out(o: Record<string, unknown>) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o));
  }
  openTerminal(id: string, cols: number, rows: number) {
    this.out({ type: "open", terminalId: id, cols, rows });
  }
  input(id: string, data: string) {
    this.out({ type: "input", terminalId: id, data });
  }
  resize(id: string, cols: number, rows: number) {
    this.out({ type: "resize", terminalId: id, cols, rows });
  }
  closeTerminal(id: string) {
    this.out({ type: "close", terminalId: id });
  }
  listDir(path?: string) {
    this.out({ type: "fs.list", path });
  }
  readFile(path: string) {
    this.out({ type: "fs.read", path });
  }
  dispose() {
    try {
      this.ws.close();
    } catch {
      /* noop */
    }
  }
}
