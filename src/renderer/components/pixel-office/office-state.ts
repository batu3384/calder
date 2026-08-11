import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { getContext } from '../../session-context.js';
import { appState } from '../../state.js';
import {
  evidenceTailToAgentSignals,
  formatActivityLabel,
  listActiveSubagentIds,
} from './agent-event.js';
import {
  createOfficeCharacter,
  prefersReducedMotion,
  updateOfficeCharacter,
} from './characters.js';
import { buildWalkability } from './layout.js';
import { loadPersistedLayout } from './layout-io.js';
import { listOpenCliSessions } from './sessions.js';
import { playOfficeChime } from './sound.js';
import {
  DONE_BUBBLE_SEC,
  type OfficeCharacter,
  type OfficeLayout,
  type Seat,
  TILE_SIZE,
} from './types.js';
import { workPoseFromVisualState } from './work-pose.js';

const MAX_CACHED_EVIDENCE_EVENTS = 120;

export function mergeEvidenceEvents(
  current: EvidenceEvent[],
  incoming: EvidenceEvent[],
): EvidenceEvent[] {
  if (incoming.length === 0) return current;

  const currentRunId = current[0]?.evidenceRunId;
  const incomingRunId = incoming[0]?.evidenceRunId;
  if (currentRunId && incomingRunId && currentRunId !== incomingRunId) {
    current = [];
  }

  const targetRunId = incomingRunId ?? currentRunId;
  const byEventId = new Map(current.map((event) => [event.eventId, event]));
  for (const event of incoming) {
    if (targetRunId && event.evidenceRunId !== targetRunId) continue;
    const previous = byEventId.get(event.eventId);
    if (!previous || event.seq >= previous.seq) {
      byEventId.set(event.eventId, event);
    }
  }

  return [...byEventId.values()]
    .sort((a, b) => a.seq - b.seq || a.timestamp - b.timestamp)
    .slice(-MAX_CACHED_EVIDENCE_EVENTS);
}

export class OfficeRuntime {
  layout: OfficeLayout;
  readonly seats = new Map<string, Seat>();
  readonly characters = new Map<string, OfficeCharacter>();
  walkable: Array<{ col: number; row: number }> = [];
  blocked: Set<string> = new Set();
  private seatCursor = 0;
  private evidenceBySession = new Map<string, EvidenceEvent[]>();
  private evidenceRunBySession = new Map<string, string>();

  constructor(initialLayout?: OfficeLayout) {
    this.layout = initialLayout ?? loadPersistedLayout();
    this.applyLayoutInternals(this.layout);
  }

  replaceLayout(layout: OfficeLayout): void {
    this.layout = layout;
    this.applyLayoutInternals(layout);
    for (const character of this.characters.values()) {
      if (character.isSubagent) continue;
      if (character.seatId && !this.seats.has(character.seatId)) {
        const seat = this.allocateSeat();
        character.seatId = seat?.id ?? null;
        if (seat) {
          character.tileCol = seat.seatCol;
          character.tileRow = seat.seatRow;
          character.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
          character.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
          character.dir = seat.facingDir;
          character.path = [];
        }
      }
    }
  }

  private applyLayoutInternals(layout: OfficeLayout): void {
    this.seats.clear();
    for (const seat of layout.seats) this.seats.set(seat.id, seat);
    const walk = buildWalkability(layout);
    this.walkable = walk.walkable;
    this.blocked = walk.blocked;
    this.seatCursor = 0;
  }

  sessionCharacterIds(): string[] {
    return [...this.characters.values()]
      .filter((character) => !character.isSubagent)
      .map((character) => character.sessionId);
  }

  latestEvidenceTimestamp(sessionId: string): number | null {
    const events = this.evidenceBySession.get(sessionId);
    if (!events || events.length === 0) return null;
    return events.reduce((latest, event) => Math.max(latest, event.timestamp), 0);
  }

