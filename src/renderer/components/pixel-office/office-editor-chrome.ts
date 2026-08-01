import {
  applyEditorAt,
  clearPersistedLayout,
  createLayoutEditor,
  type EditorTool,
  type LayoutEditor,
  parseOfficeLayout,
  persistLayout,
  redoLayout,
  resetToDefaultLayout,
  stringifyOfficeLayout,
  undoLayout,
} from './layout-io.js';
import type { OfficeLayout } from './types.js';
import { Direction } from './types.js';

export interface OfficeEditorChrome {
  editor: LayoutEditor;
  sync(): void;
  setEnabled(on: boolean): void;
  paintAt(
    layout: OfficeLayout,
    col: number,
    row: number,
    opts?: { recordUndo?: boolean },
  ): OfficeLayout | null;
  undo(layout: OfficeLayout): OfficeLayout | null;
  redo(layout: OfficeLayout): OfficeLayout | null;
  reset(layout: OfficeLayout): OfficeLayout;
  exportLayout(layout: OfficeLayout): void;
  importLayout(): Promise<OfficeLayout | null>;
}

export function createOfficeEditorChrome(opts: {
  toolbarEl: HTMLElement | null;
  editBtn: HTMLElement | null;
  onLayoutChange: (layout: OfficeLayout) => void;
  getLayout: () => OfficeLayout | null;
}): OfficeEditorChrome {
  const editor = createLayoutEditor();
  const { toolbarEl, editBtn } = opts;

  const sync = (): void => {
    editBtn?.setAttribute('aria-pressed', editor.enabled ? 'true' : 'false');
    toolbarEl?.toggleAttribute('hidden', !editor.enabled);
    toolbarEl?.querySelectorAll<HTMLElement>('[data-office-tool]').forEach((btn) => {
      const tool = btn.dataset.officeTool as EditorTool | undefined;
      btn.setAttribute('aria-pressed', tool === editor.tool ? 'true' : 'false');
    });
    toolbarEl?.querySelectorAll<HTMLElement>('[data-office-facing]').forEach((btn) => {
      const facing = Number(btn.dataset.officeFacing);
      btn.setAttribute('aria-pressed', facing === editor.facingDir ? 'true' : 'false');
    });
  };

  toolbarEl?.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-office-tool],[data-office-facing],[data-office-action]',
    );
    if (!target) return;
    const layout = opts.getLayout();
    if (!layout) return;

    if (target.dataset.officeTool) {
      editor.tool = target.dataset.officeTool as EditorTool;
      sync();
      return;
    }
    if (target.dataset.officeFacing != null) {
      editor.facingDir = Number(target.dataset.officeFacing) as Direction;
      sync();
      return;
    }
    const action = target.dataset.officeAction;
    if (action === 'undo') {
      const next = undoLayout(editor, layout);
      if (next) {
        persistLayout(next);
        opts.onLayoutChange(next);
      }
    } else if (action === 'redo') {
      const next = redoLayout(editor, layout);
      if (next) {
        persistLayout(next);
        opts.onLayoutChange(next);
      }
    } else if (action === 'reset') {
      clearPersistedLayout();
      const next = resetToDefaultLayout(editor, layout);
      persistLayout(next);
      opts.onLayoutChange(next);
    } else if (action === 'export') {
      chrome.exportLayout(layout);
    } else if (action === 'import') {
      void chrome.importLayout().then((next) => {
        if (!next) return;
        persistLayout(next);
        opts.onLayoutChange(next);
      });
    }
    sync();
  });

  editBtn?.addEventListener('click', () => {
    chrome.setEnabled(!editor.enabled);
  });

  const chrome: OfficeEditorChrome = {
    editor,
    sync,
    setEnabled(on: boolean) {
      editor.enabled = on;
      sync();
    },
    paintAt(layout, col, row, opts) {
      const next = applyEditorAt(editor, layout, col, row, opts);
      if (!next) return null;
      persistLayout(next);
      return next;
    },
    undo(layout) {
      const next = undoLayout(editor, layout);
      if (next) persistLayout(next);
      return next;
    },
    redo(layout) {
      const next = redoLayout(editor, layout);
      if (next) persistLayout(next);
      return next;
    },
    reset(layout) {
      clearPersistedLayout();
      const next = resetToDefaultLayout(editor, layout);
      persistLayout(next);
      return next;
    },
    exportLayout(layout) {
      const blob = new Blob([stringifyOfficeLayout(layout)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'calder-pixel-office-layout.json';
      a.click();
      URL.revokeObjectURL(url);
    },
    async importLayout() {
      return await new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.addEventListener('change', () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(null);
            return;
          }
          void file.text().then((text) => resolve(parseOfficeLayout(text)));
        });
        input.click();
      });
    },
  };

  sync();
  return chrome;
}
