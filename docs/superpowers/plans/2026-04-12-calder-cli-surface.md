# Calder CLI Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Calder's `CLI Surface` so CLI and TUI products can run in the left live surface, be inspected by line or region, and route prompts into selected AI sessions without breaking the existing browser `Live View`.

**Architecture:** Introduce a new project-level `surface` model while keeping the current browser tab session alive as a transitional bridge. Ship V1 as a fully working PTY-backed CLI preview surface with shared prompt-routing, then layer V2 heuristics, V3 framework adapters, and a V4 semantic inspect protocol on top of the stable V1 foundation.

**Tech Stack:** Electron, TypeScript, vanilla DOM renderer, xterm.js, `@xterm/addon-serialize`, node-pty, Vitest, esbuild

---

## Execution Notes

- Keep the existing browser `Live View` working exactly as it does today.
- Do not remove `browser-tab` sessions in this plan. Instead, bridge them through `project.surface.web.sessionId` until a later cleanup pass.
- Do not change provider launch APIs, session transcript logic, or session cost/context tracking.
- The first shippable milestone is Task 7. Tasks 8-10 are layered follow-ups and should only start after Task 7 is stable.
- After Task 2, Task 4, Task 7, and Task 10, run `npm run build && npm test`.
- Commit only if the user explicitly asks for commits in the active execution session.

## File Structure

Create or modify these files:

- Create: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-runtime.ts`
  - Own the PTY lifecycle for one CLI preview runtime per project.
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-runtime.test.ts`
  - Verify runtime start/stop/restart/status emission behavior.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`
  - Render the CLI surface shell, xterm instance, toolbar, empty states, and runtime event wiring.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.test.ts`
  - Verify toolbar rendering, runtime actions, and state-driven UI.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/selection.ts`
  - Hold pure selection, buffer extraction, and payload-building helpers.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/selection.test.ts`
  - Verify line, region, and viewport extraction behavior.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/inspect-mode.ts`
  - Manage inspect overlay state and composer visibility for the CLI surface.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/inspect-mode.test.ts`
  - Verify inspect state transitions.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/session-integration.ts`
  - Route CLI surface prompts to selected, custom, or new sessions.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/session-integration.test.ts`
  - Verify CLI inspect prompt delivery flows.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/heuristics.ts`
  - Infer panels, lists, footers, forms, and boxed regions from raw terminal lines.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/heuristics.test.ts`
  - Verify heuristic region inference against text fixtures.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/registry.ts`
  - Register and resolve framework-specific CLI adapters.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/registry.test.ts`
  - Verify adapter registration and detection.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/textual.ts`
  - Normalize Textual metadata into Calder adapter output.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/ink.ts`
  - Normalize Ink metadata into Calder adapter output.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/blessed.ts`
  - Normalize Blessed metadata into Calder adapter output.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/protocol.ts`
  - Parse and encode the Calder semantic inspect protocol.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/protocol.test.ts`
  - Verify semantic protocol encoding and parsing.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-host.ts`
  - Centralize left-side surface rendering for browser and CLI surfaces.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-host.test.ts`
  - Verify surface host chooses the correct pane.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-routing.ts`
  - Share prompt target resolution, delivery, and new-session fallback between browser and CLI surfaces.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-routing.test.ts`
  - Verify shared routing behavior.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cli-surface.css`
  - Style the CLI surface shell and inspect overlay.
- Create: `/Users/batuhanyuksel/Documents/browser/docs/superpowers/specs/2026-04-12-calder-cli-surface-protocol.md`
  - Document the V4 OSC protocol payload format for our own CLI apps.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/shared/types.ts`
  - Add `ProjectSurfaceRecord`, CLI surface types, selection payloads, and runtime contract types.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/state.ts`
  - Add project surface persistence, migration, and shared target-session helpers.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/state.test.ts`
  - Add surface migration and target resolution tests.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/session-integration.ts`
  - Switch browser prompt routing to the new shared surface-routing helper.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/session-integration.test.ts`
  - Preserve browser behavior while moving to shared routing.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/pane.ts`
  - Read surface target state instead of browser-tab-only target state.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/draw-mode.ts`
  - Reuse shared target-selection behavior.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.ts`
  - Render the left-side surface host and keep the right-side session deck behavior intact.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.test.ts`
  - Verify browser and CLI surface rendering logic.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/terminal-pane.ts`
  - Export prompt-delivery helpers already used by browser and now shared by CLI surface routing.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css`
  - Import `cli-surface.css`.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts`
  - Expose `cliSurface` APIs and event listeners.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`
  - Register `cli-surface:*` IPC handlers.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/pty-manager.ts`
  - Add a generic command PTY spawn helper for non-provider preview runtimes.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/pty-manager.test.ts`
  - Verify generic command PTY spawn behavior.

### Task 1: Add Surface Types And Failing State Contracts

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/shared/types.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/state.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/state.test.ts`

- [ ] **Step 1: Write failing state tests for the new surface model**

Add these tests to `/Users/batuhanyuksel/Documents/browser/src/renderer/state.test.ts`:

```ts
it('hydrates a web surface from an existing browser session record', async () => {
  mockLoad.mockResolvedValue({
    version: 1,
    activeProjectId: 'project-1',
    preferences: {},
    projects: [
      {
        id: 'project-1',
        name: 'Demo',
        path: '/tmp/demo',
        activeSessionId: 'browser-1',
        layout: { mode: 'mosaic', splitPanes: [], splitDirection: 'horizontal' },
        sessions: [
          {
            id: 'claude-1',
            name: 'Claude',
            type: 'claude',
            providerId: 'claude',
            cliSessionId: 'cli-1',
            createdAt: '2026-04-12T09:00:00.000Z',
          },
          {
            id: 'browser-1',
            name: 'Live View',
            type: 'browser-tab',
            cliSessionId: null,
            browserTabUrl: 'http://localhost:3000',
            browserTargetSessionId: 'claude-1',
            createdAt: '2026-04-12T09:01:00.000Z',
          },
        ],
      },
    ],
  });

  await appState.load();
  const project = appState.activeProject!;

  expect(project.surface).toEqual(
    expect.objectContaining({
      kind: 'web',
      active: true,
      targetSessionId: 'claude-1',
      web: expect.objectContaining({
        sessionId: 'browser-1',
        url: 'http://localhost:3000',
      }),
    }),
  );
});

it('lists and resolves targetable surface sessions without using browser-tab state', async () => {
  const project = appState.addProject('/tmp/cli-demo')!;
  const first = appState.addSession(project.id, 'First');
  const second = appState.addSession(project.id, 'Second');

  appState.setProjectSurface(project.id, {
    kind: 'cli',
    active: true,
    targetSessionId: second.id,
    cli: { profiles: [], runtime: { status: 'idle' } },
  });

  expect(appState.listSurfaceTargetSessions(project.id).map((session) => session.id)).toEqual([first.id, second.id]);
  expect(appState.resolveSurfaceTargetSession(project.id)?.id).toBe(second.id);
});
```

- [ ] **Step 2: Run the state tests to confirm the new API does not exist yet**

Run:

```bash
npx vitest run src/renderer/state.test.ts
```

Expected: FAIL with TypeScript or runtime errors for `surface`, `setProjectSurface`, `listSurfaceTargetSessions`, or `resolveSurfaceTargetSession`.

- [ ] **Step 3: Add the shared surface types**

Add these definitions to `/Users/batuhanyuksel/Documents/browser/src/shared/types.ts` above `ProjectRecord`:

