import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeClassList {
  private tokens = new Set<string>();
  private onChange: ((value: string) => void) | undefined;

  constructor(onChange?: (value: string) => void) {
    this.onChange = onChange;
  }

  setFromClassName(value: string): void {
    this.tokens = new Set(value.split(/\s+/).filter(Boolean));
  }

  private sync(): void {
    this.onChange?.([...this.tokens].join(' '));
  }

  add(...values: string[]): void {
    values.forEach((value) => this.tokens.add(value));
    this.sync();
  }

  remove(...values: string[]): void {
    values.forEach((value) => this.tokens.delete(value));
    this.sync();
  }

  contains(value: string): boolean {
    return this.tokens.has(value);
  }

  toggle(value: string, force?: boolean): boolean {
    const shouldAdd = force ?? !this.tokens.has(value);
    if (shouldAdd) this.tokens.add(value);
    else this.tokens.delete(value);
    this.sync();
    return shouldAdd;
  }
}

class FakeElement {
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  private classNameValue = '';
  classList = new FakeClassList((value) => {
    this.classNameValue = value;
  });
  textContent = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  disabled = false;
  rect = { left: 0, top: 0, width: 800, height: 480 };
  listeners = new Map<string, Array<(event?: unknown) => void>>();

  constructor(public tagName: string) {}

  get className(): string {
    return this.classNameValue;
  }

