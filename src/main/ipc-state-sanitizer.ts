import * as path from 'path';

import type { PersistedState } from '../shared/types/project-state';
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

const VALID_PROVIDER_IDS: ProviderId[] = ['claude', 'codex', 'copilot', 'antigravity', 'qwen'];

const VALID_SESSION_TYPES = new Set([
  'claude',
  'mcp-inspector',
  'diff-viewer',
  'file-reader',
  'remote-terminal',
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
    const normalized = normalizeLegacyProviderId(session.providerId);
    if (!normalized) {
      throw new Error(
        `Invalid state payload: unsupported session.providerId "${session.providerId}"`,
      );
    }
    (session as { providerId?: ProviderId }).providerId = normalized;
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
  if (state.version !== 1) {
    throw new Error('Invalid state payload: unsupported version');
  }
  if (!Array.isArray(state.projects)) {
    throw new Error('Invalid state payload: projects must be an array');
  }
  if (state.projects.length > 500) {
    throw new Error('Invalid state payload: project count exceeds limit');
  }
  if (!state.projects.every(isValidProjectRecordShape)) {
    throw new Error('Invalid state payload: one or more projects are malformed');
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
