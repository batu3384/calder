import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeClassList {
  private tokens = new Set<string>();

  add(...values: string[]): void {
    values.forEach((value) => this.tokens.add(value));
  }

  remove(...values: string[]): void {
    values.forEach((value) => this.tokens.delete(value));
  }

  contains(value: string): boolean {
    return this.tokens.has(value);
  }
}

class FakeElement {
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  className = '';
  classList = new FakeClassList();
  textContent = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  disabled = false;
  listeners = new Map<string, Array<(event?: unknown) => void>>();

  constructor(public tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
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
}

const {
  mockFit,
  mockOpen,
  mockLoadAddon,
  MockTerminal,
  MockFitAddon,
  MockSerializeAddon,
} = vi.hoisted(() => {
  const mockFit = vi.fn();
  const mockOpen = vi.fn();
  const mockLoadAddon = vi.fn();

  return {
    mockFit,
    mockOpen,
    mockLoadAddon,
    MockTerminal: class {
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
      getSelectionPosition = vi.fn(() => undefined);
      write = vi.fn();
    },
    MockFitAddon: class {
      fit = mockFit;
    },
    MockSerializeAddon: class {
      serialize = vi.fn(() => '');
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

vi.mock('./session-integration.js', () => ({
  sendCliSelectionToSelectedSession: vi.fn(async () => ({ ok: true, targetSessionId: 'session-1' })),
  sendCliSelectionToNewSession: vi.fn(),
  sendCliSelectionToCustomSession: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('document', {
    createElement: (tagName: string) => new FakeElement(tagName),
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
});
