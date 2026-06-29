import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  preferences: { language: 'en' as 'en' | 'tr' },
}));

vi.mock('../../state.js', () => ({
  appState: mockState,
}));

type Listener = () => void | Promise<void>;

type MockClassList = {
  add: (...tokens: string[]) => void;
  remove: (...tokens: string[]) => void;
  toggle: (token: string, force?: boolean) => boolean;
  contains: (token: string) => boolean;
  toString: () => string;
  setFromString: (input: string) => void;
};

type MockElement = {
  tagName: string;
  children: MockElement[];
  textContent: string;
  innerHTML: string;
  title: string;
  value: string;
  disabled: boolean;
  selected: boolean;
  classList: MockClassList;
  className: string;
  appendChild: (child: MockElement) => MockElement;
  addEventListener: (event: string, listener: Listener) => void;
  dispatch: (event: string) => Promise<void>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
};

function createClassList(initial = ''): MockClassList {
  const set = new Set(initial.split(/\s+/).filter(Boolean));
  return {
    add: (...tokens: string[]) => {
      tokens.forEach((token) => set.add(token));
    },
    remove: (...tokens: string[]) => {
      tokens.forEach((token) => set.delete(token));
    },
    toggle: (token: string, force?: boolean) => {
      if (force === true) {
        set.add(token);
        return true;
      }
      if (force === false) {
        set.delete(token);
        return false;
      }
      if (set.has(token)) {
        set.delete(token);
        return false;
      }
      set.add(token);
      return true;
    },
    contains: (token: string) => set.has(token),
    toString: () => Array.from(set).join(' '),
    setFromString: (input: string) => {
      set.clear();
      input
        .split(/\s+/)
        .filter(Boolean)
        .forEach((token) => set.add(token));
    },
  };
}

function createMockElement(tagName = 'div'): MockElement {
  const listeners: Record<string, Listener[]> = {};
  const attributes = new Map<string, string>();
  const classList = createClassList();
  const element = {
    tagName: tagName.toUpperCase(),
    children: [] as MockElement[],
    textContent: '',
    innerHTML: '',
    title: '',
    value: '',
    disabled: false,
    selected: false,
    classList,
    appendChild(child: MockElement): MockElement {
      element.children.push(child);
      if (element.tagName === 'SELECT' && child.selected) {
        element.value = child.value;
      }
      return child;
    },
    addEventListener(event: string, listener: Listener): void {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(listener);
    },
    async dispatch(event: string): Promise<void> {
      const callbacks = listeners[event] ?? [];
      for (const callback of callbacks) {
        await callback();
      }
    },
    setAttribute(name: string, value: string): void {
      attributes.set(name, value);
    },
    getAttribute(name: string): string | null {
      return attributes.get(name) ?? null;
    },
    get className(): string {
      return classList.toString();
    },
    set className(value: string) {
      classList.setFromString(value);
    },
  } satisfies MockElement;

  return element;
}

function installDocumentStub(): void {
  vi.stubGlobal('document', {
    createElement(tagName: string) {
      return createMockElement(tagName);
    },
  });
}

import { createModeGuide, createModeSelect } from './config-sections-auto-approval.js';

describe('config-sections-auto-approval helpers', () => {
  beforeEach(() => {
    mockState.preferences.language = 'en';
    installDocumentStub();
  });

  it('createModeSelect builds expected options and selects the current mode', () => {
    const select = createModeSelect('edit_only', 'Scope help', async () => {});

    expect(select.className).toBe('auto-approval-select');
    expect(select.title).toBe('Scope help');
    expect(select.children).toHaveLength(5);
    expect(select.value).toBe('edit_only');
    expect(select.children.map((child) => child.value)).toEqual([
      'off',
      'edit_only',
      'edit_plus_safe_tools',
      'full_auto',
      'full_auto_unsafe',
    ]);
  });

  it('createModeSelect disables while the async change handler runs', async () => {
    let release: (() => void) | null = null;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onChange = vi.fn(async (_nextMode: string) => {
      await wait;
    });

    const select = createModeSelect('off', 'Scope help', onChange);
    select.value = 'full_auto';
    const changePromise = select.dispatch('change');

    await Promise.resolve();
    expect(onChange).toHaveBeenCalledWith('full_auto');
    expect(select.disabled).toBe(true);

    release?.();
    await changePromise;
    expect(select.disabled).toBe(false);
  });

  it('createModeGuide toggles expanded state and hidden class', async () => {
    const guide = createModeGuide((input) => input);

    expect(guide.className).toBe('auto-approval-mode-guide');
    expect(guide.children).toHaveLength(2);

    const toggle = guide.children[0];
    const body = guide.children[1];
    expect(toggle.textContent).toBe('Mode Guide');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(body.classList.contains('hidden')).toBe(true);
    expect(body.children).toHaveLength(5);
    expect(body.children[0].innerHTML).toContain('Auto-runs: Nothing.');
    expect(body.children[0].innerHTML).toContain('Still asks: Every edit, command, and tool run.');
    expect(body.children[3].innerHTML).toContain('Auto-runs: Non-destructive operations.');
    expect(body.children[3].innerHTML).toContain('Still asks: Destructive actions.');
    expect(body.children[4].innerHTML).toContain(
      'Auto-runs: Everything, including destructive actions.',
    );
    expect(body.children[4].innerHTML).toContain('Still asks: Nothing by policy.');

    await toggle.dispatch('click');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(body.classList.contains('hidden')).toBe(false);

    await toggle.dispatch('click');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(body.classList.contains('hidden')).toBe(true);
  });
});