```ts
export type SurfaceKind = 'web' | 'cli';
export type SurfaceSelectionMode = 'line' | 'region' | 'viewport';

export interface WebSurfaceState {
  sessionId?: string;
  url?: string;
  history?: string[];
}

export interface CliSurfaceProfile {
  id: string;
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  envPatch?: Record<string, string>;
  cols?: number;
  rows?: number;
  startupReadyPattern?: string;
  restartPolicy?: 'manual' | 'on-exit';
}

export interface CliSurfaceRuntimeState {
  status: 'idle' | 'starting' | 'running' | 'stopped' | 'error';
  runtimeId?: string;
  selectedProfileId?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  lastExitCode?: number | null;
  lastError?: string | null;
}

export interface CliSurfaceState {
  selectedProfileId?: string;
  profiles: CliSurfaceProfile[];
  runtime?: CliSurfaceRuntimeState;
}

export interface ProjectSurfaceRecord {
  kind: SurfaceKind;
  active: boolean;
  targetSessionId?: string;
  web?: WebSurfaceState;
  cli?: CliSurfaceState;
}

export interface SurfaceSelectionRange {
  mode: SurfaceSelectionMode;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export interface SurfacePromptPayload {
  projectId: string;
  projectPath: string;
  surfaceKind: SurfaceKind;
  selection: SurfaceSelectionRange;
  selectedText: string;
  nearbyText: string;
  viewportText: string;
  ansiSnapshot?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  title?: string;
  inferredLabel?: string;
  adapterMeta?: Record<string, unknown>;
}
```

Then update `ProjectRecord`:

```ts
export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  sessions: SessionRecord[];
  activeSessionId: string | null;
  surface?: ProjectSurfaceRecord;
  layout: ProjectLayoutState;
  sessionHistory?: ArchivedSession[];
  insights?: ProjectInsightsData;
  defaultArgs?: string;
  terminalPanelOpen?: boolean;
  terminalPanelHeight?: number;
  readiness?: ReadinessResult;
}
```

- [ ] **Step 4: Re-run the state tests to confirm the remaining failures are in `state.ts`**

Run:

```bash
npx vitest run src/renderer/state.test.ts
```

Expected: FAIL, but now only because the renderer state migration and surface helpers have not been implemented yet.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/renderer/state.test.ts
git commit -m "test: define cli surface contracts"
```

### Task 2: Implement Project Surface State, Migration, And Targeting

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/state.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/state.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/state.test.ts`

- [ ] **Step 1: Add failing tests for target migration and wrapper compatibility**

Append these tests to `/Users/batuhanyuksel/Documents/browser/src/renderer/state.test.ts`:

```ts
it('keeps browser wrapper helpers working through surface state', async () => {
  const project = appState.addProject('/tmp/browser-demo')!;
  const target = appState.addSession(project.id, 'Claude');
  const browser = appState.addBrowserTab(project.id, 'http://localhost:4173');

  appState.setSurfaceTargetSession(project.id, target.id);

  expect(appState.resolveBrowserTargetSession(browser.id)?.id).toBe(target.id);
  expect(appState.listBrowserTargetSessions(browser.id).map((session) => session.id)).toContain(target.id);
});

it('does not persist transient cli runtime process data', async () => {
  const project = appState.addProject('/tmp/runtime-demo')!;
  appState.setProjectSurface(project.id, {
    kind: 'cli',
    active: true,
    cli: {
      selectedProfileId: 'tui',
      profiles: [{ id: 'tui', name: 'TUI', command: 'npm', args: ['run', 'dev:tui'] }],
      runtime: { status: 'running', runtimeId: 'cli-surface:project-1', command: 'npm', args: ['run', 'dev:tui'] },
    },
  });

  const persisted = mockSave.mock.calls.at(-1)?.[0];
  expect(persisted.projects[0].surface.cli.runtime.runtimeId).toBeUndefined();
});
```

- [ ] **Step 2: Run the state suite again**

Run:

```bash
npx vitest run src/renderer/state.test.ts
```

Expected: FAIL because `setProjectSurface`, `setSurfaceTargetSession`, and transient runtime stripping are still missing.

- [ ] **Step 3: Implement normalized surface state in `/Users/batuhanyuksel/Documents/browser/src/renderer/state.ts`**

Add these helpers near `normalizeProjectLayout`:

```ts
function normalizeProjectSurface(project: ProjectRecord): ProjectSurfaceRecord {
  const browserSession = [...project.sessions].reverse().find((session) => session.type === 'browser-tab');
  const existing = project.surface;
  const fallbackTarget = browserSession?.browserTargetSessionId;

  return {
    kind: existing?.kind ?? (browserSession ? 'web' : 'cli'),
    active: existing?.active ?? Boolean(browserSession),
    targetSessionId: existing?.targetSessionId ?? fallbackTarget,
    web: {
      sessionId: existing?.web?.sessionId ?? browserSession?.id,
      url: existing?.web?.url ?? browserSession?.browserTabUrl,
      history: existing?.web?.history ?? (browserSession?.browserTabUrl ? [browserSession.browserTabUrl] : []),
    },
    cli: {
      selectedProfileId: existing?.cli?.selectedProfileId,
      profiles: existing?.cli?.profiles ?? [],
      runtime: existing?.cli?.runtime
        ? { ...existing.cli.runtime, runtimeId: undefined }
        : { status: 'idle' },
    },
  };
}
```

In `load()`, normalize every project:

```ts
this.state.projects = this.state.projects.map((project) => ({
  ...project,
  layout: normalizeProjectLayout(project.layout),
  surface: normalizeProjectSurface(project),
}));
```

Add public APIs inside `AppState`:

```ts
setProjectSurface(projectId: string, surface: ProjectSurfaceRecord): void {
  const project = this.state.projects.find((entry) => entry.id === projectId);
  if (!project) return;
  project.surface = {
    ...surface,
    cli: surface.cli
      ? {
          ...surface.cli,
          runtime: surface.cli.runtime ? { ...surface.cli.runtime, runtimeId: undefined } : undefined,
        }
      : surface.cli,
  };
  this.persist();
  this.emit('project-changed');
}

listSurfaceTargetSessions(projectId: string): SessionRecord[] {
  const project = this.state.projects.find((entry) => entry.id === projectId);
  if (!project) return [];
  return project.sessions.filter((session) => this.isCliSession(session));
}

resolveSurfaceTargetSession(projectId: string): SessionRecord | undefined {
  const project = this.state.projects.find((entry) => entry.id === projectId);
  if (!project) return undefined;
  const stored = project.surface?.targetSessionId
    ? project.sessions.find((session) => session.id === project.surface?.targetSessionId)
    : undefined;
  if (stored && this.isCliSession(stored)) return stored;
  return this.findActiveCliSession(project);
}

setSurfaceTargetSession(projectId: string, targetSessionId: string | null): void {
  const project = this.state.projects.find((entry) => entry.id === projectId);
  if (!project) return;
  project.surface = normalizeProjectSurface(project);
  if (!targetSessionId) {
    delete project.surface.targetSessionId;
  } else {
    project.surface.targetSessionId = targetSessionId;
  }
  this.persist();
  this.emit('project-changed');
}
```

Replace the browser-only wrappers with delegating versions:

```ts
listBrowserTargetSessions(browserSessionId: string): SessionRecord[] {
  const project = this.findProjectBySession(browserSessionId);
  return project ? this.listSurfaceTargetSessions(project.id) : [];
}

resolveBrowserTargetSession(browserSessionId: string): SessionRecord | undefined {
  const project = this.findProjectBySession(browserSessionId);
  return project ? this.resolveSurfaceTargetSession(project.id) : undefined;
}

setBrowserTargetSession(browserSessionId: string, targetSessionId: string | null): void {
  const project = this.findProjectBySession(browserSessionId);
  if (!project) return;
  this.setSurfaceTargetSession(project.id, targetSessionId);
}
```

In `persist()`, strip transient runtime ids:

```ts
surface: p.surface
  ? {
      ...p.surface,
      cli: p.surface.cli
        ? {
            ...p.surface.cli,
            runtime: p.surface.cli.runtime
              ? { ...p.surface.cli.runtime, runtimeId: undefined }
              : undefined,
          }
        : p.surface.cli,
    }
  : undefined,
```

