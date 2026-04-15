import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();
const windowListeners = new Map<string, Set<(event?: any) => void>>();

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
  },
  addEventListener: vi.fn((type: string, listener: (event?: any) => void) => {
    const bucket = windowListeners.get(type) ?? new Set<(event?: any) => void>();
    bucket.add(listener);
    windowListeners.set(type, bucket);
  }),
  removeEventListener: vi.fn((type: string, listener: (event?: any) => void) => {
    windowListeners.get(type)?.delete(listener);
  }),
});

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

class FakeClassList {
  private values = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) this.values.add(token);
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) this.values.delete(token);
  }

  contains(token: string): boolean {
    return this.values.has(token);
  }

  toggle(token: string, force?: boolean): boolean {
    const shouldAdd = force ?? !this.values.has(token);
    if (shouldAdd) this.values.add(token);
    else this.values.delete(token);
    return shouldAdd;
  }
}

class FakeElement {
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  className = '';
  classList = new FakeClassList();
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  id = '';
  listeners = new Map<string, Array<(event?: any) => void>>();
  rect = { left: 0, top: 0, width: 1000, height: 800 };

  constructor(public tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((candidate) => candidate !== this);
    this.parentElement = null;
  }

  addEventListener(event: string, cb: (event?: any) => void): void {
    const current = this.listeners.get(event) ?? [];
    current.push(cb);
    this.listeners.set(event, current);
  }

  removeEventListener(event: string, cb: (event?: any) => void): void {
    const current = this.listeners.get(event) ?? [];
    this.listeners.set(event, current.filter((listener) => listener !== cb));
  }

  dispatch(event: string, payload: any): void {
    for (const cb of this.listeners.get(event) ?? []) cb(payload);
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = [];
    const matcher = (el: FakeElement) => {
      if (selector.startsWith('.')) {
        const token = selector.slice(1);
        return el.className.split(/\s+/).includes(token) || el.classList.contains(token);
      }
      if (selector.startsWith('#')) {
        return el.id === selector.slice(1);
      }
      return false;
    };

    const visit = (node: FakeElement) => {
      for (const child of node.children) {
        if (matcher(child)) matches.push(child);
        visit(child);
      }
    };

    visit(this);
    return matches;
  }

