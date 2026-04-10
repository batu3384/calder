# Calder Shell Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining legacy product identity, initialize the repository professionally on `main`, and apply a subtle Calder shell polish without changing workflow or information architecture.

**Architecture:** Keep the renderer structure and behavior intact, remove legacy runtime/storage aliases directly, then refine the shell through shared theme tokens and targeted chrome updates. Protect fast session creation and existing modal/split behavior while improving polish through CSS and a small number of renderer component token integrations.

**Tech Stack:** Electron, TypeScript, vanilla renderer DOM, Vitest, CSS

---

### Task 1: Initialize Git And Ignore Working Artifacts

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/.gitignore`
- Create: `/Users/batuhanyuksel/Documents/browser/.git/` (via `git init -b main`)

- [ ] **Step 1: Extend ignore rules for local tooling artifacts**

Add these lines to `/Users/batuhanyuksel/Documents/browser/.gitignore`:

```gitignore
.superpowers/
.tmp-home-ui/
.tmp-ui/
```

- [ ] **Step 2: Initialize the repository on `main`**

Run:

```bash
git -C /Users/batuhanyuksel/Documents/browser init -b main
```

Expected: output mentioning an initialized empty Git repository with `main` as the initial branch.

- [ ] **Step 3: Verify repository state**

Run:

```bash
git -C /Users/batuhanyuksel/Documents/browser status --short --branch
```

Expected: output starts with `## main` and does not show ignored temp folders.

### Task 2: Write Failing Tests For Hard Brand Break

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/store.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/codex-hooks.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/hook-status.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/notification-desktop.test.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/readiness/checkers/context-optimization.test.ts`

- [ ] **Step 1: Replace legacy migration assertions with hard-Calder expectations**

Update tests so they expect:

```ts
// store.test.ts
expect(mockReadFileSync).not.toHaveBeenCalledWith('/mock/home/.legacy-app/state.json', 'utf-8');

// codex-hooks.test.ts
expect(script).not.toContain('old-hook');
expect(script).toContain('calder-hook');
expect(script).not.toContain('CALDER_SESSION_ID=');

// preload/runtime tests
expect('legacyProduct' in window).toBe(false);
```

and remove any test cases that assert fallback behavior for the previous product identity.

- [ ] **Step 2: Run the focused tests to verify RED**

Run:

```bash
./node_modules/.bin/vitest run \
  src/main/store.test.ts \
  src/main/codex-hooks.test.ts \
  src/main/hook-status.test.ts \
  src/main/readiness/checkers/context-optimization.test.ts \
  src/renderer/notification-desktop.test.ts
```

Expected: failing assertions showing the code still accepts or exposes legacy product identity.

### Task 3: Remove Legacy Identity From Runtime And Storage

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/preload/preload.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/state.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/types.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/store.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/codex-hooks.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/gemini-hooks.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/claude-cli.ts`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/main/settings-guard.ts`
- Delete: previous-name launcher shim in `/Users/batuhanyuksel/Documents/browser/bin/`

- [ ] **Step 1: Remove renderer compatibility aliases**

Make these changes:

```ts
// preload.ts
contextBridge.exposeInMainWorld('calder', api);

// renderer/state.ts
interface Window {
  calder: CalderApi;
}

// renderer/types.ts
export interface CalderApi { /* existing shape */ }
```

Delete deprecated renderer compatibility exposures and API alias types.

- [ ] **Step 2: Remove legacy state fallback**

Keep only Calder paths in `/Users/batuhanyuksel/Documents/browser/src/main/store.ts`:

```ts
const STATE_DIR = path.join(os.homedir(), '.calder');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