- [ ] **Step 4: Run the state suite and then the build plus full tests**

Run:

```bash
npx vitest run src/renderer/state.test.ts
npm run build && npm test
```

Expected:
- `src/renderer/state.test.ts` passes
- full build and test suite pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/state.ts src/renderer/state.test.ts
git commit -m "feat: add project surface state foundation"
```

### Task 3: Extract Shared Surface Prompt Routing And Preserve Browser Behavior

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-routing.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-routing.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/session-integration.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/session-integration.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-routing.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/session-integration.test.ts`

- [ ] **Step 1: Write failing shared-routing tests**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-routing.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../terminal-pane.js', () => ({
  deliverPromptToTerminalSession: vi.fn(async () => true),
  setPendingPrompt: vi.fn(),
}));

vi.mock('../tab-bar.js', () => ({
  promptNewSession: vi.fn((cb: (session: { id: string }) => void) => cb({ id: 'custom-1' })),
}));

import { appState, _resetForTesting as resetState } from '../state.js';
import { deliverSurfacePrompt, queueSurfacePromptInNewSession } from './surface-routing.js';
import { deliverPromptToTerminalSession, setPendingPrompt } from '../terminal-pane.js';

describe('surface routing', () => {
  beforeEach(() => {
    resetState();
  });

  it('delivers prompts to the selected surface target', async () => {
    const project = appState.addProject('/tmp/cli-surface')!;
    const target = appState.addSession(project.id, 'Claude');
    appState.setProjectSurface(project.id, { kind: 'cli', active: true, targetSessionId: target.id, cli: { profiles: [], runtime: { status: 'idle' } } });

    const result = await deliverSurfacePrompt(project.id, 'inspect this footer');

    expect(result).toEqual({ ok: true, targetSessionId: target.id });
    expect(deliverPromptToTerminalSession).toHaveBeenCalledWith(target.id, 'inspect this footer');
  });

  it('queues a new plan session when the caller asks for a new destination', () => {
    const project = appState.addProject('/tmp/cli-surface')!;

    const session = queueSurfacePromptInNewSession(project.id, 'Fix footer', 'inspect this footer');

    expect(session?.name).toContain('Fix footer');
    expect(setPendingPrompt).toHaveBeenCalledWith(session?.id, 'inspect this footer');
  });
});
```

- [ ] **Step 2: Run the focused routing tests**

Run:

```bash
npx vitest run src/renderer/components/surface-routing.test.ts src/renderer/components/browser-tab/session-integration.test.ts
```

Expected: FAIL because `surface-routing.ts` does not exist and browser session integration still owns the routing logic.

- [ ] **Step 3: Implement the shared helper and switch the browser over to it**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-routing.ts`:

```ts
import { appState } from '../state.js';
import { getProviderAvailabilitySnapshot, resolvePreferredProviderForLaunch } from '../provider-availability.js';
import { deliverPromptToTerminalSession, setPendingPrompt } from './terminal-pane.js';
import { promptNewSession } from './tab-bar.js';

function preferredProvider() {
  return resolvePreferredProviderForLaunch(
    appState.preferences.defaultProvider,
    getProviderAvailabilitySnapshot(),
  );
}

export async function deliverSurfacePrompt(projectId: string, prompt: string): Promise<{ ok: boolean; targetSessionId?: string; error?: string }> {
  const targetSession = appState.resolveSurfaceTargetSession(projectId);
  if (!targetSession) {
    return { ok: false, error: 'Select an open session target first.' };
  }
  const delivered = await deliverPromptToTerminalSession(targetSession.id, prompt);
  if (!delivered) {
    return { ok: false, error: 'Failed to deliver prompt to the selected session.' };
  }
  appState.setActiveSession(projectId, targetSession.id);
  return { ok: true, targetSessionId: targetSession.id };
}

export function queueSurfacePromptInNewSession(projectId: string, sessionName: string, prompt: string) {
  const session = appState.addPlanSession(projectId, sessionName, preferredProvider());
  if (session) {
    setPendingPrompt(session.id, prompt);
  }
  return session;
}

export function queueSurfacePromptInCustomSession(prompt: string, onReady: () => void): void {
  promptNewSession((session) => {
    setPendingPrompt(session.id, prompt);
    onReady();
  });
}
```

Then refactor `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/session-integration.ts`:

```ts
import { deliverSurfacePrompt, queueSurfacePromptInCustomSession, queueSurfacePromptInNewSession } from '../surface-routing.js';

async function sendPromptToSelectedSession(
  instance: BrowserTabInstance,
  prompt: string,
  onDelivered: () => void,
  errorEl: { textContent: string; style: { display: string } },
): Promise<boolean> {
  const project = appState.activeProject;
  if (!project) return false;

  const result = await deliverSurfacePrompt(project.id, prompt);
  if (!result.ok) {
    showSendError(errorEl, result.error ?? 'Failed to deliver prompt.');
    return false;
  }

  hideSendError(errorEl);
  onDelivered();
  return true;
}

export function sendToNewSession(instance: BrowserTabInstance): void {
  const info = instance.selectedElement;
  const prompt = buildPrompt(instance);
  const project = appState.activeProject;
  if (!info || !prompt || !project) return;
  queueSurfacePromptInNewSession(project.id, `${info.tagName}: ${instance.instructionInput.value.trim().slice(0, 30)}`, prompt);
  dismissInspect(instance);
}

export function sendToCustomSession(instance: BrowserTabInstance): void {
  const prompt = buildPrompt(instance);
  if (!prompt) return;
  queueSurfacePromptInCustomSession(prompt, () => dismissInspect(instance));
}
```

- [ ] **Step 4: Run the focused browser and shared-routing tests**

Run:

```bash
npx vitest run src/renderer/components/surface-routing.test.ts src/renderer/components/browser-tab/session-integration.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/surface-routing.ts src/renderer/components/surface-routing.test.ts src/renderer/components/browser-tab/session-integration.ts src/renderer/components/browser-tab/session-integration.test.ts
git commit -m "refactor: share surface prompt routing"
```

### Task 4: Add A Dedicated CLI Surface Runtime API

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/pty-manager.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/pty-manager.test.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-runtime.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-runtime.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/main/pty-manager.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-runtime.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Create `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-runtime.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pty-manager', () => ({
  spawnCommandPty: vi.fn(),
  writePty: vi.fn(),
  resizePty: vi.fn(),
  killPty: vi.fn(),
}));

import { spawnCommandPty, writePty, resizePty, killPty } from './pty-manager';
import { createCliSurfaceRuntimeManager } from './cli-surface-runtime';

describe('cli surface runtime manager', () => {
  const emit = {
    data: vi.fn(),
    exit: vi.fn(),
    status: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts one runtime per project using a generic command PTY', () => {
    const manager = createCliSurfaceRuntimeManager(emit);

    manager.start('project-1', {
      id: 'textual',
      name: 'Textual',
      command: 'python',
      args: ['-m', 'textual', 'run', 'app.py'],
      cwd: '/tmp/demo',
      cols: 132,
      rows: 40,
    });

    expect(spawnCommandPty).toHaveBeenCalledWith(
      'cli-surface:project-1',
      expect.objectContaining({
        command: 'python',
        args: ['-m', 'textual', 'run', 'app.py'],
        cwd: '/tmp/demo',
        cols: 132,
        rows: 40,
      }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(emit.status).toHaveBeenCalledWith('project-1', expect.objectContaining({ status: 'starting' }));
  });

  it('proxies write, resize, and stop to the active runtime id', () => {
    const manager = createCliSurfaceRuntimeManager(emit);
    manager.start('project-1', { id: 'bubbletea', name: 'Bubble Tea', command: 'go', args: ['run', './cmd/app'], cwd: '/tmp/demo' });

    manager.write('project-1', 'j');
    manager.resize('project-1', 160, 48);
    manager.stop('project-1');

    expect(writePty).toHaveBeenCalledWith('cli-surface:project-1', 'j');
    expect(resizePty).toHaveBeenCalledWith('cli-surface:project-1', 160, 48);
    expect(killPty).toHaveBeenCalledWith('cli-surface:project-1');
  });
});
```

