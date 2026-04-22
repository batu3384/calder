import type { SurfaceSelectionRange } from '../../../shared/types/project.js';
import type { InferredCliRegion } from './heuristics.js';
import { findRegionAtCell, selectionArea, selectionsMatchBounds } from './inspect-geometry.js';
import type { CalderProtocolMessage } from './protocol.js';

export interface SelectableCliRegion {
  kind: 'semantic' | 'inferred';
  label: string;
  selection: SurfaceSelectionRange;
  semanticNodeId?: string;
  semanticLabel?: string;
  sourceFile?: string;
}

interface DeriveSemanticRegionsParams {
  focusedNodeId?: string;
  messages: Iterable<CalderProtocolMessage>;
}

export function deriveSemanticRegions(params: DeriveSemanticRegionsParams): SelectableCliRegion[] {
  const { focusedNodeId, messages } = params;
  return [...messages]
    .filter((message): message is CalderProtocolMessage & { bounds: SurfaceSelectionRange } => Boolean(message.bounds))
    .map((message) => ({
      kind: 'semantic' as const,
      label: message.label ?? message.nodeId,
      selection: message.bounds,
      semanticNodeId: message.nodeId,
      semanticLabel: message.label,
      sourceFile: message.sourceFile,
    }))
    .sort((left, right) => {
      const leftFocused = left.semanticNodeId === focusedNodeId ? 1 : 0;
      const rightFocused = right.semanticNodeId === focusedNodeId ? 1 : 0;
      if (leftFocused !== rightFocused) return rightFocused - leftFocused;
      return selectionArea(left.selection) - selectionArea(right.selection);
    });
}

export function findContainingInferredRegion(
  inferredRegions: InferredCliRegion[],
  selection: SurfaceSelectionRange,
): InferredCliRegion | undefined {
  return inferredRegions.find((candidate) =>
    candidate.selection.startRow <= selection.startRow
    && candidate.selection.endRow >= selection.endRow,
  );
}

export function findContainingSemanticRegion(
  semanticRegions: SelectableCliRegion[],
  selection: SurfaceSelectionRange,
): SelectableCliRegion | undefined {
  return semanticRegions.find((candidate) =>
    candidate.selection.startRow <= selection.startRow
    && candidate.selection.endRow >= selection.endRow
    && candidate.selection.startCol <= selection.startCol
    && candidate.selection.endCol >= selection.endCol,
  );
}

export function resolveSelectionSource(
  selection: SurfaceSelectionRange,
  selectionHint: InferredCliRegion | undefined,
  semanticRegion: SelectableCliRegion | undefined,
): 'semantic' | 'inferred' | 'exact' {
  if (semanticRegion && selectionsMatchBounds(semanticRegion.selection, selection)) {
    return 'semantic';
  }
  if (selectionHint && selectionsMatchBounds(selectionHint.selection, selection)) {
    return 'inferred';
  }
  return 'exact';
}

export function findSelectableRegionAtCell(
  semanticRegions: SelectableCliRegion[],
  inferredRegions: InferredCliRegion[],
  cell: { row: number; col: number },
): SelectableCliRegion | null {
  const semanticRegion = findRegionAtCell(semanticRegions, cell);
  if (semanticRegion) return semanticRegion;

  const inferredRegion = findRegionAtCell(inferredRegions, cell);
  if (!inferredRegion) return null;
  return {
    kind: 'inferred',
    label: inferredRegion.label,
    selection: inferredRegion.selection,
  };
}

export function reconcileHoveredRegion(
  hoveredRegion: SelectableCliRegion | null,
  semanticRegions: SelectableCliRegion[],
  inferredRegions: InferredCliRegion[],
): SelectableCliRegion | null {
  if (!hoveredRegion) return null;
  if (hoveredRegion.kind === 'semantic') {
    const exists = semanticRegions.some((candidate) =>
      candidate.label === hoveredRegion.label
      && selectionsMatchBounds(candidate.selection, hoveredRegion.selection),
    );
    return exists ? hoveredRegion : null;
  }
  const exists = inferredRegions.some((candidate) =>
    candidate.label === hoveredRegion.label
    && selectionsMatchBounds(candidate.selection, hoveredRegion.selection),
  );
  return exists ? hoveredRegion : null;
}
