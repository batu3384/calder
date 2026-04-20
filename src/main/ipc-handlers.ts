import { ipcMain, BrowserWindow, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnPty, spawnShellPty, writePty, resizePty, killPty, isSilencedExit, getPtyCwd } from './pty-manager';
import { loadState, PersistedState } from './store';
import { startWatching, cleanupSessionStatus, setInspectorEventsMiddleware, stopWatching as stopHookWatching } from './hook-status';
import { startCodexSessionWatcher, registerPendingCodexSession, unregisterCodexSession, stopCodexSessionWatcher } from './codex-session-watcher';
import { startBlackboxSessionWatcher, registerPendingBlackboxSession, unregisterBlackboxSession, stopBlackboxSessionWatcher } from './blackbox-session-watcher';
import { registerMcpHandlers } from './mcp-ipc-handlers';
import { registerFsStoreIpcHandlers } from './ipc-fs-store';
import { registerMaintenanceIpcHandlers } from './ipc-maintenance';
import { registerMcpGovernanceIpcHandlers } from './ipc-mcp-governance';
import { registerGitIpcHandlers } from './ipc-git';
import { registerProviderIpcHandlers } from './ipc-provider';
import { registerProviderUpdateIpcHandlers } from './ipc-provider-update';
import { registerMobileIpcHandlers } from './ipc-mobile';
import { registerCalderIpcHandlers, resetCalderProjectWatchers } from './ipc-calder';
import { registerAppBrowserIpcHandlers, isAllowedGuestMessagePayload } from './ipc-app-browser';
import { registerCliSurfaceIpcHandlers } from './ipc-cli-surface';
import { createAppMenu } from './menu';
import { getProvider } from './providers/registry';
import type { AutoApprovalMode, ProjectGovernanceState, ProviderId, InspectorEvent } from '../shared/types';
import { isMac, isWin } from './platform';
import { isTrackingHealthy } from '../shared/tracking-health';
import { createCliSurfaceRuntimeManager } from './cli-surface-runtime';
import { openUrlWithBrowserPolicy } from './browser-open-policy';
import { POLICY_RELATIVE_PATH, discoverProjectGovernance } from './calder-governance/discovery';
import { assertProjectGovernanceAllows } from './calder-governance/enforcement';
import { createAutoApprovalOrchestrator } from './calder-governance/auto-approval-orchestrator';
import { resolveAutoApprovalInput } from './calder-governance/auto-approval-dispatch';
import {
  GLOBAL_AUTO_APPROVAL_POLICY_PATH,
  resolveEffectiveAutoApprovalMode,
  setAutoApprovalModeInPolicyFile,
} from './calder-governance/auto-approval-policy';
import {
  buildMiniMaxToolCallRecoveryPrompt,
  shouldTriggerMiniMaxToolCallRecovery,
  type MiniMaxToolCallRecoveryState,
} from './minimax-toolcall-recovery';

/**
 * Check if a resolved path is within one of the known project directories.
 */
function isWithinKnownProject(resolvedPath: string): boolean {
  const state = loadState();
  return state.projects.some(p => resolvedPath.startsWith(p.path + path.sep) || resolvedPath === p.path);
}

function requireKnownProjectPath(projectPath: string, contextLabel: string): string {
  const resolvedPath = path.resolve(projectPath);
  if (!isWithinKnownProject(resolvedPath)) {
    throw new Error(`${contextLabel} requires a known project path`);
  }
  return resolvedPath;
}

function getActiveProjectPath(): string | undefined {
  const state = loadState();
  if (!state.activeProjectId) return undefined;
  return state.projects.find((candidate) => candidate.id === state.activeProjectId)?.path;
}

function isWithinPrefix(resolvedPath: string, prefix: string): boolean {
  return resolvedPath === prefix || resolvedPath.startsWith(prefix + path.sep);
}

/**
 * Check if a resolved path is allowed for reading:
 * within a known project directory OR a known config location.
 */
