import { vi } from 'vitest';

const providerCaps = new Map([
  [
    'claude',
    {
      sessionResume: true,
      costTracking: true,
      contextWindow: true,
      pendingPromptTrigger: 'startup-arg',
    },
  ],
  [
    'antigravity',
    {
      sessionResume: true,
      costTracking: true,
      contextWindow: true,
      pendingPromptTrigger: 'startup-arg',
    },
  ],
  [
    'codex',
    {
      sessionResume: true,
      costTracking: true,
      contextWindow: true,
      pendingPromptTrigger: 'startup-arg',
    },
  ],
  [
    'cursor',
    {
      sessionResume: true,
      costTracking: false,
      contextWindow: false,
      pendingPromptTrigger: 'startup-arg',
    },
  ],
]);
const providerNames = new Map([
  ['claude', 'Claude Code'],
  ['antigravity', 'Antigravity CLI'],
  ['codex', 'Codex CLI'],
  ['cursor', 'Cursor CLI'],
]);

export const mockPtyWrite = vi.fn();
export const mockPtyKill = vi.fn();
export const webLinksActivateRef: {
  current: null | ((event: MouseEvent, url: string) => void);
} = { current: null };
export const terminalOptionsRef: { current: null | Record<string, unknown> } = { current: null };
export const mockDomSelectionClear = vi.fn();

export class FakeTerminal {
  cols = 120;
  rows = 30;
  loadedAddons: unknown[] = [];
  registerLinkProvider = vi.fn();
  open = vi.fn();
  write = vi.fn();
  focus = vi.fn();
  dispose = vi.fn();
  private keyHandler: ((e: KeyboardEvent) => boolean) | null = null;
  private onDataHandlers: Array<(data: string) => void> = [];
  private _selection = '';
  private _viewportLine = '';
  buffer = {
    active: {
      viewportY: 0,
      getLine: (_lineIndex: number) =>
        this._viewportLine ? { translateToString: () => this._viewportLine } : null,
    },
  };

  constructor(options?: Record<string, unknown>) {
    terminalOptionsRef.current = options ?? null;
  }

  loadAddon(addon: unknown): void {
    this.loadedAddons.push(addon);
  }
  attachCustomKeyEventHandler(handler: (e: KeyboardEvent) => boolean): void {
    this.keyHandler = handler;
  }
  simulateKey(event: Partial<KeyboardEvent>): boolean {
    return this.keyHandler ? this.keyHandler(event as KeyboardEvent) : true;
  }
  setViewportLine(text: string): void {
    this._viewportLine = text;
  }
  getSelection(): string {
    return this._selection;
  }
  setSelection(s: string): void {
    this._selection = s;
  }
  clearSelection = vi.fn(() => {
    this._selection = '';
  });
  onData(handler: (data: string) => void): void {
    this.onDataHandlers.push(handler);
  }
  emitData(data: string): void {
    for (const handler of this.onDataHandlers) {
      handler(data);
    }
  }
}

vi.mock('@xterm/xterm', () => ({ Terminal: FakeTerminal }));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class FakeFitAddon {
    fit(): void {}
  },
}));

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class FakeWebglAddon {},
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: class FakeSearchAddon {},
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class FakeWebLinksAddon {
    constructor(cb: (event: MouseEvent, url: string) => void) {
      webLinksActivateRef.current = cb;
    }
  },
}));

vi.mock('./surface-services/session-activity.js', () => ({
  initSession: vi.fn(),
  removeSession: vi.fn(),
}));

vi.mock('./surface-services/session-insights.js', () => ({
  markFreshSession: vi.fn(),
}));

vi.mock('../session-cost.js', () => ({
  removeSession: vi.fn(),
}));

vi.mock('../session-context.js', () => ({
  removeSession: vi.fn(),
}));

vi.mock('./surface-services/provider-availability.js', () => ({
  getProviderCapabilities: vi.fn((providerId: string) => providerCaps.get(providerId) ?? null),
  getProviderDisplayName: vi.fn(
    (providerId: string) => providerNames.get(providerId) ?? providerId,
  ),
}));

vi.mock('./terminal-link-provider.js', () => ({
  FilePathLinkProvider: class FakeFilePathLinkProvider {},
  GithubLinkProvider: class FakeGithubLinkProvider {},
}));

class FakeClassList {
  private values = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) this.values.add(token);
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) this.values.delete(token);
  }

  toggle(token: string, force?: boolean): boolean {
    const shouldAdd = force ?? !this.values.has(token);
    if (shouldAdd) this.values.add(token);
    else this.values.delete(token);
    return shouldAdd;
  }

  contains(token: string): boolean {
    return this.values.has(token);
  }
}

export class FakeElement {
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  className = '';
  classList = new FakeClassList();
  dataset: Record<string, string> = {};
  textContent = '';
  private listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(public tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  getBoundingClientRect(): DOMRect {
    return {
      left: 0,
      top: 0,
      right: 1200,
      bottom: 300,
      width: 1200,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  }

  querySelector(selector: string): FakeElement | null {
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      return this.find(
        (child) =>
          child.className.split(/\s+/).includes(className) || child.classList.contains(className),
      );
    }
    return null;
  }

  private find(predicate: (el: FakeElement) => boolean): FakeElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.find(predicate);
      if (nested) return nested;
    }
    return null;
  }

  closest(selector: string): FakeElement | null {
    if (!selector.startsWith('.')) return null;
    const className = selector.slice(1);
    let current: FakeElement | null = this;
    while (current) {
      const classes = current.className.split(/\s+/).filter(Boolean);
      if (classes.includes(className) || current.classList.contains(className)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }
}

export class FakeDocument {
  body = new FakeElement('body');
  activeElement: FakeElement | null = null;

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}

export const mockClipboardWrite = vi.fn();

export function makeWindowStub() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getSelection: () => ({
      removeAllRanges: mockDomSelectionClear,
    }),
    calder: {
      pty: {
        write: mockPtyWrite,
        kill: mockPtyKill,
        resize: vi.fn(),
        create: vi.fn(),
      },
      git: { getRemoteUrl: vi.fn(async () => null) },
      app: { openExternal: vi.fn() },
    },
  };
}