- [ ] **Step 2: Run the failing runtime tests**

Run:

```bash
npx vitest run src/main/pty-manager.test.ts src/main/cli-surface-runtime.test.ts
```

Expected: FAIL because `spawnCommandPty` and `cli-surface-runtime.ts` do not exist yet.

- [ ] **Step 3: Add the generic PTY spawn helper and the runtime manager**

Add this helper to `/Users/batuhanyuksel/Documents/browser/src/main/pty-manager.ts`:

```ts
export function spawnCommandPty(
  sessionId: string,
  launch: {
    command: string;
    args?: string[];
    cwd: string;
    envPatch?: Record<string, string>;
    cols?: number;
    rows?: number;
  },
  onData: (data: string) => void,
  onExit: (exitCode: number, signal?: number) => void,
): void {
  if (ptys.has(sessionId)) {
    silencedExits.add(sessionId);
    killPty(sessionId);
  }

  const env = { ...process.env, PATH: getFullPath(), ...(launch.envPatch ?? {}) } as Record<string, string>;
  const ptyProcess = pty.spawn(launch.command, launch.args ?? [], {
    name: 'xterm-256color',
    cols: launch.cols ?? 120,
    rows: launch.rows ?? 30,
    cwd: launch.cwd,
    env,
  });

  ptyProcess.onData((data) => onData(data));
  ptyProcess.onExit(({ exitCode, signal }) => {
    const current = ptys.get(sessionId);
    if (current?.process === ptyProcess) {
      ptys.delete(sessionId);
    }
    onExit(exitCode, signal);
  });

  ptys.set(sessionId, { process: ptyProcess, sessionId });
}
```

Create `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-runtime.ts`:

```ts
import type { CliSurfaceProfile, CliSurfaceRuntimeState } from '../shared/types';
import { killPty, resizePty, spawnCommandPty, writePty } from './pty-manager';

export function createCliSurfaceRuntimeManager(emit: {
  data(projectId: string, data: string): void;
  exit(projectId: string, exitCode: number, signal?: number): void;
  status(projectId: string, state: CliSurfaceRuntimeState): void;
  error(projectId: string, message: string): void;
}) {
  const profiles = new Map<string, CliSurfaceProfile>();

  function runtimeId(projectId: string) {
    return `cli-surface:${projectId}`;
  }

  return {
    start(projectId: string, profile: CliSurfaceProfile) {
      profiles.set(projectId, profile);
      emit.status(projectId, {
        status: 'starting',
        runtimeId: runtimeId(projectId),
        selectedProfileId: profile.id,
        command: profile.command,
        args: profile.args,
        cwd: profile.cwd,
        cols: profile.cols,
        rows: profile.rows,
      });

      spawnCommandPty(
        runtimeId(projectId),
        {
          command: profile.command,
          args: profile.args,
          cwd: profile.cwd ?? process.cwd(),
          envPatch: profile.envPatch,
          cols: profile.cols,
          rows: profile.rows,
        },
        (data) => emit.data(projectId, data),
        (exitCode, signal) => {
          emit.exit(projectId, exitCode, signal);
          emit.status(projectId, {
            status: 'stopped',
            selectedProfileId: profile.id,
            command: profile.command,
            args: profile.args,
            cwd: profile.cwd,
            cols: profile.cols,
            rows: profile.rows,
            lastExitCode: exitCode,
          });
        },
      );
    },
    write(projectId: string, data: string) {
      writePty(runtimeId(projectId), data);
    },
    resize(projectId: string, cols: number, rows: number) {
      resizePty(runtimeId(projectId), cols, rows);
    },
    stop(projectId: string) {
      killPty(runtimeId(projectId));
      const profile = profiles.get(projectId);
      emit.status(projectId, {
        status: 'stopped',
        selectedProfileId: profile?.id,
        command: profile?.command,
        args: profile?.args,
        cwd: profile?.cwd,
      });
    },
    restart(projectId: string) {
      const profile = profiles.get(projectId);
      if (!profile) {
        emit.error(projectId, 'No CLI surface profile is selected.');
        return;
      }
      this.stop(projectId);
      this.start(projectId, profile);
    },
  };
}
```

Extend `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts` with a new API:

```ts
cliSurface: {
  start(projectId: string, profile: CliSurfaceProfile): Promise<void>;
  stop(projectId: string): Promise<void>;
  restart(projectId: string): Promise<void>;
  write(projectId: string, data: string): void;
  resize(projectId: string, cols: number, rows: number): void;
  onData(callback: (projectId: string, data: string) => void): () => void;
  onExit(callback: (projectId: string, exitCode: number, signal?: number) => void): () => void;
  onStatus(callback: (projectId: string, state: CliSurfaceRuntimeState) => void): () => void;
  onError(callback: (projectId: string, message: string) => void): () => void;
},
```

Wire it in `api`:

```ts
cliSurface: {
  start: (projectId, profile) => ipcRenderer.invoke('cli-surface:start', projectId, profile),
  stop: (projectId) => ipcRenderer.invoke('cli-surface:stop', projectId),
  restart: (projectId) => ipcRenderer.invoke('cli-surface:restart', projectId),
  write: (projectId, data) => ipcRenderer.send('cli-surface:write', projectId, data),
  resize: (projectId, cols, rows) => ipcRenderer.send('cli-surface:resize', projectId, cols, rows),
  onData: (callback) => onChannel('cli-surface:data', (projectId, data) => callback(projectId as string, data as string)),
  onExit: (callback) => onChannel('cli-surface:exit', (projectId, exitCode, signal) => callback(projectId as string, exitCode as number, signal as number | undefined)),
  onStatus: (callback) => onChannel('cli-surface:status', (projectId, state) => callback(projectId as string, state as CliSurfaceRuntimeState)),
  onError: (callback) => onChannel('cli-surface:error', (projectId, message) => callback(projectId as string, message as string)),
},
```

In `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`, instantiate the manager once and register handlers:

```ts
const cliSurfaceRuntime = createCliSurfaceRuntimeManager({
  data: (projectId, data) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:data', projectId, data),
  exit: (projectId, exitCode, signal) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:exit', projectId, exitCode, signal),
  status: (projectId, state) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:status', projectId, state),
  error: (projectId, message) => BrowserWindow.getAllWindows()[0]?.webContents.send('cli-surface:error', projectId, message),
});

ipcMain.handle('cli-surface:start', (_event, projectId, profile) => {
  cliSurfaceRuntime.start(projectId, profile);
});
ipcMain.handle('cli-surface:stop', (_event, projectId) => {
  cliSurfaceRuntime.stop(projectId);
});
ipcMain.handle('cli-surface:restart', (_event, projectId) => {
  cliSurfaceRuntime.restart(projectId);
});
ipcMain.on('cli-surface:write', (_event, projectId, data) => {
  cliSurfaceRuntime.write(projectId, data);
});
ipcMain.on('cli-surface:resize', (_event, projectId, cols, rows) => {
  cliSurfaceRuntime.resize(projectId, cols, rows);
});
```

- [ ] **Step 4: Run the focused runtime tests and then the build plus full tests**

Run:

```bash
npx vitest run src/main/pty-manager.test.ts src/main/cli-surface-runtime.test.ts
npm run build && npm test
```

Expected:
- runtime-focused tests pass
- full build and test suite pass

- [ ] **Step 5: Commit**

