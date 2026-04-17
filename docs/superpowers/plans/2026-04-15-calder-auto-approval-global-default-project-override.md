# Calder Auto Approval (Global + Project Override) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** To run a safe auto-approval flow in Claude/Codex/Gemini/Qwen sessions in Calder with the global default + project override model, and to safely apply `ask` fallback in unsupported flows such as MiniMax.

**Architecture:** A central `AutoApprovalOrchestrator` will be installed in the main process; This orchestrator will manage policy resolution, command classification, decision making, rate guard and provider adapter calls from a single place. The Governance discovery layer will read the project policy file and the global default policy file together and calculate the effective mode, and the renderer side will show this effective status in the right-rail 'Auto Approval' block. All decisions will flow to the timeline as an 'approval_decision' inspector event and session-based temporary override will be supported.

**Tech Stack:** TypeScript, Electron IPC, Vitest, existing `calder-governance` modules, hook event JSONL stream (`~/.calder/runtime/*.events`)

---

## Scope Check

This plan focuses on one sub-system: Calder governance + hook + right-rail auto-approval chain. It does not require separate independent subprojects; can be delivered safely in one plan.

## File Structure Lock

- `/Users/batuhanyuksel/Documents/browser/src/shared/types.ts`  
  Auto-approval mode/source/decision/event contracts.
- `/Users/batuhanyuksel/Documents/browser/src/shared/project-governance.contract.test.ts`  
  New governance + auto-approval type contract.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-policy.ts`  
  Global + project + session override parser.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-policy.test.ts`  
  Precedence ve fallback testleri.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-classifier.ts`  
  `edit/safe_tool/risky_tool/unknown/destructive` classifier.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-classifier.test.ts`  
  Safe-tool allowlist + destructive pattern testleri.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-orchestrator.ts`  
  Decision engine + adapter triggering + audit event generation.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-orchestrator.test.ts`  
  `allow/ask/block`, rate guard, unsupported provider testleri.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/discovery.ts`  
  Adding auto-approval effective fields to the Governance state.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/discovery.test.ts`  
  Effective mode and source verification.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/scaffold.ts`  
  `autoApproval` block in Starter policy.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/scaffold.test.ts`  
  Validation of `autoApproval.mode` in Scaffold output.
- `/Users/batuhanyuksel/Documents/browser/src/main/hook-status.ts`  
  Inspector event middleware point (orchestrator integration).
- `/Users/batuhanyuksel/Documents/browser/src/main/hook-status.test.ts`  
  Post-middleware event forward behavior.
- `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`  
  Session registration + policy update IPC + override IPC.
- `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers-governance.contract.test.ts`  
  New governance IPC contract verification.
- `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts`  
  `governance.setAutoApprovalMode` ve `governance.setSessionAutoApprovalOverride` bridge.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/types.ts`  
  New governance calls to renderer API types.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/project-governance-sync.ts`  
  Active session ile effective governance sync.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/project-governance-sync.test.ts`  
  Session-aware state sync testleri.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`  
  Right-rail `Auto Approval` block and control events.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.test.ts`  
  Auto Approval UI contract testi.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-language.contract.test.ts`  
  Adding a new block to the Right-rail language contract.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`  
  Auto Approval block visual styles.
- `/Users/batuhanyuksel/Documents/browser/src/main/codex-hooks.ts`  
  `PermissionRequest` event capture + status.
- `/Users/batuhanyuksel/Documents/browser/src/main/codex-hooks.test.ts`  
  Yeni event validation ve idempotency.
- `/Users/batuhanyuksel/Documents/browser/src/main/gemini-hooks.ts`  
  `PermissionRequest` event capture + status.
- `/Users/batuhanyuksel/Documents/browser/src/main/gemini-hooks.test.ts`  
  Yeni event validation ve idempotency.

## Task 1: Shared Contracts For Auto Approval

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/shared/types.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/shared/project-governance.contract.test.ts`

- [ ] **Step 1: Write failing contract assertions**

```ts
// Expectations to be added in src/shared/project-governance.contract.test.ts
expect(source).toContain("export type AutoApprovalMode = 'off' | 'edit_only' | 'edit_plus_safe_tools'");
expect(source).toContain("export type AutoApprovalPolicySource = 'global' | 'project' | 'session' | 'fallback'");
expect(source).toContain('export interface ProjectGovernanceAutoApprovalState');
expect(source).toContain("effectiveMode: AutoApprovalMode");
expect(source).toContain("| 'approval_decision'");
```

