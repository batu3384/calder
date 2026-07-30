/**
 * Coalesce high-frequency PTY chunks into one write per animation frame.
 * Prevents xterm + IPC consumers from doing work on every node-pty fragment.
 */
export function createPtyWriteBatcher(write: (sessionId: string, data: string) => void): {
  enqueue: (sessionId: string, data: string) => void;
  flush: (sessionId?: string) => void;
  clear: (sessionId: string) => void;
} {
  const pending = new Map<string, string>();
  let frame: number | null = null;

  const schedule =
    typeof requestAnimationFrame === 'function'
      ? (cb: FrameRequestCallback): number => requestAnimationFrame(cb)
      : (cb: FrameRequestCallback): number =>
          globalThis.setTimeout(() => cb(Date.now()), 16) as unknown as number;

  const cancel =
    typeof cancelAnimationFrame === 'function'
      ? (id: number): void => cancelAnimationFrame(id)
      : (id: number): void => globalThis.clearTimeout(id);

  const flushAll = (): void => {
    frame = null;
    for (const [sessionId, data] of pending) {
      pending.delete(sessionId);
      if (data) write(sessionId, data);
    }
  };

  return {
    enqueue(sessionId: string, data: string): void {
      if (!data) return;
      pending.set(sessionId, (pending.get(sessionId) ?? '') + data);
      if (frame !== null) return;
      frame = schedule(flushAll);
    },
    flush(sessionId?: string): void {
      if (sessionId) {
        const data = pending.get(sessionId);
        pending.delete(sessionId);
        if (data) write(sessionId, data);
        return;
      }
      if (frame !== null) {
        cancel(frame);
        frame = null;
      }
      flushAll();
    },
    clear(sessionId: string): void {
      pending.delete(sessionId);
    },
  };
}