  set className(value: string) {
    this.classNameValue = value;
    this.classList.setFromClassName(value);
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  contains(target: unknown): boolean {
    if (!(target instanceof FakeElement)) return false;
    if (target === this) return true;
    return this.children.some((child) => child.contains(target));
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const token = selector.startsWith('.') ? selector.slice(1) : selector;
    const matches: FakeElement[] = [];
    const visit = (node: FakeElement) => {
      for (const child of node.children) {
        if (child.className.split(/\s+/).includes(token)) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  addEventListener(event: string, cb: (event?: unknown) => void): void {
    const current = this.listeners.get(event) ?? [];
    current.push(cb);
    this.listeners.set(event, current);
  }

  setAttribute(name: string, value: string): void {
    this.dataset[name] = value;
  }

  getBoundingClientRect(): DOMRect {
    return {
      ...this.rect,
      right: this.rect.left + this.rect.width,
      bottom: this.rect.top + this.rect.height,
      x: this.rect.left,
      y: this.rect.top,
      toJSON: () => ({}),
    } as DOMRect;
  }
}

const {
  mockFit,
  mockOpen,
  mockSerialize,
  mockDomSelectionClear,
  mockSendCliSelectionToSelectedSession,
  webLinksActivate,
  terminalOptionsRef,
  MockTerminal,
  MockFitAddon,
  MockSerializeAddon,
  MockWebLinksAddon,
} = vi.hoisted(() => {
  const mockFit = vi.fn();
  const mockOpen = vi.fn();
  const mockLoadAddon = vi.fn();
  const mockSerialize = vi.fn(() => '');
  const mockDomSelectionClear = vi.fn();
  const mockSendCliSelectionToSelectedSession = vi.fn(async () => ({ ok: true, targetSessionId: 'session-1' }));
  const webLinksActivate: { current: ((event: MouseEvent, url: string) => void) | null } = { current: null };
  const terminalOptionsRef: { current: Record<string, unknown> | null } = { current: null };

  return {
    mockFit,
    mockOpen,
    mockLoadAddon,
    mockSerialize,
    mockDomSelectionClear,
    mockSendCliSelectionToSelectedSession,
    webLinksActivate,
    terminalOptionsRef,
    MockTerminal: class {
      constructor(options?: Record<string, unknown>) {
        terminalOptionsRef.current = options ?? null;
      }
      rows = 24;
      cols = 80;
      buffer = {
        active: {
          viewportY: 0,
          getLine: vi.fn(() => undefined),
        },
      };
      open = mockOpen;
      loadAddon = mockLoadAddon;
      onSelectionChange = vi.fn();
      onData = vi.fn();
      getSelection = vi.fn(() => '');
      clearSelection = vi.fn();
      getSelectionPosition = vi.fn(() => undefined);
      write = vi.fn();
    },
    MockFitAddon: class {
      fit = mockFit;
    },
    MockSerializeAddon: class {
      serialize = mockSerialize;
    },
    MockWebLinksAddon: class {
      constructor(cb: (event: MouseEvent, url: string) => void) {
        webLinksActivate.current = cb;
      }
    },
  };
});

vi.mock('@xterm/xterm', () => ({
  Terminal: MockTerminal,
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: MockFitAddon,
}));

vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: MockSerializeAddon,
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: MockWebLinksAddon,
}));

let cliSurfaceDataCallbacks: Array<(projectId: string, data: string) => void> = [];

vi.mock('./session-integration.js', () => ({
  sendCliSelectionToSelectedSession: mockSendCliSelectionToSelectedSession,
  sendCliSelectionToNewSession: vi.fn(),
  sendCliSelectionToCustomSession: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock('./heuristics.js');
  cliSurfaceDataCallbacks = [];
  webLinksActivate.current = null;
  vi.stubGlobal('document', {
    createElement: (tagName: string) => new FakeElement(tagName),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('window', {
    getSelection: () => ({
      removeAllRanges: mockDomSelectionClear,
    }),
    calder: {
      store: {
        save: vi.fn(),
        load: vi.fn(async () => null),
      },
      cliSurface: {
        start: vi.fn(),
        stop: vi.fn(),
        restart: vi.fn(),
        write: vi.fn(),
        resize: vi.fn(),
        onData: (callback: (projectId: string, data: string) => void) => {
          cliSurfaceDataCallbacks.push(callback);
          return () => {
            cliSurfaceDataCallbacks = cliSurfaceDataCallbacks.filter((entry) => entry !== callback);
          };
        },
        onStatus: vi.fn(() => () => {}),
        onExit: vi.fn(() => () => {}),
        onError: vi.fn(() => () => {}),
      },
      app: {
        openExternal: vi.fn(),
      },
    },
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
});

describe('cli surface pane', () => {
  it('attaches and shows a cli surface shell', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, showCliSurfacePane } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    showCliSurfacePane('project-1');

    expect((container as unknown as FakeElement).querySelector('.cli-surface-pane')).toBeTruthy();
    expect(mockOpen).toHaveBeenCalled();
    expect(mockFit).toHaveBeenCalled();
  });

  it('opens detected links through Calder browser routing', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      terminal: { clearSelection: ReturnType<typeof vi.fn> };
    };
    const openExternal = (window as any).calder.app.openExternal;

    expect(webLinksActivate.current).toBeTypeOf('function');
    webLinksActivate.current?.({ metaKey: false, ctrlKey: false } as MouseEvent, 'http://localhost:8000/docs');

    expect(openExternal).toHaveBeenCalledWith('http://localhost:8000/docs', undefined);
    expect(instance.terminal.clearSelection).toHaveBeenCalled();
    expect(mockDomSelectionClear).toHaveBeenCalled();
  });

  it('normalizes bare localhost links in CLI surface output before opening', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const openExternal = (window as any).calder.app.openExternal;

    webLinksActivate.current?.({ metaKey: false, ctrlKey: false } as MouseEvent, 'localhost:4173/health');

    expect(openExternal).toHaveBeenCalledWith('http://localhost:4173/health', undefined);
  });

  it('routes OSC8 hyperlinks through xterm linkHandler', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      terminal: { clearSelection: ReturnType<typeof vi.fn> };
    };
    const openExternal = (window as any).calder.app.openExternal;
    const linkHandler = terminalOptionsRef.current?.linkHandler as
      | { activate?: (event: MouseEvent, text: string, range: unknown) => void }
      | undefined;

    linkHandler?.activate?.({ metaKey: false, ctrlKey: false } as MouseEvent, 'http://localhost:4173/health', {});

    expect(linkHandler?.activate).toBeTypeOf('function');
    expect(openExternal).toHaveBeenCalledWith('http://localhost:4173/health', undefined);
    expect(instance.terminal.clearSelection).toHaveBeenCalled();
    expect(mockDomSelectionClear).toHaveBeenCalled();
  });

  it('opens inspect mode without auto-selecting the full viewport', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      viewportLines: string[];
      inspectButton: FakeElement;
      composerEl: FakeElement;
      composerPreviewEl: FakeElement;
      selectedButton: FakeElement;
    };
    instance.viewportLines = ['alpha', 'beta'];

    instance.inspectButton.listeners.get('click')?.[0]();