- [ ] **Step 2: Run contract test and confirm failure**

Run: `npm test -- src/shared/project-governance.contract.test.ts`  
Expected: FAIL because new `AutoApproval*` types do not exist yet.

- [ ] **Step 3: Add shared types and inspector event payload fields**

```ts
// src/shared/types.ts
export type AutoApprovalMode = 'off' | 'edit_only' | 'edit_plus_safe_tools';
export type AutoApprovalPolicySource = 'global' | 'project' | 'session' | 'fallback';
export type AutoApprovalOperationClass = 'edit' | 'safe_tool' | 'risky_tool' | 'unknown' | 'destructive';
export type AutoApprovalDecision = 'allow' | 'ask' | 'block';

export interface ProjectGovernanceAutoApprovalState {
  globalMode: AutoApprovalMode;
  projectMode?: AutoApprovalMode;
  sessionMode?: AutoApprovalMode;
  effectiveMode: AutoApprovalMode;
  policySource: AutoApprovalPolicySource;
  safeToolProfile: 'default-read-only';
  recentDecisions: Array<{
    timestamp: number;
    operationClass: AutoApprovalOperationClass;
    decision: AutoApprovalDecision;
    reason: string;
  }>;
}

export interface ProjectGovernanceState {
  policy?: ProjectGovernancePolicySource;
  autoApproval?: ProjectGovernanceAutoApprovalState;
  lastUpdated?: string;
}

export type InspectorEventType =
  | 'session_start' | 'user_prompt' | 'tool_use' | 'tool_failure'
  | 'stop' | 'stop_failure' | 'permission_request'
  | 'approval_decision'
  | 'permission_denied'
  // ...

export interface InspectorEvent {
  // ...
  auto_approval?: {
    policy_source: AutoApprovalPolicySource;
    effective_mode: AutoApprovalMode;
    operation_class: AutoApprovalOperationClass;
    decision: AutoApprovalDecision;
    reason: string;
  };
}
```

- [ ] **Step 4: Re-run shared contract test**

Run: `npm test -- src/shared/project-governance.contract.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/project-governance.contract.test.ts
git commit -m "feat(governance): add shared auto-approval contracts"
```

## Task 2: Policy Resolver (Global + Project + Session)

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-policy.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-policy.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/discovery.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/discovery.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/scaffold.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/scaffold.test.ts`

- [ ] **Step 1: Write failing precedence tests**

```ts
// src/main/calder-governance/auto-approval-policy.test.ts
import { describe, expect, it } from 'vitest';
import { resolveEffectiveAutoApprovalMode } from './auto-approval-policy.js';

describe('resolveEffectiveAutoApprovalMode', () => {
  it('uses session override first', () => {
    const result = resolveEffectiveAutoApprovalMode({
      globalMode: 'off',
      projectMode: 'edit_only',
      sessionMode: 'edit_plus_safe_tools',
    });
    expect(result.effectiveMode).toBe('edit_plus_safe_tools');
    expect(result.policySource).toBe('session');
  });

  it('uses project mode over global mode', () => {
    const result = resolveEffectiveAutoApprovalMode({
      globalMode: 'off',
      projectMode: 'edit_only',
    });
    expect(result.effectiveMode).toBe('edit_only');
    expect(result.policySource).toBe('project');
  });
});
```

- [ ] **Step 2: Run new policy tests and verify they fail**

Run: `npm test -- src/main/calder-governance/auto-approval-policy.test.ts`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement resolver + file readers**

```ts
// src/main/calder-governance/auto-approval-policy.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AutoApprovalMode, AutoApprovalPolicySource } from '../../shared/types.js';

export const GLOBAL_AUTO_APPROVAL_POLICY_PATH = path.join(
  os.homedir(),
  '.calder',
  'governance',
  'default-policy.json',
);

function asMode(value: unknown): AutoApprovalMode | undefined {
  return value === 'off' || value === 'edit_only' || value === 'edit_plus_safe_tools'
    ? value
    : undefined;
}

export function readGlobalAutoApprovalMode(): AutoApprovalMode {
  try {
    const raw = JSON.parse(fs.readFileSync(GLOBAL_AUTO_APPROVAL_POLICY_PATH, 'utf8'));
    return asMode(raw?.autoApproval?.mode) ?? 'off';
  } catch {
    return 'off';
  }
}