```bash
git add src/main/pty-manager.ts src/main/pty-manager.test.ts src/main/cli-surface-runtime.ts src/main/cli-surface-runtime.test.ts src/preload/preload.ts src/main/ipc-handlers.ts
git commit -m "feat: add cli surface runtime api"
```

### Task 5: Render The Left-Side CLI Surface Without Breaking Live View

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-host.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-host.test.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.test.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cli-surface.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-host.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.test.ts`

- [ ] **Step 1: Write failing renderer tests for surface hosting**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-host.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('./browser-tab-pane.js', () => ({
  attachBrowserTabToContainer: vi.fn(),
  showBrowserTabPane: vi.fn(),
}));

vi.mock('./cli-surface/pane.js', () => ({
  attachCliSurfacePane: vi.fn(),
  showCliSurfacePane: vi.fn(),
}));

import { renderSurfaceHost } from './surface-host.js';
import { attachBrowserTabToContainer, showBrowserTabPane } from './browser-tab-pane.js';
import { attachCliSurfacePane, showCliSurfacePane } from './cli-surface/pane.js';

describe('surface host', () => {
  it('renders the browser live view when the active surface is web', () => {
    const container = document.createElement('div');
    renderSurfaceHost(
      {
        id: 'project-1',
        name: 'Demo',
        path: '/tmp/demo',
        activeSessionId: 'claude-1',
        sessions: [],
        layout: { mode: 'mosaic', splitPanes: [], splitDirection: 'horizontal' },
        surface: { kind: 'web', active: true, web: { sessionId: 'browser-1', url: 'http://localhost:3000' }, cli: { profiles: [], runtime: { status: 'idle' } } },
      } as any,
      container,
    );

    expect(attachBrowserTabToContainer).toHaveBeenCalled();
    expect(showBrowserTabPane).toHaveBeenCalledWith('browser-1');
  });

  it('renders the cli surface when the active surface is cli', () => {
    const container = document.createElement('div');
    renderSurfaceHost(
      {
        id: 'project-1',
        name: 'Demo',
        path: '/tmp/demo',
        activeSessionId: 'claude-1',
        sessions: [],
        layout: { mode: 'mosaic', splitPanes: [], splitDirection: 'horizontal' },
        surface: { kind: 'cli', active: true, cli: { selectedProfileId: 'textual', profiles: [{ id: 'textual', name: 'Textual', command: 'python' }], runtime: { status: 'idle' } } },
      } as any,
      container,
    );

    expect(attachCliSurfacePane).toHaveBeenCalled();
    expect(showCliSurfacePane).toHaveBeenCalledWith('project-1');
  });
});
```

- [ ] **Step 2: Run the failing renderer tests**

Run:

```bash
npx vitest run src/renderer/components/surface-host.test.ts src/renderer/components/split-layout.test.ts
```

Expected: FAIL because the surface host and CLI surface pane do not exist yet.

- [ ] **Step 3: Implement the host, the shell, and the stylesheet**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/surface-host.ts`:

```ts
import type { ProjectRecord } from '../state.js';
import { attachBrowserTabToContainer, showBrowserTabPane } from './browser-tab-pane.js';
import { attachCliSurfacePane, showCliSurfacePane } from './cli-surface/pane.js';

export function renderSurfaceHost(project: ProjectRecord, container: HTMLElement): void {
  const surface = project.surface;
  if (!surface?.active) return;

  if (surface.kind === 'cli') {
    attachCliSurfacePane(project.id, container);
    showCliSurfacePane(project.id);
    return;
  }

  const sessionId = surface.web?.sessionId;
  if (!sessionId) return;
  attachBrowserTabToContainer(sessionId, container);
  showBrowserTabPane(sessionId);
}
```

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`:

```ts
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { appState } from '../../state.js';

interface CliSurfaceInstance {
  projectId: string;
  element: HTMLDivElement;
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
}

const instances = new Map<string, CliSurfaceInstance>();

function ensureInstance(projectId: string): CliSurfaceInstance {
  const existing = instances.get(projectId);
  if (existing) return existing;

  const element = document.createElement('div');
  element.className = 'cli-surface-pane hidden';
  element.dataset.projectId = projectId;

  const toolbar = document.createElement('div');
  toolbar.className = 'cli-surface-toolbar';
  toolbar.innerHTML = `
    <div class="cli-surface-title">CLI Surface</div>
    <div class="cli-surface-actions">
      <button type="button" data-action="start">Start</button>
      <button type="button" data-action="stop">Stop</button>
      <button type="button" data-action="restart">Restart</button>
      <button type="button" data-action="inspect">Inspect</button>
      <button type="button" data-action="capture">Capture</button>
    </div>
  `;
  element.appendChild(toolbar);

  const viewport = document.createElement('div');
  viewport.className = 'cli-surface-viewport';
  element.appendChild(viewport);

  const empty = document.createElement('div');
  empty.className = 'cli-surface-empty';
  empty.textContent = 'Run a CLI or TUI profile to preview it here.';
  element.appendChild(empty);

  const terminal = new Terminal({ allowProposedApi: true, fontSize: 14, cursorBlink: true });
  const fitAddon = new FitAddon();
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(serializeAddon);
  terminal.open(viewport);

  const instance = { projectId, element, terminal, fitAddon, serializeAddon };
  instances.set(projectId, instance);
  return instance;
}

export function attachCliSurfacePane(projectId: string, container: HTMLElement): void {
  const instance = ensureInstance(projectId);
  if (!instance.element.parentElement) {
    container.appendChild(instance.element);
  }
}

export function showCliSurfacePane(projectId: string): void {
  const instance = ensureInstance(projectId);
  instance.element.classList.remove('hidden');
  requestAnimationFrame(() => instance.fitAddon.fit());
}
```

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cli-surface.css`:

```css
.cli-surface-pane {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
  background: linear-gradient(180deg, rgba(14, 18, 28, 0.96), rgba(9, 12, 18, 0.98));
  border-left: 1px solid var(--border-hairline);
}

.cli-surface-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-hairline);
}

.cli-surface-viewport {
  position: relative;
  min-height: 0;
}

.cli-surface-empty {
  position: absolute;
  inset: 56px 16px 16px;
  display: grid;
  place-items: center;
  color: var(--text-secondary);
}
```

Import it in `/Users/batuhanyuksel/Documents/browser/src/renderer/styles.css`:

```css
@import url('./styles/cli-surface.css');
```

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.ts`, replace direct browser-left rendering with the host:

```ts
import { renderSurfaceHost } from './surface-host.js';

function appendMosaicSlot(
  project: ProjectRecord,
  target: HTMLElement,
  paneIds: string[],
  className = 'mosaic-slot',
): HTMLElement {
  const slot = createMosaicSlot(className);
  target.appendChild(slot);
  if (className.includes('browser-slot')) {
    renderSurfaceHost(project, slot);
  } else {
    showPanes(project, slot, paneIds);
  }
  return slot;
}
```

- [ ] **Step 4: Run the focused renderer tests**

Run:

```bash
npx vitest run src/renderer/components/surface-host.test.ts src/renderer/components/cli-surface/pane.test.ts src/renderer/components/split-layout.test.ts
```

Expected: PASS for host selection and split-layout surface selection, even though inspect behavior is not implemented yet.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/surface-host.ts src/renderer/components/surface-host.test.ts src/renderer/components/cli-surface/pane.ts src/renderer/components/cli-surface/pane.test.ts src/renderer/components/split-layout.ts src/renderer/components/split-layout.test.ts src/renderer/styles/cli-surface.css src/renderer/styles.css
git commit -m "feat: render cli surface shell"
```

### Task 6: Implement V1 Selection, Snapshot, And Inspect Composer State

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/selection.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/selection.test.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/inspect-mode.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/inspect-mode.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/selection.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/inspect-mode.test.ts`

- [ ] **Step 1: Write failing pure-function tests for line, region, and viewport extraction**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildViewportText, buildSelectionText, createSelectionPayload } from './selection.js';

