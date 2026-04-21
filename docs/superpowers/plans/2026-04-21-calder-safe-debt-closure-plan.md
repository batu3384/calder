# Calder Safe Debt Closure Plan (2026-04-21)

> Execution mode: safety-first, behavior-preserving, small reversible slices.
> Scope: close remaining technical and architectural debt without breaking existing features.
> Primary constraint: no user-facing regression, no protocol/API shape changes.

## 1) Baseline Snapshot (Locked Before Work)

- `code-review-graph status --repo /Users/batuhanyuksel/Documents/browser`: up-to-date at `bc6ba9f`
- `npm run build`: PASS
- `npm test`: PASS (`313` files / `2369` tests)
- `npm run audit:deep`: PASS
- Working tree: clean

## 2) Remaining Debt Backlog (Final Five)

1. High coupling hub:
   - `src/shared/types.ts` imported by `171` files
   - `src/renderer/state.ts` imported by `79` files
2. Import cycles:
   - `cli-surface/adapters/registry.ts` <-> adapter modules
   - `project-terminal.ts` <-> `search-bar.ts`
3. Large monolith files (maintenance and blast-radius risk):
   - `preferences-modal.ts` (`3669` lines)
   - `mobile-control-bridge.ts` (`3306` lines)
   - `browser-tab/pane.ts` (`2190` lines)
   - `state.ts` (`1906` lines)
   - `tab-bar.ts` (`1713` lines)
4. Test-only unsafe reset path:
   - `state.ts` test reset uses `as any` private mutation
5. Missing coverage thresholds:
   - Coverage reporting exists, but no minimum threshold gate in `vitest.config.ts`

## 3) Non-Negotiable Safety Protocol

Apply to every implementation slice:

1. Add/adjust targeted tests before moving logic where practical.
2. Run targeted tests for touched module(s).
3. Run `npm run build`.
4. Run full `npm test`.
5. At phase boundary run `npm run audit:deep`.
6. If any step fails: stop, fix, re-run full gate, then continue.

Commit discipline:

- One logical slice per commit.
- Commit message includes phase and slice id (`debt:<phase>.<slice>`).
- No mixed concern commits.

Rollback protocol:

- If a slice causes unstable behavior, revert only that slice commit.
- Never bundle multiple risky refactors in one commit.

## 4) Ordered Execution Plan

---

## Phase 0 - Guardrails and Measurement (Do First)

### Objective
Freeze behavior and add measurement before structural refactors.

### Tasks

- [x] Create debt tracking report:
  - `docs/superpowers/reports/2026-04-21-safe-debt-closure-baseline.md`
  - record file sizes, cycle pairs, coupling counts, coverage summary
- [x] Add a strict validation checklist section to that report (copy/paste runnable commands).
- [x] Add "do-not-change behavior contracts" checklist:
  - `window.calder` preload API shape
  - session/provider selection behavior
  - hook/statusline governance behavior

### Validation

- [x] `npm run build`
- [x] `npm test`

---

## Phase 1 - Remove Import Cycles (Low-Risk Structural Cleanup)

### Objective
Eliminate known direct cycles first to reduce hidden initialization/order risks.

### Slice 1.1 - CLI Adapter Registry Cycle Removal

- [x] Introduce neutral contract module:
  - `src/renderer/components/cli-surface/adapters/adapter-contract.ts`
- [x] Move shared `CliSurfaceAdapter` types there.
- [x] Update:
  - `registry.ts` imports contract only
  - each adapter imports contract only
- [x] Ensure registry no longer imports modules that also import registry types.

### Slice 1.2 - Project Terminal/Search Bar Cycle Removal

- [x] Extract shared shell-terminal lookup boundary into dedicated file:
  - `src/renderer/components/shell-terminal-registry.ts`
- [x] Replace cross-import coupling between:
  - `project-terminal.ts`
  - `search-bar.ts`
