import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerCaps = new Map([
  ['claude', { costTracking: true, contextWindow: true, pendingPromptTrigger: 'startup-arg' }],
  ['copilot', { costTracking: false, contextWindow: false, pendingPromptTrigger: 'startup-arg' }],
  ['gemini', { costTracking: false, contextWindow: false, pendingPromptTrigger: 'startup-arg' }],
  ['codex', { costTracking: false, contextWindow: false, pendingPromptTrigger: 'startup-arg' }],
  ['qwen', { costTracking: false, contextWindow: false, pendingPromptTrigger: 'startup-arg' }],
  ['minimax', { costTracking: false, contextWindow: false, pendingPromptTrigger: 'startup-arg' }],
  ['blackbox', { costTracking: false, contextWindow: false, pendingPromptTrigger: 'startup-arg' }],
]);

const mockPtyWrite = vi.fn();
const mockPtyKill = vi.fn();
const webLinksActivateRef = vi.hoisted(() => ({
  current: null as null | ((event: MouseEvent, url: string) => void),
}));
const terminalOptionsRef = vi.hoisted(() => ({
  current: null as null | Record<string, unknown>,
}));
const mockDomSelectionClear = vi.hoisted(() => vi.fn());

class FakeTerminal {
  cols = 120;
  rows = 30;
  private keyHandler: ((e: KeyboardEvent) => boolean) | null = null;
  private _selection = '';
  private _viewportLine = '';
  buffer = {
    active: {
      viewportY: 0,
      getLine: (_lineIndex: number) => (
        this._viewportLine
          ? { translateToString: () => this._viewportLine }
          : null
      ),
    },
  };

  constructor(options?: Record<string, unknown>) {
    terminalOptionsRef.current = options ?? null;
  }

