import { beforeEach, describe, expect, it, vi } from 'vitest';

type GitStatusRecord = {
  isGitRepo: boolean;
  staged: number;
  modified: number;
  untracked: number;
  conflicted: number;
};

const mockAppState = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>();
  const state = {
    activeProjectId: 'p1',
    activeProject: {
      id: 'p1',
      path: '/tmp/workspace',
    } as { id: string; path: string },
    preferences: {
      sidebarViews: { gitPanel: true },
    },
    on: vi.fn((event: string, cb: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return () => listeners.get(event)?.delete(cb);
    }),
    emit(event: string) {
      listeners.get(event)?.forEach(cb => cb());
    },
    reset() {
      listeners.clear();
      state.activeProjectId = 'p1';
      state.activeProject = { id: 'p1', path: '/tmp/workspace' };
      state.preferences.sidebarViews.gitPanel = true;
      state.on.mockClear();
    },
  };
  return state;
});

const gitModuleState = vi.hoisted(() => {
  let status: GitStatusRecord = {
    isGitRepo: true,
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicted: 0,
  };
  let changeHandler: ((projectId: string, status: GitStatusRecord) => void) | null = null;
  let worktreeHandler: (() => void) | null = null;

  return {
    get status() {
      return status;
    },
    setStatus(next: GitStatusRecord) {
      status = next;
    },
    emitChange(projectId = 'p1') {
      changeHandler?.(projectId, status);
    },
    emitWorktreeChange() {
      worktreeHandler?.();
    },
    setChangeHandler(handler: (projectId: string, status: GitStatusRecord) => void) {
      changeHandler = handler;
    },
    setWorktreeHandler(handler: () => void) {
      worktreeHandler = handler;
    },
    reset() {
      status = {
        isGitRepo: true,
        staged: 0,
        modified: 0,
        untracked: 0,
        conflicted: 0,
      };
      changeHandler = null;
      worktreeHandler = null;
    },
  };
});

vi.mock('../state.js', () => ({
  appState: mockAppState,
}));

vi.mock('../git-status.js', () => ({
  onChange: (cb: (projectId: string, status: GitStatusRecord) => void) => {
    gitModuleState.setChangeHandler(cb);
    return () => {};
  },
  getGitStatus: () => gitModuleState.status,
  getActiveGitPath: () => '/tmp/workspace',
  getWorktrees: () => [],
  setActiveWorktree: vi.fn(),
  onWorktreeChange: (cb: () => void) => {
    gitModuleState.setWorktreeHandler(cb);
    return () => {};
  },
}));

vi.mock('../session-activity.js', () => ({
  onChange: () => () => {},
}));

vi.mock('./file-viewer.js', () => ({
  showFileViewer: vi.fn(),
}));

vi.mock('../dom-utils.js', () => ({
  areaLabel: (value: string) => value,
}));

class FakeClassList {
  constructor(private owner: FakeElement) {}

  add(...tokens: string[]): void {
    const set = new Set(this.owner.className.split(/\s+/).filter(Boolean));
    for (const token of tokens) set.add(token);
    this.owner.className = Array.from(set).join(' ');
  }

  remove(...tokens: string[]): void {
    const removeSet = new Set(tokens);
    this.owner.className = this.owner.className
      .split(/\s+/)
      .filter(token => token && !removeSet.has(token))
      .join(' ');
  }

  toggle(token: string, force?: boolean): boolean {
    const has = this.contains(token);
    const shouldHave = force ?? !has;
    if (shouldHave) this.add(token);
    else this.remove(token);
    return shouldHave;
  }

  contains(token: string): boolean {
    return this.owner.className.split(/\s+/).includes(token);
  }
}

class FakeElement {
  children: FakeElement[] = [];
  style: Record<string, string> = {};
  className = '';
  textContent = '';
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  parentNode: FakeElement | null = null;
  listeners = new Map<string, Array<(event?: unknown) => void>>();
  classList = new FakeClassList(this);

