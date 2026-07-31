import { describe, expect, it } from 'vitest';

import { EVIDENCE_SCHEMA_VERSION, type EvidenceEvent } from '../../../shared/types-evidence.js';
import {
  evidenceEventToAgentEvent,
  evidenceTailToAgentSignals,
  formatActivityLabel,
  listActiveSubagentIds,
} from './agent-event.js';
import { createOfficeCharacter } from './characters.js';
import { createDefaultLayout } from './layout.js';
import {
  applyEditorAt,
  createLayoutEditor,
  parseOfficeLayout,
  stringifyOfficeLayout,
  undoLayout,
} from './layout-io.js';
import { findPath } from './pathfinding.js';
import { DONE_BUBBLE_SEC } from './types.js';

function event(type: EvidenceEvent['type'], extras: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: extras.eventId ?? `e-${type}`,
    evidenceRunId: 'run-1',
    calderSessionId: 's1',
    providerId: 'claude',
    projectId: 'p1',
    type,
    timestamp: extras.timestamp ?? Date.now(),
    seq: extras.seq ?? 1,
    source: 'provider_hook',
    confidence: 'provider_reported',
    ...extras,
  };
}

describe('pixel office pathfinding', () => {
  it('finds a path around walls in the default layout', () => {
    const layout = createDefaultLayout();
    const blocked = new Set<string>();
    for (let row = 0; row < layout.rows; row += 1) {
      for (let col = 0; col < layout.cols; col += 1) {
        if (layout.tiles[row]?.[col] === 'wall') blocked.add(`${col},${row}`);
      }
    }
    const path = findPath(2, 2, 12, 2, layout.tiles, blocked);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ col: 12, row: 2 });
  });
});

describe('pixel office agent signals', () => {
  it('maps permission to bubble and inactive', () => {
    const signal = evidenceTailToAgentSignals('s1', [event('permission_requested')]);
    expect(signal.bubble).toBe('permission');
    expect(signal.isActive).toBe(false);
  });

  it('maps open pty to active work', () => {
    const signal = evidenceTailToAgentSignals('s1', [event('pty_started')]);
    expect(signal.isActive).toBe(true);
  });

  it('formats activity label from tool name', () => {
    expect(formatActivityLabel('Bash', true)).toBe('Bash');
    expect(formatActivityLabel(null, false)).toBe('');
  });

  it('lists active subagents within window', () => {
    const now = Date.now();
    const ids = listActiveSubagentIds(
      [
        event('subagent_started', { eventId: 'a', subagentId: 'sub-a', timestamp: now - 1000 }),
        event('subagent_started', { eventId: 'b', subagentId: 'sub-b', timestamp: now - 500 }),
        event('subagent_completed', { eventId: 'c', subagentId: 'sub-a', timestamp: now }),
      ],
      now,
    );
    expect(ids).toEqual(['sub-b']);
  });

  it('maps evidence tool_completed to AgentEvent toolEnd', () => {
    const mapped = evidenceEventToAgentEvent(event('tool_completed', { toolName: 'Bash' }));
    expect(mapped).toMatchObject({ kind: 'toolEnd', toolName: 'Bash' });
  });
});

describe('pixel office character fields', () => {
  it('creates character with bubble age and context defaults', () => {
    const seat = createDefaultLayout().seats[0]!;
    const ch = createOfficeCharacter({
      id: 's1',
      sessionId: 's1',
      providerId: 'claude',
      seat,
      name: 'Claude',
    });
    expect(ch.bubbleAge).toBe(0);
    expect(ch.contextPct).toBeNull();
    expect(ch.isSubagent).toBe(false);
    expect(DONE_BUBBLE_SEC).toBeGreaterThan(0);
  });
});

describe('pixel office layout io', () => {
  it('round-trips layout JSON and paints walls with undo', () => {
    const layout = createDefaultLayout();
    const raw = stringifyOfficeLayout(layout);
    const parsed = parseOfficeLayout(raw);
    expect(parsed?.cols).toBe(layout.cols);
    expect(parsed?.seats.length).toBe(layout.seats.length);

    const editor = createLayoutEditor();
    editor.enabled = true;
    editor.tool = 'wall';
    const painted = applyEditorAt(editor, layout, 2, 2);
    expect(painted?.tiles[2]?.[2]).toBe('wall');
    const undone = undoLayout(editor, painted!);
    expect(undone?.tiles[2]?.[2]).toBe('floor');
  });
});

describe('pixel office sprites', () => {
  it('resolves provider accents and sheet indices', async () => {
    const { providerAccent, characterSheetIndex, CHAR_FRAME_W, CHAR_FRAMES_PER_ROW } =
      await import('./sprites.js');
    expect(providerAccent('claude')).toBe('#d97706');
    expect(providerAccent('unknown-provider')).toBe('#4285f4');
    expect(characterSheetIndex('claude', 's1')).toBe(0);
    expect(CHAR_FRAME_W).toBe(16);
    expect(CHAR_FRAMES_PER_ROW).toBe(7);
  });
});
