import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BrowserWindow } from 'electron';
import type { ProviderId } from '../shared/types';

const DEBOUNCE_MS = 500;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let watchedFiles: string[] = [];
let dirWatchers: fs.FSWatcher[] = [];
let currentProjectPath: string | null = null;
let currentWin: BrowserWindow | null = null;
let currentProviderId: ProviderId | null = null;

function notify(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (currentWin && !currentWin.isDestroyed()) {
      currentWin.webContents.send('config:changed');
    }
  }, DEBOUNCE_MS);
}

function watchFile(filePath: string): void {
  fs.watchFile(filePath, { interval: 2000 }, () => notify());
  watchedFiles.push(filePath);
}

function watchDir(dirPath: string): void {
  try {
    try {
      const watcher = fs.watch(dirPath, { recursive: true }, () => notify());
      watcher.on('error', () => {}); // ignore errors (dir deleted, etc.)
      dirWatchers.push(watcher);
    } catch {
      const watcher = fs.watch(dirPath, () => notify());
      watcher.on('error', () => {}); // ignore errors (dir deleted, etc.)
      dirWatchers.push(watcher);
    }
  } catch {
    // Directory doesn't exist — that's fine
  }
}

function stopAll(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  for (const f of watchedFiles) fs.unwatchFile(f);
  watchedFiles = [];
  for (const w of dirWatchers) w.close();
  dirWatchers = [];
}

function setupClaudeWatchers(projectPath: string): void {
  const home = os.homedir();
  const claudeDir = path.join(home, '.claude');

  // Config files
  const files = [
    path.join(home, '.claude.json'),
    path.join(claudeDir, 'settings.json'),
    path.join(home, '.mcp.json'),
    path.join(projectPath, '.claude', 'settings.json'),
    path.join(projectPath, '.mcp.json'),
  ];
  for (const f of files) watchFile(f);

  // Directories for agents/skills/commands
  const dirs = [
    path.join(claudeDir, 'agents'),
    path.join(claudeDir, 'skills'),
    path.join(claudeDir, 'commands'),
    path.join(projectPath, '.claude', 'agents'),
    path.join(projectPath, '.claude', 'skills'),
    path.join(projectPath, '.claude', 'commands'),
  ];
  for (const d of dirs) watchDir(d);
}

function setupCodexWatchers(projectPath: string): void {
  const home = os.homedir();
  const codexDir = path.join(home, '.codex');

  const files = [
    path.join(codexDir, 'config.toml'),
    path.join(projectPath, '.codex', 'config.toml'),
  ];
  for (const f of files) watchFile(f);

  const dirs = [
    path.join(codexDir, 'agents'),
    path.join(codexDir, 'skills'),
    path.join(projectPath, '.codex', 'agents'),
    path.join(projectPath, '.codex', 'skills'),
  ];
  for (const d of dirs) watchDir(d);
}

function setupGeminiWatchers(projectPath: string): void {
  const home = os.homedir();

  const files = [
    path.join(home, '.gemini', 'settings.json'),
    path.join(projectPath, '.gemini', 'settings.json'),
  ];
  for (const f of files) watchFile(f);

  const dirs = [
    path.join(home, '.gemini', 'skills'),
    path.join(projectPath, '.gemini', 'skills'),
  ];
  for (const d of dirs) watchDir(d);
}

function setupQwenWatchers(projectPath: string): void {
  const home = os.homedir();
  const qwenDir = path.join(home, '.qwen');

  const files = [
    path.join(qwenDir, 'settings.json'),
    path.join(projectPath, '.qwen', 'settings.json'),
  ];
  for (const f of files) watchFile(f);

  const dirs = [
    path.join(qwenDir, 'agents'),
    path.join(qwenDir, 'skills'),
    path.join(qwenDir, 'commands'),
    path.join(projectPath, '.qwen', 'agents'),
    path.join(projectPath, '.qwen', 'skills'),
    path.join(projectPath, '.qwen', 'commands'),
  ];
  for (const d of dirs) watchDir(d);
}

function setupCopilotWatchers(projectPath: string): void {
  const home = os.homedir();
  const copilotDir = path.join(home, '.copilot');

  const files = [
    path.join(copilotDir, 'config.json'),
    path.join(copilotDir, 'mcp-config.json'),
    path.join(copilotDir, 'lsp-config.json'),
    path.join(projectPath, '.mcp.json'),
    path.join(projectPath, '.github', 'lsp.json'),
  ];
  for (const f of files) watchFile(f);

  const dirs = [
    path.join(copilotDir, 'skills'),
    path.join(projectPath, '.github', 'skills'),
  ];
  for (const d of dirs) watchDir(d);
}

function setupMiniMaxWatchers(projectPath: string): void {
  const home = os.homedir();
  const mmxDir = path.join(home, '.mmx');

  const files = [
    path.join(mmxDir, 'config.json'),
    path.join(mmxDir, 'credentials.json'),
  ];
  for (const f of files) watchFile(f);

  const dirs = [
    path.join(mmxDir, 'skills'),
    path.join(projectPath, '.mmx', 'skills'),
  ];
  for (const d of dirs) watchDir(d);
}

function setupBlackboxWatchers(projectPath: string): void {
  const home = os.homedir();
  const blackboxDir = path.join(home, '.blackboxcli');

  const files = [
    path.join(blackboxDir, 'settings.json'),
    path.join(projectPath, '.blackboxcli', 'settings.json'),
  ];
  for (const f of files) watchFile(f);

  const dirs = [
    path.join(blackboxDir, 'skills'),
    path.join(projectPath, '.blackboxcli', 'skills'),
  ];
  for (const d of dirs) watchDir(d);
}

export function startConfigWatcher(win: BrowserWindow, projectPath: string, providerId: ProviderId = 'claude'): void {
  // Keep notification target current even when watcher topology is unchanged.
  if (projectPath === currentProjectPath && providerId === currentProviderId) {
    currentWin = win;
    return;
  }
  stopAll();
  currentWin = win;
  currentProjectPath = projectPath;
  currentProviderId = providerId;
  if (providerId === 'codex') {
    setupCodexWatchers(projectPath);
  } else if (providerId === 'copilot') {
    setupCopilotWatchers(projectPath);
  } else if (providerId === 'gemini') {
    setupGeminiWatchers(projectPath);
  } else if (providerId === 'qwen') {
    setupQwenWatchers(projectPath);
  } else if (providerId === 'minimax') {
    setupMiniMaxWatchers(projectPath);
  } else if (providerId === 'blackbox') {
    setupBlackboxWatchers(projectPath);
  } else {
    setupClaudeWatchers(projectPath);
  }
}

export function stopConfigWatcher(): void {
  stopAll();
  currentWin = null;
  currentProjectPath = null;
  currentProviderId = null;
}
