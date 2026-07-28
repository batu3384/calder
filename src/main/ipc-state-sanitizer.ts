import * as path from 'path';

import type { PersistedState } from '../shared/types/project-state';
import { CURRENT_PERSISTED_STATE_VERSION } from '../shared/types/project-state';
import type { ProviderId } from '../shared/types/provider';
import { isWin } from './platform';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

const VALID_PROVIDER_IDS: ProviderId[] = ['claude', 'codex', 'antigravity', 'cursor'];

const VALID_SESSION_TYPES = new Set([
  'claude',
  'mcp-inspector',
  'diff-viewer',
  'file-reader',
  'browser-tab',
]);

const MAX_PERSISTED_STATE_BYTES = 25 * 1024 * 1024;
const MAX_PROJECT_PATH_LENGTH = 4_096;
const MAX_PROJECT_NAME_LENGTH = 256;
const MAX_SESSION_NAME_LENGTH = 512;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_SESSION_STRING_LENGTH = 16_384;

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && VALID_PROVIDER_IDS.includes(value as ProviderId);
}

function normalizeLegacyProviderId(value: unknown): ProviderId | null {
  if (value === 'gemini') return 'antigravity';
  // Removed providers: keep sessions open under Claude rather than blocking state saves.
  if (value === 'qwen' || value === 'copilot') return 'claude';
  return isProviderId(value) ? value : null;
}

function hasNulByte(value: string): boolean {
  return value.includes('\0');
}

function assertStringField(
  value: string,
  fieldName: string,
  maxLength: number,
  options?: { allowEmpty?: boolean },
): void {
  if (value.length > maxLength) {
    throw new Error(`Invalid state payload: ${fieldName} exceeds max length`);
  }
  if (hasNulByte(value)) {
    throw new Error(`Invalid state payload: ${fieldName} contains NUL byte`);
  }
  if (!options?.allowEmpty && value.trim().length === 0) {
    throw new Error(`Invalid state payload: ${fieldName} must not be empty`);
  }
}

function normalizeProjectPathForSave(rawPath: string): string {
  assertStringField(rawPath, 'project.path', MAX_PROJECT_PATH_LENGTH);
  return path.resolve(rawPath);
}

function validateSessionRecordForSave(
  session: PersistedState['projects'][number]['sessions'][number],
): void {
  assertStringField(session.id, 'session.id', MAX_IDENTIFIER_LENGTH);
  assertStringField(session.name, 'session.name', MAX_SESSION_NAME_LENGTH);
  if (!Number.isFinite(Date.parse(session.createdAt))) {
    throw new Error('Invalid state payload: session.createdAt must be a valid date');
  }
  if (session.type !== undefined && !VALID_SESSION_TYPES.has(session.type)) {
    throw new Error(`Invalid state payload: unsupported session.type "${session.type}"`);
  }
  if (session.providerId !== undefined && !isProviderId(session.providerId)) {
    const rawProvider = session.providerId;
    const normalized = normalizeLegacyProviderId(rawProvider);
    if (!normalized) {
      throw new Error(
        `Invalid state payload: unsupported session.providerId "${session.providerId}"`,
      );
    }
    (session as { providerId?: ProviderId }).providerId = normalized;
    if (normalized !== rawProvider) {
      delete (session as { cliSessionId?: string | null }).cliSessionId;
      delete (session as { claudeSessionId?: string | null }).claudeSessionId;
    }
  }
  if (session.args !== undefined) {
    assertStringField(session.args, 'session.args', MAX_SESSION_STRING_LENGTH, {
      allowEmpty: true,
    });
  }
  if (session.diffFilePath !== undefined) {
    assertStringField(session.diffFilePath, 'session.diffFilePath', MAX_SESSION_STRING_LENGTH, {
      allowEmpty: true,
    });
  }
  if (session.worktreePath !== undefined) {
    assertStringField(session.worktreePath, 'session.worktreePath', MAX_SESSION_STRING_LENGTH, {
      allowEmpty: true,
    });
  }
  if (session.fileReaderPath !== undefined) {
    assertStringField(session.fileReaderPath, 'session.fileReaderPath', MAX_SESSION_STRING_LENGTH, {
      allowEmpty: true,
    });
  }
  if (session.browserTabUrl !== undefined) {
    assertStringField(session.browserTabUrl, 'session.browserTabUrl', MAX_SESSION_STRING_LENGTH, {
      allowEmpty: true,
    });
  }
  if (session.browserTargetSessionId !== undefined) {
    assertStringField(
      session.browserTargetSessionId,
      'session.browserTargetSessionId',
      MAX_IDENTIFIER_LENGTH,
    );
  }
}

