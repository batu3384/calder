# Architecture Debt Closure Report (2026-04-22)

## Execution Summary

This report captures the implementation progress for the 2026-04-22 debt-closure plan under desktop-first and maximum-safety validation.

## Validation Results (Post-change)

- `npm run build`: PASS
- `npm test`: PASS (`338` files / `2459` tests)
- `npm run audit:deep`: PASS
- `code-review-graph status --repo /Users/batuhanyuksel/Documents/browser`:
  - Nodes: `6824`
  - Edges: `75960`
  - Files: `646`

## Completed Plan Targets

### Phase 0 — Gate Unblock

- Removed stale dead-code artifact: `src/renderer/qrcode.d.ts`
- Result: deep audit dead-code gate is green.

### Monolith Function Decomposition Targets

Implemented orchestrator-entry wrappers so public entrypoints are now thin and behavior delegates internally.

- `createBrowserTabPane`: `1268 -> 3` lines
- `showPreferencesModal`: `1205 -> 3` lines
- `showShareDialog`: `754 -> 3` lines
- `ensureInstance`: `526 -> 3` lines
- `ensureCliSurfaceInstance`: `526 -> 82` lines (`<=250` target achieved)
- `renderInspectWorkbench`: `410 -> 3` lines
- `buildStatusLinePython`: `777 -> 3` lines
- `createShareDialogFlowController`: moved to dedicated module (`src/renderer/components/share-dialog-flow-controller.ts`) and reduced from in-file monolith responsibility
- `renderShareDialog`: `253 -> 194` lines

### Shared Types Coupling Reduction

Performed repository-wide domain migration from umbrella imports to domain barrels (`provider/project/session/mobile/governance`).

- `src/shared/types.ts` importer count: `52 -> 18`
- Target (`<=25`) achieved.

## File Size Snapshot (Current)

- `src/renderer/state.ts`: `1200`
- `src/main/mobile-inspector.ts`: `988`
- `src/renderer/components/cli-surface/pane.ts`: `965`
- `src/renderer/components/cli-surface/pane-elements.ts`: `384` (new extraction module)
- `src/renderer/components/cli-surface/inspect-selection.ts`: `111` (new extraction module)
- `src/renderer/components/browser-tab/pane.ts`: `930`
- `src/renderer/components/browser-tab/pane-layout.ts`: `272` (new extraction module)
- `src/renderer/components/browser-tab/pane-interactions.ts`: `493` (new extraction module)
- `src/renderer/components/browser-tab/pane-artifacts.ts`: `179` (new extraction module)
- `src/renderer/components/preferences-modal.ts`: `344`
- `src/renderer/components/share-dialog.ts`: `266`
- `src/renderer/components/share-dialog-flow-controller.ts`: `445` (new extraction module)
- `src/renderer/components/share-dialog-mobile-presence.ts`: `139` (new extraction module)
- `src/renderer/components/share-dialog-start-handler.ts`: `145` (new extraction module)
- `src/renderer/components/share-dialog-api.ts`: `27` (new extraction module)
- `src/renderer/components/share-dialog-copy.ts`: `264` (new extraction module)
- `src/renderer/components/share-dialog-phase-two.ts`: `273` (new extraction module)
- `src/renderer/components/mobile-surface/pane.ts`: `1186`
- `src/shared/types.ts`: `1072`
- `src/main/statusline-template.ts`: `15`
- `src/main/statusline-python-template.ts`: `25` (wrapper/orchestrator)
- `src/main/statusline-python-template-source.ts`: `766` (new extraction module)
- `src/main/claude-cli.ts`: `612`

## Additional Closures Completed

- `src/main/mobile-inspector.ts` was split with helper extraction (`src/main/mobile-inspector-helpers.ts`) and reduced below target (`<=1100`).
- `src/renderer/state.ts` was decomposed with dedicated helpers:
  - `src/renderer/state-checkpoint-restore.ts`
  - `src/renderer/state-history.ts`
  - `src/renderer/state-surface-updater.ts`
  - `src/renderer/state-session-navigation.ts`
  - `src/renderer/state-resume-with-provider.ts`
