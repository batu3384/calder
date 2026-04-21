# Calder Architecture Hardening Master Plan (2026-04-21)

> **Execution mode:** Subagent-driven implementation with strict safety gates.
> **Scope:** Main hook gateway + IPC governance boundaries + renderer/state modularization + preload/testing/process debt.
> **Goal:** Reduce hidden security/reliability risk while keeping behavior stable and shipping cadence intact.

## 1) Baseline Snapshot (Current State)

- `npm run build`: PASS
- `npm test`: PASS (`312` files / `2347` tests)
- `npm run audit:deep`: PASS
- `code-review-graph detect-changes --base HEAD --brief`:
  - risk score: `0.55`
  - changed functions/classes: `68`
  - test gaps: `14`

### Key Findings (Consolidated)

1. **Main/process risks**
  - Project-path trust boundary is inconsistent across IPC write/scaffold flows.
  - MCP runtime calls (`connect/callTool/readResource/getPrompt`) are less-governed than add/remove flows.
  - Startup hook installation is not fully fail-soft per provider.
  - Config watcher is singleton-based (single active project/provider/window).

2. **Renderer/preload risks**
  - `state.ts`, `tab-bar.ts`, `cli-surface/pane.ts`, `config-sections.ts` are monolithic and highly coupled.
  - Persistence path is fire-and-forget; race/ordering behavior is weakly specified.
  - i18n is large and mutation-observer based; maintainability risk is high.
  - Preload bridge is large single surface; contract coverage is limited.

3. **QA/process risks**
  - Coverage config excludes `src/renderer/components/**` and `src/preload/**`.
  - `test:critical-stability` covers only narrow renderer slices.
  - `audit:deep` uses `npx knip` (determinism/supply-chain concern).
  - Documentation guidance is repeated in multiple files (drift risk).

## 2) Delivery Strategy

- **Principle A:** Close security boundaries first, then reliability, then modularization.
- **Principle B:** Prefer small, reversible, test-guarded increments.
- **Principle C:** Every step must pass: `npm run build`, targeted tests, then full tests.
- **Principle D:** No behavior-changing refactor without explicit contract tests.

## 3) Workstreams and Phases

---

## Phase 0 — Governance and Guardrails (Preparation)

### Objective
Establish stable execution governance before large code movement.

### Tasks
- [x] Capture baseline metrics artifact in `docs/superpowers/reports/`.
- [x] Add a single “master execution board” section at bottom of this file (status, owner, date, next action).
- [x] Define mandatory validation matrix per phase (targeted + full).

### Mandatory Validation Matrix (All Phases)

- Targeted tests for touched modules first.
- `npm run build`.
- `npm test`.
- `npm run audit:deep` on phase boundaries and security-sensitive changes.

### Validation
- [x] `npm run build`
- [x] `npm test`

---

## Phase 1 — Security Boundary Hardening (P0/P1)

### Objective
Prevent path/governance bypass and reduce startup blast radius.

### Tasks

#### 1.1 Project Path Trust Boundary
- [x] Introduce centralized `requireKnownProjectPath(projectPath)` helper in main IPC layer.
- [x] Apply helper to write/scaffold sensitive handlers (`ipc-calder`, `ipc-git`, `ipc-provider` where relevant).
- [x] Add negative tests for unknown/outside paths.

**Primary files**
- `src/main/ipc-calder.ts`
- `src/main/ipc-git.ts`
- `src/main/ipc-provider.ts`
- `src/main/*test.ts` (targeted)

#### 1.2 MCP Runtime Governance
- [x] Apply governance enforcement to `mcp:connect`, `mcp:callTool`, `mcp:readResource`, `mcp:getPrompt`.
- [x] Preserve current behavior for allowed paths, reject with explicit typed errors when disallowed.
- [x] Add contract tests for allow/deny cases.

**Primary files**
- `src/main/mcp-ipc-handlers.ts`
- `src/main/ipc-mcp-governance.ts`
- `src/main/*mcp*.test.ts`

#### 1.3 Provider Hook Install Fail-Soft
- [x] Wrap provider hook installation in provider-scoped try/catch at startup.
- [x] Log structured warning per provider, continue app startup.
- [x] Add startup regression test for one-provider-fails scenario.

**Primary files**
- `src/main/main.ts`
- `src/main/main*.test.ts` (or nearest lifecycle/runtime suite)

#### 1.4 Auto-Heal Consent Respect
- [x] Ensure foreign-statusline consent remains authoritative when declined.
- [x] Prevent silent escalation from denied to granted in auto-repair flow.
- [x] Add tests for “declined stays declined” semantics.

**Primary files**
- `src/main/ipc-handlers.ts`
- `src/main/settings-guard.ts`
- `src/main/*settings*test.ts`

