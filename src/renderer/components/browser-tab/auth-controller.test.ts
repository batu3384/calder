import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBrowserAuthController } from './auth-controller.js';

const anchorFloatingSurfaceMock = vi.hoisted(() => vi.fn(() => vi.fn()));
const sendGuestMessageMock = vi.hoisted(() => vi.fn(async () => {}));

const browserCredentialMock = vi.hoisted(() => ({
  listForUrl: vi.fn(async () => []),
  getAutoFillForUrl: vi.fn(async () => null),
  saveForUrl: vi.fn(async () => ({ id: 'saved', label: 'Saved' })),
  deleteById: vi.fn(async () => ({ deleted: true })),
  getForFill: vi.fn(async () => null),
}));

vi.mock('../floating-surface.js', () => ({
  anchorFloatingSurface: anchorFloatingSurfaceMock,
}));

vi.mock('./guest-messaging.js', () => ({
  sendGuestMessage: sendGuestMessageMock,
}));

type Listener = (event?: unknown) => void | Promise<void>;

type MockElement = {
  tagName: string;
  children: MockElement[];
  style: { display: string };
  dataset: Record<string, string>;
  textContent: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  innerHTML: string;
  appendChild: (child: MockElement) => MockElement;
  addEventListener: (event: string, listener: Listener) => void;
  dispatch: (event: string, payload?: unknown) => Promise<void>;
  contains: (node: unknown) => boolean;
};

type MockDocument = {
  createElement: (tagName: string) => MockElement;
  addEventListener: (event: string, listener: Listener) => void;
  removeEventListener: (event: string, listener: Listener) => void;
  dispatch: (event: string, payload?: unknown) => Promise<void>;
};

function createMockElement(tagName = 'div'): MockElement {
  const listeners: Record<string, Listener[]> = {};
  let innerHTML = '';
  const element = {
    tagName: tagName.toUpperCase(),
    children: [] as MockElement[],
    style: { display: tagName === 'div' ? '' : '' },
    dataset: {} as Record<string, string>,
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    get innerHTML(): string {
      return innerHTML;
    },
    set innerHTML(value: string) {
      innerHTML = value;
      if (!value) {
        element.children.length = 0;
      }
    },
    appendChild(child: MockElement): MockElement {
      element.children.push(child);
      return child;
    },
    addEventListener(event: string, listener: Listener): void {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(listener);
    },
    async dispatch(event: string, payload?: unknown): Promise<void> {
      const callbacks = listeners[event] ?? [];
      for (const callback of callbacks) {
        await callback(payload);
      }
    },
    contains(node: unknown): boolean {
      if (node === element) return true;
      return element.children.some((child) => child.contains(node));
    },
  } satisfies MockElement;
  return element;
}

function installDocumentStub(): MockDocument {
  const listeners: Record<string, Listener[]> = {};
  const documentStub = {
    createElement(tagName: string): MockElement {
      return createMockElement(tagName);
    },
    addEventListener(event: string, listener: Listener): void {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(listener);
    },
    removeEventListener(event: string, listener: Listener): void {
      const callbacks = listeners[event] ?? [];
      const index = callbacks.indexOf(listener);
      if (index >= 0) callbacks.splice(index, 1);
    },
    async dispatch(event: string, payload?: unknown): Promise<void> {
      const callbacks = listeners[event] ?? [];
      for (const callback of callbacks) {
        await callback(payload);
      }
    },
  } satisfies MockDocument;
  vi.stubGlobal('document', documentStub);
  return documentStub;
}

function resolveCredentialOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function buildFixture() {
  const authPanel = createMockElement('div');
  authPanel.style.display = 'none';
  const authElements = {
    authPanel,
    authOriginEl: createMockElement('div'),
    authProfileSelect: createMockElement('select'),
    authLabelInput: createMockElement('input'),
    authUsernameInput: createMockElement('input'),
    authPasswordInput: createMockElement('input'),
    authAutoFillCheckbox: createMockElement('input'),
    authStatusEl: createMockElement('div'),
    authDeleteBtn: createMockElement('button'),
    authSaveBtn: createMockElement('button'),
    authFillBtn: createMockElement('button'),
    authCloseBtn: createMockElement('button'),
  };
  const authBtn = createMockElement('button');
  authBtn.dataset.state = 'idle';

  const instance = {
    committedUrl: 'https://example.com/login',
    webview: {} as unknown,
  } as unknown;

  const controller = createBrowserAuthController({
    instance: instance as never,
    authBtn: authBtn as never,
    authElements: authElements as never,
    getUrlInputValue: () => '',
    getWebviewSrc: () => 'https://example.com/login',
    resolveCredentialOrigin,
  });

  return { authElements, authBtn, controller };
}

