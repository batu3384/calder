import type { CliSurfacePromptContextMode, SurfacePromptPayload, SurfaceSelectionRange } from '../../../shared/types.js';

export function buildViewportText(lines: string[]): string {
  return lines.join('\n');
}

export function buildSelectionText(lines: string[], selection: SurfaceSelectionRange): string {
  const relevant = lines.slice(selection.startRow, selection.endRow + 1);
  if (selection.mode === 'viewport' || selection.mode === 'line') {
    return relevant.join('\n');
  }

  return relevant
    .map((line) => line.slice(selection.startCol, selection.endCol))
    .join('\n');
}

export function buildNearbyText(lines: string[], selection: SurfaceSelectionRange): string {
  const start = Math.max(0, selection.startRow - 2);
  const end = Math.min(lines.length - 1, selection.endRow + 2);
  return lines.slice(start, end + 1).join('\n');
}

export function createSelectionPayload(input: {
  projectId: string;
  projectPath: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  title?: string;
  lines: string[];
  selection: SurfaceSelectionRange;
  contextMode?: CliSurfacePromptContextMode;
  selectionSource?: 'exact' | 'inferred' | 'semantic';
  semanticNodeId?: string;
  semanticLabel?: string;
  sourceFile?: string;
  ansiSnapshot?: string;
  inferredLabel?: string;
  adapterMeta?: Record<string, unknown>;
}): SurfacePromptPayload {
  return {
    projectId: input.projectId,
    projectPath: input.projectPath,
    surfaceKind: 'cli',
    selection: input.selection,
    contextMode: input.contextMode,
    selectionSource: input.selectionSource,
    semanticNodeId: input.semanticNodeId,
    semanticLabel: input.semanticLabel,
    sourceFile: input.sourceFile,
    selectedText: buildSelectionText(input.lines, input.selection),
    nearbyText: buildNearbyText(input.lines, input.selection),
    viewportText: buildViewportText(input.lines),
    ansiSnapshot: input.ansiSnapshot,
    command: input.command,
    args: input.args,
    cwd: input.cwd,
    cols: input.cols,
    rows: input.rows,
    title: input.title,
    inferredLabel: input.inferredLabel,
    adapterMeta: input.adapterMeta,
  };
}