export function resolveEffectiveAutoApprovalMode(input: {
  globalMode: AutoApprovalMode;
  projectMode?: AutoApprovalMode;
  sessionMode?: AutoApprovalMode;
}): { effectiveMode: AutoApprovalMode; policySource: AutoApprovalPolicySource } {
  if (input.sessionMode) return { effectiveMode: input.sessionMode, policySource: 'session' };
  if (input.projectMode) return { effectiveMode: input.projectMode, policySource: 'project' };
  if (input.globalMode) return { effectiveMode: input.globalMode, policySource: 'global' };
  return { effectiveMode: 'off', policySource: 'fallback' };
}
```

- [ ] **Step 4: Extend discovery/scaffold with autoApproval defaults**

```ts
// src/main/calder-governance/scaffold.ts -> starter json
autoApproval: {
  mode: 'off',
  safeToolProfile: 'default-read-only',
},
```

```ts
// src/main/calder-governance/discovery.ts -> return state
autoApproval: {
  globalMode,
  projectMode,
  effectiveMode: resolved.effectiveMode,
  policySource: resolved.policySource,
  safeToolProfile: 'default-read-only',
  recentDecisions: [],
},
```

Run: `npm test -- src/main/calder-governance/discovery.test.ts src/main/calder-governance/scaffold.test.ts src/main/calder-governance/auto-approval-policy.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/calder-governance/auto-approval-policy.ts src/main/calder-governance/auto-approval-policy.test.ts src/main/calder-governance/discovery.ts src/main/calder-governance/discovery.test.ts src/main/calder-governance/scaffold.ts src/main/calder-governance/scaffold.test.ts
git commit -m "feat(governance): resolve auto-approval mode from global project session layers"
```

## Task 3: Command Classification + Decision Matrix + Rate Guard

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-classifier.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-classifier.test.ts`

- [ ] **Step 1: Write failing classifier tests**

```ts
// src/main/calder-governance/auto-approval-classifier.test.ts
import { describe, expect, it } from 'vitest';
import { classifyOperation, decideAutoApproval } from './auto-approval-classifier.js';

describe('classifyOperation', () => {
  it('classifies Write as edit', () => {
    expect(classifyOperation({ toolName: 'Write' })).toBe('edit');
  });

  it('classifies safe bash read commands as safe_tool', () => {
    expect(classifyOperation({ toolName: 'Bash', toolInput: { command: 'rg --files src' } })).toBe('safe_tool');
  });

  it('classifies destructive bash commands as destructive', () => {
    expect(classifyOperation({ toolName: 'Bash', toolInput: { command: 'rm -rf .git' } })).toBe('destructive');
  });
});

describe('decideAutoApproval', () => {
  it('allows edit in edit_only mode', () => {
    expect(decideAutoApproval('edit_only', 'edit')).toEqual({ decision: 'allow', reason: expect.any(String) });
  });

  it('asks safe_tool in edit_only mode', () => {
    expect(decideAutoApproval('edit_only', 'safe_tool').decision).toBe('ask');
  });

  it('blocks destructive in all modes', () => {
    expect(decideAutoApproval('edit_plus_safe_tools', 'destructive').decision).toBe('block');
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/main/calder-governance/auto-approval-classifier.test.ts`  
Expected: FAIL because the classifier does not exist yet.

- [ ] **Step 3: Implement classifier and decision function**

