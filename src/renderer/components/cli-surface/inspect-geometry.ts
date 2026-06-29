import type { SurfaceSelectionRange } from '../../../shared/types/project-surface.js';

export function selectionsMatchBounds(
  left: SurfaceSelectionRange,
  right: SurfaceSelectionRange,
): boolean {
  return (
    left.startRow === right.startRow &&
    left.endRow === right.endRow &&
    left.startCol === right.startCol &&
    left.endCol === right.endCol
  );
}

export function selectionArea(selection: SurfaceSelectionRange): number {
  return (
    (selection.endRow - selection.startRow + 1) * Math.max(1, selection.endCol - selection.startCol)
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pointerToCell(
  viewportEl: HTMLElement,
  terminalCols: number,
  terminalRows: number,
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
): { row: number; col: number } | null {
  if (terminalCols <= 0 || terminalRows <= 0) return null;
  const rect = viewportEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const col = clampNumber(
    Math.floor((event.clientX - rect.left) / (rect.width / terminalCols)),
    0,
    terminalCols,
  );
  const row = clampNumber(
    Math.floor((event.clientY - rect.top) / (rect.height / terminalRows)),
    0,
    Math.max(0, terminalRows - 1),
  );
  return { row, col };
}

export function selectionFromViewport(
  viewportLineCount: number,
  terminalCols: number,
): SurfaceSelectionRange | null {
  if (viewportLineCount === 0) return null;
  return {
    mode: 'viewport',
    startRow: 0,
    endRow: viewportLineCount - 1,
    startCol: 0,
    endCol: terminalCols,
  };
}

export function selectionFromTerminal(args: {
  viewportLineCount: number;
  terminalCols: number;
  viewportY: number;
  selectionText: string;
  range: { start: { x: number; y: number }; end: { x: number; y: number } } | null | undefined;
}): SurfaceSelectionRange | null {
  if (args.viewportLineCount === 0) return null;
  if (!args.selectionText.trim() || !args.range) {
    return null;
  }

  const lastRow = Math.max(0, args.viewportLineCount - 1);
  const startRow = Math.min(lastRow, Math.max(0, args.range.start.y - 1 - args.viewportY));
  const endRow = Math.min(lastRow, Math.max(startRow, args.range.end.y - 1 - args.viewportY));
  const startCol = Math.max(0, args.range.start.x - 1);
  const endCol = Math.max(startCol + 1, args.range.end.x);
  const mode = startCol === 0 && endCol >= args.terminalCols ? 'line' : 'region';

  return {
    mode,
    startRow,
    endRow,
    startCol,
    endCol,
  };
}

export function selectionFromCells(args: {
  viewportLineCount: number;
  terminalCols: number;
  start: { row: number; col: number };
  end: { row: number; col: number };
}): SurfaceSelectionRange {
  const maxRow = Math.max(0, args.viewportLineCount - 1);
  const startRow = clampNumber(Math.min(args.start.row, args.end.row), 0, maxRow);
  const endRow = clampNumber(Math.max(args.start.row, args.end.row), startRow, maxRow);
  const startCol = clampNumber(Math.min(args.start.col, args.end.col), 0, args.terminalCols);
  const endCol = clampNumber(
    Math.max(args.start.col, args.end.col),
    startCol + 1,
    args.terminalCols,
  );
  return {
    mode: startCol === 0 && endCol >= args.terminalCols ? 'line' : 'region',
    startRow,
    endRow,
    startCol,
    endCol,
  };
}

export function findRegionAtCell<T extends { selection: SurfaceSelectionRange }>(
  regions: T[],
  cell: { row: number; col: number },
): T | null {
  return (
    regions.find(
      (candidate) =>
        candidate.selection.startRow <= cell.row &&
        candidate.selection.endRow >= cell.row &&
        candidate.selection.startCol <= cell.col &&
        candidate.selection.endCol >= cell.col,
    ) ?? null
  );
}
