import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
  },
  addEventListener: vi.fn(),
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

const terminalPanes = new Map<string, FakeElement>();
const browserPanes = new Map<string, FakeElement>();
const mockSetFocused = vi.fn();
const mockClearFocused = vi.fn();
const mockAttachBrowserTabToContainer = vi.fn((sessionId: string, container: FakeElement) => {
  const pane = browserPanes.get(sessionId) ?? makePane('browser-tab-pane', sessionId);
  browserPanes.set(sessionId, pane);
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

vi.mock('./tab-bar.js', () => ({
  quickNewSession: vi.fn(),
}));

vi.mock('./sidebar.js', () => ({
  promptNewProject: vi.fn(),
}));

vi.mock('./session-inspector.js', () => ({
  isInspectorOpen: vi.fn(() => false),
}));

describe('split-layout swarm behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    uuidCounter = 0;
    terminalPanes.clear();
    browserPanes.clear();

    const document = new FakeDocument();
    const container = new FakeElement('div');
    document.register('terminal-container', container);
    vi.stubGlobal('document', document);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });

  it('keeps a browser companion pane visible while a cli session is active in swarm', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    const firstCli = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    appState.addSession(project.id, 'Session 2', undefined, 'codex');
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    appState.setActiveSession(project.id, firstCli.id);
    renderLayout();

    const container = document.getElementById('terminal-container') as FakeElement;
    expect(mockAttachBrowserTabToContainer).toHaveBeenCalledWith(browser.id, container);
    expect(container.style.gridTemplateColumns).toBe('1fr 1fr');
  });

  it('does not focus a terminal pane when the active swarm surface is a browser tab', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    appState.addSession(project.id, 'Session 1', undefined, 'claude');
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    appState.setActiveSession(project.id, browser.id);
    renderLayout();

    expect(mockSetFocused).not.toHaveBeenCalled();
  });

  it('activates the browser session when the companion pane is clicked in swarm', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { initSplitLayout, renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    const cli = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    appState.setActiveSession(project.id, cli.id);
    initSplitLayout();
    renderLayout();

    const container = document.getElementById('terminal-container') as FakeElement;
    const browserPane = browserPanes.get(browser.id)!;
    container.dispatch('mousedown', { target: browserPane });

    expect(appState.activeProject!.activeSessionId).toBe(browser.id);
  });

  it('dims the persistent browser companion when a cli session is active', async () => {
    const { appState, _resetForTesting } = await import('../state.js');
    _resetForTesting();
    const { renderLayout } = await import('./split-layout.js');

    const project = appState.addProject('Audit', '/audit');
    const cli = appState.addSession(project.id, 'Session 1', undefined, 'claude')!;
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    appState.setActiveSession(project.id, cli.id);
    renderLayout();

    const browserPane = browserPanes.get(browser.id)!;
    expect(browserPane.classList.contains('swarm-dimmed')).toBe(true);

    appState.setActiveSession(project.id, browser.id);
    renderLayout();

    expect(browserPane.classList.contains('swarm-dimmed')).toBe(false);
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

    const container = document.getElementById('terminal-container') as FakeElement;
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
});
