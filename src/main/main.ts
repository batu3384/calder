import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { app, BrowserWindow, dialog, nativeImage, powerMonitor, session, shell } from 'electron';

import { initAutoUpdater } from './auto-updater';
import { startBrowserBridge, stopBrowserBridge } from './browser-bridge';
import { openUrlWithBrowserPolicy } from './browser-open-policy';
import { prepareBrowserSessionStorage } from './browser-session-storage';
import { attachBrowserWebviewRouting } from './browser-webview-routing';
import { stopGitWatcher } from './git-watcher';
import { restartAndResync } from './hooks/hook-status';
import { registerIpcHandlers, resetHookWatcher } from './ipc-handlers';
import { createAppMenu } from './menu';
import { isMac } from './platform';
import { checkPythonAvailable } from './prerequisites';
import {
  analyzeProviderStartup,
  formatMissingProviderDialog,
  formatProviderStartupWarning,
} from './provider-startup';
import { getAllProviders, initProviders } from './providers/registry';
import { killAllPtys } from './pty-manager';
import { installSessionPermissionPolicy } from './session-permission-policy';
import { flushState, loadState } from './store';

let mainWindow: BrowserWindow | null = null;
const SMOKE_MODE = process.env.CALDER_SMOKE === '1';
if (SMOKE_MODE) {
  const smokeDir = path.join(os.tmpdir(), `calder-smoke-${process.pid}`);
  fs.mkdirSync(smokeDir, { recursive: true });
  app.setPath('userData', smokeDir);
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
}

app.setName('Calder');

function setMacDockIcon(): void {
  if (!isMac) return;
  const iconPath = path.join(__dirname, '..', '..', '..', 'build', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.warn('Failed to load macOS dock icon from:', iconPath);
    return;
  }
  app.dock?.setIcon(icon);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'Calder',
    icon: path.join(__dirname, '..', '..', '..', 'build', 'icon.png'),
    backgroundColor: '#000000',
    show: !SMOKE_MODE,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true, // needed for browser-tab sessions
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  if (SMOKE_MODE) {
    void runSmokeAndQuit(mainWindow);
  }
  attachBrowserWebviewRouting(mainWindow, (url) => {
    void openUrlWithBrowserPolicy({ url, preferEmbedded: true }, mainWindow, (target) =>
      shell.openExternal(target),
    );
  });

  mainWindow.on('close', () => {
    flushState();
  });

  mainWindow.on('closed', () => {
    resetHookWatcher();
    mainWindow = null;
  });
}

async function runSmokeAndQuit(win: BrowserWindow): Promise<void> {
  let rendererError = '';
  const noteConsole = (level: unknown, message: unknown): void => {
    const text = String(message ?? '');
    const numeric = typeof level === 'number' ? level : level === 'error' ? 3 : 0;
    if (numeric >= 2 && /ReferenceError|TypeError|is not defined/i.test(text)) {
      rendererError = text;
    }
  };
  win.webContents.on('console-message', (...args: unknown[]) => {
    const first = args[0] as { level?: unknown; message?: unknown } | undefined;
    if (args.length >= 3) {
      noteConsole(args[1], args[2]);
      return;
    }
    noteConsole(first?.level, first?.message);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    rendererError = `render-process-gone:${details.reason}`;
  });

  const fail = (reason: string): void => {
    console.error('[smoke] FAIL', reason);
    app.exit(1);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('load timeout')), 20_000);
      win.webContents.once('did-finish-load', () => {
        clearTimeout(timer);
        resolve();
      });
      win.webContents.once('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
        if (!isMainFrame) return;
        clearTimeout(timer);
        reject(new Error(`did-fail-load ${code} ${desc}`));
      });
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }
  if (rendererError) {
    fail(rendererError);
    return;
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (win.isDestroyed()) {
      fail('window destroyed before ui-ready');
      return;
    }
    try {
      const snapshot = (await win.webContents.executeJavaScript(`({
        uiReady: document.documentElement.dataset.uiReady === '1',
        bootstrapReady: document.documentElement.dataset.bootstrapReady === '1',
        tabBar: Boolean(document.getElementById('tab-bar')),
        addSession: Boolean(document.getElementById('btn-add-session')),
        chromeBg: getComputedStyle(document.documentElement).getPropertyValue('--chrome-bg').trim()
      })`)) as {
        uiReady: boolean;
        bootstrapReady: boolean;
        tabBar: boolean;
        addSession: boolean;
        chromeBg: string;
      };
      if (snapshot.bootstrapReady && snapshot.uiReady && snapshot.tabBar && snapshot.addSession) {
        if (rendererError) {
          fail(rendererError);
          return;
        }
        console.info('[smoke] PASS', snapshot.chromeBg);
        app.exit(0);
        return;
      }
    } catch (error) {
      rendererError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fail(rendererError || 'timed out waiting for data-bootstrap-ready + tab-bar');
}

app.whenReady().then(async () => {
  // Re-assert runtime name on macOS so app menus/about panel use Calder.
  app.setName('Calder');
  app.setAboutPanelOptions({
    applicationName: 'Calder',
    applicationVersion: app.getVersion(),
  });
  setMacDockIcon();
  const state = loadState();
  const browserStorage = await prepareBrowserSessionStorage(app.getPath('userData'));
  if (browserStorage.migratedLegacyServiceWorker) {
    console.info('Moved legacy browser service worker storage into an isolated archive');
  }
  installSessionPermissionPolicy(session.defaultSession);
  app.on('session-created', (createdSession) => {
    installSessionPermissionPolicy(createdSession);
  });
  initProviders();

  const providerStartup = analyzeProviderStartup(getAllProviders(), state);
  for (const result of providerStartup.relevantUnavailable) {
    console.warn(formatProviderStartupWarning(result));
  }
  if (providerStartup.blocking && !SMOKE_MODE) {
    const details = formatMissingProviderDialog(providerStartup.unavailable);
    dialog.showErrorBox(
      'Calder — Missing Prerequisite',
      `Calder requires at least one supported CLI provider to be installed.\n\n${details}\n\nAfter installing, restart Calder.`,
    );
    app.quit();
    return;
  }
  if (providerStartup.blocking) {
    console.warn('[smoke] no CLI providers installed — continuing hidden smoke');
  }

  registerIpcHandlers();
  createAppMenu(state.preferences?.debugMode ?? false);
  createWindow();
  await startBrowserBridge(async (payload) => {
    const win = BrowserWindow.getAllWindows()[0];
    await openUrlWithBrowserPolicy(payload, win, (target) => shell.openExternal(target));
  });

  // Warn if Python is missing on Windows (hooks depend on it)
  const pythonWarning = checkPythonAvailable();
  if (pythonWarning && !SMOKE_MODE) {
    console.warn(pythonWarning);
    dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      title: 'Calder — Python Not Found',
      message: pythonWarning,
    });
  }

  initAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        restartAndResync(win);
      }
    }
  });

  powerMonitor.on('resume', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      restartAndResync(win);
    }
  });
});

app.on('before-quit', () => {
  flushState();
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('app:quitting');
  }
  killAllPtys();
  stopGitWatcher();
  void stopBrowserBridge();
  // Cleanup all providers
  for (const provider of getAllProviders()) {
    provider.cleanup();
  }
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});