### Validation
- [x] Targeted test slices for each subtask
- [x] `npm run build`
- [x] `npm test`
- [x] `npm run audit:deep` (phase exit)

---

## Phase 2 — Reliability and State Integrity

### Objective
Stabilize session persistence, watcher lifecycle, and runtime mapping.

### Tasks

#### 2.1 Renderer Persistence Queue
- [x] Replace fire-and-forget save behavior with serialized queue semantics.
- [x] Add deterministic “last write wins” policy tests under rapid mutation.

**Primary files**
- `src/renderer/state.ts`
- `src/renderer/state.test.ts`

#### 2.2 Config Watcher Multi-Context Model
- [x] Refactor singleton watcher state to keyed contexts (`project+provider+window`).
- [x] Ensure stop/cleanup semantics remain strict.

**Primary files**
- `src/main/config-watcher.ts`
- `src/main/config-watcher.test.ts`

#### 2.3 Codex Session Mapping Robustness
- [x] Replace FIFO heuristic with deterministic correlation strategy (`cwd/time/session token`).
- [x] Add concurrency tests for parallel session starts.

**Primary files**
- `src/main/codex-session-watcher.ts`
- `src/main/codex-session-watcher.test.ts`

### Validation
- [x] Targeted tests
- [x] `npm run build`
- [x] `npm test`

---

## Phase 3 — Renderer/Preload Modularization

### Objective
Reduce monolith size and coupling without behavior regressions.

### Tasks

#### 3.1 `tab-bar` Split
- [x] Extract CLI update panel/button concern into dedicated `tab-bar-cli-update-panel` module (slice-1, behavior-preserving).
- [x] Extract provider selector concern into dedicated `tab-bar-provider-selector-controller` module (slice-2, behavior-preserving).
- [x] Extract branch menu concern into dedicated `tab-bar-branch-menu-controller` module (slice-3, behavior-preserving).
- [x] Extract add-session/session context menus to dedicated `tab-bar-session-menu-controller` module (slice-4, behavior-preserving).
- [x] Evaluate update center trigger boundary and keep trigger orchestration in `tab-bar` while update panel runtime remains isolated in `tab-bar-cli-update-panel`.
- [x] Keep orchestration APIs stable.

#### 3.2 `config-sections` Split
- [x] Extract auto-approval panel into dedicated `config-sections-auto-approval` module (slice-1, behavior-preserving).
- [x] Extract watch controller into dedicated `config-sections-refresh-controller` module (slice-2, behavior-preserving).
- [x] Extract toolchain summary renderer and metadata localization adapters (`config-toolchain-summary`, `config-metadata-localization`) (slice-3, behavior-preserving).
- [x] Keep current right-rail UX unchanged.

#### 3.3 `i18n` Namespace Refactor
- [x] Start dictionary segmentation with `tab + terminal` namespace module (`i18n-translations-tab-terminal`).
- [x] Continue dictionary segmentation (`errors`) with incremental module slices.
- [x] Add non-conflicting key tests for extracted namespace module(s).

#### 3.4 Preload Bridge Registry
- [x] Extract `mcp` bridge domain into dedicated `preload-api-mcp` module (slice-1, behavior-preserving).
- [x] Split remaining preload bridge domains (`context`) into dedicated modules.
- [x] Keep exposed API shape stable for completed slices.

### Validation
- [x] Contract tests (source + runtime where possible) for completed slices
- [x] Targeted behavior suites for completed slices
- [x] `npm run build` for completed slices
- [x] `npm test` for completed slices

---

## Phase 4 — Test and Audit Pipeline Hardening

### Objective
Make quality signals representative and deterministic.

### Tasks
- [x] Introduce additional coverage target that includes `src/renderer/components/**` and `src/preload/**`.
- [x] Extend `test:critical-stability` to include selected main/preload security paths.
- [x] Make `knip` deterministic (pinned dependency + no-network invocation strategy).
- [x] Add coverage/report notes documenting what each lane measures.

**Primary files**
- `vitest.config.ts`
- `package.json`
- `scripts/deep-system-audit.mjs`
- `docs/superpowers/reports/*`

### Validation
- [x] `npm run build`
- [x] `npm test`
- [x] `npm run test:coverage` (new lane expectations)
- [x] `npm run audit:deep`

---

## Phase 5 — Documentation Consolidation

### Objective
Eliminate instruction drift and preserve one canonical operational reference.

### Tasks
- [x] Consolidate duplicated “how to run/build/test” guidance.
- [x] Keep one canonical source and link from `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`.
- [x] Update security architecture report after Phase 1/4.

### Validation
- [x] Link integrity check
- [x] Manual doc pass for consistency

---

## 4) Subagent Execution Matrix