function validatePersistedStateReferences(state: PersistedState): void {
  const projectIds = new Set<string>();
  const projectPathKeys = new Set<string>();

  for (const project of state.projects) {
    assertStringField(project.id, 'project.id', MAX_IDENTIFIER_LENGTH);
    assertStringField(project.name, 'project.name', MAX_PROJECT_NAME_LENGTH);
    project.path = normalizeProjectPathForSave(project.path);

    if (projectIds.has(project.id)) {
      throw new Error('Invalid state payload: duplicate project.id detected');
    }
    projectIds.add(project.id);

    const pathKey = isWin ? project.path.toLowerCase() : project.path;
    if (projectPathKeys.has(pathKey)) {
      throw new Error('Invalid state payload: duplicate project.path detected');
    }
    projectPathKeys.add(pathKey);

    const sessionIds = new Set<string>();
    for (const session of project.sessions) {
      validateSessionRecordForSave(session);
      if (sessionIds.has(session.id)) {
        throw new Error(
          `Invalid state payload: duplicate session.id detected in project "${project.id}"`,
        );
      }
      sessionIds.add(session.id);
    }

    if (project.activeSessionId !== null) {
      assertStringField(project.activeSessionId, 'project.activeSessionId', MAX_IDENTIFIER_LENGTH);
      if (!sessionIds.has(project.activeSessionId)) {
        throw new Error(
          `Invalid state payload: activeSessionId is missing in project "${project.id}"`,
        );
      }
    }

    for (const session of project.sessions) {
      if (session.browserTargetSessionId && !sessionIds.has(session.browserTargetSessionId)) {
        throw new Error(
          `Invalid state payload: browserTargetSessionId is missing in project "${project.id}"`,
        );
      }
    }
  }

  if (state.activeProjectId !== null) {
    assertStringField(state.activeProjectId, 'state.activeProjectId', MAX_IDENTIFIER_LENGTH);
    if (!projectIds.has(state.activeProjectId)) {
      throw new Error('Invalid state payload: activeProjectId does not match any project');
    }
  }

  if (
    state.preferences.defaultProvider !== undefined &&
    !isProviderId(state.preferences.defaultProvider)
  ) {
    const normalized = normalizeLegacyProviderId(state.preferences.defaultProvider);
    if (!normalized) {
      throw new Error(
        `Invalid state payload: unsupported preferences.defaultProvider "${state.preferences.defaultProvider}"`,
      );
    }
    state.preferences.defaultProvider = normalized;
  }
}

function isValidSessionRecordShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.name) &&
    isNullableString(value.cliSessionId) &&
    isString(value.createdAt)
  );
}

function describeMalformedSession(session: unknown, index: number): string {
  if (!isRecord(session)) return `sessions[${index}] is not an object`;
  const problems: string[] = [];
  if (!isString(session.id)) problems.push('id');
  if (!isString(session.name)) problems.push('name');
  if (!isNullableString(session.cliSessionId)) problems.push('cliSessionId');
  if (!isString(session.createdAt)) problems.push('createdAt');
  return `sessions[${index}] invalid fields: ${problems.join(',') || 'unknown'}`;
}

