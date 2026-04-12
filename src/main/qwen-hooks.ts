import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { STATUS_DIR, getStatusLineScriptPath } from './hook-status';
import { statusCmd as mkStatusCmd, captureSessionIdCmd as mkCaptureSessionIdCmd, captureToolFailureCmd as mkCaptureToolFailureCmd, installEventScript, wrapPythonHookCmd, installHookScripts } from './hook-commands';
import { readJsonSafe } from './fs-utils';
import { isManagedStatusLineCommand } from './statusline-command';
import type { InspectorEventType, SettingsValidationResult } from '../shared/types';

export const QWEN_HOOK_MARKER = '# calder-hook';
export const SESSION_ID_VAR = 'CALDER_SESSION_ID';

const QWEN_DIR = path.join(homedir(), '.qwen');
const SETTINGS_PATH = path.join(QWEN_DIR, 'settings.json');

const EXPECTED_HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'PermissionRequest',
];

interface HookHandler {
  type: string;
  command: string;
  name?: string;
}

interface HookMatcherEntry {
  matcher?: string;
  hooks: HookHandler[];
}

type HooksConfig = Record<string, HookMatcherEntry[]>;

function isIdeHook(hook: HookHandler): boolean {
  return hook.command?.includes(QWEN_HOOK_MARKER) || false;
}

function isCalderStatusLine(statusLine: unknown): boolean {
  if (!statusLine || typeof statusLine !== 'object') return false;
  const candidate = statusLine as Record<string, unknown>;
  return candidate.type === 'command'
    && isManagedStatusLineCommand(String(candidate.command ?? ''), getStatusLineScriptPath());
}

function cleanHooks(existing: HooksConfig): HooksConfig {
  const cleaned: HooksConfig = {};
  for (const [event, matchers] of Object.entries(existing)) {
    const filteredMatchers = matchers
      .map((matcher) => ({
        ...matcher,
        hooks: (matcher.hooks ?? []).filter((hook) => !isIdeHook(hook)),
      }))
      .filter((matcher) => matcher.hooks.length > 0);
    if (filteredMatchers.length > 0) {
      cleaned[event] = filteredMatchers;
    }
  }
  return cleaned;
}

