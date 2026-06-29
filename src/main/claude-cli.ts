import * as fs from 'fs';
import { homedir } from 'os';
import * as path from 'path';

import type { InspectorEventType } from '../shared/types/session';
import { getClaudeConfig } from './claude-config-discovery';
import { buildClaudeEventHookPython } from './claude-event-hook-template';
import { addMcpServer, removeMcpServer } from './claude-mcp-config';
import { EXTERNAL_HOOK_INJECTION_ENABLED } from './external-hook-policy';
import {
  captureSessionIdCmd as mkCaptureSessionIdCmd,
  captureToolFailureCmd as mkCaptureToolFailureCmd,
  installEventScript,
  installHookScripts,
  statusCmd as mkStatusCmd,
  wrapPythonHookCmd,
} from './hooks/hook-commands';
import { getStatusLineScriptPath, installStatusLineScript, STATUS_DIR } from './hooks/hook-status';
export type { Agent, ClaudeConfig, Command, McpServer, Skill } from '../shared/types/provider';
export type { McpServerConfig } from './claude-mcp-config';

export const HOOK_MARKER = '# calder-hook';

interface HookHandler {
  type: string;
  command: string;
}

interface HookMatcherEntry {
  matcher: string;
  hooks: HookHandler[];
}

type HooksConfig = Record<string, HookMatcherEntry[]>;

function isIdeHook(h: HookHandler): boolean {
  return h.command?.includes(HOOK_MARKER) || false;
}

function isMissingSettingsError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return true;
  if (!(error instanceof Error)) return false;
  return /ENOENT|ENOTDIR/.test(error.message);
}