  closest(selector: string): FakeElement | null {
    const selectors = selector.split(',').map((part) => part.trim()).filter(Boolean);
    let current: FakeElement | null = this;
    while (current) {
      for (const item of selectors) {
        if (item.startsWith('.')) {
          const token = item.slice(1);
          if (current.className.split(/\s+/).includes(token) || current.classList.contains(token)) {
            return current;
          }
        }
      }
      current = current.parentElement;
    }
    return null;
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

class FakeDataTransfer {
  effectAllowed = '';
  dropEffect = '';
  private store = new Map<string, string>();

  setData(type: string, value: string): void {
    this.store.set(type, value);
  }

  getData(type: string): string {
    return this.store.get(type) ?? '';
  }
}

class FakeDocument {
  body = new FakeElement('body');
  activeElement: FakeElement | null = null;
  private elementsById = new Map<string, FakeElement>();

  register(id: string, element: FakeElement): void {
    element.id = id;
    this.elementsById.set(id, element);
  }

  getElementById(id: string): FakeElement | null {
    return this.elementsById.get(id) ?? null;
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  querySelector(selector: string): FakeElement | null {
    if (selector.startsWith('#')) return this.getElementById(selector.slice(1));
    return this.body.querySelector(selector);
  }
}

function emitWindow(type: string, event: any): void {
  for (const listener of windowListeners.get(type) ?? []) {
    listener(event);
  }
}

const terminalPanes = new Map<string, FakeElement>();
const browserPanes = new Map<string, FakeElement>();
const cliSurfacePanes = new Map<string, FakeElement>();
const mockSetFocused = vi.fn();
const mockClearFocused = vi.fn();
const mockAttachBrowserTabToContainer = vi.fn((sessionId: string, container: FakeElement) => {
  const pane = browserPanes.get(sessionId) ?? makePane('browser-tab-pane', sessionId);
  browserPanes.set(sessionId, pane);
  if (pane.parentElement !== container) container.appendChild(pane);
});
const mockAttachCliSurfacePane = vi.fn((projectId: string, container: FakeElement) => {
  const pane = cliSurfacePanes.get(projectId) ?? makePane('cli-surface-pane', projectId);
  cliSurfacePanes.set(projectId, pane);
  if (pane.parentElement !== container) container.appendChild(pane);
});
const mockAttachTerminalToContainer = vi.fn((sessionId: string, container: FakeElement) => {
  const pane = terminalPanes.get(sessionId) ?? makePane('terminal-pane', sessionId);
  terminalPanes.set(sessionId, pane);
  if (pane.parentElement !== container) container.appendChild(pane);
});

function makePane(className: string, sessionId: string): FakeElement {
  const el = new FakeElement('div');
  el.className = className;
  el.dataset.sessionId = sessionId;
  const headerClass = className === 'terminal-pane'
    ? 'terminal-pane-chrome'
    : className === 'browser-tab-pane'
      ? 'browser-pane-chrome'
      : null;
  if (headerClass) {
    const header = new FakeElement('div');
    header.className = headerClass;
    el.appendChild(header);
  }
  return el;
}

vi.mock('./terminal-pane.js', () => ({
  createTerminalPane: vi.fn((sessionId: string) => {
    const pane = makePane('terminal-pane', sessionId);
    terminalPanes.set(sessionId, pane);
    return { element: pane, spawned: false, exited: false };
  }),
  attachToContainer: mockAttachTerminalToContainer,
  showPane: vi.fn(),
  hideAllPanes: vi.fn(),
  fitAllVisible: vi.fn(),
  setFocused: mockSetFocused,
  clearFocused: mockClearFocused,
  spawnTerminal: vi.fn(),
  setPendingPrompt: vi.fn(),
  destroyTerminal: vi.fn(),
  getTerminalInstance: vi.fn((sessionId: string) => {
    const pane = terminalPanes.get(sessionId);
    return pane ? { element: pane, spawned: false, exited: false } : undefined;
  }),
}));

vi.mock('./mcp-inspector.js', () => ({
  createInspectorPane: vi.fn(),
  destroyInspectorPane: vi.fn(),
  showInspectorPane: vi.fn(),
  hideAllInspectorPanes: vi.fn(),
  attachInspectorToContainer: vi.fn(),
  getInspectorInstance: vi.fn(() => undefined),
  disconnectInspector: vi.fn(),
}));

vi.mock('./file-viewer.js', () => ({
  createFileViewerPane: vi.fn(),
  destroyFileViewerPane: vi.fn(),
  showFileViewerPane: vi.fn(),
  hideAllFileViewerPanes: vi.fn(),
  attachFileViewerToContainer: vi.fn(),
  getFileViewerInstance: vi.fn(() => undefined),
}));

vi.mock('./file-reader.js', () => ({
  createFileReaderPane: vi.fn(),
  destroyFileReaderPane: vi.fn(),
  showFileReaderPane: vi.fn(),
  hideAllFileReaderPanes: vi.fn(),
  attachFileReaderToContainer: vi.fn(),
  getFileReaderInstance: vi.fn(() => undefined),
  setFileReaderLine: vi.fn(),
}));

vi.mock('./remote-terminal-pane.js', () => ({
  getRemoteTerminalInstance: vi.fn(() => undefined),
  destroyRemoteTerminal: vi.fn(),
  attachRemoteToContainer: vi.fn(),
  showRemotePane: vi.fn(),
  hideAllRemotePanes: vi.fn(),
}));

vi.mock('./browser-tab-pane.js', () => ({
  createBrowserTabPane: vi.fn((sessionId: string) => {
    browserPanes.set(sessionId, makePane('browser-tab-pane', sessionId));
  }),
  destroyBrowserTabPane: vi.fn(),
  showBrowserTabPane: vi.fn(),
  hideAllBrowserTabPanes: vi.fn(),
  attachBrowserTabToContainer: mockAttachBrowserTabToContainer,
  getBrowserTabInstance: vi.fn((sessionId: string) => browserPanes.get(sessionId)),
}));

vi.mock('./cli-surface/pane.js', () => ({
  attachCliSurfacePane: mockAttachCliSurfacePane,
  showCliSurfacePane: vi.fn(),
  hideAllCliSurfacePanes: vi.fn(),
  getCliSurfacePaneInstance: vi.fn((projectId: string) => cliSurfacePanes.get(projectId)),
}));

vi.mock('./tab-bar.js', () => ({
  quickNewSession: vi.fn(),
}));

vi.mock('./sidebar.js', () => ({
  promptNewProject: vi.fn(),
}));

vi.mock('./session-inspector.js', () => ({
  isInspectorOpen: vi.fn(() => false),
}));

describe('split-layout mosaic behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    uuidCounter = 0;
    terminalPanes.clear();
    browserPanes.clear();
    cliSurfacePanes.clear();
    windowListeners.clear();

    const document = new FakeDocument();
    const container = new FakeElement('div');
    document.register('terminal-container', container);
    vi.stubGlobal('document', document);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });

  it('renders browser-left with a single large session canvas when one cli session is visible', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    const firstCli = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    appState.setActiveSession(project.id, firstCli.id);
    renderLayout();

    const container = document.getElementById('terminal-container') as unknown as FakeElement;
    const browserColumn = container.querySelector('.mosaic-browser-column') as FakeElement;
    const canvas = container.querySelector('.mosaic-session-canvas') as FakeElement;
    const browserDivider = container.querySelector('.mosaic-divider-browser') as FakeElement;

    expect(browserColumn).toBeTruthy();
    expect(canvas).toBeTruthy();
    expect(browserDivider).toBeTruthy();
    expect(mockAttachBrowserTabToContainer).toHaveBeenCalledWith(browser.id, browserColumn);
    expect(browserPanes.get(browser.id)?.parentElement).toBe(browserColumn);
    expect(terminalPanes.get(firstCli.id)?.parentElement).toBe(canvas);
    expect(container.style.gridTemplateColumns).toBe('minmax(288px, 0.38fr) 10px minmax(0, 0.62fr)');
    expect(canvas.className).toContain('mosaic-single');
  });

