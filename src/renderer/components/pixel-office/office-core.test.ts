import { describe, expect, it, vi } from 'vitest';

import { EVIDENCE_SCHEMA_VERSION, type EvidenceEvent } from '../../../shared/types-evidence.js';
import { formatDefaultSessionName } from '../../provider-availability.js';
import {
  evidenceEventToAgentEvent,
  evidenceTailToAgentSignals,
  formatActivityLabel,
  listActiveSubagentIds,
} from './agent-event.js';
import { formatCharacterChromeLabel, formatCharacterStatusLabel } from './character-label.js';
import { createOfficeCharacter, updateOfficeCharacter } from './characters.js';
import { buildWalkability, createDefaultLayout } from './layout.js';
import {
  applyEditorAt,
  clearPersistedLayout,
  createLayoutEditor,
  loadPersistedLayout,
  parseOfficeLayout,
  stringifyOfficeLayout,
  undoLayout,
} from './layout-io.js';
import { mergeEvidenceEvents } from './office-state.js';
import { officeThemeFromCss } from './office-theme.js';
import { findPath } from './pathfinding.js';
import { CharacterState, DONE_BUBBLE_SEC } from './types.js';
import { workPoseFromVisualState } from './work-pose.js';

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
    expect(layout.cols).toBe(12);
    expect(layout.rows).toBe(10);
    const blocked = new Set<string>();
    for (let row = 0; row < layout.rows; row += 1) {
      for (let col = 0; col < layout.cols; col += 1) {
        if (layout.tiles[row]?.[col] === 'wall') blocked.add(`${col},${row}`);
      }
    }
    const path = findPath(2, 2, 4, 7, layout.tiles, blocked);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ col: 4, row: 7 });
  });
});