function readClaudeSettingsFile(settingsPath: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Claude settings root must be a JSON object.');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (isMissingSettingsError(error)) {
      // File may not exist yet
      return {};
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse Claude settings at ${settingsPath}: ${message}`);
  }
}

/**
 * Read and clean Claude settings, returning the settings object and cleaned hooks.
 */
function prepareSettings(): { settings: Record<string, unknown>; cleaned: HooksConfig } {
  const settingsPath = path.join(homedir(), '.claude', 'settings.json');
  const settings = readClaudeSettingsFile(settingsPath);

  const existingHooks: HooksConfig = (settings.hooks ?? {}) as HooksConfig;

  // Remove any previously-installed Calder hooks from all event types
  const cleaned: HooksConfig = {};
  for (const [event, matchers] of Object.entries(existingHooks)) {
    const filteredMatchers = matchers
      .map((m) => ({
        ...m,
        hooks: (m.hooks ?? []).filter((h) => !isIdeHook(h)),
      }))
      .filter((m) => m.hooks.length > 0);
    if (filteredMatchers.length > 0) {
      cleaned[event] = filteredMatchers;
    }
  }

  return { settings, cleaned };
}

function writeSettings(settings: Record<string, unknown>): void {
  const settingsPath = path.join(homedir(), '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Install only the hooks portion of Claude Code settings (additive, non-destructive).
 */
export function installHooksOnly(): void {
  if (!EXTERNAL_HOOK_INJECTION_ENABLED) return;

  const { settings, cleaned } = prepareSettings();

  installHookScripts();

  const statusCmd = (event: string, status: string) =>
    mkStatusCmd(event, status, 'CLAUDE_IDE_SESSION_ID', HOOK_MARKER);

  // Hook to capture Claude's session ID from the hook input JSON (stdin)
  const captureSessionIdCmd = mkCaptureSessionIdCmd('CLAUDE_IDE_SESSION_ID', HOOK_MARKER);

  // Hook to capture tool failure details (tool_name, tool_input, error) for missing-tool detection.
  // Uses a random suffix to avoid filename collisions when multiple tools fail rapidly.
  const captureToolFailureCmd = mkCaptureToolFailureCmd('CLAUDE_IDE_SESSION_ID', HOOK_MARKER);

  // Hook to capture inspector events (tool names, cost snapshots, timestamps) into a JSONL log.
  // Each hook event appends one JSON line to STATUS_DIR/{sessionId}.events
  const captureEventCmd = (hookEvent: string, eventType: InspectorEventType) => {
    const pyCode = buildClaudeEventHookPython(hookEvent, eventType, STATUS_DIR);
    const scriptName = `claude_event_${hookEvent}.py`;
    installEventScript(scriptName, pyCode);
    return wrapPythonHookCmd(scriptName, pyCode, HOOK_MARKER);
  };

  // Add our hooks for each event type
  const ideEvents: Record<string, string> = {
    SessionStart: 'waiting',
    UserPromptSubmit: 'working',
    PostToolUse: 'working',
    PostToolUseFailure: 'working',
    Stop: 'completed',
    StopFailure: 'waiting',
    PermissionRequest: 'input',
  };

  const eventTypeMap: Record<string, InspectorEventType> = {
    SessionStart: 'session_start',
    UserPromptSubmit: 'user_prompt',
    PostToolUse: 'tool_use',
    PostToolUseFailure: 'tool_failure',
    Stop: 'stop',
    StopFailure: 'stop_failure',
    PermissionRequest: 'permission_request',
  };

  for (const [event, status] of Object.entries(ideEvents)) {
    const existing = cleaned[event] ?? [];
    const hooks: HookHandler[] = [{ type: 'command', command: statusCmd(event, status) }];
    // Capture Claude session ID on session start and prompt submission
    if (event === 'SessionStart' || event === 'UserPromptSubmit') {
      hooks.push({ type: 'command', command: captureSessionIdCmd });
    }
    // Capture tool failure details for missing-tool detection
    if (event === 'PostToolUseFailure') {
      hooks.push({ type: 'command', command: captureToolFailureCmd });
    }
    // Capture inspector event log for session inspection
    hooks.push({ type: 'command', command: captureEventCmd(event, eventTypeMap[event]) });
    existing.push({
      matcher: '',
      hooks,
    });
    cleaned[event] = existing;
  }

  // Inspector-only hooks: log to .events file without changing session status
  const inspectorOnlyEvents: Record<string, InspectorEventType> = {
    PreToolUse: 'pre_tool_use',
    PermissionDenied: 'permission_denied',
    SubagentStart: 'subagent_start',
    SubagentStop: 'subagent_stop',
    Notification: 'notification',
    PreCompact: 'pre_compact',
    PostCompact: 'post_compact',
    SessionEnd: 'session_end',
    TaskCreated: 'task_created',
    TaskCompleted: 'task_completed',
    WorktreeCreate: 'worktree_create',
    WorktreeRemove: 'worktree_remove',
    CwdChanged: 'cwd_changed',
    FileChanged: 'file_changed',
    ConfigChange: 'config_change',
    Elicitation: 'elicitation',
    ElicitationResult: 'elicitation_result',
    InstructionsLoaded: 'instructions_loaded',
    TeammateIdle: 'teammate_idle',
  };

  for (const [event, eventType] of Object.entries(inspectorOnlyEvents)) {
    const existing = cleaned[event] ?? [];
    existing.push({
      matcher: '',
      hooks: [{ type: 'command', command: captureEventCmd(event, eventType) }],
    });
    cleaned[event] = existing;
  }

  settings.hooks = cleaned;
  writeSettings(settings);
}

/**
 * Install only the statusLine setting (exclusive — overwrites any existing value).
 */
export function installStatusLine(): void {
  if (!EXTERNAL_HOOK_INJECTION_ENABLED) return;

  installStatusLineScript();

  const settingsPath = path.join(homedir(), '.claude', 'settings.json');
  const settings = readClaudeSettingsFile(settingsPath);

  settings.statusLine = {
    type: 'command',
    command: getStatusLineScriptPath(),
  };

  writeSettings(settings);
}

/**
 * Install both hooks and statusLine unconditionally (legacy convenience function).
 */
export function installHooks(): void {
  installHooksOnly();
  installStatusLine();
}

/** Remove Calder-managed hooks from ~/.claude/settings.json without touching other hooks. */
export function cleanupClaudeHooksOnly(): void {
  const { settings, cleaned } = prepareSettings();
  if (Object.keys(cleaned).length === 0) {
    delete settings.hooks;
  } else {
    settings.hooks = cleaned;
  }
  writeSettings(settings);
}

export { getClaudeConfig };
export { addMcpServer, removeMcpServer };