function writeSettings(settings: Record<string, unknown>): void {
  fs.mkdirSync(QWEN_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

export function installQwenHooks(): void {
  const settings = readJsonSafe(SETTINGS_PATH) ?? {};
  const existingHooks: HooksConfig = (settings.hooks ?? {}) as HooksConfig;
  const cleaned = cleanHooks(existingHooks);

  installHookScripts();

  const statusCmd = (event: string, status: string) =>
    mkStatusCmd(event, status, SESSION_ID_VAR, QWEN_HOOK_MARKER);
  const captureSessionIdCmd = mkCaptureSessionIdCmd(SESSION_ID_VAR, QWEN_HOOK_MARKER);
  const captureToolFailureCmd = mkCaptureToolFailureCmd(SESSION_ID_VAR, QWEN_HOOK_MARKER);

  const captureEventCmd = (hookEvent: string, eventType: InspectorEventType) => {
    const pyCode = `import sys,json,os,time
try:
 d=json.load(sys.stdin)
except:
 sys.exit(0)
sid=os.environ.get("${SESSION_ID_VAR}","")
if not sid:
 sys.exit(0)
e={"type":"${eventType}","timestamp":int(time.time()*1000),"hookEvent":"${hookEvent}"}
for src,dst in (("session_id","session_id"),("transcript_path","transcript_path"),("cwd","cwd"),("tool_name","tool_name"),("tool_input","tool_input"),("error","error"),("prompt","message"),("permission_mode","permission_mode"),("source","source"),("model","model"),("agent_type","agent_type")):
 v=d.get(src)
 if v not in (None,"",{}):
  e[dst]=v
status_dir=r'${STATUS_DIR}'
with open(os.path.join(status_dir,sid+".events"),"a") as f:
 f.write(json.dumps(e)+"\\n")
`;
    const scriptName = `qwen_event_${hookEvent}.py`;
    installEventScript(scriptName, pyCode);
    return wrapPythonHookCmd(scriptName, pyCode, QWEN_HOOK_MARKER);
  };

  const statusEvents: Record<string, string> = {
    SessionStart: 'waiting',
    UserPromptSubmit: 'working',
    PreToolUse: 'working',
    PostToolUse: 'working',
    PostToolUseFailure: 'working',
    Stop: 'completed',
    PermissionRequest: 'input',
  };

  const eventTypeMap: Record<string, InspectorEventType> = {
    SessionStart: 'session_start',
    UserPromptSubmit: 'user_prompt',
    PreToolUse: 'pre_tool_use',
    PostToolUse: 'tool_use',
    PostToolUseFailure: 'tool_failure',
    Stop: 'stop',
    PermissionRequest: 'permission_request',
  };

  for (const [event, status] of Object.entries(statusEvents)) {
    const existing = cleaned[event] ?? [];
    const hooks: HookHandler[] = [
      { type: 'command', command: statusCmd(event, status), name: 'calder-status' },
    ];
    if (event === 'SessionStart' || event === 'UserPromptSubmit') {
      hooks.push({ type: 'command', command: captureSessionIdCmd, name: 'calder-sessionid' });
    }
    if (event === 'PostToolUseFailure') {
      hooks.push({ type: 'command', command: captureToolFailureCmd, name: 'calder-toolfailure' });
    }
    hooks.push({ type: 'command', command: captureEventCmd(event, eventTypeMap[event]), name: 'calder-events' });
    existing.push({ matcher: '', hooks });
    cleaned[event] = existing;
  }

  const inspectorOnlyEvents: Record<string, InspectorEventType> = {
    SubagentStart: 'subagent_start',
    SubagentStop: 'subagent_stop',
    Notification: 'notification',
    PreCompact: 'pre_compact',
    SessionEnd: 'session_end',
  };

  for (const [event, eventType] of Object.entries(inspectorOnlyEvents)) {
    const existing = cleaned[event] ?? [];
    existing.push({
      matcher: '',
      hooks: [{ type: 'command', command: captureEventCmd(event, eventType), name: 'calder-events' }],
    });
    cleaned[event] = existing;
  }

  const nextUi = settings.ui && typeof settings.ui === 'object'
    ? { ...(settings.ui as Record<string, unknown>) }
    : {};

  nextUi.statusLine = {
    type: 'command',
    command: getStatusLineScriptPath(),
  };

  writeSettings({
    ...settings,
    disableAllHooks: false,
    ui: nextUi,
    hooks: cleaned,
  });
}

export function validateQwenHooks(): SettingsValidationResult {
  const settings = readJsonSafe(SETTINGS_PATH);
  const hookDetails: Record<string, boolean> = Object.fromEntries(EXPECTED_HOOK_EVENTS.map((event) => [event, false]));

  let statusLine: SettingsValidationResult['statusLine'] = 'missing';
  let foreignStatusLineCommand: string | undefined;
  const ui = settings?.ui && typeof settings.ui === 'object' ? settings.ui as Record<string, unknown> : undefined;
  if (ui?.statusLine) {
    if (isCalderStatusLine(ui.statusLine)) {
      statusLine = 'calder';
    } else {
      statusLine = 'foreign';
      const statusConfig = ui.statusLine as Record<string, unknown>;
      foreignStatusLineCommand = String(statusConfig.command ?? JSON.stringify(statusConfig));
    }
  }

  if (!settings || settings.disableAllHooks === true) {
    return { statusLine, hooks: 'missing', foreignStatusLineCommand, hookDetails };
  }

  const existingHooks: HooksConfig = (settings.hooks ?? {}) as HooksConfig;
  let installedCount = 0;
  for (const event of EXPECTED_HOOK_EVENTS) {
    const matchers = existingHooks[event];
    const installed = matchers?.some((matcher) => matcher.hooks?.some((hook) => isIdeHook(hook))) ?? false;
    hookDetails[event] = installed;
    if (installed) installedCount += 1;
  }

  let hooks: SettingsValidationResult['hooks'] = 'missing';
  if (installedCount === EXPECTED_HOOK_EVENTS.length) {
    hooks = 'complete';
  } else if (installedCount > 0) {
    hooks = 'partial';
  }

  return { statusLine, hooks, foreignStatusLineCommand, hookDetails };
}

export function cleanupQwenHooks(): void {
  const settings = readJsonSafe(SETTINGS_PATH);
  if (!settings) return;

  const existingHooks: HooksConfig = (settings.hooks ?? {}) as HooksConfig;
  const cleaned = cleanHooks(existingHooks);

  if (Object.keys(cleaned).length === 0) {
    delete (settings as Record<string, unknown>).hooks;
  } else {
    (settings as Record<string, unknown>).hooks = cleaned;
  }

  if (settings.ui && typeof settings.ui === 'object') {
    const nextUi = { ...(settings.ui as Record<string, unknown>) };
    if (isCalderStatusLine(nextUi.statusLine)) {
      delete nextUi.statusLine;
    }
    if (Object.keys(nextUi).length === 0) {
      delete (settings as Record<string, unknown>).ui;
    } else {
      (settings as Record<string, unknown>).ui = nextUi;
    }
  }

  writeSettings(settings);
}