const lines = [
  '╭ Settings ───────────────╮',
  '│ Theme: midnight         │',
  '│ Accent: amber           │',
  '╰─────────────────────────╯',
];

describe('cli surface selection helpers', () => {
  it('returns full lines for line mode', () => {
    expect(buildSelectionText(lines, { mode: 'line', startRow: 1, endRow: 2, startCol: 0, endCol: 80 })).toBe(
      '│ Theme: midnight         │\n│ Accent: amber           │',
    );
  });

  it('clips a rectangular region by columns', () => {
    expect(buildSelectionText(lines, { mode: 'region', startRow: 1, endRow: 2, startCol: 2, endCol: 15 })).toBe(
      'Theme: midnig\nAccent: amber',
    );
  });

  it('returns the full visible viewport for viewport mode', () => {
    expect(buildViewportText(lines)).toContain('╭ Settings');
    expect(buildViewportText(lines)).toContain('Accent: amber');
  });

  it('builds a v1 payload with viewport and nearby text', () => {
    const payload = createSelectionPayload({
      projectId: 'project-1',
      projectPath: '/tmp/demo',
      command: 'python',
      args: ['app.py'],
      cwd: '/tmp/demo',
      cols: 80,
      rows: 24,
      title: 'Settings',
      lines,
      selection: { mode: 'line', startRow: 1, endRow: 1, startCol: 0, endCol: 80 },
      ansiSnapshot: '\\u001b[32mTheme\\u001b[0m',
    });

    expect(payload.selectedText).toContain('Theme: midnight');
    expect(payload.viewportText).toContain('Accent: amber');
    expect(payload.ansiSnapshot).toContain('\\u001b[32m');
  });
});
```

- [ ] **Step 2: Run the failing selection tests**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/selection.test.ts src/renderer/components/cli-surface/inspect-mode.test.ts
```

Expected: FAIL because `selection.ts` and `inspect-mode.ts` do not exist yet.

- [ ] **Step 3: Implement the pure selection helpers and inspect state**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/selection.ts`:

```ts
import type { SurfacePromptPayload, SurfaceSelectionRange } from '../../../shared/types.js';

export function buildViewportText(lines: string[]): string {
  return lines.join('\n');
}

export function buildSelectionText(lines: string[], selection: SurfaceSelectionRange): string {
  const relevant = lines.slice(selection.startRow, selection.endRow + 1);
  if (selection.mode === 'viewport' || selection.mode === 'line') {
    return relevant.join('\n');
  }
  return relevant
    .map((line) => line.slice(selection.startCol, selection.endCol))
    .join('\n');
}

function buildNearbyText(lines: string[], selection: SurfaceSelectionRange): string {
  const start = Math.max(0, selection.startRow - 2);
  const end = Math.min(lines.length - 1, selection.endRow + 2);
  return lines.slice(start, end + 1).join('\n');
}

export function createSelectionPayload(input: {
  projectId: string;
  projectPath: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  title?: string;
  lines: string[];
  selection: SurfaceSelectionRange;
  ansiSnapshot?: string;
  inferredLabel?: string;
}): SurfacePromptPayload {
  return {
    projectId: input.projectId,
    projectPath: input.projectPath,
    surfaceKind: 'cli',
    selection: input.selection,
    selectedText: buildSelectionText(input.lines, input.selection),
    nearbyText: buildNearbyText(input.lines, input.selection),
    viewportText: buildViewportText(input.lines),
    ansiSnapshot: input.ansiSnapshot,
    command: input.command,
    args: input.args,
    cwd: input.cwd,
    cols: input.cols,
    rows: input.rows,
    title: input.title,
    inferredLabel: input.inferredLabel,
  };
}
```

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/inspect-mode.ts`:

```ts
import type { SurfacePromptPayload, SurfaceSelectionRange } from '../../../shared/types.js';

export interface CliInspectState {
  active: boolean;
  selection: SurfaceSelectionRange | null;
  payload: SurfacePromptPayload | null;
}

export function createInitialInspectState(): CliInspectState {
  return { active: false, selection: null, payload: null };
}

export function openInspect(state: CliInspectState): CliInspectState {
  return { ...state, active: true };
}

export function closeInspect(state: CliInspectState): CliInspectState {
  return { ...state, active: false, selection: null, payload: null };
}

export function setInspectPayload(
  state: CliInspectState,
  selection: SurfaceSelectionRange,
  payload: SurfacePromptPayload,
): CliInspectState {
  return { active: true, selection, payload };
}
```

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`, add:

```ts
import { createInitialInspectState, openInspect, setInspectPayload } from './inspect-mode.js';
import { createSelectionPayload } from './selection.js';

// inside CliSurfaceInstance
inspectState: createInitialInspectState(),
viewportLines: [] as string[],

window.calder.cliSurface.onData((projectId, data) => {
  const instance = instances.get(projectId);
  if (!instance) return;
  instance.terminal.write(data);
  instance.viewportLines = instance.terminal.buffer.active
    ? Array.from({ length: instance.terminal.rows }, (_, index) => instance.terminal.buffer.active.getLine(index)?.translateToString(true) ?? '')
    : [];
});

// when entering inspect mode
instance.inspectState = openInspect(instance.inspectState);

// when a selection is finalized
instance.inspectState = setInspectPayload(
  instance.inspectState,
  selection,
  createSelectionPayload({
    projectId,
    projectPath: appState.activeProject?.path ?? '',
    command: runtime?.command,
    args: runtime?.args,
    cwd: runtime?.cwd,
    cols: runtime?.cols,
    rows: runtime?.rows,
    title: runtime?.command,
    lines: instance.viewportLines,
    selection,
    ansiSnapshot: instance.serializeAddon.serialize(),
  }),
);
```

- [ ] **Step 4: Run the focused inspect tests**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/selection.test.ts src/renderer/components/cli-surface/inspect-mode.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/cli-surface/selection.ts src/renderer/components/cli-surface/selection.test.ts src/renderer/components/cli-surface/inspect-mode.ts src/renderer/components/cli-surface/inspect-mode.test.ts src/renderer/components/cli-surface/pane.ts
git commit -m "feat: add cli surface inspect selection"
```

### Task 7: Deliver CLI Surface Prompts Into Selected Sessions And Ship V1

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/session-integration.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/session-integration.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/split-layout.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/session-integration.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/session-integration.test.ts`

- [ ] **Step 1: Write failing CLI surface integration tests**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/session-integration.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../surface-routing.js', () => ({
  deliverSurfacePrompt: vi.fn(async () => ({ ok: true, targetSessionId: 'claude-1' })),
  queueSurfacePromptInNewSession: vi.fn(),
  queueSurfacePromptInCustomSession: vi.fn(),
}));

import { deliverSurfacePrompt, queueSurfacePromptInCustomSession, queueSurfacePromptInNewSession } from '../surface-routing.js';
import { sendCliSelectionToSelectedSession, sendCliSelectionToNewSession, sendCliSelectionToCustomSession } from './session-integration.js';

describe('cli surface session integration', () => {
  const payload = {
    projectId: 'project-1',
    projectPath: '/tmp/demo',
    surfaceKind: 'cli',
    selection: { mode: 'line', startRow: 1, endRow: 1, startCol: 0, endCol: 80 },
    selectedText: 'Theme: midnight',
    nearbyText: 'Settings',
    viewportText: 'Settings',
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delivers the built inspect prompt to the selected session', async () => {
    await sendCliSelectionToSelectedSession(payload);
    expect(deliverSurfacePrompt).toHaveBeenCalledWith('project-1', expect.stringContaining('Theme: midnight'));
  });

  it('can route the same selection into a new session', () => {
    sendCliSelectionToNewSession(payload, 'Tighten settings panel');
    expect(queueSurfacePromptInNewSession).toHaveBeenCalled();
  });

  it('can route the same selection into a custom session chooser', () => {
    sendCliSelectionToCustomSession(payload, vi.fn());
    expect(queueSurfacePromptInCustomSession).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the failing integration tests**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/session-integration.test.ts src/renderer/components/browser-tab/session-integration.test.ts
```