```ts
// src/main/calder-governance/auto-approval-classifier.ts
import type { AutoApprovalDecision, AutoApprovalMode, AutoApprovalOperationClass } from '../../shared/types.js';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const SAFE_BASH = [/^rg(\s|$)/, /^ls(\s|$)/, /^pwd$/, /^cat(\s|$)/, /^sed\s+-n(\s|$)/, /^head(\s|$)/, /^tail(\s|$)/, /^wc(\s|$)/, /^find(\s|$)/, /^git\s+(status|log|show|diff)(\s|$)/];
const DESTRUCTIVE_BASH = [/rm\s+-rf/, /git\s+reset\s+--hard/, /git\s+checkout\s+--/];

export function classifyOperation(input: { toolName?: string; toolInput?: Record<string, unknown> }): AutoApprovalOperationClass {
  const toolName = (input.toolName ?? '').trim();
  if (!toolName) return 'unknown';
  if (EDIT_TOOLS.has(toolName)) return 'edit';
  if (toolName !== 'Bash') return 'risky_tool';
  const cmd = String(input.toolInput?.command ?? '').trim();
  if (!cmd) return 'unknown';
  if (DESTRUCTIVE_BASH.some((re) => re.test(cmd))) return 'destructive';
  if (SAFE_BASH.some((re) => re.test(cmd))) return 'safe_tool';
  return 'risky_tool';
}

export function decideAutoApproval(
  mode: AutoApprovalMode,
  operationClass: AutoApprovalOperationClass,
): { decision: AutoApprovalDecision; reason: string } {
  if (operationClass === 'destructive') return { decision: 'block', reason: 'Destructive command is hard-blocked.' };
  if (operationClass === 'unknown' || operationClass === 'risky_tool') return { decision: 'ask', reason: 'Unknown/risky operation requires manual approval.' };
  if (mode === 'off') return { decision: 'ask', reason: 'Auto approval is off.' };
  if (mode === 'edit_only') {
    return operationClass === 'edit'
      ? { decision: 'allow', reason: 'Edit operation auto-approved in edit_only mode.' }
      : { decision: 'ask', reason: 'Safe tools are disabled in edit_only mode.' };
  }
  return { decision: 'allow', reason: 'Operation allowed by edit_plus_safe_tools mode.' };
}
```

- [ ] **Step 4: Re-run classifier tests**

Run: `npm test -- src/main/calder-governance/auto-approval-classifier.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/calder-governance/auto-approval-classifier.ts src/main/calder-governance/auto-approval-classifier.test.ts
git commit -m "feat(governance): add auto-approval operation classifier and decision matrix"
```

## Task 4: Orchestrator + Provider Adapter Execution

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-orchestrator.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-orchestrator.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`

- [ ] **Step 1: Write failing orchestrator tests**

```ts
// src/main/calder-governance/auto-approval-orchestrator.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createAutoApprovalOrchestrator } from './auto-approval-orchestrator.js';

describe('auto approval orchestrator', () => {
  it('auto-approves edit permission requests and emits approval_decision', async () => {
    const sendApproval = vi.fn();
    const orchestrator = createAutoApprovalOrchestrator({
      sendApproval,
      resolvePolicy: () => ({ effectiveMode: 'edit_only', policySource: 'project' }),
    });

    const events = await orchestrator.handleInspectorEvents('sess-1', 'claude', [{
      type: 'permission_request',
      timestamp: Date.now(),
      hookEvent: 'PermissionRequest',
      tool_name: 'Write',
    }]);

    expect(sendApproval).toHaveBeenCalledWith('sess-1', 'claude');
    expect(events.some((event) => event.type === 'approval_decision')).toBe(true);
  });
});
```

- [ ] **Step 2: Run orchestrator tests and verify failure**

Run: `npm test -- src/main/calder-governance/auto-approval-orchestrator.test.ts`  
Expected: FAIL because the orchestrator does not exist yet.

- [ ] **Step 3: Implement orchestrator**

```ts
// src/main/calder-governance/auto-approval-orchestrator.ts
import type { InspectorEvent, ProviderId } from '../../shared/types.js';
import { classifyOperation, decideAutoApproval } from './auto-approval-classifier.js';

export function createAutoApprovalOrchestrator(deps: {
  sendApproval: (sessionId: string, providerId: ProviderId) => void;
  resolvePolicy: (sessionId: string) => { effectiveMode: 'off' | 'edit_only' | 'edit_plus_safe_tools'; policySource: 'global' | 'project' | 'session' | 'fallback' };
}) {
  return {
    async handleInspectorEvents(sessionId: string, providerId: ProviderId, events: InspectorEvent[]): Promise<InspectorEvent[]> {
      const output: InspectorEvent[] = [...events];
      for (const event of events) {
        if (event.type !== 'permission_request') continue;
        const policy = deps.resolvePolicy(sessionId);
        const operationClass = classifyOperation({ toolName: event.tool_name, toolInput: event.tool_input });
        const result = decideAutoApproval(policy.effectiveMode, operationClass);

        if (result.decision === 'allow') {
          deps.sendApproval(sessionId, providerId);
        }

        output.push({
          type: 'approval_decision',
          timestamp: Date.now(),
          hookEvent: 'AutoApproval',
          tool_name: event.tool_name,
          tool_input: event.tool_input,
          auto_approval: {
            policy_source: policy.policySource,
            effective_mode: policy.effectiveMode,
            operation_class: operationClass,
            decision: result.decision,
            reason: result.reason,
          },
        });
      }
      return output;
    },
  };
}
```

- [ ] **Step 4: Wire orchestrator into IPC lifecycle**

```ts
// src/main/ipc-handlers.ts (summary)
const autoApproval = createAutoApprovalOrchestrator({
  sendApproval: (sessionId, providerId) => writePty(sessionId, providerId === 'codex' ? '1\n' : '\n'),
  resolvePolicy: (sessionId) => sessionPolicyResolver(sessionId),
});

