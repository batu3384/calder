import { describe, expect, it } from 'vitest';

import {
  deriveSemanticRegions,
  findContainingInferredRegion,
  findContainingSemanticRegion,
  findSelectableRegionAtCell,
  reconcileHoveredRegion,
  resolveSelectionSource,
  type SelectableCliRegion,
} from './inspect-selection.js';
import type { CalderProtocolMessage } from './protocol.js';

function selection(
  startRow: number,
  endRow: number,
  startCol = 0,
  endCol = 40,
) {
  return {
    mode: 'line' as const,
    startRow,
    endRow,
    startCol,
    endCol,
  };
}

describe('cli-surface inspect selection helpers', () => {
  it('prioritizes focused semantic region before non-focused candidates', () => {
    const messages: CalderProtocolMessage[] = [
      {
        type: 'node',
        nodeId: 'node-a',
        label: 'A',
        bounds: selection(1, 4),
      },
      {
        type: 'node',
        nodeId: 'node-b',
        label: 'B',
        bounds: selection(2, 3),
      },
    ];

    const regions = deriveSemanticRegions({
      messages,
      focusedNodeId: 'node-a',
    });

    expect(regions[0]?.semanticNodeId).toBe('node-a');
  });

  it('resolves selection source with semantic > inferred > exact precedence', () => {
    const exact = selection(5, 5, 0, 10);
    const inferred = { label: 'Footer', selection: exact };
    const semantic: SelectableCliRegion = {
      kind: 'semantic',
      label: 'Node',
      selection: exact,
      semanticNodeId: 'node-1',
    };

    expect(resolveSelectionSource(exact, inferred, semantic)).toBe('semantic');
    expect(resolveSelectionSource(exact, inferred, undefined)).toBe('inferred');
    expect(resolveSelectionSource(selection(6, 6), inferred, undefined)).toBe('exact');
  });

  it('prefers semantic region on cell lookup when semantic and inferred overlap', () => {
    const sharedSelection = selection(4, 6, 2, 20);
    const semanticRegions: SelectableCliRegion[] = [
      {
        kind: 'semantic',
        label: 'Menu',
        selection: sharedSelection,
        semanticNodeId: 'menu.root',
      },
    ];
    const inferredRegions = [
      {
        label: 'Panel',
        selection: sharedSelection,
      },
    ];

    const found = findSelectableRegionAtCell(semanticRegions, inferredRegions, { row: 5, col: 10 });
    expect(found?.kind).toBe('semantic');
    expect(found?.label).toBe('Menu');
  });

  it('reconciles stale hovered regions when region is no longer present', () => {
    const currentSemantic: SelectableCliRegion[] = [];
    const currentInferred = [{ label: 'Panel', selection: selection(10, 12) }];
    const staleHoveredSemantic: SelectableCliRegion = {
      kind: 'semantic',
      label: 'Old',
      selection: selection(1, 2),
      semanticNodeId: 'old.node',
    };

    const staleHoveredInferred: SelectableCliRegion = {
      kind: 'inferred',
      label: 'Old Panel',
      selection: selection(1, 2),
    };

    expect(reconcileHoveredRegion(staleHoveredSemantic, currentSemantic, currentInferred)).toBeNull();
    expect(reconcileHoveredRegion(staleHoveredInferred, currentSemantic, currentInferred)).toBeNull();
  });

  it('finds containing regions for payload resolution', () => {
    const inferredRegions = [{ label: 'Group', selection: selection(3, 9) }];
    const semanticRegions: SelectableCliRegion[] = [
      {
        kind: 'semantic',
        label: 'Toolbar',
        selection: selection(4, 5, 0, 20),
        semanticNodeId: 'toolbar.root',
      },
    ];
    const target = selection(4, 5, 2, 12);

    expect(findContainingInferredRegion(inferredRegions, target)?.label).toBe('Group');
    expect(findContainingSemanticRegion(semanticRegions, target)?.semanticNodeId).toBe('toolbar.root');
  });
});