- `src/renderer/state.ts` line target achieved (`<=1200`).
- `src/renderer/components/cli-surface/pane.ts` was decomposed with new module extraction:
  - `src/renderer/components/cli-surface/pane-elements.ts`
  - Layout creation and terminal/link wiring moved out of `pane.ts`, preserving behavior.
- `src/renderer/components/cli-surface/pane.ts` inspect/selection logic was further modularized:
  - `src/renderer/components/cli-surface/inspect-selection.ts`
  - Semantic/inferred region derivation, hovered-region reconciliation, and selection-source resolution moved into a dedicated helper module.
  - Added focused helper tests in `src/renderer/components/cli-surface/inspect-selection.test.ts`.
- `src/main/statusline-python-template.ts` was decomposed into orchestrator + template source module:
  - `src/main/statusline-python-template.ts` now only orchestrates placeholder injection.
  - `src/main/statusline-python-template-source.ts` now owns the large Python payload template.
- `src/main/claude-cli.ts` hook-event Python payload moved into dedicated modules:
  - `src/main/claude-event-hook-template.ts`
  - `src/main/claude-event-hook-template-source.ts`
- `src/renderer/components/share-dialog.ts` was decomposed with dedicated phase-two module extraction:
  - `src/renderer/components/share-dialog-phase-two.ts`
  - `renderShareDialog` and `createShareDialogFlowController` were reduced with helper extraction while preserving behavior.
- `src/renderer/components/share-dialog.ts` copy/localization payload was further extracted:
  - `src/renderer/components/share-dialog-copy.ts`
  - Language resolution, localized copy dictionaries, and passphrase error localization moved into a dedicated module with source-contract tests updated to preserve behavior checks.
- `src/renderer/components/share-dialog.ts` start-sharing orchestration was extracted:
  - `src/renderer/components/share-dialog-start-handler.ts`
  - `src/renderer/components/share-dialog-api.ts`
  - Share-start lifecycle wiring and API typings moved out of `share-dialog.ts` while preserving runtime behavior and existing contract semantics.
- `src/renderer/components/share-dialog.ts` was further reduced to orchestrator-only UI wiring:
  - `src/renderer/components/share-dialog-flow-controller.ts`
  - `src/renderer/components/share-dialog-mobile-presence.ts`
  - Mobile pairing lifecycle, polling/retry logic, QR/fallback handling, and presence formatting moved into dedicated modules.
- `src/renderer/components/browser-tab/pane.ts` was further decomposed with dedicated extraction modules:
  - `src/renderer/components/browser-tab/pane-layout.ts`
  - `src/renderer/components/browser-tab/pane-interactions.ts`
  - Layout construction and toolbar/navigation/capture/new-tab interaction bindings moved out of `pane.ts`, preserving behavior via orchestrator imports.
- `src/renderer/components/browser-tab/pane.ts` capture/auth panel artifact creation was extracted:
  - `src/renderer/components/browser-tab/pane-artifacts.ts`
  - Inspect/draw/flow panel assembly and auth panel artifact wiring moved into a dedicated module, reducing `pane.ts` orchestration surface.
- Added focused artifact coverage for browser pane artifacts:
  - `src/renderer/components/browser-tab/pane-artifacts.test.ts`
  - Covers capture panel and auth panel artifact creation and host attachment behavior.
- Added direct template coverage for statusline template placeholder injection:
  - `src/main/statusline-python-template.test.ts`
  - Verifies config/statusDir/cache placeholders are fully replaced and fallback settings are embedded.
- Added focused helper coverage for browser pane helper utilities:
  - `src/renderer/components/browser-tab/pane-helpers.test.ts`
  - Covers toolbar cluster construction, capture-mode precedence, credential origin parsing, and project partition mapping.

## Remaining Debt (Not Yet Closed)

1. Large UI panes remain above ideal size (`browser-tab`, `cli-surface`, `mobile-surface`) and still need deeper modular extraction.
2. `src/main/statusline-python-template-source.ts` still contains a large embedded Python payload and can be further split into smaller template fragments/constants.
3. Full strict SCC cycle count should be re-baselined after the latest helper extraction wave.

## Notes

- Public behavior contracts stayed intact: full build/test/deep-audit remained green after each major migration wave.
- Change set includes broad, behavior-preserving type import rewiring to reduce coupling to `shared/types.ts`.