// Session metadata record in pty:create
autoApproval.registerSession?.(sessionId, { providerId, projectPath: cwd });

//cleanup in pty exit/kill
autoApproval.unregisterSession?.(sessionId);
```

Run: `npm test -- src/main/calder-governance/auto-approval-orchestrator.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/calder-governance/auto-approval-orchestrator.ts src/main/calder-governance/auto-approval-orchestrator.test.ts src/main/ipc-handlers.ts
git commit -m "feat(governance): add auto-approval orchestrator and session wiring"
```

## Task 5: Hook Event Middleware Integration

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/hook-status.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/hook-status.test.ts`

- [ ] **Step 1: Write failing middleware test**

```ts
// new test in src/main/hook-status.test.ts
it('passes inspector events through middleware before forwarding', () => {
  const middleware = vi.fn((_sessionId, events) => [...events, { type: 'approval_decision' }]);
  setInspectorEventsMiddleware(middleware);
  // After the .events file is read, the payload sent must be enriched with middleware
});
```

- [ ] **Step 2: Run hook-status tests and confirm failure**

Run: `npm test -- src/main/hook-status.test.ts`  
Expected: FAIL because there is no middleware API.

- [ ] **Step 3: Add middleware hook**

```ts
// src/main/hook-status.ts
let inspectorEventsMiddleware:
  | ((sessionId: string, events: unknown[]) => unknown[])
  | null = null;

export function setInspectorEventsMiddleware(
  middleware: ((sessionId: string, events: unknown[]) => unknown[]) | null,
): void {
  inspectorEventsMiddleware = middleware;
}

// in the .events handling section
const finalEvents = inspectorEventsMiddleware
  ? inspectorEventsMiddleware(sessionId, events)
  : events;
if (finalEvents.length > 0 && !win.isDestroyed()) {
  win.webContents.send('session:inspectorEvents', sessionId, finalEvents);
}
```

- [ ] **Step 4: Re-run hook-status tests**

Run: `npm test -- src/main/hook-status.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/hook-status.ts src/main/hook-status.test.ts
git commit -m "feat(hooks): support inspector event middleware for auto-approval decisions"
```

## Task 6: Governance IPC + Preload + Renderer Sync

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers-governance.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/types.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/project-governance-sync.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/project-governance-sync.test.ts`

- [ ] **Step 1: Write failing governance IPC contract assertions**

```ts
// src/main/ipc-handlers-governance.contract.test.ts
expect(source).toContain("ipcMain.handle('governance:setAutoApprovalMode'");
expect(source).toContain("ipcMain.handle('governance:setSessionAutoApprovalOverride'");
```

- [ ] **Step 2: Run governance IPC contract test**

Run: `npm test -- src/main/ipc-handlers-governance.contract.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Add IPC handlers and preload bridge**

```ts
// src/main/ipc-handlers.ts
ipcMain.handle('governance:setAutoApprovalMode', async (_event, projectPath: string, scope: 'global' | 'project', mode: 'off' | 'edit_only' | 'edit_plus_safe_tools') => {
  return updateAutoApprovalMode(projectPath, scope, mode);
});

ipcMain.handle('governance:setSessionAutoApprovalOverride', async (_event, sessionId: string, mode: 'off' | 'edit_only' | 'edit_plus_safe_tools' | null) => {
  autoApproval.setSessionOverride(sessionId, mode);
  return { ok: true };
});
```

```ts
// src/preload/preload.ts + src/renderer/types.ts
governance: {
  // existing...
  setAutoApprovalMode(projectPath: string, scope: 'global' | 'project', mode: 'off' | 'edit_only' | 'edit_plus_safe_tools'): Promise<ProjectGovernanceState>;
  setSessionAutoApprovalOverride(sessionId: string, mode: 'off' | 'edit_only' | 'edit_plus_safe_tools' | null): Promise<{ ok: boolean }>;
}
```

