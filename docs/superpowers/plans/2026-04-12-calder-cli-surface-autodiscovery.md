# Calder CLI Surface Autodiscovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `CLI Surface` open like a first-class live surface by auto-discovering a runnable CLI/TUI command, auto-creating and auto-starting a profile when confidence is high, showing a lightweight quick picker when confidence is medium, and falling back to the existing manual profile form only when discovery is weak.

**Architecture:** Add a main-process discovery engine that inspects project files and returns structured candidates with confidence. Keep renderer decision logic thin: it asks discovery for candidates, auto-starts a saved or high-confidence profile, opens a compact quick-setup UI for medium-confidence results, and preserves the current manual profile modal as the final fallback.

**Tech Stack:** Electron, TypeScript, Node fs/path, renderer DOM components, existing modal/custom-select utilities, Vitest, esbuild

---

## Execution Notes

- Preserve the existing `Live View` browser behavior exactly as-is.
- Preserve existing saved CLI profiles; discovery must never overwrite them automatically.
- Keep the current `CLI Surface Profile` modal as a fallback, not the first-run default.
- Prefer focused new files over adding more branching logic into `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts`.
- Run `npm run build && npm test` after Task 2 and Task 4.

## File Structure

- Create: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-discovery.ts`
  - Inspect project files and return ranked CLI runtime candidates.
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-discovery.test.ts`
  - Verify Node, Python, Rust, Go, and empty-project discovery behavior.
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-discovery-ipc.contract.test.ts`
  - Verify the IPC and preload bridge expose discovery to the renderer.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/setup.ts`
  - Own the decision flow for saved profile reuse, autodiscovery, quick setup, and manual fallback.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/setup.test.ts`
  - Verify high/medium/low-confidence setup behavior without DOM coupling.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/quick-setup.ts`
  - Render the lightweight candidate picker for medium-confidence results.
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/quick-setup.test.ts`
  - Verify candidate rendering and `Run` / `Edit` / `Manual setup` actions.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/shared/types.ts`
  - Add discovery candidate/result types.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`
  - Register `cli-surface:discover`.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts`
  - Expose `window.calder.cliSurface.discover`.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts`
  - Delegate `CLI Surface` activation to the new setup module instead of always opening the full profile form.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`
  - Improve empty/runtime failure copy and expose small helpers needed by setup orchestration.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar-cli-surface.contract.test.ts`
  - Lock the new top-deck behavior around autodiscovery and quick setup entry.
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cli-surface.css`
  - Style the quick-setup candidate surface if it lives inside the CLI module.

