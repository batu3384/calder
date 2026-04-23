import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerCaps = new Map([
  ['claude', { sessionResume: true, costTracking: true, contextWindow: true, pendingPromptTrigger: 'startup-arg' }],
  ['copilot', { sessionResume: true, costTracking: false, contextWindow: false, pendingPromptTrigger: 'startup-arg' }],
  ['gemini', { sessionResume: true, costTracking: true, contextWindow: true, pendingPromptTrigger: 'startup-arg' }],
  ['codex', { sessionResume: true, costTracking: true, contextWindow: true, pendingPromptTrigger: 'startup-arg' }],
  ['qwen', { sessionResume: true, costTracking: true, contextWindow: true, pendingPromptTrigger: 'startup-arg' }],
]);
const providerNames = new Map([
  ['claude', 'Claude Code'],
  ['copilot', 'GitHub Copilot'],
  ['gemini', 'Gemini CLI'],
  ['codex', 'Codex CLI'],
  ['qwen', 'Qwen Code'],
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

  loadAddon(addon: unknown): void {
    this.loadedAddons.push(addon);
  }
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
  getProviderDisplayName: vi.fn((providerId: string) => providerNames.get(providerId) ?? providerId),
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

  it('does not pass initialPrompt when no pending prompt is set', async () => {
    const { createTerminalPane, spawnTerminal } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('claude-2', '/project', null, false, '', 'claude');
    await spawnTerminal('claude-2');

    expect(mockPtyCreate).toHaveBeenCalledWith('claude-2', '/project', null, false, '', 'claude', undefined);
  });

  it('launches restored Copilot sessions in native resume mode once a cliSessionId exists', async () => {
    const { createTerminalPane, spawnTerminal } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    createTerminalPane('copilot-restored', '/project', 'copilot-old-id', true, '', 'copilot');
    await spawnTerminal('copilot-restored');

    expect(mockPtyCreate).toHaveBeenCalledWith(
      'copilot-restored',
      '/project',
      'copilot-old-id',
      true,
      '',
      'copilot',
      undefined,
    );
  });

  it('recovers from spawn failures without leaving the session stuck', async () => {
    const { createTerminalPane, spawnTerminal, getTerminalInstance } = await import('./terminal-pane.js');
    const mockPtyCreate = (window as any).calder.pty.create;

    mockPtyCreate
      .mockRejectedValueOnce(new Error('spawn failed'))
      .mockResolvedValueOnce(undefined);

    createTerminalPane('recover-1', '/missing/project', null, true, '', 'claude');

    await expect(spawnTerminal('recover-1')).resolves.toBeUndefined();
    const afterFailure = getTerminalInstance('recover-1');
    expect(afterFailure?.spawned).toBe(false);
    expect(afterFailure?.exited).toBe(true);
    expect(afterFailure?.element.querySelector('.terminal-exit-overlay')).not.toBeNull();
    expect(afterFailure?.element.querySelector('.terminal-exit-title')?.textContent).toBe('Session failed to start');
    const retryButton = afterFailure?.element.querySelector('.respawn-btn') as FakeElement | null;
    expect(retryButton).not.toBeNull();

    retryButton?.emit('click', {});
    await vi.runAllTimersAsync();

    const afterRetry = getTerminalInstance('recover-1');
    expect(afterRetry?.spawned).toBe(true);
    expect(afterRetry?.exited).toBe(false);
    expect(mockPtyCreate).toHaveBeenCalledTimes(2);
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

describe('terminal helper extractions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    webLinksActivateRef.current = null;
    terminalOptionsRef.current = null;

    vi.stubGlobal('document', new FakeDocument());
    vi.stubGlobal('window', makeWindowStub());
    vi.stubGlobal('navigator', { clipboard: { writeText: mockClipboardWrite } });
  });

  it('createTerminalCore wires OSC and web link activation handlers', async () => {
    const { createTerminalCore } = await import('./terminal-pane-runtime.js');
    const activateOscLink = vi.fn();
    const activateWebLink = vi.fn();

    const { terminal } = createTerminalCore({
      sessionId: 'runtime-1',
      projectPath: '/project',
      activateOscLink,
      activateWebLink,
    });
    const runtimeTerminal = terminal as unknown as FakeTerminal;
    const linkHandler = terminalOptionsRef.current?.linkHandler as
      | { activate?: (event: MouseEvent | undefined, uri: string, range?: unknown) => void }
      | undefined;

    expect(runtimeTerminal.loadedAddons).toHaveLength(3);
    linkHandler?.activate?.(undefined, 'https://example.dev/osc');
    webLinksActivateRef.current?.(undefined as unknown as MouseEvent, 'https://example.dev/web');

    expect(activateOscLink).toHaveBeenCalledWith(undefined, 'https://example.dev/osc');
    expect(activateWebLink).toHaveBeenCalledWith(undefined, 'https://example.dev/web');
  });

  it('bindTerminalInputAndFocusHandlers forwards input and focus ownership', async () => {
    const { bindTerminalInputAndFocusHandlers } = await import('./terminal-pane-runtime.js');
    const terminal = new FakeTerminal();
    const element = new FakeElement('div');
    const writePtyData = vi.fn();
    const setFocused = vi.fn();
    let focusedSessionId: string | null = null;

    bindTerminalInputAndFocusHandlers({
      terminal: terminal as unknown as any,
      element: element as unknown as HTMLDivElement,
      sessionId: 'runtime-2',
      writePtyData,
      setFocused: (sessionId) => {
        focusedSessionId = sessionId;
        setFocused(sessionId);
      },
      getFocusedSessionId: () => focusedSessionId,
    });

    const preventDefault = vi.fn();
    const keyHandled = terminal.simulateKey({
      shiftKey: true,
      key: 'Enter',
      type: 'keydown',
      preventDefault,
    } as unknown as KeyboardEvent);
    expect(keyHandled).toBe(false);
    expect(preventDefault).toHaveBeenCalled();
    expect(writePtyData).toHaveBeenCalledWith('runtime-2', '\x1b[13;2u');

    writePtyData.mockClear();
    setFocused.mockClear();
    terminal.emitData('echo test');
    expect(writePtyData).toHaveBeenCalledWith('runtime-2', 'echo test');
    expect(setFocused).toHaveBeenCalledWith('runtime-2');

    setFocused.mockClear();
    element.emit('mousedown', {});
    expect(setFocused).toHaveBeenCalledWith('runtime-2');
  });

  it('registerTerminalLinkProviders registers file and GitHub providers when available', async () => {
    const { registerTerminalLinkProviders } = await import('./terminal-pane-runtime.js');
    const terminal = new FakeTerminal();
    const getRemoteUrl = vi.fn(async () => 'https://github.com/acme/repo');

    registerTerminalLinkProviders({
      terminal: terminal as unknown as any,
      projectPath: '/project',
      projectId: 'project-1',
      getRemoteUrl,
    });
    await Promise.resolve();

    expect(getRemoteUrl).toHaveBeenCalledWith('/project');
    expect(terminal.registerLinkProvider).toHaveBeenCalledTimes(2);
  });

  it('instance DOM helpers preserve open/fit/focus behavior', async () => {
    const {
      attachTerminalInstanceToContainer,
      clearFocusedTerminalInstances,
      fitTerminalInstance,
      hideTerminalInstance,
      setFocusedTerminalInstance,
      showTerminalInstance,
    } = await import('./terminal-pane-instance-dom.js');
    const container = new FakeElement('div');
    const elementA = new FakeElement('div');
    elementA.className = 'terminal-pane hidden swarm-dimmed swarm-unread';
    const wrapA = new FakeElement('div');
    wrapA.className = 'xterm-wrap';
    elementA.appendChild(wrapA);
    const terminalA = new FakeTerminal();
    const fitA = { fit: vi.fn() };
    const instanceA = { terminal: terminalA as unknown as any, fitAddon: fitA as any, element: elementA as unknown as any };
    const writeResize: Array<[string, number, number]> = [];

    attachTerminalInstanceToContainer(instanceA, container as unknown as HTMLElement);
    expect(container.children.includes(elementA)).toBe(true);
    expect(terminalA.open).toHaveBeenCalledTimes(1);
    expect(terminalA.loadedAddons).toHaveLength(1);

    const xtermNode = new FakeElement('div');
    xtermNode.className = 'xterm';
    wrapA.appendChild(xtermNode);
    terminalA.open.mockClear();
    attachTerminalInstanceToContainer(instanceA, container as unknown as HTMLElement);
    expect(terminalA.open).not.toHaveBeenCalled();

    showTerminalInstance(instanceA, true);
    expect(elementA.classList.contains('hidden')).toBe(false);
    expect(elementA.classList.contains('split')).toBe(true);

    hideTerminalInstance(instanceA);
    expect(elementA.classList.contains('hidden')).toBe(true);
    expect(elementA.classList.contains('swarm-dimmed')).toBe(false);
    expect(elementA.classList.contains('swarm-unread')).toBe(false);

    const elementB = new FakeElement('div');
    const terminalB = new FakeTerminal();
    const instanceB = { terminal: terminalB as unknown as any, fitAddon: { fit: vi.fn() } as any, element: elementB as unknown as any };

    elementA.classList.remove('hidden');
    fitTerminalInstance('runtime-3', instanceA, (sessionId, cols, rows) => {
      writeResize.push([sessionId, cols, rows]);
    });
    expect(fitA.fit).toHaveBeenCalled();
    expect(writeResize).toContainEqual(['runtime-3', terminalA.cols, terminalA.rows]);

    elementA.classList.add('focused');
    elementB.classList.add('focused');
    clearFocusedTerminalInstances([
      ['a', instanceA],
      ['b', instanceB],
    ]);
    expect(elementA.classList.contains('focused')).toBe(false);
    expect(elementB.classList.contains('focused')).toBe(false);

    setFocusedTerminalInstance('a', [
      ['a', instanceA],
      ['b', instanceB],
    ]);
    expect(elementA.classList.contains('focused')).toBe(true);
    expect(terminalA.focus).toHaveBeenCalledTimes(1);

    const fakeDocument = document as unknown as FakeDocument;
    fakeDocument.activeElement = { closest: () => null } as unknown as FakeElement;
    terminalA.focus.mockClear();
    setFocusedTerminalInstance('a', [['a', instanceA]]);
    expect(terminalA.focus).not.toHaveBeenCalled();
  });
});
