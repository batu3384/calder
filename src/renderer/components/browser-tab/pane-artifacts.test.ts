import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBrowserAuthPanelArtifacts,
  createBrowserPaneCaptureArtifacts,
} from './pane-artifacts.js';

interface FakeElement {
  tagName: string;
  className: string;
  textContent: string;
  children: FakeElement[];
  parentElement: FakeElement | null;
  style: Record<string, string>;
  dataset: Record<string, string>;
  attributes: Record<string, string>;
  type?: string;
  value?: string;
  checked?: boolean;
  rows?: number;
  placeholder?: string;
  title?: string;
  id?: string;
  tabIndex?: number;
  ariaLabel?: string;
  classList: {
    add: (...tokens: string[]) => void;
    remove: (...tokens: string[]) => void;
    toggle: (token: string, force?: boolean) => void;
  };
  appendChild: (child: FakeElement) => FakeElement;
  setAttribute: (name: string, value: string) => void;
  contains: (candidate: FakeElement) => boolean;
}

function makeElement(tag: string): FakeElement {
  const classTokens = new Set<string>();
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    children: [],
    parentElement: null,
    style: {},
    dataset: {},
    attributes: {},
    classList: {
      add: (...tokens: string[]) => {
        for (const token of tokens) {
          if (token) classTokens.add(token);
        }
        el.className = [...classTokens].join(' ');
      },
      remove: (...tokens: string[]) => {
        for (const token of tokens) {
          classTokens.delete(token);
        }
        el.className = [...classTokens].join(' ');
      },
      toggle: (token: string, force?: boolean) => {
        if (typeof force === 'boolean') {
          if (force) classTokens.add(token);
          else classTokens.delete(token);
        } else if (classTokens.has(token)) {
          classTokens.delete(token);
        } else {
          classTokens.add(token);
        }
        el.className = [...classTokens].join(' ');
      },
    },
    appendChild: (child: FakeElement) => {
      child.parentElement = el;
      el.children.push(child);
      return child;
    },
    setAttribute: (name: string, value: string) => {
      el.attributes[name] = value;
      if (name === 'id') el.id = value;
      if (name === 'class') el.className = value;
    },
    contains: (candidate: FakeElement) => {
      if (candidate === el) return true;
      return el.children.some((child) => child.contains(candidate));
    },
  };
  return el;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('document', {
    createElement(tag: string) {
      return makeElement(tag);
    },
  });
});

describe('browser pane artifacts', () => {
  it('builds and appends capture-related panels into the host pane', () => {
    const host = makeElement('div');

    const artifacts = createBrowserPaneCaptureArtifacts(host as unknown as HTMLDivElement);

    expect(host.contains(artifacts.inspectPanel as unknown as FakeElement)).toBe(true);
    expect(host.contains(artifacts.drawPanel as unknown as FakeElement)).toBe(true);
    expect(host.contains(artifacts.flowPanel as unknown as FakeElement)).toBe(true);
    expect(host.contains(artifacts.flowPickerOverlay as unknown as FakeElement)).toBe(true);
    expect(host.contains(artifacts.targetMenu as unknown as FakeElement)).toBe(true);
    expect((artifacts.flowPickerMenu as unknown as FakeElement).children.length).toBeGreaterThan(0);
    expect((artifacts.targetMenuList as unknown as FakeElement).className).toContain('browser-target-menu-list');
  });

  it('builds and appends auth panel controls into the host pane', () => {
    const host = makeElement('div');

    const artifacts = createBrowserAuthPanelArtifacts(host as unknown as HTMLDivElement);

    expect(host.contains(artifacts.authPanel as unknown as FakeElement)).toBe(true);
    expect(artifacts.authFillBtn.textContent).toBe('Fill now');
    expect(artifacts.authSaveBtn.textContent).toBe('Save');
    expect(artifacts.authDeleteBtn.textContent).toBe('Delete');
    expect(artifacts.authCloseBtn.textContent).toBe('Close');
    expect((artifacts.authProfileSelect as unknown as FakeElement).tagName).toBe('SELECT');
  });
});