### Task 1: Add Discovery Types And The Main-Process Discovery Engine

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/shared/types.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-discovery.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-discovery.test.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-discovery.test.ts`

- [ ] **Step 1: Write the failing discovery tests**

Create `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-discovery.test.ts` with:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { discoverCliSurface } from './cli-surface-discovery';

function makeProject(name: string): string {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
}

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('discoverCliSurface', () => {
  it('returns a high-confidence npm script candidate for a dedicated tui script', async () => {
    const root = makeProject('node-tui');
    roots.push(root);
    writeFiles(root, {
      'package.json': JSON.stringify({
        name: 'node-tui',
        scripts: { 'dev:tui': 'tsx src/tui.ts' },
      }),
    });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('high');
    expect(result.candidates[0]).toMatchObject({
      command: 'npm',
      args: ['run', 'dev:tui'],
      source: 'package.json:scripts.dev:tui',
    });
  });

  it('returns a medium-confidence result when multiple node scripts are plausible', async () => {
    const root = makeProject('node-ambiguous');
    roots.push(root);
    writeFiles(root, {
      'package.json': JSON.stringify({
        name: 'node-ambiguous',
        scripts: { cli: 'tsx src/cli.ts', dev: 'tsx src/dev.ts' },
      }),
    });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('medium');
    expect(result.candidates.map((candidate) => candidate.args?.join(' '))).toEqual([
      'run cli',
      'run dev',
    ]);
  });

  it('returns a high-confidence python candidate for a textual app entry file', async () => {
    const root = makeProject('python-textual');
    roots.push(root);
    writeFiles(root, {
      'app.py': 'from textual.app import App\\nclass Demo(App):\\n    pass\\n',
      'pyproject.toml': '[project]\\nname = "demo"\\nversion = "0.1.0"\\n',
    });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('high');
    expect(result.candidates[0]).toMatchObject({
      command: 'python',
      args: ['app.py'],
      source: 'python:textual-app',
    });
  });

  it('returns a high-confidence cargo candidate for a Rust CLI project', async () => {
    const root = makeProject('rust-cli');
    roots.push(root);
    writeFiles(root, {
      'Cargo.toml': '[package]\\nname = "rust-cli"\\nversion = "0.1.0"\\nedition = "2024"\\n',
      'src/main.rs': 'fn main() { println!("hi"); }\\n',
    });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('high');
    expect(result.candidates[0]).toMatchObject({
      command: 'cargo',
      args: ['run'],
      source: 'cargo:main-bin',
    });
  });

  it('returns a high-confidence go candidate for a cmd entrypoint', async () => {
    const root = makeProject('go-cli');
    roots.push(root);
    writeFiles(root, {
      'go.mod': 'module example.com/cli\\n\\ngo 1.24.0\\n',
      'cmd/demo/main.go': 'package main\\nfunc main() {}\\n',
    });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('high');
    expect(result.candidates[0]).toMatchObject({
      command: 'go',
      args: ['run', './cmd/demo'],
      source: 'go:cmd-entry',
    });
  });

  it('returns a low-confidence result when no runtime can be inferred', async () => {
    const root = makeProject('unknown');
    roots.push(root);
    writeFiles(root, { 'README.md': '# Unknown\\n' });

    const result = await discoverCliSurface(root);

    expect(result.confidence).toBe('low');
    expect(result.candidates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the discovery tests to confirm the module does not exist yet**

Run:

```bash
npx vitest run src/main/cli-surface-discovery.test.ts
```

Expected: FAIL with `Cannot find module './cli-surface-discovery'` or missing type errors.

- [ ] **Step 3: Add shared discovery types**

Add these definitions to `/Users/batuhanyuksel/Documents/browser/src/shared/types.ts` near the existing CLI surface types:

```ts
export type CliSurfaceDiscoveryConfidence = 'high' | 'medium' | 'low';

export interface CliSurfaceDiscoveryCandidate {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  source: string;
  reason: string;
  confidence: CliSurfaceDiscoveryConfidence;
}

export interface CliSurfaceDiscoveryResult {
  confidence: CliSurfaceDiscoveryConfidence;
  candidates: CliSurfaceDiscoveryCandidate[];
}
```

- [ ] **Step 4: Implement the main discovery module**

Create `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-discovery.ts` with:

```ts
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type {
  CliSurfaceDiscoveryCandidate,
  CliSurfaceDiscoveryConfidence,
  CliSurfaceDiscoveryResult,
} from '../shared/types';

const NODE_SCRIPT_ORDER = ['dev:tui', 'dev:cli', 'tui', 'cli', 'dev', 'start'] as const;

function makeCandidate(
  id: string,
  command: string,
  args: string[] | undefined,
  cwd: string,
  source: string,
  reason: string,
  confidence: CliSurfaceDiscoveryConfidence,
): CliSurfaceDiscoveryCandidate {
  return { id, command, ...(args ? { args } : {}), cwd, source, reason, confidence };
}

function detectPackageManager(projectPath: string): 'npm' | 'pnpm' | 'yarn' {
  if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function discoverNodeCandidates(projectPath: string): CliSurfaceDiscoveryCandidate[] {
  const packageJsonPath = join(projectPath, 'package.json');
  if (!existsSync(packageJsonPath)) return [];
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};
  const pm = detectPackageManager(projectPath);
  return NODE_SCRIPT_ORDER
    .filter((name) => typeof scripts[name] === 'string')
    .map((name, index) =>
      makeCandidate(
        `node:${name}`,
        pm,
        pm === 'yarn' ? [name] : ['run', name],
        projectPath,
        `package.json:scripts.${name}`,
        `Found ${name} in package.json scripts`,
        index === 0 && NODE_SCRIPT_ORDER[0] === name ? 'high' : 'medium',
      ),
    );
}

function discoverPythonCandidates(projectPath: string): CliSurfaceDiscoveryCandidate[] {
  const appPyPath = join(projectPath, 'app.py');
  if (existsSync(appPyPath)) {
    const contents = readFileSync(appPyPath, 'utf8');
    if (contents.includes('textual.app')) {
      return [
        makeCandidate(
          'python:textual-app',
          'python',
          ['app.py'],
          projectPath,
          'python:textual-app',
          'Detected a Textual application entry file',
          'high',
        ),
      ];
    }
  }
  return [];
}