function describeMalformedProject(project: unknown, index: number): string {
  if (!isRecord(project)) return `projects[${index}] is not an object`;
  if (!isString(project.id) || !isString(project.name) || !isString(project.path)) {
    return `projects[${index}] missing id/name/path`;
  }
  if (!isNullableString(project.activeSessionId)) {
    return `projects[${index}] activeSessionId invalid`;
  }
  if (!Array.isArray(project.sessions)) {
    return `projects[${index}] sessions is not an array`;
  }
  if (project.sessions.length > 2_000) {
    return `projects[${index}] too many sessions`;
  }
  const sessions = project.sessions as unknown[];
  for (let i = 0; i < sessions.length; i += 1) {
    if (!isValidSessionRecordShape(sessions[i])) {
      return `projects[${index}] ${describeMalformedSession(sessions[i], i)}`;
    }
  }
  return `projects[${index}] unknown malformation`;
}

function coercePersistedStateShape(state: Record<string, unknown>): void {
  if (!Array.isArray(state.projects)) return;
  for (const project of state.projects) {
    if (!isRecord(project) || !Array.isArray(project.sessions)) continue;
    const nextSessions = (project.sessions as unknown[]).filter((session) => {
      if (!isRecord(session)) return false;
      const sessionType = session.type;
      return sessionType !== 'remote-terminal' && sessionType !== 'mobile';
    });
    for (const session of nextSessions) {
      if (!isRecord(session)) continue;
      if (session.cliSessionId === undefined) {
        session.cliSessionId = null;
      }
    }
    project.sessions = nextSessions;
  }
}

function isValidProjectRecordShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isString(value.id) || !isString(value.name) || !isString(value.path)) return false;
  if (!isNullableString(value.activeSessionId)) return false;
  if (!Array.isArray(value.sessions)) return false;
  if (value.sessions.length > 2_000) return false;
  return value.sessions.every(isValidSessionRecordShape);
}

function isValidPreferencesShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isBoolean(value.soundOnSessionWaiting) &&
    isBoolean(value.notificationsDesktop) &&
    isBoolean(value.debugMode) &&
    isBoolean(value.sessionHistoryEnabled) &&
    isBoolean(value.insightsEnabled) &&
    isBoolean(value.autoTitleEnabled)
  );
}

export function sanitizePersistedStateForSave(state: unknown): PersistedState {
  if (!isRecord(state)) {
    throw new Error('Invalid state payload: expected object');
  }
  if (state.version !== 1 && state.version !== CURRENT_PERSISTED_STATE_VERSION) {
    throw new Error('Invalid state payload: unsupported version');
  }
  if (!Array.isArray(state.projects)) {
    throw new Error('Invalid state payload: projects must be an array');
  }
  if (state.projects.length > 500) {
    throw new Error('Invalid state payload: project count exceeds limit');
  }

  coercePersistedStateShape(state);

  if (!state.projects.every(isValidProjectRecordShape)) {
    const details = state.projects
      .map((project, index) =>
        isValidProjectRecordShape(project) ? null : describeMalformedProject(project, index),
      )
      .filter((entry): entry is string => entry !== null)
      .slice(0, 3)
      .join('; ');
    throw new Error(
      `Invalid state payload: one or more projects are malformed (${details || 'unknown'})`,
    );
  }
  if (!isNullableString(state.activeProjectId)) {
    throw new Error('Invalid state payload: activeProjectId must be string or null');
  }
  if (!isValidPreferencesShape(state.preferences)) {
    throw new Error('Invalid state payload: preferences are malformed');
  }

  // Normalize to plain JSON to avoid prototype pollution and unserializable payloads.
  const serialized = JSON.stringify(state);
  if (serialized.length > MAX_PERSISTED_STATE_BYTES) {
    throw new Error('Invalid state payload: serialized state is too large');
  }
  const sanitized = JSON.parse(serialized) as PersistedState;
  validatePersistedStateReferences(sanitized);
  return sanitized;
}