function isAllowedReadPath(resolvedPath: string): boolean {
  // Allow files within known project directories
  if (isWithinKnownProject(resolvedPath)) {
    return true;
  }

  // Allow known config files/directories used by supported CLIs
  const home = os.homedir();
  const allowedPaths = [
    path.join(home, '.claude.json'),
    path.join(home, '.mcp.json'),
    path.join(home, '.claude') + path.sep,
    path.join(home, '.codex') + path.sep,
    path.join(home, '.copilot') + path.sep,
    path.join(home, '.qwen') + path.sep,
    path.join(home, '.mmx') + path.sep,
    path.join(home, '.blackboxcli') + path.sep,
  ];

  if (isMac) {
    allowedPaths.push('/Library/Application Support/ClaudeCode/');
  } else if (isWin) {
    allowedPaths.push('C:\\Program Files\\ClaudeCode\\');
  } else {
    allowedPaths.push('/etc/claude-code/');
  }

  return allowedPaths.some(allowed => resolvedPath === allowed || resolvedPath.startsWith(allowed));
}

function isAllowedDirectoryLookupPath(resolvedPath: string): boolean {
  if (isAllowedReadPath(resolvedPath)) {
    return true;
  }

  const homePath = path.resolve(os.homedir());
  if (isWithinPrefix(resolvedPath, homePath)) {
    return true;
  }

  if (isMac) {
    return isWithinPrefix(resolvedPath, path.resolve('/Volumes'));
  }

  if (!isWin) {
    return isWithinPrefix(resolvedPath, path.resolve('/mnt')) || isWithinPrefix(resolvedPath, path.resolve('/media'));
  }

  return false;
}

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

const VALID_PROVIDER_IDS: ProviderId[] = [
  'claude',
  'codex',
  'copilot',
  'gemini',
  'qwen',
  'minimax',
  'blackbox',
];

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

function validateSessionRecordForSave(session: PersistedState['projects'][number]['sessions'][number]): void {
  assertStringField(session.id, 'session.id', MAX_IDENTIFIER_LENGTH);
  assertStringField(session.name, 'session.name', MAX_SESSION_NAME_LENGTH);
  if (!Number.isFinite(Date.parse(session.createdAt))) {
    throw new Error('Invalid state payload: session.createdAt must be a valid date');
  }
  if (session.type !== undefined && !VALID_SESSION_TYPES.has(session.type)) {
    throw new Error(`Invalid state payload: unsupported session.type "${session.type}"`);
  }
  if (session.providerId !== undefined && !isProviderId(session.providerId)) {
    throw new Error(`Invalid state payload: unsupported session.providerId "${session.providerId}"`);
  }
  if (session.args !== undefined) {
    assertStringField(session.args, 'session.args', MAX_SESSION_STRING_LENGTH, { allowEmpty: true });
  }
  if (session.diffFilePath !== undefined) {
    assertStringField(session.diffFilePath, 'session.diffFilePath', MAX_SESSION_STRING_LENGTH, { allowEmpty: true });
  }
  if (session.worktreePath !== undefined) {
    assertStringField(session.worktreePath, 'session.worktreePath', MAX_SESSION_STRING_LENGTH, { allowEmpty: true });
  }
  if (session.fileReaderPath !== undefined) {
    assertStringField(session.fileReaderPath, 'session.fileReaderPath', MAX_SESSION_STRING_LENGTH, { allowEmpty: true });
  }
  if (session.browserTabUrl !== undefined) {
    assertStringField(session.browserTabUrl, 'session.browserTabUrl', MAX_SESSION_STRING_LENGTH, { allowEmpty: true });
  }
  if (session.browserTargetSessionId !== undefined) {
    assertStringField(session.browserTargetSessionId, 'session.browserTargetSessionId', MAX_IDENTIFIER_LENGTH);
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
        throw new Error(`Invalid state payload: duplicate session.id detected in project "${project.id}"`);
      }
      sessionIds.add(session.id);
    }

    if (project.activeSessionId !== null) {
      assertStringField(project.activeSessionId, 'project.activeSessionId', MAX_IDENTIFIER_LENGTH);
      if (!sessionIds.has(project.activeSessionId)) {
        throw new Error(`Invalid state payload: activeSessionId is missing in project "${project.id}"`);
      }
    }

    for (const session of project.sessions) {
      if (session.browserTargetSessionId && !sessionIds.has(session.browserTargetSessionId)) {
        throw new Error(`Invalid state payload: browserTargetSessionId is missing in project "${project.id}"`);
      }
    }
  }

  if (state.activeProjectId !== null) {
    assertStringField(state.activeProjectId, 'state.activeProjectId', MAX_IDENTIFIER_LENGTH);
    if (!projectIds.has(state.activeProjectId)) {
      throw new Error('Invalid state payload: activeProjectId does not match any project');
    }
  }

  if (state.preferences.defaultProvider !== undefined && !isProviderId(state.preferences.defaultProvider)) {
    throw new Error(`Invalid state payload: unsupported preferences.defaultProvider "${state.preferences.defaultProvider}"`);
  }
}

function isValidSessionRecordShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isString(value.id)
    && isString(value.name)
    && isNullableString(value.cliSessionId)
    && isString(value.createdAt);
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
  return isBoolean(value.soundOnSessionWaiting)
    && isBoolean(value.notificationsDesktop)
    && isBoolean(value.debugMode)
    && isBoolean(value.sessionHistoryEnabled)
    && isBoolean(value.insightsEnabled)
    && isBoolean(value.autoTitleEnabled);
}

function sanitizePersistedStateForSave(state: unknown): PersistedState {
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

function isAutoApprovalMode(value: unknown): value is AutoApprovalMode {
  return value === 'off'
    || value === 'edit_only'
    || value === 'edit_plus_safe_tools'
    || value === 'full_auto'
    || value === 'full_auto_unsafe';
}

function updateAutoApprovalMode(projectPath: string, scope: 'global' | 'project', mode: AutoApprovalMode | null): void {
  const targetPath = scope === 'global'
    ? GLOBAL_AUTO_APPROVAL_POLICY_PATH
    : path.join(projectPath, POLICY_RELATIVE_PATH);
  setAutoApprovalModeInPolicyFile(targetPath, mode);
}

const PLAYWRIGHT_NAVIGATE_TOOL = 'mcp__plugin_playwright_playwright__browser_navigate';
const PLAYWRIGHT_MIRROR_COOLDOWN_MS = 1_500;
const PLAYWRIGHT_TRANSCRIPT_BUFFER_MAX_CHARS = 8_192;

interface PlaywrightMirrorState {
  lastUrl: string;
  lastMirroredAtMs: number;
}

interface PlaywrightMirrorTarget {
  url: string;
  cwd: string;
  sessionId: string;
}

const AUTO_APPROVAL_AUDIT_EXTENSION = '.auto_approval.log';

function appendAutoApprovalAudit(sessionId: string, events: InspectorEvent[]): void {
  if (!events.length) return;
  const auditEvents = events.filter((event) =>
    event.type === 'approval_decision' && event.auto_approval !== undefined
  );
  if (!auditEvents.length) return;

  const runtimeDir = path.join(os.homedir(), '.calder', 'runtime');
  const auditPath = path.join(runtimeDir, `${sessionId}${AUTO_APPROVAL_AUDIT_EXTENSION}`);

  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    const lines = auditEvents.map((event) => JSON.stringify({
      emittedAt: new Date().toISOString(),
      event,
    }));
    fs.appendFileSync(auditPath, `${lines.join('\n')}\n`, 'utf8');
  } catch (error) {
    console.warn('Failed to append auto-approval audit log:', error);
  }
}

function isPlaywrightNavigateToolName(toolName: string | undefined): boolean {
  if (!toolName) return false;
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === PLAYWRIGHT_NAVIGATE_TOOL) return true;
  if (normalized.includes('playwright') && normalized.endsWith('__browser_navigate')) return true;

  // Some providers/tooling surfaces use human-readable tool names instead of
  // canonical MCP IDs (for example: "plugin:playwright:playwright - Navigate to a URL").
  const isPlaywrightTool = normalized.includes('playwright');
  if (!isPlaywrightTool) return false;
  if (/(^|[^a-z0-9])browser_navigate([^a-z0-9]|$)/.test(normalized)) return true;
  if (normalized.includes('navigate to a url')) return true;
  return /(?:^|[^a-z0-9])navigate([^a-z0-9]|$)/.test(normalized);
}