function discoverRustCandidates(projectPath: string): CliSurfaceDiscoveryCandidate[] {
  if (!existsSync(join(projectPath, 'Cargo.toml'))) return [];
  if (existsSync(join(projectPath, 'src', 'main.rs'))) {
    return [
      makeCandidate('cargo:main-bin', 'cargo', ['run'], projectPath, 'cargo:main-bin', 'Detected Cargo main binary', 'high'),
    ];
  }
  return [];
}

function discoverGoCandidates(projectPath: string): CliSurfaceDiscoveryCandidate[] {
  if (!existsSync(join(projectPath, 'go.mod'))) return [];
  const cmdDir = join(projectPath, 'cmd');
  if (!existsSync(cmdDir)) {
    return [makeCandidate('go:module-root', 'go', ['run', '.'], projectPath, 'go:module-root', 'Detected go.mod at project root', 'medium')];
  }

  const cmdEntry = readdirSync(cmdDir, { withFileTypes: true }).find((entry) => entry.isDirectory());
  if (!cmdEntry) return [];
  return [
    makeCandidate(
      `go:cmd:${cmdEntry.name}`,
      'go',
      ['run', `./cmd/${cmdEntry.name}`],
      projectPath,
      'go:cmd-entry',
      `Detected cmd/${cmdEntry.name} as the primary Go entrypoint`,
      'high',
    ),
  ];
}

export async function discoverCliSurface(projectPath: string): Promise<CliSurfaceDiscoveryResult> {
  const candidates = [
    ...discoverNodeCandidates(projectPath),
    ...discoverPythonCandidates(projectPath),
    ...discoverRustCandidates(projectPath),
    ...discoverGoCandidates(projectPath),
  ];

  if (candidates.length === 0) return { confidence: 'low', candidates: [] };
  if (candidates.length === 1 && candidates[0].confidence === 'high') {
    return { confidence: 'high', candidates };
  }
  return { confidence: 'medium', candidates };
}
```

- [ ] **Step 5: Run the discovery tests and confirm they pass**

Run:

```bash
npx vitest run src/main/cli-surface-discovery.test.ts
```

Expected: PASS with 6 passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/cli-surface-discovery.ts src/main/cli-surface-discovery.test.ts
git commit -m "feat: add cli surface autodiscovery engine"
```

### Task 2: Wire Discovery Through IPC And Preload

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-discovery-ipc.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-discovery-ipc.contract.test.ts`

- [ ] **Step 1: Write the failing IPC/preload contract test**

Create `/Users/batuhanyuksel/Documents/browser/src/main/cli-surface-discovery-ipc.contract.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const ipcHandlersSource = readFileSync(new URL('./ipc-handlers.ts', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../preload/preload.ts', import.meta.url), 'utf8');

describe('cli surface discovery IPC contract', () => {
  it('registers a discover handler in the main process', () => {
    expect(ipcHandlersSource).toContain("ipcMain.handle('cli-surface:discover'");
    expect(ipcHandlersSource).toContain('discoverCliSurface(');
  });

  it('exposes discover on window.calder.cliSurface', () => {
    expect(preloadSource).toContain("discover: (projectPath: string)");
    expect(preloadSource).toContain("ipcRenderer.invoke('cli-surface:discover', projectPath)");
  });
});
```

- [ ] **Step 2: Run the contract test to confirm the bridge does not exist yet**

Run:

```bash
npx vitest run src/main/cli-surface-discovery-ipc.contract.test.ts
```

Expected: FAIL because the new handler and preload API are missing.

- [ ] **Step 3: Add the IPC handler**

Modify `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`:

```ts
import { discoverCliSurface } from './cli-surface-discovery';
```

and add:

```ts
  ipcMain.handle('cli-surface:discover', async (_event, projectPath: string) => {
    return discoverCliSurface(projectPath);
  });
```

- [ ] **Step 4: Expose the preload API**

Modify `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts` inside the existing `cliSurface` bridge:

```ts
    discover: (projectPath: string) => ipcRenderer.invoke('cli-surface:discover', projectPath),
```

and ensure the preload type declaration includes:

```ts
      discover: (projectPath: string) => Promise<CliSurfaceDiscoveryResult>;
```

- [ ] **Step 5: Run the contract test again**

Run:

```bash
npx vitest run src/main/cli-surface-discovery-ipc.contract.test.ts
```

Expected: PASS with 2 passing tests.

- [ ] **Step 6: Run a broader safety check**

Run:

```bash
npm run build && npm test
```

Expected: PASS with no TypeScript errors and no renderer/preload regressions.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc-handlers.ts src/preload/preload.ts src/main/cli-surface-discovery-ipc.contract.test.ts
git commit -m "feat: expose cli surface discovery over ipc"
```

### Task 3: Add Renderer Setup Orchestration For Saved, Automatic, And Fallback Flows

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/setup.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/setup.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/setup.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/setup.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { CliSurfaceDiscoveryResult, CliSurfaceProfile, ProjectRecord } from '../../../shared/types';
import { openCliSurfaceWithSetup } from './setup';

function makeProject(): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Demo',
    path: '/tmp/demo',
    sessions: [],
    activeSessionId: null,
    layout: { mode: 'mosaic', splitPanes: [], splitDirection: 'horizontal' },
    surface: {
      kind: 'cli',
      active: false,
      cli: { profiles: [], runtime: { status: 'idle' } },
      web: { history: [] },
    },
  };
}

