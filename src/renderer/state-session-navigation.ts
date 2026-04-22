import type { SessionRecord } from '../shared/types/session.js';

export function resolveCycledSessionId(
  sessions: SessionRecord[],
  activeSessionId: string | null | undefined,
  direction: 1 | -1,
): string | null {
  if (sessions.length === 0) return null;
  const activeIndex = sessions.findIndex((session) => session.id === activeSessionId);
  const nextIndex = (activeIndex + direction + sessions.length) % sessions.length;
  return sessions[nextIndex]?.id ?? null;
}

export function resolveSessionIdAtIndex(sessions: SessionRecord[], index: number): string | null {
  if (index < 0 || index >= sessions.length) return null;
  return sessions[index]?.id ?? null;
}

export function collectSessionIdsForRemoval(
  sessions: SessionRecord[],
  mode: 'all' | 'right' | 'left' | 'others',
  pivotSessionId?: string,
): string[] {
  if (mode === 'all') {
    return sessions.map((session) => session.id);
  }

  if (!pivotSessionId) return [];
  const pivotIndex = sessions.findIndex((session) => session.id === pivotSessionId);
  if (pivotIndex === -1) return [];

  if (mode === 'right') {
    return sessions.slice(pivotIndex + 1).map((session) => session.id);
  }
  if (mode === 'left') {
    return sessions.slice(0, pivotIndex).map((session) => session.id);
  }
  return sessions
    .filter((session) => session.id !== pivotSessionId)
    .map((session) => session.id);
}