  syncSessionsFromAppState(): void {
    const sessions = listOpenCliSessions();
    const alive = new Set(sessions.map((session) => session.id));
    for (const [id, character] of this.characters) {
      if (character.isSubagent) continue;
      if (!alive.has(id)) {
        this.characters.delete(id);
        this.evidenceBySession.delete(id);
        this.evidenceRunBySession.delete(id);
        for (const [subId, sub] of this.characters) {
          if (sub.parentId === id) this.characters.delete(subId);
        }
      }
    }
    for (const session of sessions) {
      if (this.characters.has(session.id)) {
        const existing = this.characters.get(session.id)!;
        existing.name = session.name || existing.name;
        existing.providerId = session.providerId || existing.providerId;
        continue;
      }
      const seat = this.allocateSeat();
      this.characters.set(
        session.id,
        createOfficeCharacter({
          id: session.id,
          sessionId: session.id,
          providerId: session.providerId || 'unknown',
          seat,
          name: session.name || 'Agent',
        }),
      );
      const pendingEvidence = this.evidenceBySession.get(session.id);
      if (pendingEvidence) this.applyEvidence(session.id, pendingEvidence);
    }
  }

  private allocateSeat(): Seat | null {
    if (this.layout.seats.length === 0) return null;
    const used = new Set(
      [...this.characters.values()]
        .filter((character) => !character.isSubagent)
        .map((character) => character.seatId)
        .filter(Boolean),
    );
    for (let i = 0; i < this.layout.seats.length; i += 1) {
      const seat = this.layout.seats[(this.seatCursor + i) % this.layout.seats.length]!;
      if (!used.has(seat.id)) {
        this.seatCursor = (this.seatCursor + i + 1) % this.layout.seats.length;
        return seat;
      }
    }
    const fallback = this.layout.seats[this.seatCursor % this.layout.seats.length]!;
    this.seatCursor = (this.seatCursor + 1) % this.layout.seats.length;
    return fallback;
  }

  clearEvidence(sessionId: string): void {
    this.evidenceBySession.delete(sessionId);
    this.evidenceRunBySession.delete(sessionId);
    const character = this.characters.get(sessionId);
    if (!character || character.isSubagent) return;
    character.isActive = false;
    character.currentTool = null;
    character.isReading = false;
    character.visualState = 'idle';
    character.workPose = 'rest';
    character.activityLabel = '';
    character.bubble = 'none';
    character.bubbleAge = 0;
    this.syncSubagents(sessionId, []);
  }

  applyEvidence(sessionId: string, events: EvidenceEvent[], runId?: string): void {
    const currentEvents = this.evidenceBySession.get(sessionId) ?? [];
    const incomingRunId = runId ?? events[0]?.evidenceRunId;
    if (incomingRunId) {
      const currentRunId =
        this.evidenceRunBySession.get(sessionId) ?? currentEvents[0]?.evidenceRunId;
      if (currentRunId !== incomingRunId) {
        this.evidenceBySession.set(sessionId, []);
      }
      this.evidenceRunBySession.set(sessionId, incomingRunId);
    }
    const mergedEvents = mergeEvidenceEvents(this.evidenceBySession.get(sessionId) ?? [], events);
    this.evidenceBySession.set(sessionId, mergedEvents);
    const character = this.characters.get(sessionId);
    if (!character || character.isSubagent) return;

    const previousBubble = character.bubble;
    const signal = evidenceTailToAgentSignals(sessionId, mergedEvents);
    character.isActive = signal.isActive;
    character.currentTool = signal.toolName;
    character.isReading = signal.isReading;
    character.visualState = signal.visualState;
    character.workPose = workPoseFromVisualState(signal.visualState, signal.isActive);
    const nextBubble =
      signal.bubble !== 'none' ? signal.bubble : character.workPose === 'think' ? 'think' : 'none';
    if (nextBubble !== previousBubble) {
      character.bubble = nextBubble;
      character.bubbleAge = 0;
      if (
        (nextBubble === 'permission' || nextBubble === 'done') &&
        appState.preferences.soundOnSessionWaiting
      ) {
        playOfficeChime(nextBubble);
      }
    }
    character.activityLabel = formatActivityLabel(
      signal.visualState,
      signal.toolName,
      signal.isActive,
    );
    const ctx = getContext(sessionId);
    character.contextPct = ctx ? Math.max(0, Math.min(100, ctx.usedPercentage)) : null;

    this.syncSubagents(sessionId, mergedEvents);
  }