describe('openCliSurfaceWithSetup', () => {
  it('reuses and starts an existing saved profile without running discovery', async () => {
    const project = makeProject();
    const profile: CliSurfaceProfile = { id: 'saved', name: 'Saved', command: 'npm', args: ['run', 'dev:tui'], cwd: project.path };
    project.surface!.cli!.profiles = [profile];
    project.surface!.cli!.selectedProfileId = profile.id;

    const discover = vi.fn();
    const start = vi.fn();
    const persist = vi.fn();
    const showQuickSetup = vi.fn();
    const showManualSetup = vi.fn();

    await openCliSurfaceWithSetup(project, { discover, start, persist, showQuickSetup, showManualSetup });

    expect(discover).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith(profile);
    expect(showQuickSetup).not.toHaveBeenCalled();
    expect(showManualSetup).not.toHaveBeenCalled();
  });

  it('auto-creates and starts a high-confidence discovered profile', async () => {
    const project = makeProject();
    const discover = vi.fn<() => Promise<CliSurfaceDiscoveryResult>>().mockResolvedValue({
      confidence: 'high',
      candidates: [{
        id: 'node:dev:tui',
        command: 'npm',
        args: ['run', 'dev:tui'],
        cwd: project.path,
        source: 'package.json:scripts.dev:tui',
        reason: 'Found dev:tui in package.json scripts',
        confidence: 'high',
      }],
    });
    const start = vi.fn();
    const persist = vi.fn();

    await openCliSurfaceWithSetup(project, {
      discover,
      start,
      persist,
      showQuickSetup: vi.fn(),
      showManualSetup: vi.fn(),
    });

    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      name: 'dev:tui',
      command: 'npm',
      args: ['run', 'dev:tui'],
    }));
    expect(start).toHaveBeenCalled();
  });

  it('shows quick setup for medium-confidence discovery', async () => {
    const project = makeProject();
    const showQuickSetup = vi.fn();

    await openCliSurfaceWithSetup(project, {
      discover: vi.fn().mockResolvedValue({
        confidence: 'medium',
        candidates: [
          {
            id: 'node:cli',
            command: 'npm',
            args: ['run', 'cli'],
            cwd: project.path,
            source: 'package.json:scripts.cli',
            reason: 'Found cli in package.json scripts',
            confidence: 'medium',
          },
        ],
      }),
      start: vi.fn(),
      persist: vi.fn(),
      showQuickSetup,
      showManualSetup: vi.fn(),
    });

    expect(showQuickSetup).toHaveBeenCalledWith(project, expect.any(Array));
  });

  it('falls back to manual setup for low-confidence discovery', async () => {
    const project = makeProject();
    const showManualSetup = vi.fn();

    await openCliSurfaceWithSetup(project, {
      discover: vi.fn().mockResolvedValue({ confidence: 'low', candidates: [] }),
      start: vi.fn(),
      persist: vi.fn(),
      showQuickSetup: vi.fn(),
      showManualSetup,
    });

    expect(showManualSetup).toHaveBeenCalledWith(project);
  });
});
```

- [ ] **Step 2: Run the orchestration tests to confirm the module does not exist yet**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/setup.test.ts
```