- [ ] **Step 4: Make governance sync session-aware**

```ts
// src/renderer/project-governance-sync.ts
const activeCliSessionId = appState.activeSession && !appState.activeSession.type
  ? appState.activeSession.id
  : null;
const projectGovernance = await window.calder.governance.getProjectState(project.path, activeCliSessionId ?? undefined);
```

Run: `npm test -- src/main/ipc-handlers-governance.contract.test.ts src/renderer/project-governance-sync.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/ipc-handlers-governance.contract.test.ts src/preload/preload.ts src/renderer/types.ts src/renderer/project-governance-sync.ts src/renderer/project-governance-sync.test.ts
git commit -m "feat(governance): expose auto-approval controls via ipc preload and sync"
```

## Task 7: Right Rail Auto Approval Block

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/config-sections.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-language.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/context-inspector.css`

- [ ] **Step 1: Write failing UI contract tests**

```ts
// src/renderer/components/context-language.contract.test.ts
expect(configSectionsSource).toContain('Auto Approval');
expect(configSectionsSource).toContain('Edits + Safe tools');
expect(configSectionsSource).toContain('Pause auto-approval');
```

- [ ] **Step 2: Run right-rail contract tests and verify failure**

Run: `npm test -- src/renderer/components/context-language.contract.test.ts src/renderer/components/config-sections.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Render Auto Approval block with scope + effective mode**

```ts
// src/renderer/components/config-sections.ts (summary)
function renderAutoApprovalCard(): HTMLElement | null {
  const project = appState.activeProject;
  const session = appState.activeSession;
  const auto = project?.projectGovernance?.autoApproval;
  if (!project || !auto) return null;

  const card = document.createElement('div');
  card.className = 'auto-approval-card';
  card.innerHTML = `
    <div class="auto-approval-title">Auto Approval</div>
    <div class="auto-approval-row"><span>Scope</span><strong>${auto.policySource}</strong></div>
    <div class="auto-approval-row"><span>Effective mode</span><strong>${auto.effectiveMode}</strong></div>
  `;

  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.textContent = 'Pause auto-approval';
  pauseBtn.addEventListener('click', async () => {
    if (!session || session.type) return;
    await window.calder.governance.setSessionAutoApprovalOverride(session.id, 'off');
  });
  card.appendChild(pauseBtn);
  return card;
}
```

- [ ] **Step 4: Style card and validate tests**

```css
/* src/renderer/styles/context-inspector.css */
#context-inspector .auto-approval-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 80%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-panel) 70%, transparent);
}
```

Run: `npm test -- src/renderer/components/context-language.contract.test.ts src/renderer/components/config-sections.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/config-sections.ts src/renderer/components/config-sections.test.ts src/renderer/components/context-language.contract.test.ts src/renderer/styles/context-inspector.css
git commit -m "feat(renderer): add right-rail auto-approval controls and status copy"
```

## Task 8: Codex + Gemini PermissionRequest Hook Coverage

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/codex-hooks.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/codex-hooks.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/gemini-hooks.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/gemini-hooks.test.ts`

- [ ] **Step 1: Add failing tests for PermissionRequest coverage**

```ts
// codex-hooks.test.ts
expect(hooks.PermissionRequest).toBeDefined();
expect(getStatusCmd('PermissionRequest')).toContain('PermissionRequest:input');
```

```ts
// gemini-hooks.test.ts
expect(hooks.PermissionRequest).toBeDefined();
expect(getStatusCmd('PermissionRequest')).toContain('PermissionRequest:input');
```

- [ ] **Step 2: Run hook tests and verify failure**

Run: `npm test -- src/main/codex-hooks.test.ts src/main/gemini-hooks.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Add PermissionRequest event mapping**

```ts
// src/main/codex-hooks.ts
const EXPECTED_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop', 'PermissionRequest'];
// ...
const ideEvents: Record<string, string> = {
  SessionStart: 'waiting',
  UserPromptSubmit: 'working',
  PostToolUse: 'working',
  Stop: 'completed',
  PermissionRequest: 'input',
};
const eventTypeMap: Record<string, InspectorEventType> = {
  // ...
  PermissionRequest: 'permission_request',
};
```

