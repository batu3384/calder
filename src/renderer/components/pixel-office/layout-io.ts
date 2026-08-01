import { Direction, type OfficeLayout, type Seat, type TileKind } from './types.js';
import { createDefaultLayout } from './layout.js';

const LAYOUT_STORAGE_KEY = 'calder.pixelOffice.layout';
const LAYOUT_VERSION_KEY = 'calder.pixelOffice.layoutVersion';
const CURRENT_LAYOUT_VERSION = 3;

export function cloneLayout(layout: OfficeLayout): OfficeLayout {
  return {
    cols: layout.cols,
    rows: layout.rows,
    tiles: layout.tiles.map((row) => [...row]),
    seats: layout.seats.map((seat) => ({ ...seat })),
  };
}

export function isValidOfficeLayout(value: unknown): value is OfficeLayout {
  if (!value || typeof value !== 'object') return false;
  const layout = value as OfficeLayout;
  if (!Number.isInteger(layout.cols) || !Number.isInteger(layout.rows)) return false;
  if (layout.cols < 4 || layout.rows < 4 || layout.cols > 48 || layout.rows > 48) return false;
  if (!Array.isArray(layout.tiles) || layout.tiles.length !== layout.rows) return false;
  for (const row of layout.tiles) {
    if (!Array.isArray(row) || row.length !== layout.cols) return false;
    for (const cell of row) {
      if (cell !== 'floor' && cell !== 'wall') return false;
    }
  }
  if (!Array.isArray(layout.seats)) return false;
  for (const seat of layout.seats) {
    if (!seat || typeof seat.id !== 'string' || !seat.id) return false;
    if (!Number.isInteger(seat.seatCol) || !Number.isInteger(seat.seatRow)) return false;
    if (seat.seatCol < 0 || seat.seatRow < 0 || seat.seatCol >= layout.cols || seat.seatRow >= layout.rows) {
      return false;
    }
    if (![Direction.DOWN, Direction.LEFT, Direction.RIGHT, Direction.UP].includes(seat.facingDir)) {
      return false;
    }
  }
  return true;
}

export function parseOfficeLayout(raw: string): OfficeLayout | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidOfficeLayout(parsed) ? cloneLayout(parsed) : null;
  } catch {
    return null;
  }
}

export function stringifyOfficeLayout(layout: OfficeLayout): string {
  return JSON.stringify(cloneLayout(layout));
}

export function loadPersistedLayout(): OfficeLayout {
  try {
    const version = Number(localStorage.getItem(LAYOUT_VERSION_KEY));
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    const existing = raw ? parseOfficeLayout(raw) : null;

    if (version !== CURRENT_LAYOUT_VERSION) {
      // Never wipe a valid custom layout on version bump — only seed default when empty.
      if (existing) {
        localStorage.setItem(LAYOUT_VERSION_KEY, String(CURRENT_LAYOUT_VERSION));
        return existing;
      }
      const layout = createDefaultLayout();
      persistLayout(layout);
      return layout;
    }

    if (existing) return existing;
    return createDefaultLayout();
  } catch {
    return createDefaultLayout();
  }
}

export function persistLayout(layout: OfficeLayout): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, stringifyOfficeLayout(layout));
    localStorage.setItem(LAYOUT_VERSION_KEY, String(CURRENT_LAYOUT_VERSION));
  } catch {
    // ignore quota / private mode
  }
}

export function clearPersistedLayout(): void {
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    localStorage.removeItem(LAYOUT_VERSION_KEY);
  } catch {
    // ignore
  }
}

export type EditorTool = 'floor' | 'wall' | 'seat' | 'erase-seat';

export interface LayoutEditor {
  enabled: boolean;
  tool: EditorTool;
  facingDir: Direction;
  undoStack: OfficeLayout[];
  redoStack: OfficeLayout[];
}

export function createLayoutEditor(): LayoutEditor {
  return {
    enabled: false,
    tool: 'wall',
    facingDir: Direction.DOWN,
    undoStack: [],
    redoStack: [],
  };
}

function pushUndo(editor: LayoutEditor, before: OfficeLayout): void {
  editor.undoStack.push(cloneLayout(before));
  if (editor.undoStack.length > 40) editor.undoStack.shift();
  editor.redoStack = [];
}

export function applyEditorAt(
  editor: LayoutEditor,
  layout: OfficeLayout,
  col: number,
  row: number,
  opts: { recordUndo?: boolean } = {},
): OfficeLayout | null {
  if (!editor.enabled) return null;
  if (col < 0 || row < 0 || col >= layout.cols || row >= layout.rows) return null;
  const next = cloneLayout(layout);
  const before = cloneLayout(layout);
  const recordUndo = opts.recordUndo !== false;

  if (editor.tool === 'floor' || editor.tool === 'wall') {
    const kind: TileKind = editor.tool;
    if (next.tiles[row]![col] === kind) return null;
    next.tiles[row]![col] = kind;
    if (kind === 'wall') {
      next.seats = next.seats.filter((seat) => !(seat.seatCol === col && seat.seatRow === row));
    }
  } else if (editor.tool === 'seat') {
    if (next.tiles[row]![col] === 'wall') return null;
    const existing = next.seats.find((seat) => seat.seatCol === col && seat.seatRow === row);
    if (existing) {
      existing.facingDir = editor.facingDir;
    } else {
      const seat: Seat = {
        id: `seat-${Date.now().toString(36)}-${next.seats.length}`,
        seatCol: col,
        seatRow: row,
        facingDir: editor.facingDir,
      };
      next.seats.push(seat);
    }
  } else if (editor.tool === 'erase-seat') {
    const beforeLen = next.seats.length;
    next.seats = next.seats.filter((seat) => !(seat.seatCol === col && seat.seatRow === row));
    if (next.seats.length === beforeLen) return null;
  }

  if (recordUndo) pushUndo(editor, before);
  return next;
}

export function undoLayout(editor: LayoutEditor, current: OfficeLayout): OfficeLayout | null {
  const prev = editor.undoStack.pop();
  if (!prev) return null;
  editor.redoStack.push(cloneLayout(current));
  return prev;
}

export function redoLayout(editor: LayoutEditor, current: OfficeLayout): OfficeLayout | null {
  const next = editor.redoStack.pop();
  if (!next) return null;
  editor.undoStack.push(cloneLayout(current));
  return next;
}

export function resetToDefaultLayout(editor: LayoutEditor, current: OfficeLayout): OfficeLayout {
  pushUndo(editor, current);
  return createDefaultLayout();
}