  it('renders browser-left with a two-column session canvas when two cli sessions are visible', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    const first = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    const second = appState.addSession(project.id, 'Session 2', undefined, 'codex')!;
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;
    project.layout.browserWidthRatio = 0.44;
    appState.setActiveSession(project.id, first.id);

    renderLayout();

    const container = document.getElementById('terminal-container') as unknown as FakeElement;
    const browserColumn = container.querySelector('.mosaic-browser-column') as FakeElement;
    const canvas = container.querySelector('.mosaic-session-canvas') as FakeElement;
    const browserDivider = container.querySelector('.mosaic-divider-browser') as FakeElement;
    const sessionDivider = container.querySelector('.mosaic-divider-primary') as FakeElement;

    expect(mockAttachBrowserTabToContainer).toHaveBeenCalledWith(browser.id, browserColumn);
    expect(browserPanes.get(browser.id)?.parentElement).toBe(browserColumn);
    expect(terminalPanes.get(first.id)?.parentElement?.className).toContain('mosaic-slot');
    expect(terminalPanes.get(second.id)?.parentElement?.className).toContain('mosaic-slot');
    expect(browserDivider).toBeTruthy();
    expect(sessionDivider).toBeTruthy();
    expect(container.style.gridTemplateColumns).toBe('minmax(288px, 0.44fr) 10px minmax(0, 0.56fr)');
    expect(canvas.className).toContain('mosaic-columns-2');
    expect(canvas.style.gridTemplateColumns).toBe('minmax(0, 0.5fr) 10px minmax(0, 0.5fr)');
    expect(canvas.style.gridTemplateRows).toBe('1fr');
  });

  it('renders browser-left with a focus-left preset when three cli sessions are visible', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    const first = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    const second = appState.addSession(project.id, 'Session 2', undefined, 'codex')!;
    const third = appState.addSession(project.id, 'Session 3', undefined, 'gemini')!;
    appState.addBrowserTabSession(project.id, 'http://localhost:3000');
    project.layout.mosaicRatios = { 'focus-left-main': 0.62, 'focus-left-stack': 0.35 };

    appState.setActiveSession(project.id, first.id);
    renderLayout();

    const container = document.getElementById('terminal-container') as unknown as FakeElement;
    const canvas = container.querySelector('.mosaic-session-canvas') as FakeElement;
    const main = container.querySelector('.mosaic-focus-left-main') as FakeElement;
    const stack = container.querySelector('.mosaic-focus-left-stack') as FakeElement;
    const primaryDivider = container.querySelector('.mosaic-divider-primary') as FakeElement;
    const secondaryDivider = container.querySelector('.mosaic-divider-secondary') as FakeElement;

    expect(canvas.className).toContain('mosaic-focus-left');
    expect(main).toBeTruthy();
    expect(stack).toBeTruthy();
    expect(primaryDivider).toBeTruthy();
    expect(secondaryDivider).toBeTruthy();
    expect(canvas.style.gridTemplateColumns).toBe('minmax(0, 0.62fr) 10px minmax(0, 0.38fr)');
    expect(stack.style.gridTemplateRows).toBe('minmax(0, 0.35fr) 10px minmax(0, 0.65fr)');
    expect(terminalPanes.get(first.id)?.parentElement).toBe(main);
    expect(terminalPanes.get(second.id)?.parentElement?.className).toContain('mosaic-slot');
    expect(terminalPanes.get(third.id)?.parentElement?.className).toContain('mosaic-slot');
  });

  it('expands the session mosaic to full width when no browser session exists', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    const first = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    const second = appState.addSession(project.id, 'Session 2', undefined, 'codex')!;

    appState.setActiveSession(project.id, first.id);
    renderLayout();

    const container = document.getElementById('terminal-container') as unknown as FakeElement;
    const browserColumn = container.querySelector('.mosaic-browser-column') as FakeElement | null;
    const canvas = container.querySelector('.mosaic-session-canvas') as FakeElement;

    expect(browserColumn).toBeNull();
    expect(canvas).toBeTruthy();
    expect(container.style.gridTemplateColumns).toBe('1fr');
    expect(terminalPanes.get(first.id)?.parentElement?.className).toContain('mosaic-slot');
    expect(terminalPanes.get(second.id)?.parentElement?.className).toContain('mosaic-slot');
    expect(canvas.className).toContain('mosaic-columns-2');
  });

  it('does not activate a pane on reorder-header mousedown before drag can start', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { initSplitLayout, renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    const first = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    const second = appState.addSession(project.id, 'Session 2', undefined, 'codex')!;

    appState.setActiveSession(project.id, second.id);
    initSplitLayout();
    renderLayout();

    const container = document.getElementById('terminal-container') as unknown as FakeElement;
    const firstHeader = terminalPanes.get(first.id)!.querySelector('.terminal-pane-chrome')!;

    container.dispatch('mousedown', { target: firstHeader });

    expect(appState.activeProject!.activeSessionId).toBe(second.id);
  });

  it('reorders swarm panes when a pane header is dragged onto another pane', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { initSplitLayout, renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    const first = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    const second = appState.addSession(project.id, 'Session 2', undefined, 'codex')!;

    appState.setActiveSession(project.id, second.id);
    initSplitLayout();
    renderLayout();

    const container = document.getElementById('terminal-container') as unknown as FakeElement;
    const firstPane = terminalPanes.get(first.id)!;
    const secondPane = terminalPanes.get(second.id)!;
    const firstHeader = firstPane.querySelector('.terminal-pane-chrome')!;
    const transfer = new FakeDataTransfer();

    container.dispatch('dragstart', { target: firstHeader, dataTransfer: transfer });
    container.dispatch('dragover', { target: secondPane, dataTransfer: transfer, preventDefault: vi.fn() });
    container.dispatch('drop', { target: secondPane, dataTransfer: transfer, preventDefault: vi.fn() });

    expect(appState.activeProject!.sessions.map((session) => session.id)).toEqual([second.id, first.id]);
    expect(appState.activeProject!.layout.splitPanes).toEqual([second.id, first.id]);
  });

  it('persists the dragged live surface width ratio from the center divider', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { initSplitLayout, renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    appState.addSession(project.id, 'Session 2', undefined, 'codex')!;
    appState.addBrowserTabSession(project.id, 'http://localhost:3000');
    project.layout.browserWidthRatio = 0.61;

    initSplitLayout();
    renderLayout();

    const container = document.getElementById('terminal-container') as unknown as FakeElement;
    const divider = container.querySelector('.mosaic-divider-browser') as FakeElement;

    expect(divider).toBeTruthy();
    expect(container.style.gridTemplateColumns).toBe('minmax(288px, 0.61fr) 10px minmax(0, 0.39fr)');

    const preventDefault = vi.fn();
    divider.dispatch('pointerdown', { clientX: 610, clientY: 10, preventDefault });
    emitWindow('pointermove', { clientX: 520, clientY: 10 });
    emitWindow('pointerup', { clientX: 520, clientY: 10 });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(appState.activeProject!.layout.browserWidthRatio).toBeCloseTo(0.52, 4);
  });

  it('uses only the live-surface span when dragging the center divider with the inspector open', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { isInspectorOpen } = await import('./session-inspector.js');
    const { initSplitLayout, renderLayout } = await import('./split-layout.js');

    vi.mocked(isInspectorOpen).mockReturnValue(true);

    const project = appState.addProject('Audit', '/audit');
    appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    appState.addSession(project.id, 'Session 2', undefined, 'codex')!;
    appState.addBrowserTabSession(project.id, 'http://localhost:3000');
    project.layout.browserWidthRatio = 0.5;

    initSplitLayout();
    renderLayout();

    const container = document.getElementById('terminal-container') as unknown as FakeElement;
    const divider = container.querySelector('.mosaic-divider-browser') as FakeElement;

    expect(divider).toBeTruthy();
    expect(container.style.gridTemplateColumns)
      .toBe('minmax(288px, 0.5fr) 10px minmax(0, 0.5fr) var(--inspector-width, 350px)');

    const preventDefault = vi.fn();
    divider.dispatch('pointerdown', { clientX: 325, clientY: 10, preventDefault });
    emitWindow('pointermove', { clientX: 390, clientY: 10 });
    emitWindow('pointerup', { clientX: 390, clientY: 10 });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(appState.activeProject!.layout.browserWidthRatio).toBeCloseTo(0.6, 4);
  });

  it('renders a cli surface in the pinned left column when the project surface is cli', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    const first = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    const second = appState.addSession(project.id, 'Session 2', undefined, 'codex')!;
    appState.setProjectSurface(project.id, {
      kind: 'cli',
      active: true,
      cli: {
        selectedProfileId: 'textual',
        profiles: [{ id: 'textual', name: 'Textual', command: 'python' }],
        runtime: { status: 'idle' },
      },
    });
    appState.setActiveSession(project.id, first.id);

    renderLayout();

    const container = document.getElementById('terminal-container') as unknown as FakeElement;
    const surfaceColumn = container.querySelector('.mosaic-browser-column') as FakeElement;
    const canvas = container.querySelector('.mosaic-session-canvas') as FakeElement;

    expect(surfaceColumn).toBeTruthy();
    expect(canvas).toBeTruthy();
    expect(mockAttachCliSurfacePane).toHaveBeenCalledWith(project.id, surfaceColumn);
    expect(cliSurfacePanes.get(project.id)?.parentElement).toBe(surfaceColumn);
    expect(terminalPanes.get(first.id)?.parentElement?.className).toContain('mosaic-slot');
    expect(terminalPanes.get(second.id)?.parentElement?.className).toContain('mosaic-slot');
  });

  it('expands the session mosaic back to full width after closing the cli surface tab', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { isInspectorOpen } = await import('./session-inspector.js');
    const { renderLayout } = await import('./split-layout.js');
    vi.mocked(isInspectorOpen).mockReturnValue(false);

    const project = appState.addProject('Audit', '/audit');
    const first = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    appState.addSession(project.id, 'Session 2', undefined, 'codex')!;
    appState.setProjectSurface(project.id, {
      kind: 'cli',
      active: true,
      tabFocus: 'cli',
      cli: {
        selectedProfileId: 'textual',
        profiles: [{ id: 'textual', name: 'Textual', command: 'python' }],
        runtime: { status: 'idle' },
      },
    });
    appState.setActiveSession(project.id, first.id);

    renderLayout();
    appState.closeCliSurface(project.id);
    renderLayout();

    const container = document.getElementById('terminal-container') as unknown as FakeElement;
    const browserColumn = container.querySelector('.mosaic-browser-column') as FakeElement | null;
    const canvas = container.querySelector('.mosaic-session-canvas') as FakeElement;

    expect(browserColumn).toBeNull();
    expect(canvas).toBeTruthy();
    expect(container.style.gridTemplateColumns).toBe('1fr');
  });

  it('does not rebuild the pinned browser surface when only the browser URL changes', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { initSplitLayout, renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    initSplitLayout();
    renderLayout();
    mockAttachBrowserTabToContainer.mockClear();

    appState.updateSessionBrowserTabUrl(browser.id, 'http://localhost:3001');

    expect(mockAttachBrowserTabToContainer).not.toHaveBeenCalled();
  });

  it('does not rebuild the pinned browser surface when a sibling session only changes metadata', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { initSplitLayout, renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    const cliSession = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    initSplitLayout();
    renderLayout();
    mockAttachBrowserTabToContainer.mockClear();

    appState.renameSession(project.id, cliSession.id, 'Renamed Session', true);

    expect(mockAttachBrowserTabToContainer).not.toHaveBeenCalled();
  });
});