function extractPlaywrightNavigateUrl(toolInput: InspectorEvent['tool_input']): string | null {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const urlCandidate = (toolInput as Record<string, unknown>).url;
  return normalizePlaywrightNavigateUrl(typeof urlCandidate === 'string' ? urlCandidate : null);
}

function extractPlaywrightNavigateCwd(cwd: InspectorEvent['cwd']): string | null {
  if (typeof cwd !== 'string') return null;
  const normalized = cwd.trim();
  return normalized ? normalized : null;
}

function normalizePlaywrightNavigateUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function shouldMirrorPlaywrightNavigateUrl(
  sessionId: string,
  url: string,
  stateBySession: Map<string, PlaywrightMirrorState>,
  nowMs = Date.now(),
): boolean {
  const previous = stateBySession.get(sessionId);
  if (previous && previous.lastUrl === url && nowMs - previous.lastMirroredAtMs < PLAYWRIGHT_MIRROR_COOLDOWN_MS) {
    return false;
  }
  stateBySession.set(sessionId, { lastUrl: url, lastMirroredAtMs: nowMs });
  return true;
}

function shouldMirrorPlaywrightNavigate(
  sessionId: string,
  event: InspectorEvent,
  stateBySession: Map<string, PlaywrightMirrorState>,
  nowMs = Date.now(),
): PlaywrightMirrorTarget | null {
  if (event.type !== 'tool_use') return null;
  if (!isPlaywrightNavigateToolName(event.tool_name)) return null;
  const url = extractPlaywrightNavigateUrl(event.tool_input);
  const cwd = extractPlaywrightNavigateCwd(event.cwd);
  if (!cwd) return null;
  if (!url) return null;
  if (!shouldMirrorPlaywrightNavigateUrl(sessionId, url, stateBySession, nowMs)) return null;
  return { url, cwd, sessionId };
}

function extractPlaywrightNavigateUrlsFromTerminalChunk(text: string): string[] {
  if (!text) return [];
  const matches: string[] = [];
  const patterns = [
    /plugin:playwright:playwright[^\n\r]{0,160}navigate to a url[\s\S]{0,360}?\(mcp\)\(url:\s*"([^"\n\r]+)"/gi,
    /playwright:[^\n\r]{0,160}browser_navigate[^\n\r]*[\s\S]{0,360}?\(mcp\)\(url:\s*"([^"\n\r]+)"/gi,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let result: RegExpExecArray | null;
    while ((result = pattern.exec(text)) !== null) {
      const normalized = normalizePlaywrightNavigateUrl(result[1]);
      if (normalized) {
        matches.push(normalized);
      }
    }
  }
  return Array.from(new Set(matches));
}

/** @internal test-only */
export function _extractPlaywrightNavigateUrlForTesting(toolInput: InspectorEvent['tool_input']): string | null {
  return extractPlaywrightNavigateUrl(toolInput);
}

/** @internal test-only */
export function _extractPlaywrightNavigateCwdForTesting(cwd: InspectorEvent['cwd']): string | null {
  return extractPlaywrightNavigateCwd(cwd);
}

/** @internal test-only */
export function _extractPlaywrightNavigateUrlsFromTerminalChunkForTesting(text: string): string[] {
  return extractPlaywrightNavigateUrlsFromTerminalChunk(text);
}

/** @internal test-only */
export function _shouldMirrorPlaywrightNavigateForTesting(
  sessionId: string,
  event: InspectorEvent,
  stateBySession: Map<string, PlaywrightMirrorState>,
  nowMs = Date.now(),
): PlaywrightMirrorTarget | null {
  return shouldMirrorPlaywrightNavigate(sessionId, event, stateBySession, nowMs);
}

/** @internal test-only */
export function _sanitizePersistedStateForSaveForTesting(state: unknown): PersistedState {
  return sanitizePersistedStateForSave(state);
}

