# Safe Debt Closure Baseline Report (2026-04-21)

## Scope

This report records the locked baseline and safety contracts for the sequential debt-closure execution defined in:

- `docs/superpowers/plans/2026-04-21-calder-safe-debt-closure-plan.md`

## Baseline Snapshot (Locked)

- Git branch: `main`
- Baseline commit: `bc6ba9f3a23b`
- Working tree at start: clean
- `code-review-graph status`:
  - Nodes: `6605`
  - Edges: `74708`
  - Files: `582`
  - Last updated: `2026-04-21T17:13:11`

## Quality Baseline

- `npm run build`: PASS
- `npm test`: PASS (`313` files / `2369` tests)
- `npm run audit:deep`: PASS

## Debt Baseline Metrics

### Coupling hubs

- `src/shared/types.ts`: `171` importers
- `src/renderer/state.ts`: `79` importers

### Large file hotspots

- `src/renderer/components/preferences-modal.ts`: `3669` lines
- `src/main/mobile-control-bridge.ts`: `3306` lines
- `src/renderer/components/browser-tab/pane.ts`: `2190` lines
- `src/renderer/state.ts`: `1906` lines
- `src/renderer/components/tab-bar.ts`: `1713` lines
- `src/shared/types.ts`: `1072` lines

### Known reciprocal import cycles at baseline

- `src/renderer/components/cli-surface/adapters/*` <-> `registry.ts`
- `src/renderer/components/project-terminal.ts` <-> `search-bar.ts`

## Validation Checklist (Mandatory Per Slice)

Run in order:

1. Targeted tests for touched modules.
2. `npm run build`
3. `npm test`
4. `npm run audit:deep` (phase exit and security-sensitive slices)

## Do-Not-Change Behavior Contracts

Any refactor in this plan must preserve:

1. `window.calder` preload API shape and callable names.
2. Session/provider selection behavior in existing CLI surfaces.
3. Hook/statusline governance and auto-heal consent semantics.
4. Mobile pairing/session transport protocol behavior.
5. Browser tab inspect/navigation interaction semantics.

## Phase 1 Verification Note (Completed)

- Introduced neutral adapter contract module to remove adapter-type import cycle pressure.
- Introduced neutral shell terminal registry to remove `project-terminal` <-> `search-bar` direct cycle.
- Post-change graph reciprocal import check result: no direct reciprocal import pair returned for `src/**` targets.
- Full quality gate after change: PASS (`build`, `test`, `audit:deep`).

## Phase 2.1 Progress Note (Completed)

- Added domain type barrels:
  - `src/shared/types/session.ts`
  - `src/shared/types/provider.ts`
  - `src/shared/types/project.ts`
  - `src/shared/types/mobile.ts`
  - `src/shared/types/governance.ts`
- Initial high-churn migration applied across provider/mobile/governance/session type paths.
- Direct import count snapshot:
  - `../shared/types*` imports in `src/main|src/preload|src/renderer`: `92 -> 69`
  - Domain imports (`provider/mobile/governance/session/project`): `0 -> 28`
- Runtime safety checks for this slice: targeted tests + build + full test + deep audit all PASS.

## Phase 2.2 Progress Note (Completed)

- Extracted renderer persistence queue internals into:
  - `src/renderer/state-persistence.ts`
- Extracted renderer navigation/history internals into:
  - `src/renderer/state-navigation.ts`
- Extracted state session mutators into:
  - `src/renderer/state-session-mutators.ts`
  - `src/renderer/state-session-mutators.test.ts`
- Kept `AppState` public API stable while delegating persistence queue behavior to the extracted module.
- Validation:
  - Targeted tests: PASS
  - `npm run build`: PASS
  - `npm test`: PASS
  - `npm run audit:deep`: PASS

## Phase 3 Verification Note (Completed)

- Removed unsafe `as any`-based reset mutation from `src/renderer/state.ts`.
- Added explicit typed reset hook on `AppState` and routed `_resetForTesting()` through it.
- Added regression coverage in `src/renderer/state.test.ts` to verify reset restores defaults and clears old listeners.
- Validation:
  - Targeted `state.test.ts`: PASS
  - `npm run build`: PASS
  - `npm test`: PASS (`314` files / `2374` tests)
  - `npm run audit:deep`: PASS

## Phase 4.1 Progress Note (In Progress)

- Started `tab-bar.ts` decomposition with a behavior-preserving extraction:
  - `src/renderer/components/tab-bar-cli-surface-profile-utils.ts`
- Continued with project surface state extraction:
  - `src/renderer/components/tab-bar-surface-state.ts`
- Continued with mobile control extraction:
  - `src/renderer/components/tab-bar-mobile-control.ts`
- Continued with session title/tooltip extraction:
  - `src/renderer/components/tab-bar-session-titles.ts`
- Continued with git status view extraction:
  - `src/renderer/components/tab-bar-git-status-view.ts`
- Continued with context menu semantics extraction:
  - `src/renderer/components/tab-bar-menu-semantics.ts`
- Continued with surface signature extraction:
  - `src/renderer/components/tab-bar-surface-signature.ts`
- Continued with CLI profile modal extraction:
  - `src/renderer/components/tab-bar-cli-profile-modal.ts`
- Continued with session tab context-menu extraction:
  - `src/renderer/components/tab-bar-session-context-menu.ts`
- Continued with surface tab render/reorder extraction:
  - `src/renderer/components/tab-bar-surface-tab-factory.ts`
- Continued with session tab render/reorder extraction:
  - `src/renderer/components/tab-bar-session-tab-factory.ts`
