import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VIEWPORT_PRESETS } from './types.js';

const mockApplyViewport = vi.fn();
const mockOpenViewportDropdown = vi.fn();
const mockCloseViewportDropdown = vi.fn();

vi.mock('./viewport.js', () => ({
  applyViewport: (...args: unknown[]) => mockApplyViewport(...args),
  openViewportDropdown: (...args: unknown[]) => mockOpenViewportDropdown(...args),
  closeViewportDropdown: (...args: unknown[]) => mockCloseViewportDropdown(...args),
}));

import { createBrowserViewportMenuController } from './pane-viewport-menu.js';

type Listener = (event?: unknown) => void;

class FakeElement {
  className = '';
  textContent = '';
  tabIndex = -1;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  children: FakeElement[] = [];
  private attrs = new Map<string, string>();
  private listeners = new Map<string, Listener[]>();
  focus = vi.fn();

  constructor(public tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  addEventListener(name: string, cb: Listener): void {
    const list = this.listeners.get(name) ?? [];
    list.push(cb);
    this.listeners.set(name, list);
  }

  dispatch(name: string): void {
    const list = this.listeners.get(name) ?? [];
    for (const listener of list) {
      listener();
    }
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }
}

function setup(): {
  instance: { currentViewport: { label: string } };
  viewportBtn: FakeElement;
  viewportDropdown: FakeElement;
  customItem: FakeElement;
  customForm: FakeElement;
} {
  const instance = {
    currentViewport: { label: 'Responsive' },
  };
  const viewportBtn = new FakeElement('button');
  const viewportDropdown = new FakeElement('div');
  const customItem = new FakeElement('button');
  const customForm = new FakeElement('div');
  return {
    instance,
    viewportBtn,
    viewportDropdown,
    customItem,
    customForm,
  };
}

describe('browser viewport menu controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('document', {
      createElement: (tag: string) => new FakeElement(tag),
    } as unknown as Document);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates preset menu entries and appends custom controls', () => {
    const { instance, viewportBtn, viewportDropdown, customItem, customForm } = setup();
    const controller = createBrowserViewportMenuController({
      instance: instance as any,
      viewportBtn: viewportBtn as any,
      viewportDropdown: viewportDropdown as any,
      customItem: customItem as any,
      customForm: customForm as any,
    });

    expect(controller.viewportMenuItems).toHaveLength(VIEWPORT_PRESETS.length + 1);
    expect(controller.viewportMenuItems.at(-1)).toBe(customItem);
    expect(viewportDropdown.children.includes(customForm)).toBe(true);
  });

  it('opens and closes with expected custom form behavior', () => {
    const { instance, viewportBtn, viewportDropdown, customItem, customForm } = setup();
    instance.currentViewport.label = 'Custom';
    const controller = createBrowserViewportMenuController({
      instance: instance as any,
      viewportBtn: viewportBtn as any,
      viewportDropdown: viewportDropdown as any,
      customItem: customItem as any,
      customForm: customForm as any,
    });

    controller.openViewportMenu('kbd-open', 'selected');
    expect(mockOpenViewportDropdown).toHaveBeenCalled();
    expect(customForm.style.display).toBe('flex');
    expect(customItem.getAttribute('aria-expanded')).toBe('true');

    controller.closeViewportMenu('escape', true);
    expect(mockCloseViewportDropdown).toHaveBeenCalled();
    expect(customForm.style.display).toBe('none');
    expect(customItem.getAttribute('aria-expanded')).toBe('false');
    expect(viewportBtn.focus).toHaveBeenCalled();
  });

  it('applies a preset and closes the menu from item click', () => {
    const { instance, viewportBtn, viewportDropdown, customItem, customForm } = setup();
    const controller = createBrowserViewportMenuController({
      instance: instance as any,
      viewportBtn: viewportBtn as any,
      viewportDropdown: viewportDropdown as any,
      customItem: customItem as any,
      customForm: customForm as any,
    });

    const firstPreset = controller.viewportMenuItems[0];
    firstPreset.dispatch('click');

    expect(mockApplyViewport).toHaveBeenCalledTimes(1);
    expect(mockCloseViewportDropdown).toHaveBeenCalledTimes(1);
  });
});
