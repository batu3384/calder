/**
 * Batched event emitter for renderer state.
 * Batches rapid successive emits into a single microtask flush.
 * Prevents expensive re-renders when multiple state changes fire in quick succession.
 */

export type EventCallback = (data?: unknown) => void;
export type EventType = string;

interface QueuedEvent {
  event: EventType;
  data?: unknown;
}

function shouldBatchEmits(): boolean {
  return typeof process === 'undefined' || process.env.VITEST !== 'true';
}

export class BatchedEventEmitter {
  private listeners = new Map<EventType, Set<EventCallback>>();
  private queue: QueuedEvent[] = [];
  private flushScheduled = false;
  private iterating = false;
  private pendingAdds = new Map<EventType, Set<EventCallback>>();
  private pendingRemoves = new Map<EventType, Set<EventCallback>>();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on(event: EventType, cb: EventCallback): () => void {
    if (this.iterating) {
      if (!this.pendingAdds.has(event)) this.pendingAdds.set(event, new Set());
      this.pendingAdds.get(event)!.add(cb);
      return () => this.removePending(event, cb);
    }
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.remove(event, cb);
  }

  /**
   * Emit an event. Calls are batched via queueMicrotask in production.
   * Duplicate events of the same type are deduplicated — only the latest data is kept.
   */
  emit(event: EventType, data?: unknown): void {
    this.queue.push({ event, data });
    if (shouldBatchEmits()) {
      if (!this.flushScheduled) {
        this.flushScheduled = true;
        queueMicrotask(() => this.flush());
      }
      return;
    }
    this.flush();
  }

  private flush(): void {
    this.flushScheduled = false;
    if (this.queue.length === 0) return;

    const latest = new Map<EventType, unknown>();
    for (const { event, data } of this.queue) {
      latest.set(event, data);
    }
    this.queue = [];

    this.iterating = true;
    for (const [event, data] of latest) {
      const cbs = this.listeners.get(event);
      if (cbs) {
        for (const cb of cbs) {
          try {
            cb(data);
          } catch (err) {
            console.error(`[BatchedEventEmitter] Error in event handler for "${event}":`, err);
          }
        }
      }
    }
    this.iterating = false;

    this.applyPending(this.pendingAdds);
    this.applyPending(this.pendingRemoves);
    this.pendingAdds.clear();
    this.pendingRemoves.clear();
  }

  private remove(event: EventType, cb: EventCallback): void {
    this.listeners.get(event)?.delete(cb);
  }

  private removePending(event: EventType, cb: EventCallback): void {
    this.pendingAdds.get(event)?.delete(cb);
  }

  private applyPending(map: Map<EventType, Set<EventCallback>>): void {
    for (const [event, cbs] of map) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      for (const cb of cbs) {
        this.listeners.get(event)!.add(cb);
      }
    }
  }

  removeAll(event: EventType): void {
    this.listeners.delete(event);
    this.pendingAdds.delete(event);
    this.pendingRemoves.delete(event);
    this.queue = this.queue.filter((q) => q.event !== event);
  }

  destroy(): void {
    this.listeners.clear();
    this.pendingAdds.clear();
    this.pendingRemoves.clear();
    this.queue = [];
    this.flushScheduled = false;
    this.iterating = false;
  }
}
