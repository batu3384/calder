import type { PersistedState } from '../shared/types/project-state.js';

export type PersistedStateSave = (snapshot: PersistedState) => unknown;
export type PersistedStateErrorHandler = (error: unknown) => void;

function isPromiseLike(value: unknown): value is Promise<void> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

export class RendererPersistQueue {
  private persistInFlight = false;
  private pendingPersistSnapshot: PersistedState | null = null;

  constructor(
    private readonly save: PersistedStateSave,
    private readonly onError: PersistedStateErrorHandler,
  ) {}

  enqueue(snapshot: PersistedState): void {
    this.pendingPersistSnapshot = snapshot;
    if (this.persistInFlight) return;
    void this.flush();
  }

  resetForTesting(): void {
    this.persistInFlight = false;
    this.pendingPersistSnapshot = null;
  }

  private async flush(): Promise<void> {
    if (this.persistInFlight) return;
    this.persistInFlight = true;

    try {
      while (this.pendingPersistSnapshot) {
        const nextSnapshot = this.pendingPersistSnapshot;
        this.pendingPersistSnapshot = null;
        try {
          const saveResult = this.save(nextSnapshot);
          if (isPromiseLike(saveResult)) {
            await saveResult;
          }
        } catch (error) {
          this.onError(error);
        }
      }
    } finally {
      this.persistInFlight = false;
      if (this.pendingPersistSnapshot) {
        void this.flush();
      }
    }
  }
}
