import { ipcMain, BrowserWindow, app, dialog, shell, webContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnPty, spawnShellPty, writePty, resizePty, killPty, isSilencedExit, getPtyCwd } from './pty-manager';
import { loadState, PersistedState } from './store';
import { startWatching, cleanupSessionStatus, setInspectorEventsMiddleware, stopWatching as stopHookWatching } from './hook-status';
import { startCodexSessionWatcher, registerPendingCodexSession, unregisterCodexSession, stopCodexSessionWatcher } from './codex-session-watcher';
import { startBlackboxSessionWatcher, registerPendingBlackboxSession, unregisterBlackboxSession, stopBlackboxSessionWatcher } from './blackbox-session-watcher';
import { getGitStatus, getGitFiles, getGitDiff, getGitWorktrees, gitStageFile, gitUnstageFile, gitDiscardFile, getGitRemoteUrl, listGitBranches, checkoutGitBranch, createGitBranch } from './git-status';
import { startGitWatcher, notifyGitChanged } from './git-watcher';
import { registerMcpHandlers } from './mcp-ipc-handlers';
import { registerFsStoreIpcHandlers } from './ipc-fs-store';
import { registerMaintenanceIpcHandlers } from './ipc-maintenance';
import { registerMcpGovernanceIpcHandlers } from './ipc-mcp-governance';
import { createAppMenu } from './menu';
import { getProvider, getProviderMeta, getAllProviderMetas } from './providers/registry';
import { buildHandoffPrompt } from './providers/resume-handoff';
import { updateAllProviders } from './provider-updater';
import { checkMobileDependencies, installMobileDependency } from './mobile-dependency-doctor';
import { launchMobileInspectSurface, captureMobileInspectScreenshot, inspectMobilePoint, interactMobileInspectPoint } from './mobile-inspector';
import type { AutoApprovalMode, ProjectGovernanceState, ProviderId, GitFileEntry, ProviderUpdateSummary, MobileDependencyId, BrowserCredentialSaveInput, MobileDependencyInstallProgressEvent, ShareConnectionDescription, MobileInspectPlatform, InspectorEvent } from '../shared/types';
import { isMac, isWin } from './platform';
import { discoverLocalBrowserTargets } from './local-dev-targets';
import {
  deleteBrowserCredentialById,
  getBrowserAutoFillCredentialForUrl,
  getBrowserCredentialForFill,
  listBrowserCredentialSummariesForUrl,
  saveBrowserCredentialForUrl,
} from './browser-credential-vault';
import { isTrackingHealthy } from '../shared/tracking-health';
import { createCliSurfaceRuntimeManager } from './cli-surface-runtime';
import { discoverCliSurface } from './cli-surface-discovery';
import { openUrlWithBrowserPolicy } from './browser-open-policy';
import { resolveShareRtcConfigFromEnv } from './share-rtc-config';
import {
  createMobileControlPairing,
  consumeMobileControlPairingAnswer,
  revokeMobileControlPairing,
} from './mobile-control-bridge';
import { discoverProjectContext } from './calder-context/discovery';
import {
  createProjectContextStarterFiles,
  createProjectContextRuleFile,
  deleteProjectContextRuleFile,
  renameProjectContextRuleFile,
} from './calder-context/scaffold';
import { startProjectContextWatcher, stopProjectContextWatcher } from './calder-context/watcher';
import { discoverProjectWorkflows } from './calder-workflows/discovery';
import {
  createProjectWorkflowFile,
  createProjectWorkflowStarterFiles,
} from './calder-workflows/scaffold';
import { readProjectWorkflowFile } from './calder-workflows/read';
import { startProjectWorkflowWatcher, stopProjectWorkflowWatcher } from './calder-workflows/watcher';
import { discoverProjectTeamContext } from './calder-team-context/discovery';
import {
  createProjectTeamContextSpaceFile,
  createProjectTeamContextStarterFiles,
} from './calder-team-context/scaffold';
import { startProjectTeamContextWatcher } from './calder-team-context/watcher';
import { discoverProjectReviews } from './calder-reviews/discovery';
import { createProjectReviewFile } from './calder-reviews/scaffold';
import { readProjectReviewFile } from './calder-reviews/read';
import { startProjectReviewWatcher, stopProjectReviewWatcher } from './calder-reviews/watcher';
import { POLICY_RELATIVE_PATH, discoverProjectGovernance } from './calder-governance/discovery';
import { createProjectGovernanceStarterPolicy } from './calder-governance/scaffold';
import { startProjectGovernanceWatcher, stopProjectGovernanceWatcher } from './calder-governance/watcher';
import { assertProjectGovernanceAllows } from './calder-governance/enforcement';
import { createAutoApprovalOrchestrator } from './calder-governance/auto-approval-orchestrator';
import { resolveAutoApprovalInput } from './calder-governance/auto-approval-dispatch';
import {
  GLOBAL_AUTO_APPROVAL_POLICY_PATH,
  resolveEffectiveAutoApprovalMode,
  setAutoApprovalModeInPolicyFile,
} from './calder-governance/auto-approval-policy';
import { discoverProjectBackgroundTasks } from './calder-tasks/discovery';
import { createProjectBackgroundTaskFile } from './calder-tasks/scaffold';
import { readProjectBackgroundTaskFile } from './calder-tasks/read';
import { startProjectBackgroundTaskWatcher, stopProjectBackgroundTaskWatcher } from './calder-tasks/watcher';
import { discoverProjectCheckpoints } from './calder-checkpoints/discovery';
import { createProjectCheckpointFile, readProjectCheckpointFile } from './calder-checkpoints/scaffold';
import { startProjectCheckpointWatcher, stopProjectCheckpointWatcher } from './calder-checkpoints/watcher';
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
const ALLOWED_GUEST_MESSAGE_CHANNELS = new Set([
  'enter-inspect-mode',
  'exit-inspect-mode',
  'enter-flow-mode',
  'exit-flow-mode',
  'enter-draw-mode',
  'exit-draw-mode',
  'draw-clear',
  'flow-do-click',
  'auth-fill-credentials',
]);
const GUEST_CHANNELS_WITHOUT_ARGS = new Set([
  'enter-inspect-mode',
  'exit-inspect-mode',
  'enter-flow-mode',
  'exit-flow-mode',
  'enter-draw-mode',
  'exit-draw-mode',
  'draw-clear',
]);
const MAX_GUEST_MESSAGE_BYTES = 1 * 1024 * 1024;
const MAX_GUEST_CREDENTIAL_FIELD_BYTES = 8 * 1024;