### Subagent A — Main Security Boundary
- Ownership: `src/main/ipc-*.ts`, `src/main/mcp-*.ts`, related tests
- Phase: `1.1`, `1.2`
- Risk: High

### Subagent B — Startup and Consent Safety
- Ownership: `src/main/main.ts`, `src/main/settings-guard.ts`, `src/main/ipc-handlers.ts`, tests
- Phase: `1.3`, `1.4`
- Risk: Medium/High

### Subagent C — State/Watcher Reliability
- Ownership: `src/renderer/state.ts`, `src/main/config-watcher.ts`, codex session watcher + tests
- Phase: `2.1`, `2.2`, `2.3`
- Risk: Medium

### Subagent D — Renderer Modularization
- Ownership: `src/renderer/components/tab-bar*`, `config-sections*`, `i18n*`
- Phase: `3.1`, `3.2`, `3.3`
- Risk: Medium

### Subagent E — Preload + QA Pipeline
- Ownership: `src/preload/preload.ts`, test pipeline files
- Phase: `3.4`, `4.*`
- Risk: Medium

## 5) Phase Exit Criteria

- [x] No failing tests/build.
- [x] Added tests cover all modified decision branches.
- [x] No security guard regressions in IPC and governance boundaries.
- [x] Change log section updated in this plan file.

## 6) Change Log (Execution Tracking)

- `2026-04-21` — Master plan created from full repo scan + parallel subagent analysis.
- `2026-04-21` — Baseline report created: `docs/superpowers/reports/2026-04-21-architecture-hardening-baseline.md`.
- `2026-04-21` — Phase 1.1 completed: project-path trust boundary hardening for `ipc-calder`, `ipc-git`, `ipc-provider` + negative tests.
- `2026-04-21` — Phase 1.2 completed: MCP runtime governance enforcement for connect/callTool/readResource/getPrompt with deterministic typed error handling and tests.
- `2026-04-21` — Phase 1.3 completed: provider startup hook/status install is now provider-scoped fail-soft with continuation and regression tests.
- `2026-04-21` — Phase 1.4 completed: Claude foreign-statusline declined consent now remains authoritative in auto-heal flow, with runtime tests.
- `2026-04-21` — Phase 2.1 completed: renderer persistence now uses serialized/coalesced save queue with deterministic last-write-wins tests.
- `2026-04-21` — Phase 2.2 completed: config watcher now uses keyed context model (`provider+project+window`) with strict teardown and stale-timer safety tests.
- `2026-04-21` — Phase 2.3 completed: codex session mapping now scores token/cwd/time hints before FIFO fallback, plus parallel-start concurrency tests.
- `2026-04-21` — Phase 4 starter completed: deterministic Knip lane (`audit:knip`) and `test:critical-stability` expansion with main security path coverage.
- `2026-04-21` — Phase 4 completed: expanded full-boundary coverage lane (`test:coverage:full`) added and wired into deep audit; lane semantics documented in quality-lane notes report.
- `2026-04-21` — Phase 3.1 slice-1 completed: extracted tab-bar CLI update panel/button concern into dedicated module with contract/build/full-test validation.
- `2026-04-21` — Phase 3.1 slice-2 completed: extracted tab-bar provider selector concern into dedicated `tab-bar-provider-selector-controller` with stable orchestration wrappers and contract/build/full-test validation.
- `2026-04-21` — Phase 3.1 slice-3 completed: extracted tab-bar branch menu concern into dedicated `tab-bar-branch-menu-controller` and updated menu surface contracts; targeted/build/full-test validation passed.
- `2026-04-21` — Phase 3.1 slice-4 completed: extracted tab-bar add-session/new-session flows into dedicated `tab-bar-session-menu-controller` and kept orchestration wrappers stable.
- `2026-04-21` — Phase 3.2 slice-1 completed: extracted config-sections auto-approval concern into dedicated module with contract/build/full-test validation.
- `2026-04-21` — Phase 3.2 slice-2 completed: extracted config-sections refresh/watch scheduling into dedicated `config-sections-refresh-controller` with deterministic generation guards and validation pass.
- `2026-04-21` — Phase 3.2 slice-3 completed: extracted config metadata localization + toolchain summary adapters to dedicated modules with unchanged UI semantics and validation pass.
- `2026-04-21` — Phase 3.3 slice-1 started: extracted tab/terminal dictionary entries into `i18n-translations-tab-terminal`, wired composition via `i18n-translations`, and added namespace key uniqueness tests.
- `2026-04-21` — Phase 3.3 slice-2 completed: extracted preferences/settings-shell dictionary entries into `i18n-translations-preferences` with source-contract coverage updated.
- `2026-04-21` — Phase 3.3 slice-3 completed: extracted mobile inspect/dependency-doctor dictionary entries into `i18n-translations-mobile` with namespace uniqueness tests.
- `2026-04-21` — Phase 3.3 slice-4 completed: extracted shared error/validation copy into `i18n-translations-errors` and removed duplicate in-file entries.
- `2026-04-21` — Post-slice validation: targeted i18n suites + full build/test + deep audit (`audit:deep`) all passed after Phase 3.1/3.3 modularization changes.
- `2026-04-21` — Validation checkpoint: post-slice full suite remains green at `313` files / `2367` tests.
- `2026-04-21` — Validation checkpoint: post-slice full suite remains green at `313` files / `2368` tests.
- `2026-04-21` — Validation checkpoint: post-slice full suite remains green at `313` files / `2369` tests.
- `2026-04-21` — Phase 3.3 exit: i18n namespace refactor completed (`tab-terminal`, `preferences`, `mobile`, `errors`) with source contracts and deep audit green.
- `2026-04-21` — Phase 3.4 slice-1 started: extracted preload `mcp` bridge into `preload-api-mcp` while keeping `window.calder` shape stable; targeted preload contracts + full build/test passed.
- `2026-04-21` — Phase 3.4 slice-2 completed: extracted preload `cliSurface` bridge into `preload-api-cli-surface` and updated discovery contract source aggregation for modularized preload layout.
- `2026-04-21` — Phase 3.4 slice-3 completed: extracted preload `mobile`, `mobileSetup`, and `mobileInspect` bridges into `preload-api-mobile`; mobile IPC preload contracts now aggregate modular preload sources.
- `2026-04-21` — Phase 3.4 slice-4 completed: extracted preload `provider` bridge into `preload-api-provider` with full build/test regression pass.
- `2026-04-21` — Phase 3.4 slice-5 completed: extracted preload `git` bridge into `preload-api-git` with unchanged API behavior and full build/test pass.
- `2026-04-21` — Phase 3.4 slice-6 completed: extracted preload `pty` bridge into `preload-api-pty` with full build/test regression pass.
- `2026-04-21` — Phase 3.4 slice-7 completed: extracted project-domain preload bridges (`context/workflow/teamContext/review/governance/task/checkpoint`) into `preload-api-project-domains` and updated preload source-contract tests.
- `2026-04-21` — Phase 3.4 exit: preload bridge registry modularization completed with all phase domains extracted and full suite green.
- `2026-04-21` — Phase 5 completed: canonical workflow doc added (`docs/development-workflow.md`), README/CLAUDE/CONTRIBUTING consolidated to link to canonical guidance, and security architecture report updated with hardening outcomes.
- `2026-04-21` — Final validation checkpoint: `audit:deep` passed after completing all open phases in this master plan.
- `2026-04-21` — Phase 3.1 exit: full tab-bar modularization scope complete (update panel, provider selector, branch menu, session menu), with orchestration API preserved and full validation green.