/** @internal test-only */
export function _isAllowedGuestMessagePayloadForTesting(channel: string, args: unknown[]): boolean {
  return isAllowedGuestMessagePayload(channel, args);
}

async function applySessionOverrideToGovernanceState(
  state: ProjectGovernanceState,
  sessionMode: AutoApprovalMode | undefined,
): Promise<ProjectGovernanceState> {
  if (!state.autoApproval || sessionMode === undefined) return state;

  const resolved = resolveEffectiveAutoApprovalMode({
    globalMode: state.autoApproval.globalMode,
    hasGlobalMode: true,
    projectMode: state.autoApproval.projectMode,
    hasProjectMode: state.autoApproval.projectMode !== undefined,
    sessionMode,
    hasSessionMode: true,
  });

  return {
    ...state,
    autoApproval: {
      ...state.autoApproval,
      sessionMode,
      effectiveMode: resolved.effectiveMode,
      policySource: resolved.policySource,
    },
  };
}

let hookWatcherStarted = false;
const miniMaxToolCallRecoveryBySession = new Map<string, MiniMaxToolCallRecoveryState>();
const MINIMAX_TOOLCALL_RECOVERY_COOLDOWN_MS = 45_000;
const playwrightMirrorBySession = new Map<string, PlaywrightMirrorState>();
const playwrightTranscriptBufferBySession = new Map<string, string>();

const cliSurfaceRuntime = createCliSurfaceRuntimeManager({
  data: (projectId, data) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:data', projectId, data),
  exit: (projectId, exitCode, signal) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:exit', projectId, exitCode, signal),
  status: (projectId, state) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:status', projectId, state),
  error: (projectId, message) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:error', projectId, message),
});

export function resetHookWatcher(): void {
  hookWatcherStarted = false;
  stopHookWatching();
  stopCodexSessionWatcher();
  stopBlackboxSessionWatcher();
  resetCalderProjectWatchers();
  miniMaxToolCallRecoveryBySession.clear();
  playwrightMirrorBySession.clear();
  playwrightTranscriptBufferBySession.clear();
}

