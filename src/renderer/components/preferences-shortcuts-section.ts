import { shortcutManager, displayKeys, eventToAccelerator } from '../shortcuts.js';

export interface RenderShortcutsSectionArgs {
  container: HTMLElement;
  shortcutOverridesDraft: Record<string, string>;
  cleanupRecorder: () => void;
  setActiveRecorder: (cleanup: () => void) => void;
  clearActiveRecorder: () => void;
  rerenderShortcuts: () => void;
}

export function renderShortcutsSection(args: RenderShortcutsSectionArgs): void {
  const grouped = shortcutManager.getAll(args.shortcutOverridesDraft);

  for (const [category, shortcuts] of grouped) {
    const groupShell = document.createElement('div');
    groupShell.className = 'shortcut-group-shell';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'shortcut-group-header';

    const header = document.createElement('div');
    header.className = 'shortcut-category-header';
    header.textContent = category;

    const count = document.createElement('div');
    count.className = 'shortcut-group-count';
    count.textContent = `${shortcuts.length} commands`;

    groupHeader.appendChild(header);
    groupHeader.appendChild(count);
    groupShell.appendChild(groupHeader);

    for (const shortcut of shortcuts) {
      const row = document.createElement('div');
      row.className = 'shortcut-row shortcut-row-shell';

      const copy = document.createElement('div');
      copy.className = 'shortcut-row-copy';

      const label = document.createElement('div');
      label.className = 'shortcut-row-label';
      label.textContent = shortcut.label;

      copy.appendChild(label);

      const keyBtn = document.createElement('button');
      keyBtn.className = 'shortcut-key-btn';
      keyBtn.textContent = displayKeys(shortcut.resolvedKeys);

      const hasOverride = shortcutManager.hasOverride(shortcut.id, args.shortcutOverridesDraft);
      if (hasOverride) {
        keyBtn.classList.add('customized');
      }

      const resetBtn = document.createElement('button');
      resetBtn.className = 'shortcut-reset-btn';
      resetBtn.textContent = 'Reset';
      resetBtn.title = 'Reset to default';
      if (!hasOverride) {
        resetBtn.style.visibility = 'hidden';
      }

      const actions = document.createElement('div');
      actions.className = 'shortcut-row-actions';

      keyBtn.addEventListener('click', () => {
        args.cleanupRecorder();
        keyBtn.textContent = 'Press keys...';
        keyBtn.classList.add('recording');

        const onKeydown = (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopPropagation();

          const accelerator = eventToAccelerator(e);
          if (!accelerator) return;

          args.shortcutOverridesDraft[shortcut.id] = accelerator;
          cleanup();
          args.rerenderShortcuts();
        };

        const onBlur = () => {
          cleanup();
          keyBtn.textContent = displayKeys(shortcutManager.getKeys(shortcut.id, args.shortcutOverridesDraft));
          keyBtn.classList.remove('recording');
        };

        const cleanup = () => {
          document.removeEventListener('keydown', onKeydown, true);
          keyBtn.removeEventListener('blur', onBlur);
          keyBtn.classList.remove('recording');
          args.clearActiveRecorder();
        };

        document.addEventListener('keydown', onKeydown, true);
        keyBtn.addEventListener('blur', onBlur);
        args.setActiveRecorder(cleanup);
      });

      resetBtn.addEventListener('click', () => {
        args.cleanupRecorder();
        delete args.shortcutOverridesDraft[shortcut.id];
        args.rerenderShortcuts();
      });

      actions.appendChild(keyBtn);
      actions.appendChild(resetBtn);
      row.appendChild(copy);
      row.appendChild(actions);
      groupShell.appendChild(row);
    }

    args.container.appendChild(groupShell);
  }
}
