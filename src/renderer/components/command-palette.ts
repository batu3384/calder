import { createKeybindingActionBridge } from '../bootstrap/keybindings-action-bridge.js';
import { shortcutManager } from '../shortcuts.js';
import { registerLifecycle, unregisterLifecycle } from './component-lifecycle.js';
import { trapFocus } from './focus-management.js';

export interface CommandPaletteEntry {
  id: string;
  label: string;
  keywords?: string;
  run: () => void;
}

let overlay: HTMLElement | null = null;
let inputEl: HTMLInputElement | null = null;
let resultsList: HTMLElement | null = null;
let releaseFocusTrap: (() => void) | null = null;
let previousFocus: HTMLElement | null = null;
const commandPaletteLifecycle = {
  destroy(): void {
    hideCommandPalette();
  },
};
let visibleEntries: CommandPaletteEntry[] = [];
let highlightedIndex = 0;

function getCommandEntries(): CommandPaletteEntry[] {
  const actions = createKeybindingActionBridge();
  return [
    {
      id: 'new-session',
      label: 'New Session',
      keywords: 'session tab',
      run: () => actions.newSession(),
    },
    {
      id: 'new-project',
      label: 'New Project',
      keywords: 'workspace folder',
      run: () => actions.newProject(),
    },
    {
      id: 'preferences',
      label: 'Open Preferences',
      keywords: 'settings config',
      run: () => actions.showPreferences(),
    },
    {
      id: 'quick-open',
      label: 'Quick Open File',
      keywords: 'file search',
      run: () => actions.quickOpen(),
    },
    {
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      keywords: 'panel',
      run: () => actions.toggleSidebar(),
    },
    {
      id: 'toggle-git',
      label: 'Toggle Git Panel',
      keywords: 'source control',
      run: () => actions.toggleGitPanel(),
    },
    {
      id: 'toggle-inspector',
      label: 'Toggle Session Inspector',
      keywords: 'timeline tools',
      run: () => actions.toggleInspector(),
    },
    { id: 'help', label: 'Open Help', keywords: 'docs shortcuts', run: () => actions.help() },
  ];
}

function hideCommandPalette(): void {
  releaseFocusTrap?.();
  releaseFocusTrap = null;
  if (overlay) {
    unregisterLifecycle(commandPaletteLifecycle);
  }
  overlay?.remove();
  overlay = null;
  inputEl = null;
  resultsList = null;
  visibleEntries = [];
  highlightedIndex = 0;
  previousFocus?.focus?.();
  previousFocus = null;
}

function runHighlighted(): void {
  const entry = visibleEntries[highlightedIndex];
  if (!entry) return;
  hideCommandPalette();
  entry.run();
}

function renderResults(query: string): void {
  if (!resultsList) return;
  const normalized = query.trim().toLowerCase();
  const entries = getCommandEntries().filter((entry) => {
    if (!normalized) return true;
    const haystack = `${entry.label} ${entry.keywords ?? ''}`.toLowerCase();
    return haystack.includes(normalized);
  });
  visibleEntries = entries;
  highlightedIndex = 0;
  resultsList.innerHTML = '';

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'command-palette-empty';
    empty.textContent = 'No matching commands';
    resultsList.appendChild(empty);
    return;
  }

  entries.forEach((entry, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `command-palette-item${index === highlightedIndex ? ' active' : ''}`;
    item.textContent = entry.label;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', index === highlightedIndex ? 'true' : 'false');
    item.id = `command-palette-option-${index}`;
    item.addEventListener('click', () => {
      hideCommandPalette();
      entry.run();
    });
    resultsList.appendChild(item);
  });
  inputEl?.setAttribute('aria-activedescendant', 'command-palette-option-0');
}

function highlightNext(delta: number): void {
  if (!visibleEntries.length) return;
  highlightedIndex = (highlightedIndex + delta + visibleEntries.length) % visibleEntries.length;
  const items = resultsList?.querySelectorAll('.command-palette-item');
  items?.forEach((item, index) => {
    const isActive = index === highlightedIndex;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive && item instanceof HTMLElement) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
  inputEl?.setAttribute('aria-activedescendant', `command-palette-option-${highlightedIndex}`);
}

export function showCommandPalette(): void {
  if (overlay) {
    inputEl?.focus();
    return;
  }

  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  overlay = document.createElement('div');
  overlay.className = 'command-palette-overlay';
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) hideCommandPalette();
  });

  const container = document.createElement('div');
  container.className = 'command-palette-container';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-label', 'Command palette');

  const title = document.createElement('div');
  title.className = 'command-palette-title';
  title.textContent = 'Command Palette';

  inputEl = document.createElement('input');
  inputEl.className = 'command-palette-input';
  inputEl.type = 'search';
  inputEl.placeholder = 'Type a command...';
  inputEl.setAttribute('aria-label', 'Filter commands');
  inputEl.setAttribute('aria-autocomplete', 'list');
  inputEl.setAttribute('aria-controls', 'command-palette-results');
  inputEl.addEventListener('input', () => renderResults(inputEl?.value ?? ''));
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      hideCommandPalette();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlightNext(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlightNext(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runHighlighted();
    }
  });

  resultsList = document.createElement('div');
  resultsList.className = 'command-palette-results';
  resultsList.id = 'command-palette-results';
  resultsList.setAttribute('role', 'listbox');

  container.appendChild(title);
  container.appendChild(inputEl);
  container.appendChild(resultsList);
  overlay.appendChild(container);
  document.body.appendChild(overlay);
  releaseFocusTrap = trapFocus(container);
  registerLifecycle(commandPaletteLifecycle);
  renderResults('');
  inputEl.focus();
}

export function hideCommandPaletteForTesting(): void {
  hideCommandPalette();
}

export function getCommandPaletteShortcutLabel(): string {
  return shortcutManager.getDisplayKeys('command-palette');
}
