import { beforeEach, describe, expect, it, vi } from 'vitest';

type ElementStub = {
  className: string;
  id: string;
  setAttribute: ReturnType<typeof vi.fn>;
  appendChild: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  classList: { add: ReturnType<typeof vi.fn> };
  remove: ReturnType<typeof vi.fn>;
  textContent: string;
};

function createElementStub(): ElementStub {
  return {
    className: '',
    id: '',
    setAttribute: vi.fn(),
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    classList: { add: vi.fn() },
    remove: vi.fn(),
    textContent: '',
  };
}

const createdElements: ElementStub[] = [];

const documentStub = {
  body: { appendChild: vi.fn() },
  createElement: vi.fn(() => {
    const element = createElementStub();
    createdElements.push(element);
    return element;
  }),
  getElementById: vi.fn(() => null),
};

describe('toast', () => {
  beforeEach(() => {
    vi.resetModules();
    createdElements.length = 0;
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('window', { setTimeout: (fn: () => void) => fn() });
  });

  it('creates toast container with live region semantics', async () => {
    const { showToast, resetToastForTesting } = await import('./toast.js');
    resetToastForTesting();
    showToast({ message: 'Saved', type: 'success', duration: 0 });
    const container = createdElements.find((element) => element.id === 'calder-toast-container');
    expect(container?.setAttribute).toHaveBeenCalledWith('role', 'status');
    expect(container?.setAttribute).toHaveBeenCalledWith('aria-live', 'polite');
  });

  it('tracks toast element on the instance for targeted dismiss', async () => {
    const { showToast, resetToastForTesting } = await import('./toast.js');
    resetToastForTesting();
    const toast = showToast({ message: 'First', duration: 0 });
    expect(toast.element).not.toBeNull();
    toast.dismiss();
    expect(toast.element?.classList.add).toHaveBeenCalledWith('removing');
  });
});