  loadAddon(): void {}
  attachCustomKeyEventHandler(handler: (e: KeyboardEvent) => boolean): void {
    this.keyHandler = handler;
  }
  simulateKey(event: Partial<KeyboardEvent>): boolean {
    return this.keyHandler ? this.keyHandler(event as KeyboardEvent) : true;
  }
  setViewportLine(text: string): void { this._viewportLine = text; }
  getSelection(): string { return this._selection; }
  setSelection(s: string): void { this._selection = s; }
  clearSelection = vi.fn(() => {
    this._selection = '';
  });
  registerLinkProvider(): void {}
  onData(): void {}
  open(): void {}
  write(): void {}
  focus(): void {}
  dispose(): void {}
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

vi.mock('../session-activity.js', () => ({
  initSession: vi.fn(),
  removeSession: vi.fn(),
}));

vi.mock('../session-insights.js', () => ({
  markFreshSession: vi.fn(),
}));

vi.mock('../session-cost.js', () => ({
  removeSession: vi.fn(),
}));

vi.mock('../session-context.js', () => ({
  removeSession: vi.fn(),
}));

vi.mock('../provider-availability.js', () => ({
  getProviderCapabilities: vi.fn((providerId: string) => providerCaps.get(providerId) ?? null),
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

class FakeElement {
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
      return this.find((child) => child.className.split(/\s+/).includes(className) || child.classList.contains(className));
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
}

class FakeDocument {
  body = new FakeElement('body');
  activeElement: FakeElement | null = null;

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}

const mockClipboardWrite = vi.fn();

function makeWindowStub() {
  return {
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

describe('terminal pending prompt injection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    webLinksActivateRef.current = null;

    vi.stubGlobal('document', new FakeDocument());
    vi.stubGlobal('window', makeWindowStub());
    vi.stubGlobal('navigator', { clipboard: { writeText: mockClipboardWrite } });
  });

  it('passes pending prompt as initialPrompt to pty.create for claude', async () => {
    const { createTerminalPane, setPendingPrompt, spawnTerminal } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('claude-1', '/project', null, false, '', 'claude');
    setPendingPrompt('claude-1', 'fix the bug');
    await spawnTerminal('claude-1');

    expect(mockPtyCreate).toHaveBeenCalledWith('claude-1', '/project', null, false, '', 'claude', 'fix the bug');
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('passes pending prompt as initialPrompt to pty.create for codex', async () => {
    const { createTerminalPane, setPendingPrompt, spawnTerminal } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('codex-1', '/project', null, false, '', 'codex');
    setPendingPrompt('codex-1', 'fix the bug');
    await spawnTerminal('codex-1');

    expect(mockPtyCreate).toHaveBeenCalledWith('codex-1', '/project', null, false, '', 'codex', 'fix the bug');
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('passes pending prompt as initialPrompt to pty.create for copilot', async () => {
    const { createTerminalPane, setPendingPrompt, spawnTerminal } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('copilot-1', '/project', null, false, '', 'copilot');
    setPendingPrompt('copilot-1', 'fix the bug');
    await spawnTerminal('copilot-1');

    expect(mockPtyCreate).toHaveBeenCalledWith('copilot-1', '/project', null, false, '', 'copilot', 'fix the bug');
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('passes pending prompt as initialPrompt to pty.create for qwen', async () => {
    const { createTerminalPane, setPendingPrompt, spawnTerminal } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('qwen-1', '/project', null, false, '', 'qwen');
    setPendingPrompt('qwen-1', 'fix the bug');
    await spawnTerminal('qwen-1');

    expect(mockPtyCreate).toHaveBeenCalledWith('qwen-1', '/project', null, false, '', 'qwen', 'fix the bug');
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('passes pending prompt as initialPrompt to pty.create for blackbox', async () => {
    const { createTerminalPane, setPendingPrompt, spawnTerminal } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('blackbox-1', '/project', null, false, '', 'blackbox');
    setPendingPrompt('blackbox-1', 'fix the bug');
    await spawnTerminal('blackbox-1');

    expect(mockPtyCreate).toHaveBeenCalledWith('blackbox-1', '/project', null, false, '', 'blackbox', 'fix the bug');
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('passes pending prompt as initialPrompt to pty.create for minimax', async () => {
    const { createTerminalPane, setPendingPrompt, spawnTerminal } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('minimax-1', '/project', null, false, '', 'minimax' as any);
    setPendingPrompt('minimax-1', 'fix the bug');
    await spawnTerminal('minimax-1');

    expect(mockPtyCreate).toHaveBeenCalledWith('minimax-1', '/project', null, false, '', 'minimax', 'fix the bug');
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('does not pass initialPrompt when no pending prompt is set', async () => {
    const { createTerminalPane, spawnTerminal } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('claude-2', '/project', null, false, '', 'claude');
    await spawnTerminal('claude-2');

    expect(mockPtyCreate).toHaveBeenCalledWith('claude-2', '/project', null, false, '', 'claude', undefined);
  });

  it('does not inject pending prompt from PTY output', async () => {
    const { createTerminalPane, setPendingPrompt, handlePtyData, spawnTerminal } = await import('./terminal-pane.js');

    createTerminalPane('codex-2', '/project', null, false, '', 'codex');
    setPendingPrompt('codex-2', 'some prompt');
    await spawnTerminal('codex-2');

    handlePtyData('codex-2', 'some output');
    await vi.runAllTimersAsync();
    expect(mockPtyWrite).not.toHaveBeenCalled();
  });

  it('delivers a prompt into an already spawned terminal session', async () => {
    const { createTerminalPane, spawnTerminal, deliverPromptToTerminalSession } = await import('./terminal-pane.js');

    createTerminalPane('codex-live', '/project', null, false, '', 'codex');
    await spawnTerminal('codex-live');
    mockPtyWrite.mockClear();

    const delivered = await (deliverPromptToTerminalSession as any)('codex-live', 'Fix the auth modal');

    expect(delivered).toBe(true);
    expect(mockPtyWrite).toHaveBeenCalledWith('codex-live', '\u001b[200~Fix the auth modal\u001b[201~\r');
  });

  it('marks the provider badge with the active provider id for provider-aware styling', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');

    const instance = createTerminalPane('claude-themed', '/project', null, false, '', 'claude');
    const providerBadge = instance.element.querySelector('.terminal-pane-provider') as FakeElement | null;

    expect(providerBadge?.dataset.provider).toBe('claude');
  });
});

describe('terminal Ctrl+Shift+C clipboard copy', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    webLinksActivateRef.current = null;

    vi.stubGlobal('document', new FakeDocument());
    vi.stubGlobal('window', makeWindowStub());
    vi.stubGlobal('navigator', { clipboard: { writeText: mockClipboardWrite } });
  });

  it('copies selected text to clipboard on Ctrl+Shift+C keydown', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('s1', '/project', null);
    const term = instance.terminal as unknown as FakeTerminal;

    term.setSelection('hello world');
    term.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keydown' });

    expect(mockClipboardWrite).toHaveBeenCalledWith('hello world');
  });

  it('does not copy on keyup', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('s2', '/project', null);
    const term = instance.terminal as unknown as FakeTerminal;

    term.setSelection('hello world');
    term.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keyup' });

    expect(mockClipboardWrite).not.toHaveBeenCalled();
  });

  it('does not copy when nothing is selected', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('s3', '/project', null);
    const term = instance.terminal as unknown as FakeTerminal;

    term.setSelection('');
    term.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keydown' });

    expect(mockClipboardWrite).not.toHaveBeenCalled();
  });

  it('returns false to prevent default on Ctrl+Shift+C', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('s4', '/project', null);
    const term = instance.terminal as unknown as FakeTerminal;

    const result = term.simulateKey({ ctrlKey: true, shiftKey: true, key: 'C', type: 'keydown' });

    expect(result).toBe(false);
  });

  it('opens detected web links without requiring modifier keys', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('links-1', '/project', null);
    const openExternal = (window as any).calder.app.openExternal;
    const terminal = instance.terminal as unknown as FakeTerminal;

    expect(webLinksActivateRef.current).toBeTypeOf('function');
    webLinksActivateRef.current?.({ metaKey: false, ctrlKey: false } as MouseEvent, 'http://localhost:8000/docs');

    expect(openExternal).toHaveBeenCalledWith('http://localhost:8000/docs', '/project');
    expect(terminal.clearSelection).toHaveBeenCalled();
    expect(mockDomSelectionClear).toHaveBeenCalled();
  });

  it('normalizes bare localhost links before opening', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    createTerminalPane('links-2', '/project', null);
    const openExternal = (window as any).calder.app.openExternal;

    webLinksActivateRef.current?.({ metaKey: false, ctrlKey: false } as MouseEvent, 'localhost:5173/preview');

    expect(openExternal).toHaveBeenCalledWith('http://localhost:5173/preview', '/project');
  });

  it('routes OSC8 hyperlinks through xterm linkHandler', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('links-osc8', '/project', null);
    const openExternal = (window as any).calder.app.openExternal;
    const terminal = instance.terminal as unknown as FakeTerminal;
    const linkHandler = terminalOptionsRef.current?.linkHandler as
      | { activate?: (event: MouseEvent, text: string, range: unknown) => void }
      | undefined;

    linkHandler?.activate?.({ metaKey: false, ctrlKey: false } as MouseEvent, 'http://localhost:3000/dashboard', {});

    expect(linkHandler?.activate).toBeTypeOf('function');
    expect(openExternal).toHaveBeenCalledWith('http://localhost:3000/dashboard', '/project');
    expect(terminal.clearSelection).toHaveBeenCalled();
    expect(mockDomSelectionClear).toHaveBeenCalled();
  });

  it('does not cross-dedupe link opens between different terminal sessions', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    createTerminalPane('links-scope-a', '/project', null);
    const sessionALink = webLinksActivateRef.current;

    const openExternal = (window as any).calder.app.openExternal;
    sessionALink?.({ metaKey: false, ctrlKey: false } as MouseEvent, 'http://localhost:3000/dashboard');

    createTerminalPane('links-scope-b', '/project', null);
    const sessionBLink = webLinksActivateRef.current;
    sessionBLink?.({ metaKey: false, ctrlKey: false } as MouseEvent, 'http://localhost:3000/dashboard');

    expect(openExternal).toHaveBeenCalledTimes(2);
    expect(openExternal).toHaveBeenNthCalledWith(1, 'http://localhost:3000/dashboard', '/project');
    expect(openExternal).toHaveBeenNthCalledWith(2, 'http://localhost:3000/dashboard', '/project');
  });

  it('suppresses drag selection when a link anchor is the pointer target', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('links-anchor-target', '/project', null);
    const xtermWrap = instance.element.querySelector('.xterm-wrap') as unknown as FakeElement;

    const linkTarget = {
      closest: () => ({
        getAttribute: () => 'http://localhost:4100/path',
      }),
    };

    const mousedown = {
      button: 0,
      clientX: 1024,
      clientY: 32,
      target: linkTarget,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    xtermWrap.emit('mousedown', mousedown);

    expect((mousedown as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> }).preventDefault).toHaveBeenCalled();
  });

  it('opens link anchors when pointer-based URL detection misses', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('links-anchor-open', '/project', null);
    const openExternal = (window as any).calder.app.openExternal;
    const xtermWrap = instance.element.querySelector('.xterm-wrap') as unknown as FakeElement;

    const linkTarget = {
      closest: () => ({
        getAttribute: () => 'http://localhost:4101/from-anchor',
      }),
    };

    const click = {
      defaultPrevented: false,
      button: 0,
      clientX: 1008,
      clientY: 30,
      target: linkTarget,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    xtermWrap.emit('click', click);

    expect(openExternal).toHaveBeenCalledWith('http://localhost:4101/from-anchor', '/project');
  });

  it('resets link-drag suppression before a non-link drag starts', async () => {
    const { createTerminalPane } = await import('./terminal-pane.js');
    const instance = createTerminalPane('links-drag-reset', '/project', null);
    const terminal = instance.terminal as unknown as FakeTerminal;
    terminal.setViewportLine('http://localhost:3000/dashboard plain text tail');

    const xtermWrap = instance.element.querySelector('.xterm-wrap') as unknown as FakeElement;
    const linkMouseDown = {
      button: 0,
      clientX: 16,
      clientY: 12,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    xtermWrap.emit('mousedown', linkMouseDown);
    expect((linkMouseDown as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> }).preventDefault).toHaveBeenCalled();

    const nonLinkMouseDown = {
      button: 0,
      clientX: 1080,
      clientY: 12,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    xtermWrap.emit('mousedown', nonLinkMouseDown);
    expect((nonLinkMouseDown as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> }).preventDefault).not.toHaveBeenCalled();

    const dragMove = {
      buttons: 1,
      button: 0,
      clientX: 1090,
      clientY: 18,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    xtermWrap.emit('mousemove', dragMove);
    expect((dragMove as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> }).preventDefault).not.toHaveBeenCalled();
  });
});