- Continued with top-deck surface controls extraction:
  - `src/renderer/components/tab-bar-surface-controls.ts`
- Moved CLI surface profile argument parsing, port mode parsing, and fixed-port compatibility heuristics out of `tab-bar.ts`.
- Moved project surface default/get/update/profile-upsert helpers out of `tab-bar.ts`.
- Moved mobile-control target session selection and button/presence synchronization out of `tab-bar.ts`.
- Moved session title/tooltip formatting and git-status view rendering logic out of `tab-bar.ts`.
- Moved tab context-menu ARIA/keyboard semantics out of `tab-bar.ts` via a dedicated semantics helper.
- Moved surface control signature computation out of `tab-bar.ts` via a dedicated signature helper.
- Moved CLI profile modal orchestration/validation/persistence out of `tab-bar.ts` into a dedicated helper.
- Moved session tab context-menu construction/actions out of `tab-bar.ts` into a dedicated helper.
- Centralized CLI profile selection/runtime state updates in `tab-bar-surface-state.ts` and reused it from `tab-bar.ts` + `tab-bar-cli-profile-modal.ts`.
- Moved surface tab creation and drag reorder handlers out of `tab-bar.ts` into a dedicated factory helper.
- Moved session tab creation, badges, sharing indicator, activation, context-menu wiring, and drag reorder handlers out of `tab-bar.ts` into a dedicated factory helper.
- Moved surface switcher rendering, CLI profile dropdown creation, profile selector lifecycle, floating-menu placement, and signature-based dropdown-flicker avoidance out of `tab-bar.ts` into a dedicated controller.
- Added dedicated unit coverage:
  - `src/renderer/components/tab-bar-cli-surface-profile-utils.test.ts`
  - `src/renderer/components/tab-bar-cli-profile-modal.test.ts`
  - `src/renderer/components/tab-bar-surface-tab-factory.test.ts`
  - `src/renderer/components/tab-bar-surface-state.test.ts`
  - `src/renderer/components/tab-bar-mobile-control.test.ts`
  - `src/renderer/components/tab-bar-session-titles.test.ts`
  - `src/renderer/components/tab-bar-session-context-menu.test.ts`
  - `src/renderer/components/tab-bar-session-tab-factory.test.ts`
  - `src/renderer/components/tab-bar-git-status-view.test.ts`
  - `src/renderer/components/tab-bar-surface-signature.test.ts`
  - `src/renderer/components/tab-bar-surface-controls.test.ts`
- Updated menu surface contract to validate the extracted semantics module (`tab-bar-menu-semantics.ts`) while preserving tab-bar integration checks.
- Updated mobile discoverability contract to validate modular placement (`tab-bar-mobile-control.ts`) instead of requiring inline implementation in `tab-bar.ts`.
- Updated menu surface/mobile discoverability contracts to validate extracted session context-menu module placement (`tab-bar-session-context-menu.ts`).
- Updated tab surface reorder contract to validate extracted module placement (`tab-bar-surface-tab-factory.ts`) while preserving behavior checks.
- Updated tab reorder and P2P share indicator contracts to validate extracted session tab factory placement (`tab-bar-session-tab-factory.ts`).
- Updated command deck, CLI surface, and menu surface contracts to validate the extracted surface controls controller while preserving the same top-deck slots and floating dropdown behavior.
- `tab-bar.ts` size snapshot: `1713 -> 611` lines.
- Validation:
  - Targeted tests: PASS
  - `npm run build`: PASS
  - `npm test`: PASS (`326` files / `2412` tests)
  - `npm run audit:deep`: PASS

## Phase 5 Verification Note (Completed)

- Added conservative global coverage thresholds to `vitest.config.ts`:
  - Statements: `45`
  - Branches: `45`
  - Functions: `50`
  - Lines: `45`
- Documented the threshold rationale and ratchet rule in:
  - `docs/superpowers/reports/2026-04-21-coverage-threshold-ratchet.md`
- Rationale:
  - The gate is intentionally below both the standard coverage lane and the full-boundary lane.
  - Thresholds prevent accidental large regressions while keeping monolith decomposition work low-noise.
- Validation:
  - `npm run test:coverage`: PASS (`326` files / `2412` tests, statements `89.92%`, branches `79.23%`, functions `89.45%`, lines `92.57%`)
  - `npm run test:coverage:full`: PASS (`326` files / `2412` tests, statements `50.18%`, branches `51.19%`, functions `55.85%`, lines `51.02%`)
  - `npm run build`: PASS
  - `npm test`: PASS (`326` files / `2412` tests)
  - `npm run audit:deep`: PASS

## Phase 4.2 Progress Note (In Progress)

- Continued `state.ts` decomposition with a behavior-preserving extraction:
  - `src/renderer/state-normalizers.ts`
  - `src/renderer/state-normalizers.test.ts`
- Moved pure normalization/helper logic out of `state.ts`:
  - project layout normalization
  - project context/workflow/team/review/governance/background-task/checkpoint state normalization
  - project surface normalization and transient CLI runtime stripping
  - browser session name derivation
  - workflow launch prompt formatting
- `state.ts` size snapshot:
  - Phase 0 baseline: `1906` lines
  - Before this slice: `1844` lines
  - After this slice: `1701` lines
- Validation:
  - Targeted `state-normalizers.test.ts` + `state.test.ts`: PASS (`2` files / `198` tests)
  - `npm run build`: PASS
  - `npm test`: PASS (`327` files / `2416` tests)
  - `npm run audit:deep`: PASS