function isSerializedSizeWithinLimit(value: unknown, maxBytes: number): boolean {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') return false;
    return Buffer.byteLength(serialized, 'utf8') <= maxBytes;
  } catch {
    return false;
  }
}

function isValidAuthFillPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false;

  const username = payload.username;
  const password = payload.password;
  if (username !== undefined && !isString(username)) return false;
  if (password !== undefined && !isString(password)) return false;
  if (isString(username) && Buffer.byteLength(username, 'utf8') > MAX_GUEST_CREDENTIAL_FIELD_BYTES) return false;
  if (isString(password) && Buffer.byteLength(password, 'utf8') > MAX_GUEST_CREDENTIAL_FIELD_BYTES) return false;

  return true;
}

function isAllowedGuestMessagePayload(channel: string, args: unknown[]): boolean {
  if (!isSerializedSizeWithinLimit(args, MAX_GUEST_MESSAGE_BYTES)) {
    return false;
  }

  if (GUEST_CHANNELS_WITHOUT_ARGS.has(channel)) {
    return args.length === 0;
  }

  if (channel === 'flow-do-click') {
    if (args.length !== 1) return false;
    const payload = args[0];
    if (!(isRecord(payload) || isString(payload) || Array.isArray(payload))) {
      return false;
    }
    return isSerializedSizeWithinLimit(payload, MAX_GUEST_MESSAGE_BYTES);
  }

  if (channel === 'auth-fill-credentials') {
    return args.length === 1 && isValidAuthFillPayload(args[0]);
  }

  return false;
}

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
let providerUpdateAbortController: AbortController | null = null;
let providerUpdateInFlight: Promise<ProviderUpdateSummary> | null = null;
const miniMaxToolCallRecoveryBySession = new Map<string, MiniMaxToolCallRecoveryState>();
const MINIMAX_TOOLCALL_RECOVERY_COOLDOWN_MS = 45_000;
const playwrightMirrorBySession = new Map<string, PlaywrightMirrorState>();
const playwrightTranscriptBufferBySession = new Map<string, string>();

