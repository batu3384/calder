# Calder Top Debt 3-Sprint Execution Plan (2026-04-21)

> Execution mode: behavior-preserving, test-gated, small reversible slices.
> Scope: remaining highest architectural debt after mobile-control-bridge hardening.
> Primary constraint: no protocol/API contract break, no UX regression.

## 1) Current Debt Baseline

### Size and concentration snapshot

- Graph stats (updated): `6619 nodes`, `74909 edges`, `595 files`.
- Source concentration:
  - `src/renderer`: ~`76k` lines
  - `src/main`: ~`49k` lines
  - `apps/calder-mobile`: ~`15k` lines

### Highest-risk monolith hotspots (current)

1. `src/renderer/components/preferences-modal.ts`
   - `showPreferencesModal`: ~`3566` lines
2. `src/renderer/components/browser-tab/pane.ts`
   - `createBrowserTabPane`: ~`1838` lines
3. `src/main/statusline-template.ts`
   - `buildStatusLinePython`: ~`777` lines
4. `src/renderer/components/share-dialog.ts`
   - `showShareDialog`: ~`754` lines
5. `apps/calder-mobile/App.tsx`
   - `App`: ~`597` lines
6. `src/renderer/components/cli-surface/pane.ts`
   - `ensureInstance`: ~`466` lines
7. `src/renderer/components/mobile-surface/pane.ts`
   - `renderInspectWorkbench`: ~`408` lines
8. `src/renderer/components/config-sections-auto-approval.ts`
   - `renderAutoApprovalSection`: ~`343` lines

### Test-gap signal on active changeset

- `code-review-graph detect-changes --brief`:
  - risk score: `0.55`
  - changed functions/classes: `38`
  - test gaps: `27`
- Priority test gap cluster:
  - `src/main/mobile-control-bridge.ts` exports and lifecycle helpers
  - `src/renderer/components/browser-tab/pane.ts` viewport/control helpers
  - modal and menu-surface glue functions

## 2) Non-Negotiable Safety Protocol

Apply to every slice in every sprint:

1. Add or adjust targeted tests before structural movement where practical.
2. Run targeted tests for touched module(s).
3. Run `npm run build`.
4. Run full `npm test`.
5. Run `npm run audit:deep` at sprint boundary.
6. Keep each commit single-concern and reversible.

Rollback rule:

- Revert only the failing slice commit.
- Never bundle two risky extractions in one commit.

## 3) Sprint Plan

---

## Sprint 1 (P0) - Renderer Monolith Breakdown

### Objective

Reduce highest blast-radius UI monoliths first: preferences modal and browser tab pane.

### Scope

1. `preferences-modal.ts` decomposition
   - Extract section renderers into domain files:
     - orchestration/workflow/team/review/background/checkpoints
   - Introduce a shared section context object to reduce cross-captured state.
   - Keep existing modal API and event wiring unchanged.
2. `browser-tab/pane.ts` decomposition
   - Continue extracting viewport/menu/inspect/sizing blocks into focused modules.
   - Preserve current interaction semantics for back/forward/reload/inspect/viewport.
3. Contract coverage reinforcement
   - Extend existing contract tests around modal sections and browser tab controls.

### Target files

- `src/renderer/components/preferences-modal.ts`
- `src/renderer/components/browser-tab/pane.ts`
- `src/renderer/components/browser-tab/*.ts`
- related `*.test.ts` and `*.contract.test.ts`

### Exit criteria

- `showPreferencesModal` no longer monolithic (orchestrator role only).
- `createBrowserTabPane` line count substantially reduced.
- All browser-tab and preferences contract tests green.

---

## Sprint 2 (P1) - Main Runtime and Surface Integrity

### Objective

Reduce main-process and surface-runtime maintenance risk without changing behavior.

### Scope

1. `statusline-template.ts` hardening
   - Move large embedded Python template into dedicated template asset/module.
   - Keep generated output byte-compatible (or behavior-compatible with snapshot tests).
2. `cli-surface/pane.ts` and `mobile-surface/pane.ts` split
   - Extract instance lifecycle, inspect workbench, and UI action routing helpers.
   - Keep existing event channel contracts and DOM selectors stable.
3. `share-dialog.ts` split
   - Separate render scaffolding, action wiring, and model/clipboard helpers.

### Target files

- `src/main/statusline-template.ts`
- `src/renderer/components/cli-surface/pane.ts`
- `src/renderer/components/mobile-surface/pane.ts`
- `src/renderer/components/share-dialog.ts`

### Exit criteria

- No giant inline template body in `statusline-template.ts`.
- Surface pane files become orchestration-first, helpers modularized.
- Existing dialog and surface tests remain green.

---

## Sprint 3 (P1/P2) - Policy/UI Debt Consolidation and Ratchet

### Objective

Consolidate policy UI debt and close remaining high-friction maintenance hotspots.

### Scope

1. Auto-approval UI consolidation
   - Split `renderAutoApprovalSection` into:
     - state derivation
     - scope control rendering
     - mode guide rendering
     - summary/meta rendering
2. Context-inspector CSS decomposition
   - Split large stylesheet by concern (`auto-approval`, `config-list`, `responsive`).
   - Keep selectors stable through compatibility imports.
3. Mobile app surface decomposition kickoff
   - Split `apps/calder-mobile/App.tsx` into screen-level modules.
4. Coverage ratchet pass
   - Raise targeted thresholds only if Sprint 1/2/3 are stable.

### Target files

- `src/renderer/components/config-sections-auto-approval.ts`
- `src/renderer/styles/context-inspector.css`
- `apps/calder-mobile/App.tsx`
- `vitest.config.ts` (only for ratchet adjustments)

### Exit criteria

- Policy UI section no longer single large renderer.
- CSS split complete with no visual regressions.
- Mobile app root component significantly reduced.
- Coverage ratchet documented and passing.

## 4) Execution Order Inside Each Sprint

1. Add safety tests or strengthen contract tests.
2. Extract one cohesive helper/module.
3. Wire old entrypoint to new helper.
4. Run validation matrix.
5. Commit slice with debt phase id.

## 5) Ownership Matrix (Recommended)

- Workstream A (Renderer UI monoliths):
  - `preferences-modal.ts`, `browser-tab/pane.ts`
- Workstream B (Main/runtime/template):
  - `statusline-template.ts`, `share-dialog.ts`
- Workstream C (Surface/runtime + policy):
  - `cli-surface`, `mobile-surface`, auto-approval section, context-inspector CSS
- Workstream D (Quality lane):
  - contract tests, coverage ratchet, sprint boundary `audit:deep`

## 6) Validation Commands

Per slice:

- `npm run build`
- `npm test -- <targeted-files-or-suite>`
- `npm test`

Per sprint boundary:

- `npm run audit:deep`

## 7) Success Definition

Plan is successful when:

1. Top 3 monolith risk points are no longer monolithic entrypoints.
2. No behavioral regressions in existing contract tests.
3. Full build and full test remain green after each sprint.
4. Debt concentration visibly shifts from orchestration code to modular helpers.