- [x] Keep same runtime behavior for shell search UX.

### Validation

- [x] Targeted tests for search/terminal surfaces
- [x] `npm run build`
- [x] `npm test`
- [x] `npm run audit:deep` (phase exit)

---

## Phase 2 - Reduce Coupling Hubs Safely

### Objective
Lower blast radius around `shared/types.ts` and `renderer/state.ts` without API breakage.

### Slice 2.1 - `shared/types.ts` Domain Split with Compatibility Barrel

- [x] Create domain files:
  - `src/shared/types/session.ts`
  - `src/shared/types/provider.ts`
  - `src/shared/types/project.ts`
  - `src/shared/types/mobile.ts`
  - `src/shared/types/governance.ts`
- [x] Keep `src/shared/types.ts` as compatibility barrel exporting existing symbols.
- [x] Migrate high-churn imports first (renderer/main hotspots), incremental not big-bang.
- [x] Confirm no runtime behavior change (type-only refactor).

Migration snapshot (2026-04-21):

- Direct `../shared/types` imports (main/preload/renderer): `92 -> 69`
- New domain imports (`provider/mobile/governance/session/project`): `0 -> 28`

### Slice 2.2 - `renderer/state.ts` Internal Module Extraction

- [x] Extract persistence queue internals to `renderer/state-persistence.ts`.
- [x] Extract navigation/history internals to `renderer/state-navigation.ts`.
- [x] Extract session reorder + insights mutators to focused helpers.
- [x] Keep public `AppState` API unchanged.

### Validation

- [x] Targeted tests for state + renderer integration
- [x] `npm run build`
- [x] `npm test`
- [x] `npm run audit:deep` (phase exit)

---

## Phase 3 - Remove Unsafe Test Reset Pattern

### Objective
Replace `as any` private mutation with a typed, explicit test hook.

### Tasks

- [x] Replace `_resetForTesting()` implementation to avoid private field mutation by string index.
- [x] Add explicit internal reset method or test harness with typed state container.
- [x] Keep production behavior unchanged (test-only path).
- [x] Add regression tests proving reset semantics remain identical.

### Validation

- [x] Targeted `state.test.ts`
- [x] `npm run build`
- [x] `npm test`

---

## Phase 4 - Monolith Decomposition in Controlled Slices

### Objective
Reduce maintenance risk from very large files via behavior-preserving extraction.

Execution rule:

- Maximum one monolith family per slice.
- Each slice must keep old entry API and event wiring stable.

### Slice 4.1 - `tab-bar.ts` (already partially modularized, finish residual)

- [x] Extract CLI surface profile parsing + fixed-port compatibility helpers to a dedicated module.
- [x] Extract project surface state/profile upsert helpers to a dedicated module.
- [x] Extract mobile-control target selection + presence sync helpers to a dedicated module.
- [x] Extract session title/tooltip presentation helpers to a dedicated module.
- [x] Extract git-status view rendering helper to a dedicated module.
- [x] Extract shared tab context-menu accessibility/keyboard semantics to a dedicated module.
- [x] Extract surface-control signature computation helper to a dedicated module.
- [x] Extract CLI profile modal orchestration/validation/persistence to a dedicated module.
- [x] Extract session tab context-menu orchestration/actions to a dedicated module.
- [x] Centralize CLI profile selection/runtime state updates into shared surface-state helper.
- [x] Extract surface tab rendering + drag reorder orchestration to a dedicated module.
- [x] Extract session tab rendering + drag reorder orchestration to a dedicated module.
- [x] Extract top-deck surface mode/profile controls and CLI profile dropdown stability to a dedicated controller.
- [ ] Extract remaining high-cohesion concerns (update orchestration/status helpers if still embedded).
- [x] Keep command deck and provider launch UX identical.

### Slice 4.2 - `state.ts` (post Phase 2 continuation)