interface ProjectWatchBinding {
  projectPath: string;
  dispose: () => void;
  win: BrowserWindow;
  onWindowClosed: () => void;
}

const projectContextBindings = new Map<number, ProjectWatchBinding>();
const projectWorkflowBindings = new Map<number, ProjectWatchBinding>();
const projectTeamContextBindings = new Map<number, ProjectWatchBinding>();
const projectReviewBindings = new Map<number, ProjectWatchBinding>();
const projectGovernanceBindings = new Map<number, ProjectWatchBinding>();
const projectTaskBindings = new Map<number, ProjectWatchBinding>();
const projectCheckpointBindings = new Map<number, ProjectWatchBinding>();

function removeWindowClosedListener(win: BrowserWindow, listener: () => void): void {
  if (typeof win.off === 'function') {
    win.off('closed', listener);
    return;
  }
  win.removeListener('closed', listener);
}

function clearProjectBindings(bindings: Map<number, ProjectWatchBinding>): void {
  for (const binding of bindings.values()) {
    removeWindowClosedListener(binding.win, binding.onWindowClosed);
    binding.dispose();
  }
  bindings.clear();
}

function bindProjectWatcher<State>(
  bindings: Map<number, ProjectWatchBinding>,
  win: BrowserWindow,
  projectPath: string,
  start: (projectPath: string, onChange: (state: State) => void) => () => void,
  channel: string,
): void {
  const windowId = win.id;
  const existing = bindings.get(windowId);
  if (existing?.projectPath === projectPath) return;
  if (existing) {
    removeWindowClosedListener(existing.win, existing.onWindowClosed);
    existing.dispose();
    bindings.delete(windowId);
  }

  const dispose = start(projectPath, (state) => {
    const targetWindow = BrowserWindow.fromId(windowId);
    if (!targetWindow || targetWindow.isDestroyed()) return;
    targetWindow.webContents.send(channel, projectPath, state);
  });

  const onWindowClosed = () => {
    const current = bindings.get(windowId);
    if (!current || current.dispose !== dispose) return;
    current.dispose();
    bindings.delete(windowId);
  };
  bindings.set(windowId, { projectPath, dispose, win, onWindowClosed });
  win.once('closed', onWindowClosed);
}

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
  stopProjectContextWatcher();
  stopProjectWorkflowWatcher();
  stopProjectReviewWatcher();
  stopProjectGovernanceWatcher();
  stopProjectBackgroundTaskWatcher();
  stopProjectCheckpointWatcher();

  clearProjectBindings(projectContextBindings);
  clearProjectBindings(projectWorkflowBindings);
  clearProjectBindings(projectTeamContextBindings);
  clearProjectBindings(projectReviewBindings);
  clearProjectBindings(projectGovernanceBindings);
  clearProjectBindings(projectTaskBindings);
  clearProjectBindings(projectCheckpointBindings);
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

  ipcMain.handle('cli-surface:start', async (_event, projectId: string, profile) => {
    await cliSurfaceRuntime.start(projectId, profile);
  });

  ipcMain.handle('cli-surface:discover', (_event, projectPath: string) => {
    return discoverCliSurface(projectPath);
  });

  ipcMain.handle('cli-surface:stop', (_event, projectId: string) => {
    cliSurfaceRuntime.stop(projectId);
  });

  ipcMain.handle('cli-surface:restart', async (_event, projectId: string) => {
    await cliSurfaceRuntime.restart(projectId);
  });

  ipcMain.on('cli-surface:write', (_event, projectId: string, data: string) => {
    cliSurfaceRuntime.write(projectId, data);
  });

  ipcMain.on('cli-surface:resize', (_event, projectId: string, cols: number, rows: number) => {
    cliSurfaceRuntime.resize(projectId, cols, rows);
  });

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

  ipcMain.handle('menu:rebuild', (_event, debugMode: boolean) => {
    createAppMenu(debugMode);
  });

  ipcMain.handle('provider:getConfig', async (_event, providerId: ProviderId, projectPath: string) => {
    const provider = getProvider(providerId);
    return provider.getConfig(projectPath);
  });

  // Backward compatibility alias
  ipcMain.handle('claude:getConfig', async (_event, projectPath: string) => {
    const provider = getProvider('claude');
    return provider.getConfig(projectPath);
  });

  ipcMain.on('config:watchProject', (_event, providerId: ProviderId, projectPath: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const provider = getProvider(providerId);
    provider.startConfigWatcher?.(win, projectPath);
  });

  ipcMain.handle('context:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectContext(projectPath);
  });

  ipcMain.handle('context:createStarterFiles', async (_event, projectPath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create context starter files' });
    return createProjectContextStarterFiles(projectPath);
  });

  ipcMain.handle('context:createSharedRule', async (_event, projectPath: string, title: string, priority: 'hard' | 'soft') => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create shared context rule' });
    return createProjectContextRuleFile(projectPath, title, priority);
  });

  ipcMain.handle('context:renameSharedRule', async (_event, projectPath: string, relativePath: string, title: string, priority: 'hard' | 'soft') => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Rename shared context rule' });
    return renameProjectContextRuleFile(projectPath, relativePath, title, priority);
  });

  ipcMain.handle('context:deleteSharedRule', async (_event, projectPath: string, relativePath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Delete shared context rule' });
    return deleteProjectContextRuleFile(projectPath, relativePath);
  });

  ipcMain.handle('workflow:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectWorkflows(projectPath);
  });

  ipcMain.handle('workflow:createStarterFiles', async (_event, projectPath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create workflow starter files' });
    return createProjectWorkflowStarterFiles(projectPath);
  });

  ipcMain.handle('workflow:createFile', async (_event, projectPath: string, title: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create workflow file' });
    return createProjectWorkflowFile(projectPath, title);
  });

  ipcMain.handle('workflow:readFile', async (_event, projectPath: string, workflowPath: string) => {
    return readProjectWorkflowFile(projectPath, workflowPath);
  });

  ipcMain.handle('teamContext:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectTeamContext(projectPath);
  });

  ipcMain.handle('teamContext:createStarterFiles', async (_event, projectPath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create team context starter spaces' });
    return createProjectTeamContextStarterFiles(projectPath);
  });

  ipcMain.handle('teamContext:createSpace', async (_event, projectPath: string, title: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create team context space' });
    return createProjectTeamContextSpaceFile(projectPath, title);
  });

  ipcMain.handle('review:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectReviews(projectPath);
  });

  ipcMain.handle('review:createFile', async (_event, projectPath: string, title: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create review findings file' });
    return createProjectReviewFile(projectPath, title);
  });

  ipcMain.handle('review:readFile', async (_event, projectPath: string, reviewPath: string) => {
    return readProjectReviewFile(projectPath, reviewPath);
  });

  ipcMain.handle('governance:getProjectState', async (_event, projectPath: string, sessionId?: string) => {
    return getGovernanceState(projectPath, sessionId);
  });

  ipcMain.handle('governance:createStarterPolicy', async (_event, projectPath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create governance starter policy' });
    return createProjectGovernanceStarterPolicy(projectPath);
  });

  ipcMain.handle(
    'governance:setAutoApprovalMode',
    async (
      _event,
      projectPath: string,
      scope: 'global' | 'project',
      mode: AutoApprovalMode | null,
      sessionId?: string,
    ) => {
      const validGlobalPayload = scope === 'global' && isAutoApprovalMode(mode);
      const validProjectPayload = scope === 'project' && (mode === null || isAutoApprovalMode(mode));
      if (!validGlobalPayload && !validProjectPayload) {
        throw new Error('Invalid auto-approval update payload.');
      }
      updateAutoApprovalMode(projectPath, scope, mode);
      return getGovernanceState(projectPath, sessionId);
    },
  );

  ipcMain.handle(
    'governance:setSessionAutoApprovalOverride',
    async (_event, sessionId: string, mode: AutoApprovalMode | null) => {
      if (mode !== null && !isAutoApprovalMode(mode)) {
        throw new Error('Invalid session auto-approval override mode.');
      }
      autoApprovalOrchestrator.setSessionOverride(sessionId, mode);
      return { ok: true };
    },
  );

  ipcMain.handle('task:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectBackgroundTasks(projectPath);
  });

  ipcMain.handle('task:create', async (_event, projectPath: string, title: string, prompt: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create background task' });
    return createProjectBackgroundTaskFile(projectPath, title, prompt);
  });

  ipcMain.handle('task:read', async (_event, projectPath: string, taskPath: string) => {
    return readProjectBackgroundTaskFile(projectPath, taskPath);
  });

  ipcMain.handle('checkpoint:getProjectState', async (_event, projectPath: string) => {
    return discoverProjectCheckpoints(projectPath);
  });

  ipcMain.handle('checkpoint:create', async (_event, projectPath: string, snapshot) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create checkpoint' });
    return createProjectCheckpointFile(projectPath, snapshot);
  });

  ipcMain.handle('checkpoint:read', async (_event, projectPath: string, checkpointPath: string) => {
    return readProjectCheckpointFile(projectPath, checkpointPath);
  });

  ipcMain.on('context:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectContextBindings, win, projectPath, startProjectContextWatcher, 'context:changed');
  });

  ipcMain.on('workflow:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectWorkflowBindings, win, projectPath, startProjectWorkflowWatcher, 'workflow:changed');
  });

  ipcMain.on('teamContext:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectTeamContextBindings, win, projectPath, startProjectTeamContextWatcher, 'teamContext:changed');
  });

  ipcMain.on('review:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectReviewBindings, win, projectPath, startProjectReviewWatcher, 'review:changed');
  });

  ipcMain.on('governance:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectGovernanceBindings, win, projectPath, startProjectGovernanceWatcher, 'governance:changed');
  });

  ipcMain.on('task:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectTaskBindings, win, projectPath, startProjectBackgroundTaskWatcher, 'task:changed');
  });

  ipcMain.on('checkpoint:watchProject', (event, projectPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    bindProjectWatcher(projectCheckpointBindings, win, projectPath, startProjectCheckpointWatcher, 'checkpoint:changed');
  });

  ipcMain.handle('provider:getMeta', (_event, providerId: ProviderId) => {
    return getProviderMeta(providerId);
  });

  ipcMain.handle('provider:listProviders', () => {
    return getAllProviderMetas();
  });

  ipcMain.handle('session:buildResumeWithPrompt', async (
    _event,
    sourceProviderId: ProviderId,
    sourceCliSessionId: string | null,
    projectPath: string,
    sessionName: string,
  ) => {
    const sourceProvider = getProvider(sourceProviderId);
    const fromProviderLabel = sourceProvider.meta.displayName;
    let transcriptPath: string | null = null;
    if (sourceCliSessionId && sourceProvider.getTranscriptPath) {
      try {
        transcriptPath = sourceProvider.getTranscriptPath(sourceCliSessionId, projectPath);
      } catch (err) {
        console.warn('getTranscriptPath failed:', err);
      }
    }
    return buildHandoffPrompt({ fromProviderLabel, sessionName, transcriptPath });
  });

  ipcMain.handle('provider:checkBinary', (_event, providerId: ProviderId = 'claude') => {
    const provider = getProvider(providerId);
    return provider.validatePrerequisites();
  });

  ipcMain.handle('provider:updateAll', async (event) => {
    if (providerUpdateInFlight) {
      return providerUpdateInFlight;
    }

    const abortController = new AbortController();
    providerUpdateAbortController = abortController;
    providerUpdateInFlight = updateAllProviders({
      signal: abortController.signal,
      onProgress: (progressEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('provider:update-progress', progressEvent);
        }
      },
    }).finally(() => {
      if (providerUpdateAbortController === abortController) {
        providerUpdateAbortController = null;
      }
      if (providerUpdateInFlight) {
        providerUpdateInFlight = null;
      }
    });
    return providerUpdateInFlight;
  });

  ipcMain.handle('provider:cancelUpdateAll', async () => {
    if (!providerUpdateAbortController || providerUpdateAbortController.signal.aborted) {
      return { cancelled: false };
    }
    providerUpdateAbortController.abort();
    return { cancelled: true };
  });

  ipcMain.handle('mobileSetup:checkDependencies', async () => {
    return checkMobileDependencies();
  });

  ipcMain.handle('mobileSetup:installDependency', async (event, dependencyId: string, installId?: string) => {
    const resolvedInstallId = typeof installId === 'string' && installId.trim().length > 0
      ? installId.trim()
      : `mobile-install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return installMobileDependency(dependencyId as MobileDependencyId, {
      installId: resolvedInstallId,
      onProgress: (progressEvent: MobileDependencyInstallProgressEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('mobileSetup:installProgress', progressEvent);
        }
      },
    });
  });

  ipcMain.handle('mobileInspect:launch', async (_event, platform: MobileInspectPlatform) => {
    const resolvedPlatform: MobileInspectPlatform = platform === 'android' ? 'android' : 'ios';
    return launchMobileInspectSurface(resolvedPlatform);
  });

  ipcMain.handle('mobileInspect:captureScreenshot', async (_event, platform: MobileInspectPlatform) => {
    const resolvedPlatform: MobileInspectPlatform = platform === 'android' ? 'android' : 'ios';
    return captureMobileInspectScreenshot(resolvedPlatform);
  });

  ipcMain.handle('mobileInspect:inspectPoint', async (_event, platform: MobileInspectPlatform, x: number, y: number) => {
    const resolvedPlatform: MobileInspectPlatform = platform === 'android' ? 'android' : 'ios';
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    return inspectMobilePoint(resolvedPlatform, safeX, safeY);
  });

  ipcMain.handle('mobileInspect:interact', async (_event, platform: MobileInspectPlatform, x: number, y: number) => {
    const resolvedPlatform: MobileInspectPlatform = platform === 'android' ? 'android' : 'ios';
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    return interactMobileInspectPoint(resolvedPlatform, safeX, safeY);
  });

  ipcMain.handle('fs:browseDirectory', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.on('app:focus', () => {
    app.focus({ steal: true });
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getBrowserPreloadPath', () =>
    path.join(__dirname, '..', '..', 'preload', 'preload', 'browser-tab-preload.js')
  );
  ipcMain.handle('app:sendToGuestWebContents', (_event, webContentsId: number, channel: string, ...args: unknown[]) => {
    if (!ALLOWED_GUEST_MESSAGE_CHANNELS.has(channel)) {
      console.warn(`app:sendToGuestWebContents blocked unknown channel: ${channel}`);
      return false;
    }
    if (!isAllowedGuestMessagePayload(channel, args)) {
      console.warn(`app:sendToGuestWebContents blocked invalid payload for channel: ${channel}`);
      return false;
    }
    const guest = webContents.fromId(webContentsId);
    if (!guest || guest.isDestroyed()) return false;
    if (typeof guest.getType === 'function' && guest.getType() !== 'webview') {
      console.warn(`app:sendToGuestWebContents blocked non-webview target: ${guest.getType()}`);
      return false;
    }
    guest.send(channel, ...args);
    return true;
  });

  const MAX_SCREENSHOT_BYTES = 50 * 1024 * 1024;
  const MAX_SCREENSHOT_B64_LEN = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3);
  const SCREENSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  let screenshotsPruned = false;

  async function pruneOldScreenshots(dir: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dir);
      const now = Date.now();
      await Promise.all(entries.map(async (name) => {
        const full = path.join(dir, name);
        try {
          const stat = await fs.promises.stat(full);
          if (now - stat.mtimeMs > SCREENSHOT_MAX_AGE_MS) {
            await fs.promises.unlink(full);
          }
        } catch (err) {
          console.warn('Failed to prune screenshot', full, err);
        }
      }));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Failed to read screenshots dir for pruning', err);
      }
    }
  }

  ipcMain.handle('browser:saveScreenshot', async (_event, sessionId: string, dataUrl: string) => {
    const PREFIX = 'data:image/png;base64,';
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIX)) {
      throw new Error('Invalid screenshot data URL');
    }
    const b64 = dataUrl.slice(PREFIX.length);
    if (b64.length > MAX_SCREENSHOT_B64_LEN) {
      throw new Error('Screenshot data exceeds size limit');
    }
    const buffer = Buffer.from(b64, 'base64');
    const dir = path.join(os.tmpdir(), 'calder-screenshots');
    await fs.promises.mkdir(dir, { recursive: true });
    if (!screenshotsPruned) {
      screenshotsPruned = true;
      void pruneOldScreenshots(dir);
    }
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(dir, `draw-${safeId}-${Date.now()}.png`);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  });
  ipcMain.handle('browser:listLocalTargets', async () => discoverLocalBrowserTargets());
  ipcMain.handle('browserCredential:listForUrl', async (_event, url: string) =>
    listBrowserCredentialSummariesForUrl(url));
  ipcMain.handle('browserCredential:saveForUrl', async (_event, input: BrowserCredentialSaveInput) =>
    saveBrowserCredentialForUrl(input));
  ipcMain.handle('browserCredential:deleteById', async (_event, id: string) =>
    deleteBrowserCredentialById(id));
  ipcMain.handle('browserCredential:getForFill', async (_event, url: string, id: string) =>
    getBrowserCredentialForFill(url, id));
  ipcMain.handle('browserCredential:getAutoFillForUrl', async (_event, url: string) =>
    getBrowserAutoFillCredentialForUrl(url));
  ipcMain.handle('sharing:getRtcConfig', () => resolveShareRtcConfigFromEnv());
  ipcMain.handle(
    'mobile:createControlPairing',
    async (
      _event,
      sessionId: string,
      offer: string,
      passphrase: string,
      mode: 'readonly' | 'readwrite',
      language?: 'en' | 'tr',
      offerDescription?: ShareConnectionDescription,
    ) =>
      createMobileControlPairing({ sessionId, offer, passphrase, mode, language, offerDescription }),
  );
  ipcMain.handle('mobile:consumeControlAnswer', (_event, pairingId: string) =>
    consumeMobileControlPairingAnswer(pairingId));
  ipcMain.handle('mobile:revokeControlPairing', (_event, pairingId: string) => {
    revokeMobileControlPairing(pairingId);
    return { ok: true };
  });
  ipcMain.handle('app:openExternal', async (_event, url: string, cwd?: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Only HTTP(S) URLs are allowed');
    }
    const governanceProjectPath = cwd
      ? requireKnownProjectPath(cwd, 'Open external URL')
      : getActiveProjectPath();
    if (governanceProjectPath) {
      await assertProjectGovernanceAllows(governanceProjectPath, {
        kind: 'network',
        label: 'Open external URL',
        target: parsed.hostname,
      });
    }
    const win = BrowserWindow.getAllWindows()[0];
    return openUrlWithBrowserPolicy({ url, cwd, preferEmbedded: true }, win, (target) => shell.openExternal(target));
  });

  ipcMain.handle('git:getStatus', (_event, projectPath: string) => getGitStatus(projectPath));

  ipcMain.handle('git:getRemoteUrl', (_event, projectPath: string) => getGitRemoteUrl(projectPath));

  ipcMain.handle('git:getFiles', (_event, projectPath: string) => getGitFiles(projectPath));

  ipcMain.handle('git:getDiff', (_event, projectPath: string, filePath: string, area: string) => getGitDiff(projectPath, filePath, area));

  ipcMain.handle('git:getWorktrees', (_event, projectPath: string) => getGitWorktrees(projectPath));

  ipcMain.handle('git:stageFile', async (_event, projectPath: string, filePath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Stage git file' });
    await gitStageFile(projectPath, filePath);
    notifyGitChanged();
  });

  ipcMain.handle('git:unstageFile', async (_event, projectPath: string, filePath: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Unstage git file' });
    await gitUnstageFile(projectPath, filePath);
    notifyGitChanged();
  });

  ipcMain.handle('git:discardFile', async (_event, projectPath: string, filePath: string, area: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Discard git file changes' });
    await gitDiscardFile(projectPath, filePath, area as GitFileEntry['area']);
    notifyGitChanged();
  });

  ipcMain.on('git:watchProject', (_event, projectPath: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    startGitWatcher(win, projectPath);
  });

  ipcMain.handle('git:listBranches', (_event, projectPath: string) => listGitBranches(projectPath));

  ipcMain.handle('git:checkoutBranch', async (_event, projectPath: string, branch: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Checkout git branch' });
    await checkoutGitBranch(projectPath, branch);
    notifyGitChanged();
  });

  ipcMain.handle('git:createBranch', async (_event, projectPath: string, branch: string) => {
    await assertProjectGovernanceAllows(projectPath, { kind: 'write', label: 'Create git branch' });
    await createGitBranch(projectPath, branch);
    notifyGitChanged();
  });

  ipcMain.handle('git:openInEditor', (_event, projectPath: string, filePath: string) => {
    const fullPath = path.join(projectPath, filePath);
    return shell.openPath(fullPath);
  });

  ipcMain.handle('pty:getCwd', (_event, sessionId: string) => getPtyCwd(sessionId));

  registerMcpHandlers();
}