Expected: FAIL because `cli-surface/session-integration.ts` does not exist yet.

- [ ] **Step 3: Implement prompt generation and wire the pane controls**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/session-integration.ts`:

```ts
import type { SurfacePromptPayload } from '../../../shared/types.js';
import { deliverSurfacePrompt, queueSurfacePromptInCustomSession, queueSurfacePromptInNewSession } from '../surface-routing.js';

function buildCliInspectPrompt(payload: SurfacePromptPayload): string {
  return [
    'CLI surface selection:',
    '',
    `Project: ${payload.projectPath}`,
    `Command: ${payload.command ?? 'unknown'}`,
    `Selection mode: ${payload.selection.mode}`,
    '',
    'Selected region:',
    payload.selectedText,
    '',
    'Nearby context:',
    payload.nearbyText,
    '',
    'Visible viewport:',
    payload.viewportText,
  ].join('\n');
}

export async function sendCliSelectionToSelectedSession(payload: SurfacePromptPayload) {
  return deliverSurfacePrompt(payload.projectId, buildCliInspectPrompt(payload));
}

export function sendCliSelectionToNewSession(payload: SurfacePromptPayload, sessionName: string) {
  return queueSurfacePromptInNewSession(payload.projectId, sessionName, buildCliInspectPrompt(payload));
}

export function sendCliSelectionToCustomSession(payload: SurfacePromptPayload, onReady: () => void) {
  return queueSurfacePromptInCustomSession(buildCliInspectPrompt(payload), onReady);
}
```

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`, connect the inspect composer buttons:

```ts
import { sendCliSelectionToCustomSession, sendCliSelectionToNewSession, sendCliSelectionToSelectedSession } from './session-integration.js';

// after a payload exists
selectedButton.addEventListener('click', async () => {
  if (!instance.inspectState.payload) return;
  const result = await sendCliSelectionToSelectedSession(instance.inspectState.payload);
  errorEl.textContent = result.ok ? '' : result.error ?? 'Failed to send prompt.';
});

newButton.addEventListener('click', () => {
  if (!instance.inspectState.payload) return;
  sendCliSelectionToNewSession(instance.inspectState.payload, 'CLI inspect follow-up');
});

customButton.addEventListener('click', () => {
  if (!instance.inspectState.payload) return;
  sendCliSelectionToCustomSession(instance.inspectState.payload, () => {
    errorEl.textContent = '';
  });
});
```

- [ ] **Step 4: Run the focused integration tests and then the build plus full tests**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/session-integration.test.ts src/renderer/components/browser-tab/session-integration.test.ts src/renderer/components/split-layout.test.ts
npm run build && npm test
```

Expected:
- CLI and browser surface routing tests pass
- full build and test suite pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/cli-surface/session-integration.ts src/renderer/components/cli-surface/session-integration.test.ts src/renderer/components/cli-surface/pane.ts src/renderer/components/split-layout.test.ts
git commit -m "feat: ship cli surface v1"
```

### Task 8: Add V2 Heuristics For TUI Region Inference

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/heuristics.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/heuristics.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/heuristics.test.ts`

- [ ] **Step 1: Write failing heuristic tests**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/heuristics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { inferCliRegions } from './heuristics.js';

describe('cli surface heuristics', () => {
  it('detects a boxed settings panel', () => {
    const regions = inferCliRegions([
      '╭ Settings ───────────────╮',
      '│ Theme: midnight         │',
      '│ Accent: amber           │',
      '╰─────────────────────────╯',
    ]);

    expect(regions[0]).toEqual(
      expect.objectContaining({
        label: 'settings panel',
        selection: { mode: 'region', startRow: 0, endRow: 3, startCol: 0, endCol: 27 },
      }),
    );
  });

  it('detects footer actions as a separate region', () => {
    const regions = inferCliRegions([
      'Project build status',
      '',
      '[r] restart   [q] quit   [enter] open',
    ]);

    expect(regions.some((region) => region.label === 'footer actions')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing heuristic tests**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/heuristics.test.ts
```

Expected: FAIL because `heuristics.ts` does not exist yet.

- [ ] **Step 3: Implement deterministic heuristics**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/heuristics.ts`:

```ts
import type { SurfaceSelectionRange } from '../../../shared/types.js';

export interface InferredCliRegion {
  label: string;
  selection: SurfaceSelectionRange;
}

export function inferCliRegions(lines: string[]): InferredCliRegion[] {
  const regions: InferredCliRegion[] = [];

  const boxedStart = lines.findIndex((line) => /^[╭┌]/.test(line));
  const boxedEnd = boxedStart >= 0 ? lines.findIndex((line, index) => index >= boxedStart && /^[╰└]/.test(line)) : -1;
  if (boxedStart >= 0 && boxedEnd >= boxedStart) {
    regions.push({
      label: 'settings panel',
      selection: {
        mode: 'region',
        startRow: boxedStart,
        endRow: boxedEnd,
        startCol: 0,
        endCol: Math.max(...lines.slice(boxedStart, boxedEnd + 1).map((line) => line.length)),
      },
    });
  }

  const footerRow = lines.findIndex((line) => /\[[^\]]+\]/.test(line) && /(restart|quit|open|save|cancel)/i.test(line));
  if (footerRow >= 0) {
    regions.push({
      label: 'footer actions',
      selection: {
        mode: 'line',
        startRow: footerRow,
        endRow: footerRow,
        startCol: 0,
        endCol: lines[footerRow].length,
      },
    });
  }

  return regions;
}
```

Then in `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`, when a payload is created, add:

```ts
import { inferCliRegions } from './heuristics.js';

const inferred = inferCliRegions(instance.viewportLines);
const selectionHint = inferred.find((candidate) => candidate.selection.startRow <= selection.startRow && candidate.selection.endRow >= selection.endRow);

instance.inspectState = setInspectPayload(
  instance.inspectState,
  selection,
  createSelectionPayload({
    ...payloadInput,
    inferredLabel: selectionHint?.label,
  }),
);
```

- [ ] **Step 4: Run the heuristic tests**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/heuristics.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/cli-surface/heuristics.ts src/renderer/components/cli-surface/heuristics.test.ts src/renderer/components/cli-surface/pane.ts
git commit -m "feat: add cli surface heuristics"
```

### Task 9: Add V3 Framework Adapters For Textual, Ink, And Blessed

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/registry.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/registry.test.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/textual.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/ink.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/blessed.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/registry.test.ts`

- [ ] **Step 1: Write failing adapter registry tests**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detectCliAdapter } from './registry.js';

describe('cli surface adapters', () => {
  it('detects Textual from the launch command', () => {
    expect(detectCliAdapter({ command: 'python', args: ['-m', 'textual', 'run', 'app.py'] })?.id).toBe('textual');
  });

  it('detects Ink from the process title', () => {
    expect(detectCliAdapter({ command: 'node', args: ['dist/cli.js'], title: 'ink-app' })?.id).toBe('ink');
  });

  it('detects Blessed from explicit metadata', () => {
    expect(detectCliAdapter({ command: 'node', args: ['cli.js'], adapterHint: 'blessed' })?.id).toBe('blessed');
  });
});
```

- [ ] **Step 2: Run the failing adapter tests**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/adapters/registry.test.ts
```

Expected: FAIL because the adapter registry does not exist yet.

- [ ] **Step 3: Implement the registry and the first adapters**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/registry.ts`:

