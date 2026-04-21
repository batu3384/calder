import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BrowserWindow } from 'electron';
import type { ProviderId } from '../shared/types';

const DEBOUNCE_MS = 500;

interface WatcherContext {
  key: string;
  win: BrowserWindow;
  projectPath: string;
  providerId: ProviderId;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  watchedFiles: string[];
  dirWatchers: fs.FSWatcher[];
}

let activeContext: WatcherContext | null = null;
const fallbackWindowIds = new WeakMap<BrowserWindow, number>();
let fallbackWindowIdSeq = 0;

function getWindowIdentity(win: BrowserWindow): string {
  const winWithId = win as BrowserWindow & { id?: number | string };
  if (typeof winWithId.id === 'number' || typeof winWithId.id === 'string') {
    return `win:${String(winWithId.id)}`;
  }
  const webContentsWithId = win.webContents as typeof win.webContents & { id?: number | string };
  if (typeof webContentsWithId.id === 'number' || typeof webContentsWithId.id === 'string') {
    return `web:${String(webContentsWithId.id)}`;
  }
  let fallbackId = fallbackWindowIds.get(win);
  if (fallbackId === undefined) {
    fallbackId = ++fallbackWindowIdSeq;
    fallbackWindowIds.set(win, fallbackId);
  }
  return `obj:${fallbackId}`;
}

function createContext(win: BrowserWindow, projectPath: string, providerId: ProviderId): WatcherContext {
  const key = `${providerId}::${projectPath}::${getWindowIdentity(win)}`;
  return {
    key,
    win,
    projectPath,
    providerId,
    debounceTimer: null,
    watchedFiles: [],
    dirWatchers: [],
  };
}

function notify(context: WatcherContext): void {
  if (context.debounceTimer) clearTimeout(context.debounceTimer);
  context.debounceTimer = setTimeout(() => {
    if (activeContext !== context) return;
    if (!context.win.isDestroyed()) {
      context.win.webContents.send('config:changed');
    }
  }, DEBOUNCE_MS);
}

function watchFile(context: WatcherContext, filePath: string): void {
  fs.watchFile(filePath, { interval: 2000 }, () => notify(context));
  context.watchedFiles.push(filePath);
}

function watchDir(context: WatcherContext, dirPath: string): void {
  try {
    try {
      const watcher = fs.watch(dirPath, { recursive: true }, () => notify(context));
      watcher.on('error', () => {}); // ignore errors (dir deleted, etc.)
      context.dirWatchers.push(watcher);
    } catch {
      const watcher = fs.watch(dirPath, () => notify(context));
      watcher.on('error', () => {}); // ignore errors (dir deleted, etc.)
      context.dirWatchers.push(watcher);
    }
  } catch {
    // Directory doesn't exist — that's fine
  }
}

function stopContext(context: WatcherContext): void {
  if (context.debounceTimer) {
    clearTimeout(context.debounceTimer);
    context.debounceTimer = null;
  }
  for (const f of context.watchedFiles) fs.unwatchFile(f);
  context.watchedFiles = [];
  for (const w of context.dirWatchers) w.close();
  context.dirWatchers = [];
}

function setupClaudeWatchers(context: WatcherContext): void {
  const home = os.homedir();
  const claudeDir = path.join(home, '.claude');

  // Config files
  const files = [
    path.join(home, '.claude.json'),
    path.join(claudeDir, 'settings.json'),
    path.join(home, '.mcp.json'),
    path.join(context.projectPath, '.claude', 'settings.json'),
    path.join(context.projectPath, '.mcp.json'),
  ];
  for (const f of files) watchFile(context, f);

  // Directories for agents/skills/commands
  const dirs = [
    path.join(claudeDir, 'agents'),
    path.join(claudeDir, 'skills'),
    path.join(claudeDir, 'commands'),
    path.join(context.projectPath, '.claude', 'agents'),
    path.join(context.projectPath, '.claude', 'skills'),
    path.join(context.projectPath, '.claude', 'commands'),
  ];
  for (const d of dirs) watchDir(context, d);
}

function setupCodexWatchers(context: WatcherContext): void {
  const home = os.homedir();
  const codexDir = path.join(home, '.codex');

  const files = [
    path.join(codexDir, 'config.toml'),
    path.join(context.projectPath, '.codex', 'config.toml'),
  ];
  for (const f of files) watchFile(context, f);

  const dirs = [
    path.join(codexDir, 'agents'),
    path.join(codexDir, 'skills'),
    path.join(codexDir, 'plugins', 'cache'),
    path.join(context.projectPath, '.codex', 'agents'),
    path.join(context.projectPath, '.codex', 'skills'),
  ];
  for (const d of dirs) watchDir(context, d);
}

function setupGeminiWatchers(context: WatcherContext): void {
  const home = os.homedir();

  const files = [
    path.join(home, '.gemini', 'settings.json'),
    path.join(context.projectPath, '.gemini', 'settings.json'),
  ];
  for (const f of files) watchFile(context, f);

  const dirs = [
    path.join(home, '.gemini', 'skills'),
    path.join(context.projectPath, '.gemini', 'skills'),
  ];
  for (const d of dirs) watchDir(context, d);
}

function setupQwenWatchers(context: WatcherContext): void {
  const home = os.homedir();
  const qwenDir = path.join(home, '.qwen');

  const files = [
    path.join(qwenDir, 'settings.json'),
    path.join(context.projectPath, '.qwen', 'settings.json'),
  ];
  for (const f of files) watchFile(context, f);

  const dirs = [
    path.join(qwenDir, 'agents'),
    path.join(qwenDir, 'skills'),
    path.join(qwenDir, 'commands'),
    path.join(context.projectPath, '.qwen', 'agents'),
    path.join(context.projectPath, '.qwen', 'skills'),
    path.join(context.projectPath, '.qwen', 'commands'),
  ];
  for (const d of dirs) watchDir(context, d);
}

function setupCopilotWatchers(context: WatcherContext): void {
  const home = os.homedir();
  const copilotDir = path.join(home, '.copilot');

  const files = [
    path.join(copilotDir, 'config.json'),
    path.join(copilotDir, 'mcp-config.json'),
    path.join(copilotDir, 'lsp-config.json'),
    path.join(context.projectPath, '.mcp.json'),
    path.join(context.projectPath, '.github', 'lsp.json'),
  ];
  for (const f of files) watchFile(context, f);

  const dirs = [
    path.join(copilotDir, 'skills'),
    path.join(context.projectPath, '.github', 'skills'),
  ];
  for (const d of dirs) watchDir(context, d);
}

export function startConfigWatcher(win: BrowserWindow, projectPath: string, providerId: ProviderId = 'claude'): void {
  const nextContext = createContext(win, projectPath, providerId);
  if (activeContext?.key === nextContext.key) {
    return;
  }
  if (activeContext) {
    stopContext(activeContext);
  }
  activeContext = nextContext;
  if (activeContext.providerId === 'codex') {
    setupCodexWatchers(activeContext);
  } else if (activeContext.providerId === 'copilot') {
    setupCopilotWatchers(activeContext);
  } else if (activeContext.providerId === 'gemini') {
    setupGeminiWatchers(activeContext);
  } else if (activeContext.providerId === 'qwen') {
    setupQwenWatchers(activeContext);
  } else {
    setupClaudeWatchers(activeContext);
  }
}

export function stopConfigWatcher(): void {
  if (!activeContext) return;
  stopContext(activeContext);
  activeContext = null;
}