  constructor(public tagName: string, public ownerDocument: FakeDocument) {}

  set innerHTML(value: string) {
    this.textContent = value;
    if (value === '') this.children = [];
  }

  get innerHTML(): string {
    return this.textContent;
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
    if (name.startsWith('data-')) {
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = value;
    }
  }

  addEventListener(event: string, cb: (event?: unknown) => void): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(cb);
    this.listeners.set(event, existing);
  }

  dispatch(event: string): void {
    const eventObject = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
    for (const cb of this.listeners.get(event) ?? []) cb(eventObject as never);
  }

  querySelector(selector: string): FakeElement | null {
    if (!selector.startsWith('.')) return null;
    const className = selector.slice(1);
    for (const child of this.children) {
      if (child.classList.contains(className)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  closest(selector: string): FakeElement | null {
    if (!selector.startsWith('.')) return null;
    const className = selector.slice(1);
    let current: FakeElement | null = this;
    while (current) {
      if (current.classList.contains(className)) return current;
      current = current.parentNode;
    }
    return null;
  }

  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  hasChildNodes(): boolean {
    return this.children.length > 0;
  }

  scrollIntoView(): void {}
}

class FakeDocument {
  private elements = new Map<string, FakeElement>();
  listeners = new Map<string, Array<(event?: unknown) => void>>();
  body = new FakeElement('body', this);

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  createDocumentFragment(): FakeElement {
    return new FakeElement('#fragment', this);
  }

  getElementById(id: string): FakeElement | null {
    return this.elements.get(id) ?? null;
  }

  registerElement(id: string, element: FakeElement): void {
    this.elements.set(id, element);
  }

  addEventListener(event: string, cb: (event?: unknown) => void): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(cb);
    this.listeners.set(event, existing);
  }
}

async function renderGitPanel(status: GitStatusRecord): Promise<FakeElement> {
  vi.resetModules();
  gitModuleState.setStatus(status);

  const document = new FakeDocument();
  const wrapper = document.createElement('section');
  wrapper.className = 'context-inspector-section';
  const container = document.createElement('div');
  wrapper.appendChild(container);
  document.registerElement('git-panel', container);
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', {
    calder: {
      git: {
        getFiles: vi.fn(async () => []),
      },
    },
  });

  const { initGitPanel } = await import('./git-panel.js');
  initGitPanel();
  mockAppState.emit('state-loaded');
  vi.runAllTimers();
  await Promise.resolve();

  return container;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.unstubAllGlobals();
  mockAppState.reset();
  gitModuleState.reset();
});

describe('git panel', () => {
  it('keeps a visible clean state instead of disappearing when the worktree is clean', async () => {
    const container = await renderGitPanel({
      isGitRepo: true,
      staged: 0,
      modified: 0,
      untracked: 0,
      conflicted: 0,
    });

    expect(container.firstElementChild).not.toBeNull();
    expect(container.querySelector('.config-section-toggle-button')).not.toBeNull();
    expect(container.querySelector('.config-empty')?.textContent).toContain('Working tree clean');
  });

  it('renders a helpful no-repo state instead of leaving the rail empty', async () => {
    const container = await renderGitPanel({
      isGitRepo: false,
      staged: 0,
      modified: 0,
      untracked: 0,
      conflicted: 0,
    });

    expect(container.firstElementChild).not.toBeNull();
    expect(container.querySelector('.config-section-toggle-button')).not.toBeNull();
    expect(container.querySelector('.config-empty')?.textContent).toContain('This folder is not a Git repo yet');
  });

  it('keeps git compact when the repo is clean', async () => {
    const container = await renderGitPanel({
      isGitRepo: true,
      staged: 0,
      modified: 0,
      untracked: 0,
      conflicted: 0,
    });

    (container.parentNode as FakeElement).dataset.presentation = 'compact';
    gitModuleState.emitChange();
    vi.runAllTimers();
    await Promise.resolve();

    expect(container.querySelector('.config-empty')?.textContent).toContain('Git is clean');
  });
});