Expected: FAIL with missing module or missing export errors.

- [ ] **Step 3: Implement the setup orchestrator**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/setup.ts` with:

```ts
import type {
  CliSurfaceDiscoveryCandidate,
  CliSurfaceDiscoveryResult,
  CliSurfaceProfile,
  ProjectRecord,
} from '../../../shared/types';

interface SetupDeps {
  discover: (projectPath: string) => Promise<CliSurfaceDiscoveryResult>;
  start: (profile: CliSurfaceProfile) => Promise<void>;
  persist: (profile: CliSurfaceProfile) => void;
  showQuickSetup: (project: ProjectRecord, candidates: CliSurfaceDiscoveryCandidate[]) => void;
  showManualSetup: (project: ProjectRecord) => void;
}

function candidateToProfile(candidate: CliSurfaceDiscoveryCandidate): CliSurfaceProfile {
  return {
    id: candidate.id,
    name: candidate.args?.[candidate.args.length - 1] ?? candidate.command,
    command: candidate.command,
    args: candidate.args,
    cwd: candidate.cwd,
  };
}

export async function openCliSurfaceWithSetup(project: ProjectRecord, deps: SetupDeps): Promise<void> {
  const cliState = project.surface?.cli;
  const saved = cliState?.profiles.find((profile) => profile.id === cliState.selectedProfileId) ?? cliState?.profiles[0];
  if (saved) {
    await deps.start(saved);
    return;
  }

  const result = await deps.discover(project.path);
  if (result.confidence === 'high' && result.candidates.length === 1) {
    const profile = candidateToProfile(result.candidates[0]);
    deps.persist(profile);
    await deps.start(profile);
    return;
  }

  if (result.confidence === 'medium' && result.candidates.length > 0) {
    deps.showQuickSetup(project, result.candidates);
    return;
  }

  deps.showManualSetup(project);
}
```

- [ ] **Step 4: Integrate the setup orchestrator into the tab bar**

Modify `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts`:

```ts
import { openCliSurfaceWithSetup } from './cli-surface/setup.js';
```

Then replace the current `activateCliSurface(project)` body with:

```ts
async function activateCliSurface(project: ProjectRecord): Promise<void> {
  const cliApi = window.calder?.cliSurface;
  await openCliSurfaceWithSetup(project, {
    discover: (projectPath) => cliApi!.discover(projectPath),
    start: async (profile) => {
      const surface = getProjectSurface(project);
      updateProjectSurface(project, {
        ...surface,
        kind: 'cli',
        active: true,
        cli: {
          profiles: surface.cli?.profiles ?? [profile],
          selectedProfileId: profile.id,
          runtime: {
            ...(surface.cli?.runtime ?? { status: 'idle' }),
            selectedProfileId: profile.id,
          },
        },
      });
      await cliApi?.start(project.id, profile);
    },
    persist: (profile) => {
      const surface = getProjectSurface(project);
      const profiles = [...(surface.cli?.profiles ?? []), profile];
      updateProjectSurface(project, {
        ...surface,
        kind: 'cli',
        active: true,
        cli: {
          profiles,
          selectedProfileId: profile.id,
          runtime: surface.cli?.runtime ?? { status: 'idle', selectedProfileId: profile.id },
        },
      });
    },
    showQuickSetup: (activeProject, candidates) => showCliSurfaceQuickSetup(activeProject, candidates, promptCliSurfaceProfile),
    showManualSetup: (activeProject) => promptCliSurfaceProfile(activeProject),
  });
}
```

- [ ] **Step 5: Run the setup tests**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/setup.test.ts
```

