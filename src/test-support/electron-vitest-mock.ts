import { vi } from 'vitest';

/**
 * Unit tests import Electron modules at load time. CI Linux runners may not have
 * a downloaded Electron binary, so provide a minimal stub unless a test file
 * defines its own vi.mock('electron').
 */
vi.mock('electron', () => {
  const noop = vi.fn();
  const asyncNoop = vi.fn(async () => undefined);

  return {
    app: {
      getPath: vi.fn((name: string) => `/tmp/calder-${name}`),
      getVersion: vi.fn(() => '0.0.0-test'),
      getName: vi.fn(() => 'calder-test'),
      isPackaged: false,
      whenReady: vi.fn(async () => undefined),
      on: noop,
      quit: noop,
    },
    BrowserWindow: vi.fn(function BrowserWindow() {
      return {
        webContents: { send: noop, on: noop, id: 1 },
        isDestroyed: vi.fn(() => false),
        loadURL: noop,
        destroy: noop,
        on: noop,
        focus: noop,
        show: noop,
        hide: noop,
      };
    }),
    ipcMain: {
      handle: noop,
      on: noop,
      removeHandler: noop,
      removeListener: noop,
    },
    shell: {
      openExternal: asyncNoop,
      openPath: vi.fn(async () => ''),
    },
    webContents: {
      fromId: vi.fn(() => null),
      getAllWebContents: vi.fn(() => []),
    },
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn((value: string) => Buffer.from(value)),
      decryptString: vi.fn((payload: Buffer) => payload.toString()),
    },
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      showMessageBox: vi.fn(async () => ({ response: 0 })),
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: noop,
        webRequest: { onBeforeRequest: noop },
      },
      fromPartition: vi.fn(() => ({
        setPermissionRequestHandler: noop,
        webRequest: { onBeforeRequest: noop },
      })),
    },
    nativeImage: {
      createFromPath: vi.fn(),
    },
    powerMonitor: {
      on: noop,
    },
    Menu: {
      buildFromTemplate: vi.fn(() => ({})),
      setApplicationMenu: noop,
    },
    contextBridge: {
      exposeInMainWorld: noop,
    },
    ipcRenderer: {
      invoke: vi.fn(),
      on: noop,
      send: noop,
      removeListener: noop,
    },
  };
});