- [x] Extract pure project/layout/surface/domain-state normalizers into `state-normalizers.ts`.
- [x] Add direct unit coverage for state normalizers.
- [ ] Continue extraction until `state.ts` becomes orchestrator, not storage of all logic.

### Slice 4.3 - `browser-tab/pane.ts`

- [ ] Split inspect/navigation/overlay behaviors into dedicated modules.
- [ ] Preserve browser tab interaction semantics exactly.

### Slice 4.4 - `mobile-control-bridge.ts`

- [ ] Split by transport/auth/inspection orchestration boundaries.
- [ ] Preserve pairing/session transport protocol.

### Slice 4.5 - `preferences-modal.ts`

- [ ] Extract section renderers/controllers by settings domain.
- [ ] Preserve layout, shortcuts, and update center behavior.

### Validation (each slice)

- [ ] Targeted tests per module family
- [ ] `npm run build`
- [ ] `npm test`

### Validation (phase exit)

- [ ] `npm run audit:deep`

---

## Phase 5 - Coverage Gate Introduction (Fail-Safe Ratchet)

### Objective
Add minimum coverage thresholds safely, without causing noisy false failures.

### Tasks

- [x] Define initial conservative thresholds in `vitest.config.ts` from current baseline.
- [x] Apply global threshold with explicit per-surface exclusions only when justified.
- [x] Add ratchet rule in docs: thresholds only go up, never down, unless explicit incident review.
- [x] Document threshold rationale in `docs/superpowers/reports/`.

### Recommended initial gate (baseline-safe)

- Statements: `45`
- Branches: `45`
- Functions: `50`
- Lines: `45`

### Validation

- [x] `npm run test:coverage`
- [x] `npm run test:coverage:full`
- [x] `npm run build`
- [x] `npm test`
- [x] `npm run audit:deep` (phase exit)

---

## Phase 6 - Final Verification and Sign-off

### Objective
Prove debt closure is stable and no behavior was broken.

### Tasks

- [ ] Re-run baseline commands and capture final snapshot report:
  - `docs/superpowers/reports/2026-04-21-safe-debt-closure-final.md`
- [ ] Recompute coupling/cycle/size metrics and compare with Phase 0 baseline.
- [ ] Confirm no regressions in:
  - provider/session flows
  - auto-approval and hook governance
  - mobile bridge and browser tab workflows
- [ ] Publish completed checklist with links to commits per phase.

### Exit Criteria (All Required)

- [ ] No known import cycle remains in targeted pairs.
- [ ] `as any` reset hack removed from `state.ts`.
- [ ] Coverage threshold gate active and green.
- [ ] Largest-file risk reduced with extracted modules and unchanged behavior.
- [ ] `npm run build` PASS
- [ ] `npm test` PASS
- [ ] `npm run audit:deep` PASS

## 5) Strict Execution Order

Follow exactly:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6

No phase jumping unless blocker documented in the report with mitigation.

## 6) Status Board

| Workstream | Status | Owner | Updated | Next Action |
|---|---|---|---|---|
| Phase 0 Guardrails | Done | Main agent | 2026-04-21 | Move to Phase 2 coupling reduction |
| Phase 1 Cycle removal | Done | Main agent | 2026-04-21 | Move to Phase 2 coupling reduction |
| Phase 2 Coupling reduction | Done | Main agent | 2026-04-21 | Start Phase 4 monolith decomposition |
| Phase 3 Test reset safety | Done | Main agent | 2026-04-21 | Start Phase 4 monolith decomposition |
| Phase 4 Monolith decomposition | In Progress | Main agent | 2026-04-21 | Continue residual monolith cleanup after state normalizer split (`state.ts` `1906 -> 1701` lines) |
| Phase 5 Coverage gates | Done | Main agent | 2026-04-21 | Move to Phase 6 final sign-off after remaining monolith work |
| Phase 6 Final sign-off | Planned | Main agent | 2026-04-21 | Run full comparison report |