async function flushPromises(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

describe('createBrowserAuthController', () => {
  beforeEach(() => {
    installDocumentStub();
    vi.stubGlobal('window', {
      calder: {
        browserCredential: browserCredentialMock,
      },
    });
    browserCredentialMock.listForUrl.mockReset();
    browserCredentialMock.getAutoFillForUrl.mockReset();
    browserCredentialMock.saveForUrl.mockReset();
    browserCredentialMock.deleteById.mockReset();
    browserCredentialMock.getForFill.mockReset();
    browserCredentialMock.listForUrl.mockResolvedValue([]);
    browserCredentialMock.getAutoFillForUrl.mockResolvedValue(null);
    browserCredentialMock.saveForUrl.mockResolvedValue({ id: 'saved', label: 'Saved' });
    browserCredentialMock.deleteById.mockResolvedValue({ deleted: true });
    browserCredentialMock.getForFill.mockResolvedValue(null);
    sendGuestMessageMock.mockClear();
    anchorFloatingSurfaceMock.mockClear();
  });

  it('loads saved profiles when opening the auth panel and preselects auto-fill entry', async () => {
    browserCredentialMock.listForUrl.mockResolvedValue([
      { id: 'work', label: 'Work', username: 'work@example.com', autoFill: false },
      { id: 'personal', label: 'Personal', username: 'me@example.com', autoFill: true },
    ]);
    const { authElements, authBtn } = buildFixture();

    await authBtn.dispatch('click');
    await flushPromises();

    expect(anchorFloatingSurfaceMock).toHaveBeenCalled();
    expect(browserCredentialMock.listForUrl).toHaveBeenCalledWith('https://example.com/login');
    expect(authElements.authPanel.style.display).toBe('flex');
    expect(authBtn.dataset.state).toBe('active');
    expect(authElements.authProfileSelect.children).toHaveLength(3);
    expect(authElements.authProfileSelect.value).toBe('personal');
    expect(authElements.authLabelInput.value).toBe('Personal');
    expect(authElements.authUsernameInput.value).toBe('me@example.com');
    expect(authElements.authStatusEl.textContent).toBe('Saved profiles ready.');
    expect(authElements.authDeleteBtn.disabled).toBe(false);
    expect(authElements.authFillBtn.disabled).toBe(false);
  });

  it('fills manual credentials and closes panel after successful fill result', async () => {
    const { authElements, authBtn, controller } = buildFixture();

    await authBtn.dispatch('click');
    await flushPromises();
    authElements.authUsernameInput.value = 'demo@example.com';
    authElements.authPasswordInput.value = 'secret';

    await authElements.authFillBtn.dispatch('click');
    await flushPromises();

    expect(sendGuestMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      'auth-fill-credentials',
      { username: 'demo@example.com', password: 'secret' },
    );
    expect(authElements.authPanel.style.display).toBe('flex');
    expect(authElements.authStatusEl.textContent).toBe('Filled credentials from the form.');

    controller.handleFillResult({ filledUsername: true, filledPassword: true });
    expect(authElements.authPanel.style.display).toBe('none');
    expect(authBtn.dataset.state).toBe('idle');
    expect(authElements.authStatusEl.textContent).toBe('Credentials were filled on the page.');
  });

  it('auto-fills credentials via stored profile payload when available', async () => {
    browserCredentialMock.getAutoFillForUrl.mockResolvedValue({
      id: 'auto-1',
      label: 'Auto Profile',
      username: 'auto@example.com',
      password: 'auto-secret',
    });
    const { authElements, controller } = buildFixture();

    await controller.maybeAutoFillCredentials();

    expect(browserCredentialMock.getAutoFillForUrl).toHaveBeenCalledWith('https://example.com/login');
    expect(sendGuestMessageMock).toHaveBeenCalledWith(
      expect.anything(),
      'auth-fill-credentials',
      { username: 'auto@example.com', password: 'auto-secret' },
    );
    expect(authElements.authStatusEl.textContent).toBe('Auto-filled Auto Profile.');
    expect(authElements.authStatusEl.dataset.tone).toBe('success');
  });
});