for (const file of [STATE_FILE, STATE_FILE + '.tmp']) {
  // existing read logic
}
```

- [ ] **Step 3: Remove acceptance of old hook markers and status-line fragments**

Update the hook detection logic so it only recognizes Calder markers:

```ts
return h.command?.includes(CODEX_HOOK_MARKER) || false;
```

and remove legacy marker/status-line constants from the hook and settings guard modules.

- [ ] **Step 4: Remove old launcher shim**

Remove the previous-name launcher shim from the repo and package-facing flow so the old CLI name is no longer supported at runtime.

- [ ] **Step 5: Run the focused tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run \
  src/main/store.test.ts \
  src/main/codex-hooks.test.ts \
  src/main/hook-status.test.ts \
  src/main/readiness/checkers/context-optimization.test.ts \
  src/renderer/notification-desktop.test.ts
```

Expected: all selected tests pass.

### Task 4: Polish Shared Shell Tokens

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/dom-utils.ts`

- [ ] **Step 1: Replace the base shell palette with deeper Calder tones**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/base.css` to use a calmer graphite palette with explicit shell tokens, for example:

```css
:root {
  --bg-primary: #0a0f15;
  --bg-secondary: #0f141b;
  --bg-tertiary: #151b23;
  --bg-hover: #1a2230;
  --text-primary: #e6edf6;
  --text-secondary: #a9b4c2;
  --text-muted: #6d7887;
  --accent: #ff4d67;
  --accent-dim: #d63f58;
  --border: #212a36;
  --panel-shadow: 0 16px 40px rgba(0, 0, 0, 0.34);
  --radius-sm: 6px;
  --radius-md: 10px;
}
```

- [ ] **Step 2: Standardize semantic color helpers**

Update `/Users/batuhanyuksel/Documents/browser/src/renderer/dom-utils.ts` to use token-aligned semantic colors instead of the old bright defaults.

- [ ] **Step 3: Build to verify no CSS/token regressions**

Run:

```bash
npm run build
```

Expected: build succeeds.

### Task 5: Apply Surgical Shell Polish

**Files:**
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/sidebar.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/tabs.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/modals.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/terminal.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/preferences.css`
- Modify: `/Users/batuhanyuksel/Documents/browser/src/renderer/styles/alerts.css`

- [ ] **Step 1: Refine sidebar density without changing hierarchy**

Adjust spacing, separators, active states, and section headers in `sidebar.css` while keeping the same structure and collapsed behavior.

- [ ] **Step 2: Refine tab bar and action controls**

Tighten `tabs.css` to make tabs, action buttons, git status, and context menus feel more deliberate without increasing visual noise.

- [ ] **Step 3: Refine modal framework**

Update `modals.css` and `preferences.css` so modal spacing, headers, footer buttons, and select/input controls feel authored rather than generic.

- [ ] **Step 4: Refine session chrome**

Update `terminal.css` and alert-related surfaces so pane borders, status bars, overlays, and empty states reflect the new shell tone without changing pane behavior.

- [ ] **Step 5: Run build again**

Run:

```bash
npm run build
```

Expected: build succeeds after the shell polish changes.

### Task 6: Remove Remaining Product Residue And Verify

**Files:**
- Delete: previous-name root ignore artifact
- Create: `/Users/batuhanyuksel/Documents/browser/.calderignore`
- Modify: `/Users/batuhanyuksel/Documents/browser/CHANGELOG.md` (only if non-archival runtime-facing residue remains)
- Modify: other files returned by residue search if needed

- [ ] **Step 1: Replace the root ignore file with Calder naming**

Rename or replace the root ignore file so the project no longer ships a legacy-named artifact.

- [ ] **Step 2: Run residue search**

Run:

```bash
rg -n --hidden --glob '!node_modules' --glob '!dist' '<previous-name-patterns>' /Users/batuhanyuksel/Documents/browser
```

Expected: no runtime-facing old-brand results remain; only intentional archival changelog context is allowed until archival docs are cleaned or removed.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run build
./node_modules/.bin/vitest run
git -C /Users/batuhanyuksel/Documents/browser status --short --branch
```

Expected:
- build passes
- full test suite passes
- git status shows the intended tracked changes on `main`
