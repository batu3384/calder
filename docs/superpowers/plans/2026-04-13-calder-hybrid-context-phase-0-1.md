# Calder Hybrid Context Phase 0-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 0 and Phase 1 of Calder's hybrid context system so provider-native memory sources are discoverable and visible, shared project rules can be added, and browser/CLI prompt routing can use a compact applied-context summary.

**Architecture:** Keep provider-native memory untouched and add a Calder-owned discovery, normalization, registry, and resolver layer around it. Main process code will scan and watch visible context files, renderer state will store a compact project context snapshot, and browser/CLI routing code will append a short, budgeted applied-context block instead of injecting raw file contents.

**Tech Stack:** Electron, TypeScript, vanilla DOM renderer, Vitest, markdown file discovery, IPC

---

## Scope

This plan intentionally covers only the first working slice:

- Phase 0: product truth cleanup and discovery visibility
- Phase 1: shared rules and compact prompt application

It does not include workflows, checkpoints, background agents, or governance controls.

## File Structure Lock

- `/Users/batuhanyuksel/Documents/browser/src/shared/types.ts`
  Extend shared contracts for discovered context sources, project context state, and applied-context payloads.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-context/discovery.ts`
  New source discovery and normalization entrypoint.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-context/discovery.test.ts`
  Unit tests for discovery and normalization rules.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-context/watcher.ts`
  New watcher for project context source changes.
- `/Users/batuhanyuksel/Documents/browser/src/main/calder-context/watcher.test.ts`
  Watcher behavior tests.
- `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`
  Add IPC fetch and watch hooks for project context state.
- `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts`
  Expose context APIs to renderer.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/types.ts`
  Renderer-side typing for context APIs.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/state.ts`
  Persist compact project context snapshots and subscribe to updates.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.ts`
  Show discovered provider-native sources and shared rule counts.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
  Add `Memory & Rules` management surface and starter-file actions.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/session-integration.ts`
  Append compact applied-context summaries for browser prompt routing.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/session-integration.ts`
  Append compact applied-context summaries for CLI prompt routing.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.contract.test.ts`
  Extend or create contract coverage for visible context summaries.
- `/Users/batuhanyuksel/Documents/browser/src/renderer/components/applied-context.contract.test.ts`
  Contract coverage for browser and CLI prompt summaries.
- `/Users/batuhanyuksel/Documents/browser/README.md`
  Align feature and provider documentation with shipped behavior.

## Execution Order

1. Shared contracts
2. Main-process discovery
3. Main-process watcher and IPC
4. Renderer state wiring
5. Read-only context visibility UI
6. Shared rules support
7. Compact prompt application
8. Preferences management and scaffolding
9. README cleanup
10. Final verification

## Task 1: Extend Shared Contracts

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/shared/types.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/shared/project-context.contract.test.ts`

- [ ] **Step 1: Write the failing contract test**

Add a new test file with assertions for:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../../shared/types.ts', import.meta.url),
  'utf8',
);

describe('project context contracts', () => {
  it('defines a discovered context source model', () => {
    expect(source).toContain('export interface ProjectContextSource');
    expect(source).toContain("provider: ProviderId | 'shared'");
    expect(source).toContain("kind: 'memory' | 'rules' | 'instructions' | 'mcp'");
  });

  it('defines a project context state snapshot', () => {
    expect(source).toContain('export interface ProjectContextState');
    expect(source).toContain('sources: ProjectContextSource[]');
    expect(source).toContain('sharedRuleCount: number');
  });

  it('defines applied-context payload fields', () => {
    expect(source).toContain('appliedContext?: AppliedContextSummary');
    expect(source).toContain('export interface AppliedContextSummary');
  });
});
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run:

```bash
npx vitest run src/shared/project-context.contract.test.ts
```

Expected: FAIL because the new types do not exist yet.

- [ ] **Step 3: Add minimal shared type definitions**

Add the following families to `types.ts`:

- `ProjectContextSource`
- `ProjectContextState`
- `AppliedContextSourceRef`
- `AppliedContextSummary`

Required fields:

- `provider`
- `scope`
- `kind`
- `path`
- `displayName`
- `summary`
- `lastUpdated`

Also extend relevant prompt payload types so routed prompt helpers can carry `appliedContext`.