export function registerIpcHandlers(): void {
  const autoApprovalOrchestrator = createAutoApprovalOrchestrator({
    sendApproval: (sessionId, providerId) => {
      const approvalInput = resolveAutoApprovalInput(providerId);
      const sent = writePty(sessionId, approvalInput);
      if (!sent) {
        throw new Error(`Failed to write approval input: missing PTY session (${sessionId}).`);
      }
    },
    emitInspectorEvents: (sessionId, events) => {
      appendAutoApprovalAudit(sessionId, events);
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('session:inspectorEvents', sessionId, events);
      }
    },
  });

  setInspectorEventsMiddleware((sessionId, events) => {
    void autoApprovalOrchestrator.handleInspectorEvents(sessionId, events).catch((error) => {
      console.warn('Auto-approval orchestrator failed:', error);
    });
    let finalEvents = events;
    for (const event of events) {
      const now = Date.now();

      const mirroredTarget = shouldMirrorPlaywrightNavigate(sessionId, event, playwrightMirrorBySession, now);
      if (mirroredTarget) {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          void openUrlWithBrowserPolicy(
            {
              url: mirroredTarget.url,
              cwd: mirroredTarget.cwd,
              sessionId: mirroredTarget.sessionId,
              preferEmbedded: true,
            },
            win,
            (target) => shell.openExternal(target),
          ).catch((error) => {
            console.warn('Playwright mirror open failed:', error);
          });
        }
        finalEvents = [
          ...finalEvents,
          {
            type: 'status_update',
            timestamp: now,
            hookEvent: 'PlaywrightMirror',
            message: `Mirrored Playwright navigate to Calder browser: ${mirroredTarget.url}`,
          },
        ];
      }

      if (event.type !== 'stop') continue;
      const lastMessage = typeof event.last_assistant_message === 'string'
        ? event.last_assistant_message
        : '';
      const previousState = miniMaxToolCallRecoveryBySession.get(sessionId);
      if (!shouldTriggerMiniMaxToolCallRecovery(lastMessage, previousState, now, MINIMAX_TOOLCALL_RECOVERY_COOLDOWN_MS)) {
        continue;
      }

      const normalizedMessage = lastMessage.trim();
      miniMaxToolCallRecoveryBySession.set(sessionId, {
        lastTriggeredAt: now,
        lastMessage: normalizedMessage,
        attempts: (previousState?.attempts ?? 0) + 1,
      });

      try {
        writePty(sessionId, `${buildMiniMaxToolCallRecoveryPrompt()}\n`);
      } catch (error) {
        console.warn('MiniMax tool-call recovery dispatch failed:', error);
      }

      finalEvents = [
        ...finalEvents,
        {
          type: 'status_update',
          timestamp: now,
          hookEvent: 'MiniMaxToolCallRecovery',
          message: 'MiniMax pseudo tool-call markup detected; recovery prompt was sent automatically.',
        },
      ];
    }
    return finalEvents;
  });
  const getGovernanceState = async (projectPath: string, sessionId?: string): Promise<ProjectGovernanceState> => {
    const baseState = await discoverProjectGovernance(projectPath);
    const sessionMode = sessionId ? autoApprovalOrchestrator.getSessionOverride(sessionId) : undefined;
    return applySessionOverrideToGovernanceState(baseState, sessionMode);
  };

  const mirrorPlaywrightFromPtyData = (sessionId: string, cwd: string, chunk: string): void => {
    if (!chunk || chunk.length === 0) return;
    const previous = playwrightTranscriptBufferBySession.get(sessionId) ?? '';
    const combined = `${previous}${chunk}`;
    const buffer = combined.length > PLAYWRIGHT_TRANSCRIPT_BUFFER_MAX_CHARS
      ? combined.slice(-PLAYWRIGHT_TRANSCRIPT_BUFFER_MAX_CHARS)
      : combined;
    playwrightTranscriptBufferBySession.set(sessionId, buffer);

    const urls = extractPlaywrightNavigateUrlsFromTerminalChunk(buffer);
    if (urls.length === 0) return;

    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return;

    for (const url of urls) {
      const now = Date.now();
      if (!shouldMirrorPlaywrightNavigateUrl(sessionId, url, playwrightMirrorBySession, now)) {
        continue;
      }

      void openUrlWithBrowserPolicy(
        { url, cwd, sessionId, preferEmbedded: true },
        win,
        (target) => shell.openExternal(target),
      ).catch((error) => {
        console.warn('Playwright transcript mirror open failed:', error);
      });

      win.webContents.send('session:inspectorEvents', sessionId, [{
        type: 'status_update',
        timestamp: now,
        hookEvent: 'PlaywrightMirror',
        message: `Mirrored Playwright navigate from terminal output: ${url}`,
      } satisfies InspectorEvent]);
    }
  };

  ipcMain.handle('pty:create', (_event, sessionId: string, cwd: string, cliSessionId: string | null, isResume: boolean, extraArgs: string, providerId: ProviderId = 'claude', initialPrompt?: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const resolvedCwd = path.resolve(cwd);
    if (!isWithinKnownProject(resolvedCwd)) {
      throw new Error('PTY create requires a known project path');
    }

    // Start hook status watcher on first PTY creation (window is guaranteed to exist)
    if (!hookWatcherStarted) {
      startWatching(win);
      hookWatcherStarted = true;
    }
    autoApprovalOrchestrator.registerSession(sessionId, providerId, resolvedCwd);

    // Validate provider settings and warn renderer if missing/tampered
    const provider = getProvider(providerId);
    if (provider.meta.capabilities.hookStatus) {
      let validation = provider.validateSettings();
      if (!isTrackingHealthy(provider.meta, validation)) {
        try {
          provider.reinstallSettings();
          validation = provider.validateSettings();
        } catch (error) {
          console.warn('Auto-heal settings reinstall failed:', error);
        }
      }
      if (!isTrackingHealthy(provider.meta, validation)) {
        win.webContents.send('settings:warning', {
          sessionId,
          providerId,
          statusLine: validation.statusLine,
          hooks: validation.hooks,
        });
      }
    }

    // For Codex sessions without a cliSessionId, start watching history.jsonl
    if (providerId === 'codex' && !cliSessionId) {
      startCodexSessionWatcher(win);
      registerPendingCodexSession(sessionId);
    }

    if (providerId === 'blackbox' && !cliSessionId) {
      startBlackboxSessionWatcher(win);
      registerPendingBlackboxSession(sessionId);
    }

    spawnPty(
      sessionId,
      resolvedCwd,
      cliSessionId,
      isResume,
      extraArgs,
      providerId,
      initialPrompt,
      (data) => {
        mirrorPlaywrightFromPtyData(sessionId, resolvedCwd, data);
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:data', sessionId, data);
        }
      },
      (exitCode, signal) => {
        cleanupSessionStatus(sessionId);
        unregisterCodexSession(sessionId);
        unregisterBlackboxSession(sessionId);
        autoApprovalOrchestrator.unregisterSession(sessionId);
        miniMaxToolCallRecoveryBySession.delete(sessionId);
        playwrightMirrorBySession.delete(sessionId);
        playwrightTranscriptBufferBySession.delete(sessionId);
        if (isSilencedExit(sessionId)) return; // old PTY killed for re-spawn
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:exit', sessionId, exitCode, signal);
        }
      }
    );
  });

  ipcMain.handle('pty:createShell', (_event, sessionId: string, cwd: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const resolvedCwd = path.resolve(cwd);
    if (!isWithinKnownProject(resolvedCwd)) {
      throw new Error('PTY shell requires a known project path');
    }

    spawnShellPty(
      sessionId,
      resolvedCwd,
      (data) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:data', sessionId, data);
        }
      },
      (exitCode, signal) => {
        const w = BrowserWindow.getAllWindows()[0];
        if (w && !w.isDestroyed()) {
          w.webContents.send('pty:exit', sessionId, exitCode, signal);
        }
      }
    );
  });

  ipcMain.on('pty:write', (_event, sessionId: string, data: string) => {
    writePty(sessionId, data);
  });

  ipcMain.on('pty:resize', (_event, sessionId: string, cols: number, rows: number) => {
    resizePty(sessionId, cols, rows);
  });

  ipcMain.handle('pty:kill', (_event, sessionId: string) => {
    autoApprovalOrchestrator.unregisterSession(sessionId);
    killPty(sessionId);
  });

  registerCliSurfaceIpcHandlers(cliSurfaceRuntime);

  registerFsStoreIpcHandlers({
    isAllowedDirectoryLookupPath,
    isAllowedReadPath,
    isWithinKnownProject,
    sanitizePersistedStateForSave,
  });
  registerMaintenanceIpcHandlers();
  registerMcpGovernanceIpcHandlers({
    requireKnownProjectPath,
    assertProjectGovernanceAllows: (projectPath, operation) => assertProjectGovernanceAllows(projectPath, operation),
  });
  registerGitIpcHandlers({
    assertProjectGovernanceAllows: (projectPath, operation) => assertProjectGovernanceAllows(projectPath, operation),
  });
  registerProviderIpcHandlers();
  registerProviderUpdateIpcHandlers();
  registerMobileIpcHandlers();

  ipcMain.handle('menu:rebuild', (_event, debugMode: boolean) => {
    createAppMenu(debugMode);
  });

  registerCalderIpcHandlers({
    assertProjectGovernanceAllows: (projectPath, operation) => assertProjectGovernanceAllows(projectPath, operation),
    getGovernanceState,
    isAutoApprovalMode,
    updateAutoApprovalMode,
    setSessionAutoApprovalOverride: (sessionId, mode) => autoApprovalOrchestrator.setSessionOverride(sessionId, mode),
  });
  registerAppBrowserIpcHandlers({
    requireKnownProjectPath,
    getActiveProjectPath,
    assertProjectGovernanceAllows: (projectPath, operation) => assertProjectGovernanceAllows(projectPath, operation),
  });

  registerMcpHandlers();
}
