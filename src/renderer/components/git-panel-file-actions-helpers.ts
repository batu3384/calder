import { showFileViewer } from './file-viewer.js';
import { areaLabel } from './surface-services/dom-utils.js';
import { applyTabContextMenuSemantics } from './tab-bar/tab-bar-menu-semantics.js';
import { esc } from './git-panel-presentation-helpers.js';
import type { GitFileEntry } from '../types.js';

let activeContextMenu: HTMLElement | null = null;

interface RenderGitFilesListArgs {
  body: HTMLElement;
  files: GitFileEntry[];
  gitPath: string;
  maxFiles: number;
  onAfterAction: () => void;
}

export function hideGitContextMenu(): void {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

function createMenuItem(label: string, onClick: () => void, disabled = false): HTMLElement {
  const item = document.createElement('div');
  item.className = 'tab-context-menu-item' + (disabled ? ' disabled' : '');
  item.textContent = label;
  if (!disabled) {
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      hideGitContextMenu();
      onClick();
    });
  }
  return item;
}

function createSeparator(): HTMLElement {
  const separator = document.createElement('div');
  separator.className = 'tab-context-menu-separator';
  return separator;
}

function compactGitPath(fullPath: string): string {
  const normalized = fullPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 3) return normalized;
  return `.../${parts.slice(-3).join('/')}`;
}

function statusBadge(entry: GitFileEntry): string {
  const letterMap: Record<string, string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    untracked: '?',
    conflicted: 'U',
  };
  const letter = letterMap[entry.status] || '?';
  return `<span class="git-file-badge calder-status-pill ${entry.status}">${letter}</span>`;
}

function createActionButton(title: string, icon: string, onClick: (event: Event) => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'git-action-btn';
  button.title = title;
  button.ariaLabel = title;
  button.textContent = icon;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

function showGitFileContextMenu(
  x: number,
  y: number,
  entry: GitFileEntry,
  gitPath: string,
  onAfterAction: () => void,
): void {
  hideGitContextMenu();

  const menu = document.createElement('div');
  menu.className = 'tab-context-menu calder-floating-list';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.addEventListener('click', (event) => event.stopPropagation());

  if (entry.area === 'staged') {
    menu.appendChild(createMenuItem('Unstage', async () => {
      await window.calder.git.unstageFile(gitPath, entry.path);
      onAfterAction();
    }));
  } else {
    menu.appendChild(createMenuItem('Stage', async () => {
      await window.calder.git.stageFile(gitPath, entry.path);
      onAfterAction();
    }));
  }

  if (entry.area !== 'staged' && entry.area !== 'conflicted') {
    menu.appendChild(createMenuItem('Discard Changes', async () => {
      const message = entry.area === 'untracked'
        ? `Delete untracked file "${entry.path}"?`
        : `Discard changes to "${entry.path}"? This cannot be undone.`;
      if (confirm(message)) {
        await window.calder.git.discardFile(gitPath, entry.path, entry.area);
        onAfterAction();
      }
    }));
  }

  menu.appendChild(createSeparator());

  menu.appendChild(createMenuItem('Open in Editor', async () => {
    await window.calder.git.openInEditor(gitPath, entry.path);
  }));

  menu.appendChild(createMenuItem('Copy Path', () => {
    navigator.clipboard.writeText(entry.path);
  }));

  document.body.appendChild(menu);
  activeContextMenu = menu;

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;
  applyTabContextMenuSemantics(menu, 'Git file actions', hideGitContextMenu);
}

export function renderGitFilesList(args: RenderGitFilesListArgs): void {
  const {
    body,
    files,
    gitPath,
    maxFiles,
    onAfterAction,
  } = args;
  const fragment = document.createDocumentFragment();
  const order: string[] = ['conflicted', 'staged', 'working', 'untracked'];
  const groups = new Map<string, GitFileEntry[]>();

  for (const file of files) {
    const list = groups.get(file.area) || [];
    list.push(file);
    groups.set(file.area, list);
  }

  let rendered = 0;
  for (const area of order) {
    const group = groups.get(area);
    if (!group || group.length === 0) continue;

    const groupHeader = document.createElement('div');
    groupHeader.className = 'git-group-header';
    groupHeader.textContent = `${areaLabel(area)} (${group.length})`;
    fragment.appendChild(groupHeader);

    for (const entry of group) {
      if (rendered >= maxFiles) break;

      const item = document.createElement('div');
      item.className = 'config-item config-item-clickable calder-list-row';
      item.innerHTML = `${statusBadge(entry)}<span class="config-item-detail git-file-path" title="${esc(entry.path)}">${esc(compactGitPath(entry.path))}</span>`;

      const actions = document.createElement('span');
      actions.className = 'git-item-actions';

      if (entry.area === 'staged') {
        actions.appendChild(createActionButton('Unstage', '−', async () => {
          await window.calder.git.unstageFile(gitPath, entry.path);
          onAfterAction();
        }));
      } else {
        if (entry.area !== 'conflicted') {
          actions.appendChild(createActionButton('Discard Changes', '↩', async () => {
            const message = entry.area === 'untracked'
              ? `Delete untracked file "${entry.path}"?`
              : `Discard changes to "${entry.path}"? This cannot be undone.`;
            if (confirm(message)) {
              await window.calder.git.discardFile(gitPath, entry.path, entry.area);
              onAfterAction();
            }
          }));
        }
        actions.appendChild(createActionButton('Stage', '+', async () => {
          await window.calder.git.stageFile(gitPath, entry.path);
          onAfterAction();
        }));
      }

      item.appendChild(actions);
      item.addEventListener('click', () => showFileViewer(entry.path, entry.area, gitPath));
      item.addEventListener('contextmenu', (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        showGitFileContextMenu(event.clientX, event.clientY, entry, gitPath, onAfterAction);
      });
      fragment.appendChild(item);
      rendered += 1;
    }

    if (rendered >= maxFiles) break;
  }

  const remaining = files.length - rendered;
  if (remaining > 0) {
    const overflow = document.createElement('div');
    overflow.className = 'config-empty ops-rail-note git-overflow-note';
    overflow.dataset.tone = 'muted';
    overflow.textContent = `and ${remaining} more…`;
    fragment.appendChild(overflow);
  }

  body.innerHTML = '';
  body.appendChild(fragment);
}