Expected: PASS with 4 passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/cli-surface/setup.ts src/renderer/components/cli-surface/setup.test.ts src/renderer/components/tab-bar.ts
git commit -m "feat: add cli surface setup orchestration"
```

### Task 4: Add Quick Setup UI And End-To-End Renderer Integration

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/quick-setup.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/quick-setup.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar-cli-surface.contract.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cli-surface.css`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/quick-setup.test.ts`

- [ ] **Step 1: Write the failing quick setup UI test**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/quick-setup.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliSurfaceDiscoveryCandidate } from '../../../shared/types';
import { showCliSurfaceQuickSetup } from './quick-setup';

const candidates: CliSurfaceDiscoveryCandidate[] = [
  {
    id: 'node:cli',
    command: 'npm',
    args: ['run', 'cli'],
    cwd: '/tmp/demo',
    source: 'package.json:scripts.cli',
    reason: 'Found cli in package.json scripts',
    confidence: 'medium',
  },
  {
    id: 'node:dev',
    command: 'npm',
    args: ['run', 'dev'],
    cwd: '/tmp/demo',
    source: 'package.json:scripts.dev',
    reason: 'Found dev in package.json scripts',
    confidence: 'medium',
  },
];

beforeEach(() => {
  document.body.innerHTML = `
    <div id="modal-overlay" class="hidden">
      <div id="modal">
        <div id="modal-title"></div>
        <div id="modal-body"></div>
        <div id="modal-actions">
          <button id="modal-cancel">Cancel</button>
          <button id="modal-confirm">Create</button>
        </div>
      </div>
    </div>
  `;
});

describe('showCliSurfaceQuickSetup', () => {
  it('renders candidates and wires Run, Edit, and Manual setup actions', () => {
    const onRun = vi.fn();
    const onEdit = vi.fn();
    const onManual = vi.fn();

    showCliSurfaceQuickSetup(candidates, { onRun, onEdit, onManual });

    expect(document.body.textContent).toContain('npm run cli');
    expect(document.body.textContent).toContain('npm run dev');
    expect(document.body.textContent).toContain('Found cli in package.json scripts');

    (document.querySelector('[data-action="run"][data-candidate-id="node:cli"]') as HTMLButtonElement).click();
    expect(onRun).toHaveBeenCalledWith(candidates[0]);

    (document.querySelector('[data-action="edit"][data-candidate-id="node:dev"]') as HTMLButtonElement).click();
    expect(onEdit).toHaveBeenCalledWith(candidates[1]);

    (document.querySelector('[data-action="manual-setup"]') as HTMLButtonElement).click();
    expect(onManual).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the quick setup test to confirm the module is missing**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/quick-setup.test.ts
```

Expected: FAIL with missing module or missing DOM controls.

- [ ] **Step 3: Implement the quick setup UI**

Create `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/quick-setup.ts` with:

```ts
import { closeModal, prepareModalSurface } from '../modal.js';
import type { CliSurfaceDiscoveryCandidate } from '../../../shared/types';

interface QuickSetupHandlers {
  onRun: (candidate: CliSurfaceDiscoveryCandidate) => void;
  onEdit: (candidate: CliSurfaceDiscoveryCandidate) => void;
  onManual: () => void;
}

function formatCommand(candidate: CliSurfaceDiscoveryCandidate): string {
  return [candidate.command, ...(candidate.args ?? [])].join(' ');
}

export function showCliSurfaceQuickSetup(
  candidates: CliSurfaceDiscoveryCandidate[],
  handlers: QuickSetupHandlers,
): void {
  const overlay = document.getElementById('modal-overlay')!;
  const titleEl = document.getElementById('modal-title')!;
  const bodyEl = document.getElementById('modal-body')!;
  const actionsEl = document.getElementById('modal-actions')!;

  prepareModalSurface();
  overlay.classList.remove('hidden');
  titleEl.textContent = 'CLI Surface Suggestions';
  bodyEl.innerHTML = '';
  actionsEl.innerHTML = '';

  for (const candidate of candidates) {
    const card = document.createElement('div');
    card.className = 'cli-surface-quick-setup-card';
    card.innerHTML = `
      <div class="cli-surface-quick-setup-command">${formatCommand(candidate)}</div>
      <div class="cli-surface-quick-setup-reason">${candidate.reason}</div>
      <div class="cli-surface-quick-setup-cwd">${candidate.cwd ?? ''}</div>
      <div class="cli-surface-quick-setup-actions">
        <button type="button" data-action="run" data-candidate-id="${candidate.id}">Run</button>
        <button type="button" data-action="edit" data-candidate-id="${candidate.id}">Edit</button>
      </div>
    `;
    bodyEl.appendChild(card);
  }

  bodyEl.querySelectorAll('[data-action="run"]').forEach((button) => {
    button.addEventListener('click', () => {
      const candidate = candidates.find((entry) => entry.id === (button as HTMLElement).dataset.candidateId)!;
      handlers.onRun(candidate);
      closeModal();
    });
  });

  bodyEl.querySelectorAll('[data-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => {
      const candidate = candidates.find((entry) => entry.id === (button as HTMLElement).dataset.candidateId)!;
      handlers.onEdit(candidate);
      closeModal();
    });
  });

  const manualButton = document.createElement('button');
  manualButton.type = 'button';
  manualButton.dataset.action = 'manual-setup';
  manualButton.textContent = 'Manual setup';
  manualButton.addEventListener('click', () => {
    handlers.onManual();
    closeModal();
  });
  actionsEl.appendChild(manualButton);
}
```