- [ ] **Step 4: Run the contract test to verify it passes**

Run:

```bash
npx vitest run src/shared/project-context.contract.test.ts
```

Expected: PASS

## Task 2: Build Project Context Discovery

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/calder-context/discovery.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/calder-context/discovery.test.ts`

- [ ] **Step 1: Write the failing discovery tests**

Cover these cases:

- discovers `CLAUDE.md`
- discovers `CALDER.shared.md`
- discovers `.calder/rules/*.md`
- deduplicates missing/unsupported files cleanly
- tags shared files with `provider: 'shared'`

Use fixture-style temp directories rather than the real repo.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/main/calder-context/discovery.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal discovery**

Discovery rules for v1:

- `CLAUDE.md` -> `provider: 'claude'`, `kind: 'memory'`
- `CALDER.shared.md` -> `provider: 'shared'`, `kind: 'rules'`
- `.calder/rules/*.md` -> `provider: 'shared'`, `kind: 'rules'`
- `.mcp.json` -> `provider: 'shared'`, `kind: 'mcp'`

Each discovered source should include:

- absolute `path`
- friendly `displayName`
- `lastUpdated`
- compact `summary` from the first non-empty line or heading

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npx vitest run src/main/calder-context/discovery.test.ts
```

Expected: PASS

## Task 3: Add Context Watcher And IPC

**Files:**
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/calder-context/watcher.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/main/calder-context/watcher.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/types.ts`

- [ ] **Step 1: Write the failing watcher and IPC tests**

Add tests for:

- initial context fetch IPC
- update callback after a watched file changes
- clean teardown when switching projects

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:

```bash
npx vitest run src/main/calder-context/watcher.test.ts
```

Expected: FAIL because watcher and IPC hooks do not exist.

- [ ] **Step 3: Implement watcher and IPC plumbing**

Required APIs:

- `context:getProjectState(projectPath)`
- `context:watchProject(projectPath)`
- renderer event subscription for updates

Behavior rules:

- debounce file changes
- reuse discovery module for refresh
- stop previous watcher when project changes

- [ ] **Step 4: Run the watcher tests to verify they pass**

Run:

```bash
npx vitest run src/main/calder-context/watcher.test.ts
```

Expected: PASS

## Task 4: Wire Renderer State To Project Context

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/state.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/state.project-context.test.ts`

- [ ] **Step 1: Write the failing renderer-state test**

Cover:

- stores a compact project context snapshot
- updates context on incoming watch events
- avoids persisting full raw markdown blobs

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/renderer/state.project-context.test.ts
```

Expected: FAIL because project context state is not yet modeled.

- [ ] **Step 3: Implement minimal state integration**

Rules:

- keep discovered sources in project state
- persist compact metadata only
- do not persist full file bodies

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npx vitest run src/renderer/state.project-context.test.ts
```

Expected: PASS

## Task 5: Add Read-Only Context Visibility In The UI

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.contract.test.ts`

- [ ] **Step 1: Write the failing UI contract test**

Assert the inspector and preferences source now contain:

- `Provider context`
- `Shared rules`
- `Memory & Rules`
- applied source count or summary text

- [ ] **Step 2: Run the contract test to verify it fails**

Run:

```bash
npx vitest run src/renderer/components/context-inspector.contract.test.ts
```

Expected: FAIL because those labels and sections do not exist.

- [ ] **Step 3: Implement read-only UI summaries**

Inspector requirements:

- show active provider-native source count
- show shared rule count
- show last update freshness

Preferences requirements:

- add a `Memory & Rules` section
- list discovered sources
- no edit/write actions yet beyond placeholders for starter file creation

- [ ] **Step 4: Run the contract test to verify it passes**

Run:

```bash
npx vitest run src/renderer/components/context-inspector.contract.test.ts
```

Expected: PASS

## Task 6: Add Shared Rules Support

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/calder-context/discovery.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/main/calder-context/discovery.test.ts`

- [ ] **Step 1: Extend discovery tests first**

Add tests for:

- `.calder/rules/*.md` ordering
- rule display names
- hard vs soft rule classification inferred from frontmatter or filename convention

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/main/calder-context/discovery.test.ts
```

Expected: FAIL because shared-rule metadata is incomplete.

- [ ] **Step 3: Implement shared-rule metadata**

V1 convention:

- filenames with `.hard.` or frontmatter `priority: hard` -> hard rule
- all others -> soft rule

Add this metadata to normalized sources.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npx vitest run src/main/calder-context/discovery.test.ts
```

Expected: PASS

## Task 7: Apply Compact Context In Browser And CLI Routing

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/browser-tab/session-integration.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/cli-surface/session-integration.ts`
- Create: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/applied-context.contract.test.ts`

- [ ] **Step 1: Write the failing routing contract test**

Assert that routed prompt builders now include:

- applied source names
- shared rules summary
- provider-native relevant summary
- no raw full-file dump markers

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/renderer/components/applied-context.contract.test.ts
```

Expected: FAIL because no applied-context summary exists.

- [ ] **Step 3: Implement compact applied-context summaries**

Rules:

- keep user prompt first
- keep surface selection first-class
- append short applied-context block
- cap added summary length
- do not append raw markdown bodies

- [ ] **Step 4: Run the contract test to verify it passes**

Run:

```bash
npx vitest run src/renderer/components/applied-context.contract.test.ts
```

Expected: PASS

## Task 8: Add Starter File Scaffolding

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/ipc-handlers.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/preferences-modal.ts`
- Test: `/Users/batuhanyuksel/Documents/browser/src/renderer/components/context-inspector.contract.test.ts`

- [ ] **Step 1: Extend the UI contract test first**

Assert the preferences source includes starter actions:

- `Create CALDER.shared.md`
- `Create sample rules`

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/renderer/components/context-inspector.contract.test.ts
```

Expected: FAIL because no scaffolding actions exist.

- [ ] **Step 3: Implement starter-file creation**

Starter files:

- `CALDER.shared.md`
- `.calder/rules/testing.md`
- `.calder/rules/boundaries.md`

Rules:

- create only if missing
- never overwrite existing files

- [ ] **Step 4: Run the contract test to verify it passes**

Run:

```bash
npx vitest run src/renderer/components/context-inspector.contract.test.ts
```

Expected: PASS

## Task 9: Align README With Shipped Reality

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/README.md`
- Test: `/Users/batuhanyuksel/Documents/browser/src/main/readme-product-truth.contract.test.ts`

- [ ] **Step 1: Write the failing README contract test**

Assert:

- old readiness feature language is removed
- provider list includes current shipped providers
- hybrid context / shared rules feature is documented

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run src/main/readme-product-truth.contract.test.ts
```

Expected: FAIL because README still contains stale product claims.

- [ ] **Step 3: Update README**

Required doc changes:

- replace stale provider text
- remove removed readiness score claims
- add concise `Hybrid Context` explanation

- [ ] **Step 4: Run the README contract test to verify it passes**

Run:

```bash
npx vitest run src/main/readme-product-truth.contract.test.ts
```

Expected: PASS

## Task 10: Final Verification

**Files:**
- Verify all files touched above

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npx vitest run \
  src/shared/project-context.contract.test.ts \
  src/main/calder-context/discovery.test.ts \
  src/main/calder-context/watcher.test.ts \
  src/renderer/state.project-context.test.ts \
  src/renderer/components/context-inspector.contract.test.ts \
  src/renderer/components/applied-context.contract.test.ts \
  src/main/readme-product-truth.contract.test.ts
```

Expected: PASS

- [ ] **Step 2: Run typecheck**

Run:

```bash
npx tsc -p tsconfig.test.json --noEmit
```

Expected: PASS

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 5: Commit the completed slice**

```bash
git add README.md src/shared/types.ts src/main/calder-context src/main/ipc-handlers.ts src/preload/preload.ts src/renderer/types.ts src/renderer/state.ts src/renderer/components/context-inspector.ts src/renderer/components/preferences-modal.ts src/renderer/components/browser-tab/session-integration.ts src/renderer/components/cli-surface/session-integration.ts src/shared/project-context.contract.test.ts src/renderer/state.project-context.test.ts src/renderer/components/context-inspector.contract.test.ts src/renderer/components/applied-context.contract.test.ts src/main/readme-product-truth.contract.test.ts
git commit -m "feat: add hybrid context discovery and shared rules v1"
```
