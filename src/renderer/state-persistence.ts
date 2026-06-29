import type { PersistedState } from '../shared/types/project-state.js';

export type PersistedStateSave = (snapshot: PersistedState) => unknown;
export type PersistedStateErrorHandler = (error: unknown) => void;

function isPromiseLike(value: unknown): value is Promise<void> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

export class RendererPersistQueue {
  private persistInFlight = false;
  private pendingSnapshots: PersistedState[] = [];
  private retrySnapshot: PersistedState | null = null;

  constructor(
    private readonly save: PersistedStateSave,
    private readonly onError: PersistedStateErrorHandler,
  ) {}

  enqueue(snapshot: PersistedState): void {
    this.pendingSnapshots.push(snapshot);
    if (this.persistInFlight) return;
    void this.flush();
  }

  resetForTesting(): void {
    this.persistInFlight = false;
    this.pendingSnapshots = [];
    this.retrySnapshot = null;
  }

  private dequeueLatestSnapshot(): PersistedState | null {
    if (this.retrySnapshot) {
      const snapshot = this.retrySnapshot;
      this.retrySnapshot = null;
      return snapshot;
    }
    if (this.pendingSnapshots.length === 0) return null;
    const latest = this.pendingSnapshots[this.pendingSnapshots.length - 1]!;
    this.pendingSnapshots = [];
    return latest;
  }

  private async flush(): Promise<void> {
    if (this.persistInFlight) return;
    this.persistInFlight = true;

    try {
      while (this.pendingSnapshots.length > 0 || this.retrySnapshot) {
        const nextSnapshot = this.dequeueLatestSnapshot();
        if (!nextSnapshot) break;
        try {
          const saveResult = this.save(nextSnapshot);
          if (isPromiseLike(saveResult)) {
            await saveResult;
          }
        } catch (error) {
          this.retrySnapshot = nextSnapshot;
          this.onError(error);
          break;
        }
      }
    } finally {
      this.persistInFlight = false;
      if (this.pendingSnapshots.length > 0 || this.retrySnapshot) {
        void this.flush();
      }
    }
  }
}
