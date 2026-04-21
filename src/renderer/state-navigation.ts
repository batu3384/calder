export class RendererStateNavigation {
  private history: string[] = [];
  private index = -1;
  private suppressPush = false;

  constructor(private readonly maxEntries: number) {}

  push(sessionId: string | null | undefined): void {
    if (!sessionId || this.suppressPush) return;
    if (this.history[this.index] === sessionId) return;
    this.history.length = this.index + 1;
    this.history.push(sessionId);
    if (this.history.length > this.maxEntries) {
      const drop = this.history.length - this.maxEntries;
      this.history.splice(0, drop);
    }
    this.index = this.history.length - 1;
  }

  prune(sessionId: string): void {
    let i = 0;
    while (i < this.history.length) {
      if (this.history[i] === sessionId) {
        this.history.splice(i, 1);
        if (i <= this.index) this.index--;
      } else {
        i++;
      }
    }
  }

  step<T>(
    direction: 1 | -1,
    resolve: (sessionId: string) => T | undefined,
    activate: (resolved: T, sessionId: string) => void,
  ): void {
    let i = this.index + direction;
    while (i >= 0 && i < this.history.length) {
      const sessionId = this.history[i];
      const resolved = resolve(sessionId);
      if (resolved !== undefined) {
        this.index = i;
        this.suppressPush = true;
        try {
          activate(resolved, sessionId);
        } finally {
          this.suppressPush = false;
        }
        return;
      }

      // Stale entry: remove and continue.
      this.history.splice(i, 1);
      if (direction === -1) i--;
      if (i < this.index) this.index--;
    }
  }

  resetForTesting(): void {
    this.history = [];
    this.index = -1;
    this.suppressPush = false;
  }
}