## 7) Master Execution Board

| Item | Status | Owner | Last Update | Next Action |
|---|---|---|---|---|
| Phase 0 baseline/report | Done | Main agent | 2026-04-21 | Keep snapshot updated at phase exits |
| Phase 1 security boundary hardening (1.1-1.4) | Done | Workers + Main agent verify | 2026-04-21 | Proceed to Phase 2 reliability tasks |
| Phase 4 QA lane hardening | Done | Worker (Banach) + Main agent verify | 2026-04-21 | Continue with Phase 3 modularization |
| Phase 2.1 renderer persistence queue | Done | Worker (Harvey) + Main agent verify | 2026-04-21 | Start Phase 3 modularization slices |
| Phase 2.2 config watcher multi-context | Done | Worker (Bernoulli) + Main agent verify | 2026-04-21 | Start Phase 3 modularization slices |
| Phase 2.3 codex session mapping robustness | Done | Worker (Helmholtz) + Main agent verify | 2026-04-21 | Start Phase 3 modularization slices |
| Phase 3.1 tab-bar modularization slice | Done (slices 1-4) | Workers + Main agent verify | 2026-04-21 | Proceed with i18n and preload modularization slices |
| Phase 3.2 config-sections modularization slice | Done (slices 1-3) | Workers + Main agent verify | 2026-04-21 | Proceed to Phase 3.3 i18n namespace refactor |
| Phase 3.3 i18n namespace refactor | Done (slices 1-4) | Main agent | 2026-04-21 | Proceed to Phase 3.4 preload bridge registry split |
| Phase 3.4 preload bridge registry split | Done (slices 1-7) | Main agent | 2026-04-21 | Proceed to Phase 5 documentation consolidation |
| Phase 5 documentation consolidation | Done | Main agent | 2026-04-21 | Track future command changes in canonical workflow doc |