  private syncSubagents(parentId: string, events: EvidenceEvent[]): void {
    const parent = this.characters.get(parentId);
    if (!parent) return;
    const activeIds = listActiveSubagentIds(events);
    const prefix = `${parentId}::sub::`;
    for (const [id, character] of this.characters) {
      if (
        character.parentId === parentId &&
        !activeIds.some((subId) => id === `${prefix}${subId}`)
      ) {
        this.characters.delete(id);
      }
    }
    activeIds.forEach((subId, index) => {
      const id = `${prefix}${subId}`;
      let sub = this.characters.get(id);
      if (!sub) {
        sub = createOfficeCharacter({
          id,
          sessionId: parentId,
          providerId: parent.providerId,
          seat: null,
          name: `Sub ${index + 1}`,
          isSubagent: true,
          parentId,
        });
        sub.isActive = true;
        this.characters.set(id, sub);
      }
      const angle = (index / Math.max(activeIds.length, 1)) * Math.PI * 2 - Math.PI / 2;
      sub.x = parent.x + Math.cos(angle) * 18;
      sub.y = parent.y + Math.sin(angle) * 12;
      sub.tileCol = Math.round(sub.x / TILE_SIZE);
      sub.tileRow = Math.round(sub.y / TILE_SIZE);
      sub.isActive = parent.isActive;
      sub.activityLabel = parent.isActive ? parent.activityLabel : '';
      sub.providerId = parent.providerId;
      sub.workPose = parent.workPose;
      sub.visualState = parent.visualState;
    });
  }

  private refreshEvidenceState(character: OfficeCharacter): void {
    const events = this.evidenceBySession.get(character.sessionId);
    if (!events) return;
    const signal = evidenceTailToAgentSignals(character.sessionId, events);
    if (
      signal.isActive === character.isActive &&
      signal.toolName === character.currentTool &&
      signal.isReading === character.isReading &&
      signal.visualState === character.visualState
    ) {
      return;
    }
    this.applyEvidence(character.sessionId, events);
  }

  update(dt: number): void {
    const reducedMotion = prefersReducedMotion();
    for (const character of [...this.characters.values()]) {
      if (character.isSubagent) {
        if (reducedMotion) {
          character.frame = 0;
          continue;
        }
        character.frameTimer += dt;
        if (character.frameTimer > 0.2) {
          character.frameTimer = 0;
          character.frame = (character.frame + 1) % 2;
        }
        continue;
      }
      this.refreshEvidenceState(character);
      if (character.bubble === 'done') {
        character.bubbleAge += dt;
        if (character.bubbleAge >= DONE_BUBBLE_SEC) {
          character.bubble = 'none';
          character.bubbleAge = 0;
        }
      }
      updateOfficeCharacter(character, dt, this.layout, this.seats, this.walkable, this.blocked);
    }
  }

  listCharacters(): OfficeCharacter[] {
    return [...this.characters.values()];
  }

  selectedSessionId(): string | null {
    return appState.activeProject?.activeSessionId ?? null;
  }

  hitTest(worldX: number, worldY: number): OfficeCharacter | null {
    const sorted = this.listCharacters().sort((a, b) => b.y - a.y);
    for (const character of sorted) {
      const padX = character.isSubagent ? 6 : 8;
      const top = character.isSubagent ? 20 : 28;
      if (
        worldX >= character.x - padX &&
        worldX <= character.x + padX &&
        worldY >= character.y - top &&
        worldY <= character.y + 4
      ) {
        return character;
      }
    }
    return null;
  }
}
