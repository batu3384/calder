import { app, BrowserWindow, dialog, powerMonitor, shell } from 'electron';
import * as path from 'path';
import { registerIpcHandlers, resetHookWatcher } from './ipc-handlers';
import { killAllPtys } from './pty-manager';
import { flushState, loadState } from './store';
import { createAppMenu } from './menu';
import { restartAndResync } from './hook-status';
import { initProviders, getAllProviders } from './providers/registry';
import { initAutoUpdater } from './auto-updater';
import { stopGitWatcher } from './git-watcher';
import { checkPythonAvailable } from './prerequisites';
import { isMac } from './platform';
import { attachBrowserWebviewRouting } from './browser-webview-routing';
import { analyzeProviderStartup, formatMissingProviderDialog, formatProviderStartupWarning } from './provider-startup';
import { openUrlWithBrowserPolicy } from './browser-open-policy';
import { startBrowserBridge, stopBrowserBridge } from './browser-bridge';

let mainWindow: BrowserWindow | null = null;

app.setName('Calder');

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'Calder',
    icon: path.join(__dirname, '..', '..', '..', 'build', 'icon.png'),
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // needed for node-pty IPC
      webviewTag: true, // needed for browser-tab sessions
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  attachBrowserWebviewRouting(mainWindow, (url) => {
    void openUrlWithBrowserPolicy(url, mainWindow, (target) => shell.openExternal(target));
  });

  mainWindow.on('close', () => {
    flushState();
  });

  mainWindow.on('closed', () => {
    killAllPtys();
    resetHookWatcher();
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const state = loadState();
  initProviders();

  const providerStartup = analyzeProviderStartup(getAllProviders(), state);
  for (const result of providerStartup.relevantUnavailable) {
    console.warn(formatProviderStartupWarning(result));
  }
  if (providerStartup.blocking) {
    const details = formatMissingProviderDialog(providerStartup.unavailable);
    dialog.showErrorBox(
      'Calder — Missing Prerequisite',
      `Calder requires at least one supported CLI provider to be installed.\n\n${details}\n\nAfter installing, restart Calder.`,
    );
    app.quit();
    return;
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
  if (pythonWarning) {
    console.warn(pythonWarning);
    dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      title: 'Calder — Python Not Found',
      message: pythonWarning,
    });
  }

  // Install hooks and status scripts for available providers (after window creation so dialogs can attach)
  for (const provider of getAllProviders()) {
    if (provider.validatePrerequisites().ok) {
      await provider.installHooks(mainWindow);
      provider.installStatusScripts();
    }
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