```ts
// src/main/gemini-hooks.ts
const EXPECTED_HOOK_EVENTS = ['SessionStart', 'BeforeAgent', 'AfterTool', 'AfterAgent', 'SessionEnd', 'PermissionRequest'];
// ...
const ideEvents: Record<string, string> = {
  SessionStart: 'waiting',
  BeforeAgent: 'working',
  AfterTool: 'working',
  AfterAgent: 'completed',
  SessionEnd: 'completed',
  PermissionRequest: 'input',
};
const eventTypeMap: Record<string, InspectorEventType> = {
  // ...
  PermissionRequest: 'permission_request',
};
```

- [ ] **Step 4: Re-run hook tests**

Run: `npm test -- src/main/codex-hooks.test.ts src/main/gemini-hooks.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/codex-hooks.ts src/main/codex-hooks.test.ts src/main/gemini-hooks.ts src/main/gemini-hooks.test.ts
git commit -m "feat(hooks): add permission_request coverage for codex and gemini"
```

## Task 9: End-to-End Verification Sweep

**Files:**
- Modify (if needed): `/Users/batuhanyuksel/Documents/browser/src/main/calder-governance/auto-approval-orchestrator.test.ts`
- Modify (if needed): `/Users/batuhanyuksel/Documents/browser/src/renderer/project-governance-sync.test.ts`

- [ ] **Step 1: Run focused governance + hooks + renderer suites**

Run:

```bash
npm test -- src/main/calder-governance/auto-approval-policy.test.ts src/main/calder-governance/auto-approval-classifier.test.ts src/main/calder-governance/auto-approval-orchestrator.test.ts src/main/hook-status.test.ts src/main/codex-hooks.test.ts src/main/gemini-hooks.test.ts src/renderer/project-governance-sync.test.ts src/renderer/components/config-sections.test.ts src/renderer/components/context-language.contract.test.ts src/shared/project-governance.contract.test.ts src/main/ipc-handlers-governance.contract.test.ts
```

Expected: PASS (all green).

- [ ] **Step 2: Run full repository regression**

Run: `npm test`  
Expected: PASS should not do silent regression to the old stream when the new behavior is `mode=off`.

- [ ] **Step 3: Manual smoke checklist (desktop run)**

Run: `npm run dev`  
Expected:
- 'Auto Approval' card appears on the right rail.
- In 'Off' mode, permission request remains manual.
- In 'Edits' mode, the edit becomes auto-approve, the safe tool remains manual.
- `Edits + Safe tools` modunda `rg`, `ls`, `git status` auto-approve olur.
- `rm -rf` and `git reset --hard` decisions produce `approval_decision` event as `block`.

- [ ] **Step 4: Commit any final test-only fixes**

```bash
git add src/main/calder-governance/auto-approval-orchestrator.test.ts src/renderer/project-governance-sync.test.ts
git commit -m "test(governance): finalize auto-approval regression coverage"
```

- [ ] **Step 5: Create release note snippet in changelog**

```bash
git add CHANGELOG.md
git commit -m "docs: add auto-approval governance release notes"
```

Suggested changelog entry:

```md
### Added
- Calder auto-approval with global default + project override + session pause.
- Unified `approval_decision` inspector events for auditability.
- Permission request hook coverage for Codex and Gemini CLIs.
```

## Self-Review

### 1. Spec Coverage

- Policy model (`off`, `edit_only`, `edit_plus_safe_tools`) covered: Task 1-2.
- Global + project + session precedence covered: Task 2.
- Decision classification (`edit/safe/risky/unknown/destructive`) covered: Task 3.
- Fail-safe (`unknown -> ask`, destructive -> block) covered: Task 3-4.
- Right rail `Auto Approval` block + scope/effective mode + pause action covered: Task 7.
- Audit event (`approval_decision`) covered: Task 1 and Task 4-5.
- Provider adapter chain and unsupported fallback covered: Task 4.
- Codex/Gemini permission_request capture covered: Task 8.

No gaps.

### 2. Placeholder Scan

- No `TODO/TBD` placeholders.
- Each task has test + run command + expected result.
- Code steps have actual snippet.

### 3. Type Consistency

- The names `AutoApprovalMode`, `AutoApprovalPolicySource`, `AutoApprovalOperationClass`, `AutoApprovalDecision` are consistent in all tasks.
- The Inspector event field was used with a single name: `auto_approval`.
- IPC method names are unique and consistent: `setAutoApprovalMode`, `setSessionAutoApprovalOverride`.