- [ ] **Step 4: Hook quick setup into the tab bar and improve runtime copy**

Modify `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar.ts` to import and use:

```ts
import { showCliSurfaceQuickSetup } from './cli-surface/quick-setup.js';
```

and make the `showQuickSetup` dependency:

```ts
showQuickSetup: (activeProject, candidates) => showCliSurfaceQuickSetup(candidates, {
  onRun: async (candidate) => {
    const profile = {
      id: candidate.id,
      name: candidate.args?.[candidate.args.length - 1] ?? candidate.command,
      command: candidate.command,
      args: candidate.args,
      cwd: candidate.cwd,
    };
    const surface = getProjectSurface(activeProject);
    updateProjectSurface(activeProject, {
      ...surface,
      kind: 'cli',
      active: true,
      cli: {
        profiles: [...(surface.cli?.profiles ?? []), profile],
        selectedProfileId: profile.id,
        runtime: surface.cli?.runtime ?? { status: 'idle', selectedProfileId: profile.id },
      },
    });
    void window.calder?.cliSurface?.start(activeProject.id, profile);
  },
  onEdit: (candidate) => {
    promptCliSurfaceProfile(activeProject, {
      id: candidate.id,
      name: candidate.args?.[candidate.args.length - 1] ?? candidate.command,
      command: candidate.command,
      args: candidate.args,
      cwd: candidate.cwd,
    });
  },
  onManual: () => promptCliSurfaceProfile(activeProject),
}),
```

Modify `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/pane.ts` so empty/error copy becomes:

```ts
  instance.emptyEl.textContent = 'Calder can run a detected CLI or TUI command here. If startup fails, edit the command or try another suggestion.';
```

- [ ] **Step 5: Add the quick setup styles and contract expectations**

Add these styles to `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/cli-surface.css`:

```css
.cli-surface-quick-setup-card {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-panel) 90%, transparent);
}

.cli-surface-quick-setup-command {
  font-family: var(--font-mono);
  color: var(--text-primary);
  font-size: 12px;
}

.cli-surface-quick-setup-reason,
.cli-surface-quick-setup-cwd {
  color: var(--text-muted);
  font-size: 11px;
}

.cli-surface-quick-setup-actions {
  display: flex;
  gap: 8px;
}
```

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/components/tab-bar-cli-surface.contract.test.ts`:

```ts
  it('delegates cli surface entry to setup and quick-setup helpers', () => {
    expect(tabBarSource).toContain('openCliSurfaceWithSetup');
    expect(tabBarSource).toContain('showCliSurfaceQuickSetup');
  });
```

- [ ] **Step 6: Run the renderer tests and broader verification**

Run:

```bash
npx vitest run src/renderer/components/cli-surface/quick-setup.test.ts src/renderer/components/cli-surface/setup.test.ts src/renderer/components/tab-bar-cli-surface.contract.test.ts
npm run build && npm test
```

Expected:
- targeted renderer tests PASS
- full build PASS
- full test suite PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/cli-surface/quick-setup.ts src/renderer/components/cli-surface/quick-setup.test.ts src/renderer/components/cli-surface/pane.ts src/renderer/components/tab-bar.ts src/renderer/components/tab-bar-cli-surface.contract.test.ts src/renderer/styles/cli-surface.css
git commit -m "feat: add cli surface quick setup flow"
```

## Spec Coverage Check

- Autodiscovery-first behavior: Task 1 + Task 3
- High-confidence auto-create and auto-start: Task 3
- Medium-confidence quick setup picker: Task 4
- Manual fallback: Task 3 + Task 4
- Saved profile reuse: Task 3
- Browser preservation: constrained by execution notes and limited file touch set

## Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task includes file paths, test commands, and concrete code snippets.

## Type Consistency Check

- Discovery types consistently use `CliSurfaceDiscoveryCandidate` and `CliSurfaceDiscoveryResult`.
- Renderer orchestration consistently uses `openCliSurfaceWithSetup`.
- Quick picker consistently uses `showCliSurfaceQuickSetup`.