describe('pixel office agent signals', () => {
  it('maps permission to bubble and inactive', () => {
    const signal = evidenceTailToAgentSignals('s1', [event('permission_requested')]);
    expect(signal.bubble).toBe('permission');
    expect(signal.isActive).toBe(false);
  });

  it('keeps open pty idle until structured work arrives', () => {
    const signal = evidenceTailToAgentSignals('s1', [event('pty_started')]);
    expect(signal.isActive).toBe(false);
  });

  it('formats activity label from visual state', () => {
    expect(formatActivityLabel('editing_code', 'Write', true)).toBe('Editing code');
    expect(formatActivityLabel('idle', null, false)).toBe('');
  });

  it('maps visual states to distinct work poses', () => {
    expect(workPoseFromVisualState('idle', false)).toBe('rest');
    expect(workPoseFromVisualState('editing_code', true)).toBe('type');
    expect(workPoseFromVisualState('researching_web', true)).toBe('browse');
    expect(workPoseFromVisualState('preparing', false)).toBe('rest');
    expect(workPoseFromVisualState('building', true)).toBe('build');
    expect(workPoseFromVisualState('reading_files', true)).toBe('read');
  });

  it('treats prompt_submitted as active think, not open pty', () => {
    const pty = evidenceTailToAgentSignals('s1', [event('pty_started')]);
    expect(pty.isActive).toBe(false);
    const thinking = evidenceTailToAgentSignals('s1', [
      event('pty_started', { seq: 1 }),
      event('prompt_submitted', { seq: 2 }),
    ]);
    expect(thinking.isActive).toBe(true);
    expect(thinking.visualState).toBe('unknown_working');
    expect(workPoseFromVisualState(thinking.visualState, thinking.isActive)).toBe('think');
  });

  it('does not keep completed tool metadata as current work', () => {
    const signal = evidenceTailToAgentSignals('s1', [
      event('tool_started', { seq: 1, toolName: 'Read' }),
      event('tool_completed', { seq: 2, toolName: 'Read' }),
    ]);
    expect(signal.isActive).toBe(true);
    expect(signal.toolName).toBeNull();
    expect(signal.isReading).toBe(false);
  });

  it('clears current tool metadata after a stopped turn', () => {
    const signal = evidenceTailToAgentSignals('s1', [
      event('tool_started', { seq: 1, toolName: 'Read' }),
      event('session_ended', { seq: 2 }),
    ]);
    expect(signal.isActive).toBe(false);
    expect(signal.toolName).toBeNull();
  });

  it('merges live evidence by event identity and sequence', () => {
    const first = event('pty_started', { eventId: 'a', seq: 1 });
    const next = event('prompt_submitted', { eventId: 'b', seq: 2 });
    const merged = mergeEvidenceEvents([first], [next, first]);

    expect(merged.map((item) => item.eventId)).toEqual(['a', 'b']);
    expect(mergeEvidenceEvents(merged, [])).toEqual(merged);
  });

  it('rejects stale cross-run snapshots until a new run starts', () => {
    const current = event('prompt_submitted', { eventId: 'current', seq: 4, timestamp: 2_000 });
    const staleStart = event('pty_started', {
      eventId: 'stale-start',
      evidenceRunId: 'run-old',
      seq: 1,
      timestamp: 1_000,
    });
    const stale = event('tool_started', {
      eventId: 'stale',
      evidenceRunId: 'run-old',
      seq: 2,
      timestamp: 1_500,
    });
    const fresh = event('pty_started', {
      eventId: 'fresh',
      evidenceRunId: 'run-new',
      seq: 1,
      timestamp: 3_000,
    });

    expect(mergeEvidenceEvents([current], [staleStart])).toEqual([current]);
    expect(mergeEvidenceEvents([current], [stale])).toEqual([current]);
    expect(mergeEvidenceEvents([current], [fresh])).toEqual([fresh]);
  });

  it('derives office colors from shared CSS tokens', () => {
    const theme = officeThemeFromCss((name) => {
      const values: Record<string, string> = {
        '--surface-live': '#101820',
        '--pixel-office-floor': '#202830',
        '--pixel-office-floor-accent': '#2a3440',
        '--pixel-office-wall': '#334455',
        '--pixel-office-wall-accent': '#445566',
        '--accent-positive': '#27a644',
        '--accent-warning': '#d5a94f',
        '--accent-danger': '#ef8a74',
        '--accent-info': '#8fb8c1',
        '--text-primary': '#f7f8f8',
        '--text-secondary': '#d0d6e0',
      };
      return values[name] ?? '';
    });
    expect(theme).toMatchObject({
      stage: '#101820',
      floor: '#202830',
      floorAccent: '#2a3440',
      wall: '#334455',
      wallAccent: '#445566',
      active: '#27a644',
      waiting: '#d5a94f',
      danger: '#ef8a74',
      info: '#8fb8c1',
    });
  });

  it('avoids generic Session N chrome labels', () => {
    const ch = createOfficeCharacter({
      id: 's1',
      sessionId: 's1',
      providerId: 'claude',
      seat: createDefaultLayout().seats[0]!,
      name: 'Session 1',
    });
    expect(formatCharacterChromeLabel(ch)).toContain('Claude');
    expect(formatCharacterChromeLabel(ch)).not.toMatch(/Session\s*1/i);
    ch.isActive = true;
    ch.activityLabel = 'Kod düzenliyor';
    expect(formatCharacterChromeLabel(ch)).toContain('Claude · Kod');
  });

  it('uses provider and activity in accessible session status', () => {
    const ch = createOfficeCharacter({
      id: 's1',
      sessionId: 's1',
      providerId: 'claude',
      seat: createDefaultLayout().seats[0]!,
      name: 'Session 1',
    });
    expect(formatCharacterStatusLabel(ch)).toContain('Claude');
    expect(formatCharacterStatusLabel(ch)).toContain('Resting');
    ch.isActive = true;
    ch.activityLabel = 'Kod düzenliyor';
    expect(formatCharacterStatusLabel(ch)).toBe('Claude · Kod düzenliyor');
    ch.isActive = false;
    ch.activityLabel = '';
    ch.visualState = 'waiting_for_approval';
    expect(formatCharacterStatusLabel(ch)).toContain('Waiting for approval');
  });

  it('prefers desk rest over wander when rng stays high', () => {
    const layout = createDefaultLayout();
    const seat = layout.seats[0]!;
    const ch = createOfficeCharacter(
      {
        id: 's1',
        sessionId: 's1',
        providerId: 'claude',
        seat,
        name: 'Claude 1',
      },
      { random: () => 0.99 },
    );
    ch.seatTimer = 0;
    ch.workPose = 'rest';
    ch.isActive = false;
    const seats = new Map([[seat.id, seat]]);
    const { walkable, blocked } = buildWalkability(layout);
    updateOfficeCharacter(
      ch,
      0.05,
      layout,
      seats,
      walkable,
      blocked,
      { random: () => 0.99 },
      false,
    );
    expect(ch.state).toBe(CharacterState.DESK);
    expect(ch.seatTimer).toBeGreaterThan(0);
  });

  it('skips wander under reduced motion', () => {
    const layout = createDefaultLayout();
    const seat = layout.seats[0]!;
    const ch = createOfficeCharacter({
      id: 's1',
      sessionId: 's1',
      providerId: 'claude',
      seat,
      name: 'Claude 1',
    });
    ch.seatTimer = 0;
    const seats = new Map([[seat.id, seat]]);
    const { walkable, blocked } = buildWalkability(layout);
    updateOfficeCharacter(ch, 0.05, layout, seats, walkable, blocked, { random: () => 0 }, true);
    expect(ch.state).toBe(CharacterState.DESK);
    expect(ch.seatTimer).toBeGreaterThan(0);
  });

  it('keeps permission-waiting agents at their desk', () => {
    const layout = createDefaultLayout();
    const seat = layout.seats[0]!;
    const ch = createOfficeCharacter({
      id: 's1',
      sessionId: 's1',
      providerId: 'claude',
      seat,
      name: 'Claude 1',
    });
    ch.state = CharacterState.WALK;
    ch.visualState = 'waiting_for_approval';
    ch.path = [{ col: seat.seatCol + 1, row: seat.seatRow }];
    const seats = new Map([[seat.id, seat]]);
    const { walkable, blocked } = buildWalkability(layout);
    updateOfficeCharacter(ch, 0.05, layout, seats, walkable, blocked, { random: () => 0 });
    expect(ch.state).toBe(CharacterState.DESK);
    expect(ch.tileCol).toBe(seat.seatCol);
    expect(ch.tileRow).toBe(seat.seatRow);
  });

  it('snaps walking agents to their desk under reduced motion', () => {
    const layout = createDefaultLayout();
    const seat = layout.seats[0]!;
    const ch = createOfficeCharacter({
      id: 's1',
      sessionId: 's1',
      providerId: 'claude',
      seat,
      name: 'Claude 1',
    });
    ch.state = CharacterState.WALK;
    ch.path = [{ col: seat.seatCol + 1, row: seat.seatRow }];
    const seats = new Map([[seat.id, seat]]);
    const { walkable, blocked } = buildWalkability(layout);
    updateOfficeCharacter(ch, 0.05, layout, seats, walkable, blocked, { random: () => 0 }, true);
    expect(ch.state).toBe(CharacterState.DESK);
    expect(ch.path).toEqual([]);
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

  it('clears subagents when parent session ends', () => {
    const now = Date.now();
    const ids = listActiveSubagentIds(
      [
        event('subagent_started', { eventId: 'a', subagentId: 'sub-a', timestamp: now - 1000 }),
        event('session_completed', { eventId: 'b', timestamp: now }),
      ],
      now,
    );
    expect(ids).toEqual([]);
  });

  it('clears a stopped turn before processing later subagents', () => {
    const now = Date.now();
    const ids = listActiveSubagentIds([
      event('subagent_started', { eventId: 'a', subagentId: 'sub-a', timestamp: now - 1000 }),
      event('session_ended', { eventId: 'b', timestamp: now }),
      event('subagent_started', { eventId: 'c', subagentId: 'sub-b', timestamp: now }),
    ]);
    expect(ids).toEqual(['sub-b']);
  });

  it('maps evidence tool_completed to AgentEvent toolEnd', () => {
    const mapped = evidenceEventToAgentEvent(event('tool_completed', { toolName: 'Bash' }));
    expect(mapped).toMatchObject({ kind: 'toolEnd', toolName: 'Bash' });
  });

  it('maps stopped turns to AgentEvent turnEnd', () => {
    expect(evidenceEventToAgentEvent(event('session_ended'))).toMatchObject({
      kind: 'turnEnd',
    });
  });

  it('clears late tool names after a stopped turn', () => {
    const signals = evidenceTailToAgentSignals('s1', [
      event('session_ended', { seq: 1 }),
      event('tool_started', { seq: 2, toolName: 'Read' }),
    ]);
    expect(signals.visualState).toBe('idle');
    expect(signals.toolName).toBeNull();
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
    expect(ch.workPose).toBe('rest');
    expect(ch.visualState).toBe('idle');
    expect(ch.seatTimer).toBeGreaterThan(0);
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

  it('preserves custom layout across version bump', () => {
    const custom = createDefaultLayout();
    custom.seats[0]!.seatCol = 3;
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage);
    store.set('calder.pixelOffice.layout', stringifyOfficeLayout(custom));
    store.set('calder.pixelOffice.layoutVersion', '1');
    const loaded = loadPersistedLayout();
    expect(loaded.seats[0]?.seatCol).toBe(3);
    expect(store.get('calder.pixelOffice.layoutVersion')).toBe('3');
    clearPersistedLayout();
    expect(store.has('calder.pixelOffice.layout')).toBe(false);
    expect(store.has('calder.pixelOffice.layoutVersion')).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('default session naming', () => {
  it('skips taken provider ordinals', () => {
    expect(formatDefaultSessionName('claude', 1, ['Claude 1', 'Claude 2'])).toBe('Claude 3');
  });
});

describe('pixel office sprites', () => {
  it('resolves provider accents and sheet indices', async () => {
    const { providerAccent, characterSheetIndex, CHAR_FRAME_W, CHAR_FRAMES_PER_ROW } =
      await import('./sprites.js');
    expect(providerAccent('claude')).toBe('#b45309');
    expect(providerAccent('unknown-provider')).toBe('#475569');
    expect(characterSheetIndex('claude', 's1')).toBe(0);
    expect(characterSheetIndex('cursor', 's1')).toBe(2);
    expect(CHAR_FRAME_W).toBe(16);
    expect(CHAR_FRAMES_PER_ROW).toBe(7);
  });
});