    expect(instance.composerPreviewEl.textContent).toBe('');
    expect(instance.selectedButton.disabled).toBe(true);
    expect(instance.composerEl.classList.contains('hidden')).toBe(true);
  });

  it('changes the inspect button label while inspect mode is active', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      inspectButton: FakeElement;
    };

    instance.inspectButton.listeners.get('click')?.[0]();

    expect(instance.inspectButton.textContent).toBe('Exit Inspect');
  });

  it('batches bursty runtime output into one terminal write per animation frame', async () => {
    const rafQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      terminal: { write: ReturnType<typeof vi.fn> };
    };

    cliSurfaceDataCallbacks[0]?.('project-1', 'alpha');
    cliSurfaceDataCallbacks[0]?.('project-1', 'beta');
    cliSurfaceDataCallbacks[0]?.('project-1', 'gamma');

    expect(instance.terminal.write).not.toHaveBeenCalled();

    rafQueue.shift()?.(0);

    expect(instance.terminal.write).toHaveBeenCalledTimes(1);
    expect(instance.terminal.write).toHaveBeenCalledWith('alphabetagamma');
  });

  it('strips OSC protocol metadata from mixed runtime output before writing to the terminal', async () => {
    const rafQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { encodeCalderOsc } = await import('./protocol.js');
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      terminal: { write: ReturnType<typeof vi.fn> };
    };

    const message = encodeCalderOsc({
      type: 'node',
      nodeId: 'menu.root',
      label: 'command menu',
      meta: { framework: 'Blessed', widgetType: 'list' },
    });

    cliSurfaceDataCallbacks[0]?.('project-1', `hello${message}world`);

    expect(instance.terminal.write).not.toHaveBeenCalled();

    rafQueue.shift()?.(0);

    expect(instance.terminal.write).toHaveBeenCalledTimes(1);
    expect(instance.terminal.write).toHaveBeenCalledWith('helloworld');
  });

  it('buffers split OSC messages across runtime chunks without leaking escape text into the terminal', async () => {
    const rafQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { encodeCalderOsc } = await import('./protocol.js');
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'node', args: ['dist/cli.js'] }],
        runtime: { status: 'running', command: 'node', args: ['dist/cli.js'] },
      },
    });

    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      terminal: { write: ReturnType<typeof vi.fn> };
    };

    const message = encodeCalderOsc({
      type: 'node',
      nodeId: 'menu.root',
      label: 'command menu',
      meta: { framework: 'Blessed', widgetType: 'list' },
    });
    const splitIndex = Math.floor(message.length / 2);

    cliSurfaceDataCallbacks[0]?.(project.id, `hello${message.slice(0, splitIndex)}`);
    while (rafQueue.length > 0) rafQueue.shift()?.(0);

    expect(instance.terminal.write).toHaveBeenCalledTimes(1);
    expect(instance.terminal.write).toHaveBeenLastCalledWith('hello');

    cliSurfaceDataCallbacks[0]?.(project.id, `${message.slice(splitIndex)}world`);
    while (rafQueue.length > 0) rafQueue.shift()?.(0);

    expect(instance.terminal.write).toHaveBeenCalledTimes(2);
    expect(instance.terminal.write).toHaveBeenLastCalledWith('world');

    const badges = (container as unknown as FakeElement).querySelectorAll('.cli-surface-adapter-badge')
      .map((entry) => entry.textContent);
    expect(badges).toContain('Blessed');
  });

  it('captures drag selections through an inspect overlay instead of relying on terminal selection', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    const targetSession = appState.addSession(project.id, 'Codex Main', undefined, 'codex')!;
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      targetSessionId: targetSession.id,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'python', args: ['app.py'] }],
        runtime: { status: 'idle' },
      },
    });
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      composerEl: FakeElement;
      composerHintEl: FakeElement;
      composerPreviewEl: FakeElement;
      selectedButton: FakeElement;
    };
    instance.viewportLines = ['alpha beta', 'gamma delta', 'omega'];
    instance.terminal.cols = 10;
    instance.terminal.rows = 3;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 100, height: 30 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };

    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 0, clientY: 0, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 50, clientY: 15, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 50, clientY: 15, preventDefault: vi.fn() });

    expect(instance.composerPreviewEl.textContent).toBe('alpha\ngamma');
    expect(instance.composerHintEl.textContent).toContain('Selected region');
    expect(instance.selectedButton.disabled).toBe(false);
    expect(instance.composerEl.classList.contains('hidden')).toBe(false);
    expect(instance.composerEl.style.left).toBe('62px');
    expect(instance.composerEl.style.top).toBe('27px');
  });

  it('labels inferred panels separately from exact selections', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      composerEl: FakeElement;
      composerHintEl: FakeElement;
    };
    instance.viewportLines = [
      '╭ Settings ───────────────╮',
      '│ Theme: midnight         │',
      '│ Accent: amber           │',
      '╰─────────────────────────╯',
    ];
    instance.terminal.cols = 27;
    instance.terminal.rows = 4;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 108, height: 40 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };

    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 0, clientY: 0, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 108, clientY: 40, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 108, clientY: 40, preventDefault: vi.fn() });

    expect(instance.composerHintEl.textContent).toContain('Inferred panel');
    expect(instance.composerHintEl.textContent).toContain('settings panel');
  });

  it('snaps a single click to the inferred panel bounds', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    const targetSession = appState.addSession(project.id, 'Codex Main', undefined, 'codex')!;
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      targetSessionId: targetSession.id,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'python', args: ['app.py'] }],
        runtime: { status: 'idle' },
      },
    });
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      composerEl: FakeElement;
      composerHintEl: FakeElement;
      composerPreviewEl: FakeElement;
    };
    instance.viewportLines = [
      '╭ Settings ───────────────╮',
      '│ Theme: midnight         │',
      '│ Accent: amber           │',
      '╰─────────────────────────╯',
    ];
    instance.terminal.cols = 27;
    instance.terminal.rows = 4;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 108, height: 40 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };

    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 40, clientY: 10, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 40, clientY: 10, preventDefault: vi.fn() });

    expect(instance.composerHintEl.textContent).toContain('Inferred panel');
    expect(instance.composerHintEl.textContent).toContain('settings panel');
    expect(instance.composerPreviewEl.textContent).toContain('╭ Settings');
    expect(instance.composerPreviewEl.textContent).toContain('Accent: amber');
  });

  it('previews inferred panels on hover before selection', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      viewportLines: string[];
      inferredRegions: unknown[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      hoverOverlayEl: FakeElement;
      hoverLabelEl: FakeElement;
      composerHintEl: FakeElement;
    };
    instance.viewportLines = [
      '╭ Settings ───────────────╮',
      '│ Theme: midnight         │',
      '│ Accent: amber           │',
      '╰─────────────────────────╯',
    ];
    instance.inferredRegions = [{
      label: 'settings panel',
      selection: { mode: 'region', startRow: 0, endRow: 3, startCol: 0, endCol: 27 },
    }];
    instance.terminal.cols = 27;
    instance.terminal.rows = 4;
    instance.viewport.rect = { left: 0, top: 0, width: 108, height: 40 };

    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 40, clientY: 10, preventDefault: vi.fn() });

    expect(instance.hoverOverlayEl.classList.contains('hidden')).toBe(false);
    expect(instance.hoverLabelEl.textContent).toBe('settings panel');
    expect(instance.composerHintEl.textContent).toContain('Click to select settings panel');

    instance.selectionOverlayEl.listeners.get('pointerleave')?.[0]();

    expect(instance.hoverOverlayEl.classList.contains('hidden')).toBe(true);
  });

  it('reuses cached inferred regions during hover and click selection', async () => {
    const inferSpy = vi.fn((lines: string[]) => [{
      label: 'settings panel',
      selection: {
        mode: 'region' as const,
        startRow: 0,
        endRow: Math.max(0, lines.length - 1),
        startCol: 0,
        endCol: Math.max(1, lines[0]?.length ?? 1),
      },
    }]);
    vi.doMock('./heuristics.js', () => ({
      inferCliRegions: inferSpy,
    }));

    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      composerEl: FakeElement;
    };
    instance.viewportLines = [
      '╭ Settings ───────────────╮',
      '│ Theme: midnight         │',
      '╰─────────────────────────╯',
    ];
    instance.terminal.cols = 27;
    instance.terminal.rows = 3;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 108, height: 30 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };
    instance.inspectButton.listeners.get('click')?.[0]();

    inferSpy.mockClear();

    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 40, clientY: 10, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 40, clientY: 10, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 40, clientY: 10, preventDefault: vi.fn() });

    expect(inferSpy).toHaveBeenCalledTimes(1);
  });

  it('waits to serialize the ANSI snapshot until the selection is actually sent', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      composerEl: FakeElement;
      selectedButton: FakeElement;
    };
    instance.viewportLines = ['alpha beta', 'gamma delta', 'omega'];
    instance.terminal.cols = 10;
    instance.terminal.rows = 3;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 100, height: 30 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };

    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 0, clientY: 0, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 50, clientY: 15, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 50, clientY: 15, preventDefault: vi.fn() });

    expect(mockSerialize).not.toHaveBeenCalled();

    await instance.selectedButton.listeners.get('click')?.[0]?.();

    expect(mockSerialize).toHaveBeenCalledTimes(1);
    expect(mockSendCliSelectionToSelectedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        ansiSnapshot: '',
        selectedText: 'alpha\ngamma',
      }),
    );
  });

  it('shows the actual send scope in the composer and lets viewport context be toggled on', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      composerEl: FakeElement;
      composerScopeEl: FakeElement;
      composerContextSelectEl: FakeElement & { value?: string };
    };
    instance.viewportLines = ['alpha beta', 'gamma delta', 'omega'];
    instance.terminal.cols = 10;
    instance.terminal.rows = 3;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 100, height: 30 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };

    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 0, clientY: 0, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 50, clientY: 15, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 50, clientY: 15, preventDefault: vi.fn() });

    expect(instance.composerScopeEl.textContent).toContain('Selection only');

    instance.composerContextSelectEl.value = 'selection-nearby-viewport';
    instance.composerContextSelectEl.listeners.get('change')?.[0]();

    expect(instance.composerScopeEl.textContent).toContain('Selection + visible viewport');

    instance.composerContextSelectEl.value = 'selection-nearby';
    instance.composerContextSelectEl.listeners.get('change')?.[0]();

    expect(instance.composerScopeEl.textContent).toContain('Selection + nearby lines');
  });

  it('shows the current target session in the toolbar copy', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    const targetSession = appState.addSession(project.id, 'Codex Main', undefined, 'codex')!;
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      targetSessionId: targetSession.id,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'python', args: ['app.py'] }],
        runtime: { status: 'idle' },
      },
    });

    const { attachCliSurfacePane } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);

    expect((container as unknown as FakeElement).querySelector('.cli-surface-route')?.textContent).toContain('Codex Main');
  });

  it('shows the selected open session on the inspect target button', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    const targetSession = appState.addSession(project.id, 'Gemini Fix', undefined, 'gemini')!;
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      targetSessionId: targetSession.id,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'python', args: ['app.py'] }],
        runtime: { status: 'idle' },
      },
    });

    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      customButton: FakeElement;
    };

    expect(instance.customButton.textContent).toContain('Gemini Fix');
  });

  it('keeps the session picker available before a capture payload exists', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    appState.addSession(project.id, 'Codex Main', undefined, 'codex')!;
    appState.addSession(project.id, 'Claude Patch', undefined, 'claude');
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'python', args: ['app.py'] }],
        runtime: { status: 'idle' },
      },
    });

    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      customButton: FakeElement;
      targetMenuEl: FakeElement;
      targetMenuListEl: FakeElement;
    };

    expect(instance.customButton.disabled).toBe(false);

    instance.customButton.listeners.get('click')?.[0]?.();

    expect(instance.targetMenuEl.style.display).toBe('flex');
    const items = instance.targetMenuListEl.querySelectorAll('.cli-surface-target-menu-item');
    const labels = items.map((entry) => entry.children[0]?.textContent ?? entry.textContent);
    expect(labels).toContain('Codex Main');
    expect(labels).toContain('Claude Patch');
    expect(items.slice(-2).every((entry) => entry.disabled)).toBe(true);
  });

  it('closes the session picker when clicking outside it', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    appState.addSession(project.id, 'Codex Main', undefined, 'codex')!;
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'python', args: ['app.py'] }],
        runtime: { status: 'idle' },
      },
    });

    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      customButton: FakeElement;
      targetMenuEl: FakeElement;
    };

    instance.customButton.listeners.get('click')?.[0]?.();
    expect(instance.targetMenuEl.style.display).toBe('flex');

    const mousedownHandler = (document.addEventListener as any).mock.calls
      .find(([eventName]: [string]) => eventName === 'mousedown')?.[1];
    expect(typeof mousedownHandler).toBe('function');

    mousedownHandler({ target: new FakeElement('div') });

    expect(instance.targetMenuEl.style.display).toBe('none');
  });

  it('opens a browser-style target menu with open sessions and quick actions', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    const sessionA = appState.addSession(project.id, 'Codex Main', undefined, 'codex')!;
    appState.addSession(project.id, 'Claude Patch', undefined, 'claude');
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      targetSessionId: sessionA.id,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'python', args: ['app.py'] }],
        runtime: { status: 'idle' },
      },
    });

    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      composerEl: FakeElement;
      customButton: FakeElement;
      targetMenuEl: FakeElement;
      targetMenuListEl: FakeElement;
    };

    instance.viewportLines = ['alpha beta', 'gamma delta', 'omega'];
    instance.terminal.cols = 10;
    instance.terminal.rows = 3;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 100, height: 30 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };
    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 0, clientY: 0, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 50, clientY: 15, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 50, clientY: 15, preventDefault: vi.fn() });

    instance.customButton.listeners.get('click')?.[0]?.();

    expect(instance.targetMenuEl.style.display).toBe('flex');
    const items = instance.targetMenuListEl.querySelectorAll('.cli-surface-target-menu-item');
    const labels = items.map((entry) => entry.children[0]?.textContent ?? entry.textContent);
    expect(labels).toContain('Codex Main');
    expect(labels).toContain('Claude Patch');
    expect(labels).toContain('Send to Custom Session…');
  });

  it('shows provider badges and active-state badges inside the CLI target menu', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    const activeSession = appState.addSession(project.id, 'Codex Main', undefined, 'codex')!;
    appState.addSession(project.id, 'Gemini Fix', undefined, 'gemini');
    appState.setActiveSession(project.id, activeSession.id);
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      targetSessionId: activeSession.id,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'python', args: ['app.py'] }],
        runtime: { status: 'idle' },
      },
    });

    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      composerEl: FakeElement;
      customButton: FakeElement;
      targetMenuListEl: FakeElement;
    };

    instance.viewportLines = ['alpha beta', 'gamma delta'];
    instance.terminal.cols = 10;
    instance.terminal.rows = 2;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 100, height: 20 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };
    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 0, clientY: 0, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 50, clientY: 10, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 50, clientY: 10, preventDefault: vi.fn() });

    instance.customButton.listeners.get('click')?.[0]?.();

    const badges = instance.targetMenuListEl.querySelectorAll('.cli-surface-target-session-badge')
      .map((entry) => entry.textContent);
    expect(badges).toContain('Codex');
    expect(badges).toContain('Gemini');
    expect(badges).toContain('Active');
  });

  it('shows session status dots and labels inside the CLI target menu', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { appState } = await import('../../state.js');
    const { initSession, setHookStatus } = await import('../../session-activity.js');
    const project = appState.addProject('Security', '/tmp/security');
    const sessionA = appState.addSession(project.id, 'Codex Main', undefined, 'codex')!;
    const sessionB = appState.addSession(project.id, 'Gemini Fix', undefined, 'gemini')!;
    initSession(sessionA.id);
    initSession(sessionB.id);
    setHookStatus(sessionA.id, 'working');
    setHookStatus(sessionB.id, 'completed');
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      targetSessionId: sessionA.id,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'python', args: ['app.py'] }],
        runtime: { status: 'idle' },
      },
    });

    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      composerEl: FakeElement;
      customButton: FakeElement;
      targetMenuListEl: FakeElement;
    };

    instance.viewportLines = ['alpha beta', 'gamma delta'];
    instance.terminal.cols = 10;
    instance.terminal.rows = 2;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 100, height: 20 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };
    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 0, clientY: 0, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 50, clientY: 10, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 50, clientY: 10, preventDefault: vi.fn() });

    instance.customButton.listeners.get('click')?.[0]?.();

    const statusBadges = instance.targetMenuListEl.querySelectorAll('.cli-surface-target-session-status')
      .map((entry) => entry.children[1]?.textContent ?? entry.textContent);
    const dots = instance.targetMenuListEl.querySelectorAll('.tab-status').map((entry) => entry.className);

    expect(statusBadges).toContain('Working');
    expect(statusBadges).toContain('Completed');
    expect(dots.some((value) => value.includes('working'))).toBe(true);
    expect(dots.some((value) => value.includes('completed'))).toBe(true);
  });

  it('shows active adapter badges for supported frameworks in the toolbar', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'python', args: ['-m', 'textual', 'run', 'app.py'] }],
        runtime: { status: 'idle', command: 'python', args: ['-m', 'textual', 'run', 'app.py'] },
      },
    });

    const { attachCliSurfacePane } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);

    const badges = (container as unknown as FakeElement).querySelectorAll('.cli-surface-adapter-badge')
      .map((entry) => entry.textContent);

    expect(badges).toContain('Textual');
    expect(badges).toContain('Widgets');
    expect(badges).toContain('Focus path');
  });

  it('derives adapter badges from OSC semantic framework hints for generic commands', async () => {
    const rafQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { encodeCalderOsc } = await import('./protocol.js');
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'node', args: ['dist/cli.js'] }],
        runtime: { status: 'running', command: 'node', args: ['dist/cli.js'] },
      },
    });

    const { attachCliSurfacePane } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);

    const message = encodeCalderOsc({
      type: 'node',
      nodeId: 'menu.root',
      label: 'command menu',
      meta: { framework: 'Blessed', widgetType: 'list' },
    });

    cliSurfaceDataCallbacks[0]?.(project.id, `hello${message}`);
    rafQueue.shift()?.(0);

    const badges = (container as unknown as FakeElement).querySelectorAll('.cli-surface-adapter-badge')
      .map((entry) => entry.textContent);

    expect(badges).toContain('Blessed');
    expect(badges).toContain('Widgets');
    expect(badges).toContain('Focus path');
  });

  it('preserves node bounds while merging focus and state metadata into the sent selection payload', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { encodeCalderOsc } = await import('./protocol.js');
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'node', args: ['dist/cli.js'] }],
        runtime: { status: 'running', command: 'node', args: ['dist/cli.js'] },
      },
    });

    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      composerEl: FakeElement;
      selectedButton: FakeElement;
    };
    instance.viewportLines = ['Command menu', 'Second item', 'Third item'];
    instance.terminal.cols = 24;
    instance.terminal.rows = 3;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 120, height: 30 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };

    cliSurfaceDataCallbacks[0]?.(project.id, encodeCalderOsc({
      type: 'node',
      nodeId: 'menu.root',
      label: 'command menu',
      bounds: { mode: 'line', startRow: 0, endRow: 0, startCol: 0, endCol: 24 },
      sourceFile: 'src/ui/menu.ts',
      meta: { framework: 'Blessed', widgetType: 'list' },
    }));
    cliSurfaceDataCallbacks[0]?.(project.id, encodeCalderOsc({
      type: 'focus',
      nodeId: 'menu.root',
      label: 'command menu',
      meta: { framework: 'Blessed', focusPath: ['screen', 'menu', 'command menu'] },
    }));
    cliSurfaceDataCallbacks[0]?.(project.id, encodeCalderOsc({
      type: 'state',
      nodeId: 'menu.root',
      meta: { framework: 'Blessed', stateSummary: '3 items focused' },
    }));

    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 0, clientY: 0, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 120, clientY: 9, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 120, clientY: 9, preventDefault: vi.fn() });

    await instance.selectedButton.listeners.get('click')?.[0]?.();

    expect(mockSendCliSelectionToSelectedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedText: 'Command menu',
        semanticNodeId: 'menu.root',
        semanticLabel: 'command menu',
        sourceFile: 'src/ui/menu.ts',
        adapterMeta: expect.objectContaining({
          framework: 'Blessed',
          widgetType: 'list',
          focusPath: ['screen', 'menu', 'command menu'],
          stateSummary: '3 items focused',
        }),
      }),
    );
  });

  it('prefers semantic node bounds for hover preview and single-click selection', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { encodeCalderOsc } = await import('./protocol.js');
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'node', args: ['dist/cli.js'] }],
        runtime: { status: 'running', command: 'node', args: ['dist/cli.js'] },
      },
    });

    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      hoverOverlayEl: FakeElement;
      hoverLabelEl: FakeElement;
      composerEl: FakeElement;
      composerHintEl: FakeElement;
      composerPreviewEl: FakeElement;
    };
    instance.viewportLines = ['Command menu', 'Second item', 'Third item'];
    instance.terminal.cols = 24;
    instance.terminal.rows = 3;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 120, height: 30 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };

    cliSurfaceDataCallbacks[0]?.(project.id, encodeCalderOsc({
      type: 'node',
      nodeId: 'menu.root',
      label: 'command menu',
      bounds: { mode: 'line', startRow: 0, endRow: 0, startCol: 0, endCol: 24 },
      sourceFile: 'src/ui/menu.ts',
      meta: { framework: 'Blessed', widgetType: 'list' },
    }));

    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 40, clientY: 5, preventDefault: vi.fn() });

    expect(instance.hoverOverlayEl.classList.contains('hidden')).toBe(false);
    expect(instance.hoverLabelEl.textContent).toBe('command menu');
    expect(instance.composerHintEl.textContent).toContain('Click to select command menu');

    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 40, clientY: 5, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 40, clientY: 5, preventDefault: vi.fn() });

    expect(instance.composerHintEl.textContent).toContain('Semantic target: command menu');
    expect(instance.composerPreviewEl.textContent).toBe('Command menu');
  });

  it('prefers the currently focused semantic node when multiple semantic regions overlap', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { encodeCalderOsc } = await import('./protocol.js');
    const { appState } = await import('../../state.js');
    const project = appState.addProject('Security', '/tmp/security');
    appState.setProjectSurface(project.id, {
      ...project.surface!,
      kind: 'cli',
      active: true,
      cli: {
        selectedProfileId: 'preview',
        profiles: [{ id: 'preview', name: 'Preview', command: 'node', args: ['dist/cli.js'] }],
        runtime: { status: 'running', command: 'node', args: ['dist/cli.js'] },
      },
    });

    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');
    attachCliSurfacePane(project.id, container);
    const instance = getCliSurfacePaneInstance(project.id) as unknown as {
      viewportLines: string[];
      terminal: { cols: number; rows: number };
      viewport: FakeElement;
      element: FakeElement;
      inspectButton: FakeElement;
      selectionOverlayEl: FakeElement;
      hoverOverlayEl: FakeElement;
      hoverLabelEl: FakeElement;
      hoverMetaEl: FakeElement;
      hoverPreviewEl: FakeElement;
      composerEl: FakeElement;
      composerHintEl: FakeElement;
      composerPreviewEl: FakeElement;
    };
    instance.viewportLines = ['Search query'];
    instance.terminal.cols = 24;
    instance.terminal.rows = 12;
    instance.element.rect = { left: 0, top: 0, width: 500, height: 360 };
    instance.viewport.rect = { left: 0, top: 0, width: 120, height: 120 };
    instance.composerEl.rect = { left: 0, top: 0, width: 220, height: 140 };

    cliSurfaceDataCallbacks[0]?.(project.id, encodeCalderOsc({
      type: 'node',
      nodeId: 'menu.root',
      label: 'command menu',
      bounds: { mode: 'line', startRow: 0, endRow: 0, startCol: 0, endCol: 24 },
      meta: { framework: 'Blessed', widgetType: 'list' },
    }));
    cliSurfaceDataCallbacks[0]?.(project.id, encodeCalderOsc({
      type: 'node',
      nodeId: 'menu.search',
      label: 'search input',
      bounds: { mode: 'line', startRow: 0, endRow: 0, startCol: 0, endCol: 24 },
      meta: { framework: 'Blessed', widgetType: 'textbox' },
    }));
    cliSurfaceDataCallbacks[0]?.(project.id, encodeCalderOsc({
      type: 'focus',
      nodeId: 'menu.search',
      label: 'search input',
      meta: { framework: 'Blessed', focusPath: ['screen', 'menu', 'search input'] },
    }));

    instance.inspectButton.listeners.get('click')?.[0]();
    instance.selectionOverlayEl.listeners.get('pointermove')?.[0]({ clientX: 20, clientY: 5, preventDefault: vi.fn() });

    expect(instance.hoverOverlayEl.classList.contains('semantic')).toBe(true);
    expect(instance.hoverOverlayEl.classList.contains('focused')).toBe(true);
    expect(instance.hoverOverlayEl.classList.contains('floating-below')).toBe(true);
    expect(instance.hoverOverlayEl.dataset.kind).toBe('semantic');
    expect(instance.hoverOverlayEl.dataset.placement).toBe('below');
    expect(instance.hoverOverlayEl.dataset.focused).toBe('true');
    expect(instance.hoverLabelEl.textContent).toBe('search input');
    expect(instance.hoverMetaEl.textContent).toContain('Semantic target');
    expect(instance.hoverMetaEl.textContent).toContain('Focused');
    expect(instance.hoverMetaEl.textContent).toContain('Blessed');
    expect(instance.hoverMetaEl.textContent).toContain('textbox');
    expect(instance.hoverPreviewEl.textContent).toBe('Search query');

    instance.selectionOverlayEl.listeners.get('pointerdown')?.[0]({ clientX: 20, clientY: 5, preventDefault: vi.fn() });
    instance.selectionOverlayEl.listeners.get('pointerup')?.[0]({ clientX: 20, clientY: 5, preventDefault: vi.fn() });

    expect(instance.composerHintEl.textContent).toContain('Semantic target: search input');
    expect(instance.composerPreviewEl.textContent).toBe('Search query');
  });

  it('creates a browser-style movable capture popover', async () => {
    const container = new FakeElement('div') as unknown as HTMLElement;
    const { attachCliSurfacePane, getCliSurfacePaneInstance } = await import('./pane.js');

    attachCliSurfacePane('project-1', container);
    const instance = getCliSurfacePaneInstance('project-1') as unknown as {
      composerEl: FakeElement;
      composerHandleEl: FakeElement;
    };

    expect(instance.composerEl.className).toContain('calder-popover');
    expect(instance.composerHandleEl.className).toBe('cli-surface-composer-handle');
    expect(instance.composerHandleEl.children[0]?.textContent).toBe('Terminal capture');
  });

  it('formats startup timing diagnostics for the runtime meta line', async () => {
    const { formatCliSurfaceTiming } = await import('./pane.js');

    expect(formatCliSurfaceTiming({ spawnLatencyMs: 45, firstOutputLatencyMs: 3_400 })).toBe(
      'spawn 45ms · first output 3.4s',
    );
    expect(formatCliSurfaceTiming({ spawnLatencyMs: 18 })).toBe('spawn 18ms');
    expect(formatCliSurfaceTiming()).toBe('');
  });
});