```ts
export interface CliAdapterDetectionInput {
  command?: string;
  args?: string[];
  title?: string;
  adapterHint?: string;
}

export interface CliSurfaceAdapter {
  id: 'textual' | 'ink' | 'blessed';
  detect(input: CliAdapterDetectionInput): boolean;
  enrich(meta: Record<string, unknown>): Record<string, unknown>;
}

import { textualAdapter } from './textual.js';
import { inkAdapter } from './ink.js';
import { blessedAdapter } from './blessed.js';

const adapters: CliSurfaceAdapter[] = [textualAdapter, inkAdapter, blessedAdapter];

export function detectCliAdapter(input: CliAdapterDetectionInput): CliSurfaceAdapter | undefined {
  return adapters.find((adapter) => adapter.detect(input));
}
```

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/textual.ts`:

```ts
export const textualAdapter = {
  id: 'textual',
  detect(input) {
    return input.command === 'python' && (input.args ?? []).includes('textual');
  },
  enrich(meta) {
    return { ...meta, framework: 'Textual' };
  },
};
```

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/ink.ts`:

```ts
export const inkAdapter = {
  id: 'ink',
  detect(input) {
    return /ink/i.test(input.title ?? '') || (input.args ?? []).some((arg) => /ink/i.test(arg));
  },
  enrich(meta) {
    return { ...meta, framework: 'Ink' };
  },
};
```

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/adapters/blessed.ts`:

```ts
export const blessedAdapter = {
  id: 'blessed',
  detect(input) {
    return input.adapterHint === 'blessed' || (input.args ?? []).some((arg) => /blessed/i.test(arg));
  },
  enrich(meta) {
    return { ...meta, framework: 'Blessed' };
  },
};
```

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`, enrich payload metadata:

```ts
import { detectCliAdapter } from './adapters/registry.js';

const adapter = detectCliAdapter({
  command: runtime?.command,
  args: runtime?.args,
  title: runtime?.command,
});

const adapterMeta = adapter?.enrich({ inferredLabel: selectionHint?.label });
```

- [ ] **Step 4: Run the adapter tests**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/adapters/registry.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/cli-surface/adapters/registry.ts src/renderer/components/cli-surface/adapters/registry.test.ts src/renderer/components/cli-surface/adapters/textual.ts src/renderer/components/cli-surface/adapters/ink.ts src/renderer/components/cli-surface/adapters/blessed.ts src/renderer/components/cli-surface/pane.ts
git commit -m "feat: add cli surface adapters"
```

### Task 10: Add V4 Calder Semantic Inspect Protocol

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/protocol.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/protocol.test.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/docs/superpowers/specs/2026-04-12-calder-cli-surface-protocol.md`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/protocol.test.ts`

- [ ] **Step 1: Write failing protocol tests**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { encodeCalderOsc, parseCalderOsc } from './protocol.js';

describe('calder cli surface protocol', () => {
  it('encodes inspect metadata into OSC 8970', () => {
    const encoded = encodeCalderOsc({
      type: 'node',
      nodeId: 'settings.footer',
      label: 'footer actions',
      bounds: { startRow: 12, endRow: 12, startCol: 0, endCol: 64 },
    });

    expect(encoded.startsWith('\\u001b]8970;calder=')).toBe(true);
  });

  it('parses OSC 8970 messages back into semantic nodes', () => {
    const message = encodeCalderOsc({
      type: 'node',
      nodeId: 'settings.footer',
      label: 'footer actions',
      bounds: { startRow: 12, endRow: 12, startCol: 0, endCol: 64 },
    });

    expect(parseCalderOsc(message)).toEqual(
      expect.objectContaining({
        type: 'node',
        nodeId: 'settings.footer',
        label: 'footer actions',
      }),
    );
  });
});
```

- [ ] **Step 2: Run the failing protocol tests**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/protocol.test.ts
```

Expected: FAIL because `protocol.ts` does not exist yet.

- [ ] **Step 3: Implement the protocol helpers and document the format**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/protocol.ts`:

```ts
export interface CalderProtocolMessage {
  type: 'node' | 'focus' | 'state';
  nodeId: string;
  label?: string;
  bounds?: { startRow: number; endRow: number; startCol: number; endCol: number };
  sourceFile?: string;
  meta?: Record<string, unknown>;
}

const OSC_PREFIX = '\u001b]8970;calder=';
const OSC_SUFFIX = '\u0007';

export function encodeCalderOsc(message: CalderProtocolMessage): string {
  return `${OSC_PREFIX}${Buffer.from(JSON.stringify(message), 'utf8').toString('base64')}${OSC_SUFFIX}`;
}

export function parseCalderOsc(input: string): CalderProtocolMessage | null {
  if (!input.startsWith(OSC_PREFIX) || !input.endsWith(OSC_SUFFIX)) {
    return null;
  }
  const encoded = input.slice(OSC_PREFIX.length, -OSC_SUFFIX.length);
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as CalderProtocolMessage;
}
```

Create `/Users/batuhanyuksel/Documents/browser/docs/superpowers/specs/2026-04-12-calder-cli-surface-protocol.md`:

```markdown
# Calder CLI Surface Protocol

**Date:** 2026-04-12

**Purpose:** Provide an exact semantic inspect channel for first-party CLI applications running inside Calder's `CLI Surface`.

## Transport

- Transport: OSC 8970
- Prefix: `ESC ] 8970;calder=`
- Payload: base64-encoded UTF-8 JSON
- Terminator: BEL (`\\u0007`)

## Message Shapes

### Node

```json
{
  "type": "node",
  "nodeId": "settings.footer",
  "label": "footer actions",
  "bounds": { "startRow": 12, "endRow": 12, "startCol": 0, "endCol": 64 },
  "sourceFile": "src/ui/footer.ts",
  "meta": { "framework": "Calder" }
}
```

### Focus

```json
{
  "type": "focus",
  "nodeId": "settings.theme",
  "label": "theme selector"
}
```

### State

```json
{
  "type": "state",
  "nodeId": "settings.root",
  "meta": { "screen": "settings", "dirty": false }
}
```
```

In `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`, reserve protocol metadata:

```ts
import { parseCalderOsc } from './protocol.js';

const semanticNodes = new Map<string, unknown>();

window.calder.cliSurface.onData((projectId, data) => {
  const message = parseCalderOsc(data);
  if (message) {
    semanticNodes.set(message.nodeId, message);
    return;
  }
  // existing terminal write path continues here
});
```

- [ ] **Step 4: Run the protocol tests and then the build plus full tests**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/protocol.test.ts
npm run build && npm test
```

Expected:
- protocol tests pass
- full build and test suite pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/cli-surface/protocol.ts src/renderer/components/cli-surface/protocol.test.ts src/renderer/components/cli-surface/pane.ts docs/superpowers/specs/2026-04-12-calder-cli-surface-protocol.md
git commit -m "feat: add cli surface semantic protocol"
```

## Self-Review

### Spec Coverage

- `CLI Surface` as a new left-side surface: covered by Tasks 1, 2, 5, and 7.
- Shared target-session routing with browser preserved: covered by Tasks 2, 3, and 7.
- Dedicated CLI runtime instead of reusing AI terminals: covered by Task 4.
- V1 line/region/viewport inspect: covered by Tasks 6 and 7.
- V2 heuristics: covered by Task 8.
- V3 adapters for Textual, Ink, and Blessed: covered by Task 9.
- V4 semantic inspect protocol: covered by Task 10.

### Placeholder Scan

- No placeholder markers or open-ended implementation notes remain in this plan.

### Type Consistency

- `ProjectSurfaceRecord`, `CliSurfaceProfile`, `CliSurfaceRuntimeState`, `SurfaceSelectionRange`, and `SurfacePromptPayload` are introduced in Task 1 and reused consistently in later tasks.
- Browser compatibility continues through `resolveBrowserTargetSession`, but target ownership moves to `setSurfaceTargetSession` in Task 2.
- Runtime ownership is keyed by project via `cli-surface:${projectId}` consistently across Tasks 4-10.
