# Architecture Debt Closure Report (2026-04-22)

## Execution Summary

This report captures the implementation progress for the 2026-04-22 debt-closure plan under desktop-first and maximum-safety validation.

## Validation Results (Post-change)

- `npm run build`: PASS
- `npm test`: PASS (`335` files / `2451` tests)
- `npm run audit:deep`: PASS
- `code-review-graph status --repo /Users/batuhanyuksel/Documents/browser`:
  - Nodes: `6603`
  - Edges: `74772`
  - Files: `597`

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

### Shared Types Coupling Reduction

Performed repository-wide domain migration from umbrella imports to domain barrels (`provider/project/session/mobile/governance`).

- `src/shared/types.ts` importer count: `52 -> 18`
- Target (`<=25`) achieved.

## File Size Snapshot (Current)

- `src/renderer/state.ts`: `1200`
- `src/main/mobile-inspector.ts`: `988`
- `src/renderer/components/cli-surface/pane.ts`: `1072`
- `src/renderer/components/cli-surface/pane-elements.ts`: `384` (new extraction module)
- `src/renderer/components/browser-tab/pane.ts`: `1386`
- `src/renderer/components/preferences-modal.ts`: `1288`
- `src/renderer/components/share-dialog.ts`: `1284`
- `src/renderer/components/mobile-surface/pane.ts`: `1177`
- `src/shared/types.ts`: `1072`
- `src/main/statusline-template.ts`: `15`
- `src/main/statusline-python-template.ts`: `783` (new extraction module)

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
- `src/main/statusline-template.ts` was decomposed into orchestrator + template module:
  - `src/main/statusline-template.ts` now only wrapper/orchestration exports.
  - `src/main/statusline-python-template.ts` now owns the Python payload template.
- Added focused helper coverage for browser pane helper utilities:
  - `src/renderer/components/browser-tab/pane-helpers.test.ts`
  - Covers toolbar cluster construction, capture-mode precedence, credential origin parsing, and project partition mapping.

## Remaining Debt (Not Yet Closed)

1. Large UI panes remain above ideal size (`cli-surface`, `browser-tab`, `preferences-modal`, `share-dialog`) and still need deep modular extraction.
2. `src/main/statusline-python-template.ts` still contains a large embedded Python payload and can be further split into smaller template fragments/constants.
3. Full strict SCC cycle count should be re-baselined after current import migrations and helper extraction wave.

## Notes

- Public behavior contracts stayed intact: full build/test/deep-audit remained green after each major migration wave.
- Change set includes broad, behavior-preserving type import rewiring to reduce coupling to `shared/types.ts`.
