# Calder Structure Remediation Progress

Date: 2026-04-22  
Scope: Sequential execution progress for project structure/foldering debt.

## Completed in this slice

1. **Backup artifact cleanup (P0)**
   - Moved tracked backup payload from:
     - `.codex-ui-backups/2026-04-19-premium-pass/...`
   - To archive location:
     - `docs/archive/ui-backups/2026-04-19-premium-pass/...`
   - Added root guard:
     - `.gitignore` now ignores `.codex-ui-backups/`.

2. **Structure guardrail automation (P0/P1)**
   - Added `scripts/structure-audit.mjs`.
   - Added npm script: `npm run audit:structure`.
   - Integrated into deep gate:
     - `scripts/deep-system-audit.mjs` now runs `Structure audit`.
   - Updated docs:
     - `docs/development-workflow.md`.

3. **Preferences domain regrouping (P0)**
   - Moved all `preferences-*` component files from:
     - `src/renderer/components/`
   - To:
     - `src/renderer/components/preferences/`
   - Updated runtime imports (`keybindings`, `sidebar`, and internal module paths).
   - Updated contract test file-path assertions accordingly.

4. **Report filing cleanup (P1)**
   - Moved:
     - `security-report/`
   - To:
     - `docs/reports/security/`

5. **Session inspector domain regrouping (P0/P1)**
   - Moved all `session-inspector*` files from:
     - `src/renderer/components/`
   - To:
     - `src/renderer/components/session-inspector/`
   - Updated all runtime/test imports (`split-layout`, `tab-bar-session-context-menu`, `index`, `keybindings`, contract tests).

6. **Main statusline domain regrouping (P1)**
   - Moved all `statusline*` files from:
     - `src/main/`
   - To:
     - `src/main/statusline/`
   - Updated imports in `hook-status`, `qwen-hooks`, `settings-guard`, and moved-statusline tests.

7. **Main hooks domain regrouping (P1)**
   - Moved `hook-status*` and `hook-commands*` files from:
     - `src/main/`
   - To:
     - `src/main/hooks/`
   - Updated all runtime/test imports in main process and provider tests.

8. **Tab bar domain regrouping (P0/P1)**
   - Moved all `tab-bar*` files from:
     - `src/renderer/components/`
   - To:
     - `src/renderer/components/tab-bar/`
   - Updated runtime imports (`index`, `keybindings`, `split-layout`, `surface-routing`, `browser-tab/draw-mode`, `git-panel`, `session-history`, `sidebar`).
   - Updated contract/runtime tests and file-path assertions to match new folder boundaries.
   - Repaired relative import depth changes introduced by deeper nesting (including `shared/types/*` paths).

9. **Share dialog domain regrouping (P0/P1)**
   - Moved all `share-dialog*` files from:
     - `src/renderer/components/`
   - To:
     - `src/renderer/components/share-dialog/`
   - Updated runtime imports in tab-bar module family to point to the new domain entry file.
   - Updated contract tests that load raw source files (`p2p-dialog-family`, `micro-status-surfaces`, `mobile-control-discoverability`).
   - Repaired relative import depth changes for renderer-level modules (`state`, `sharing/*`) and shared types (`shared/*`).

10. **Config sections domain regrouping (P1)**
    - Moved all `config-sections*` files from:
      - `src/renderer/components/`
    - To:
      - `src/renderer/components/config-sections/`
    - Updated runtime imports in renderer bootstrap and context-language contract checks.
    - Updated moved tests/mocks and contract file references for new folder depth.
    - Repaired relative import depth changes for `state`, `provider-availability`, `types`, and `shared/*`.

11. **Auto-approval section monolith split (P0/P1)**
    - Refactored `src/renderer/components/config-sections/config-sections-auto-approval.ts` to split control-building logic into dedicated helpers:
      - `createModeSelect`
      - `createModeGuide`
      - `appendAutoApprovalControls`
    - `renderAutoApprovalSection` now acts as orchestrator instead of owning all scope-control and mode-guide wiring.
    - Behavior/contract preserved (same labels, inheritance options, handlers, and toggle semantics).

12. **Preferences modal orchestration split (P1)**
    - Refactored `src/renderer/components/preferences/preferences-modal.ts` to extract stable modal configuration helpers:
      - `PREFERENCE_SECTIONS`
      - `createPreferenceDraft`
      - `countCustomizedShortcuts`
      - `bindPreferencesMenuNavigation`
    - `renderPreferencesModalContent` reduced by removing static config/draft boilerplate and menu binding wiring.
    - Behavior/contract preserved (same modal copy, section labels, and action flow).

13. **Auto-approval helper coverage (P1)**
    - Added focused runtime tests:
      - `src/renderer/components/config-sections/config-sections-auto-approval.test.ts`
    - Added named exports for helper-level verification:
      - `createModeSelect`
      - `createModeGuide`
    - Verified helper behavior with async disabled-state and mode-guide expand/collapse assertions.

14. **Share dialog flow controller split (P1)**
    - Refactored `src/renderer/components/share-dialog/share-dialog-flow-controller.ts` by extracting:
      - `setupManualFallbackUi`
      - `bindUseMobileFallbackButton`
      - `bindConnectAndRetryHandlers`
      - `createMobileAnswerPolling`
      - `createFlowControllerResult`
    - `createShareDialogFlowController` now orchestrates instead of directly owning all event/polling wiring.
    - Behavior preserved for manual fallback, OTP flow, polling retries, and retry button handling.

15. **Share dialog mobile pairing module extraction (P1)**
    - Extracted mobile pairing-specific helpers from:
      - `src/renderer/components/share-dialog/share-dialog-flow-controller.ts`
    - Into:
      - `src/renderer/components/share-dialog/share-dialog-mobile-pairing.ts`
    - Moved QR/link + polling concerns into dedicated exports:
      - `setShareDialogPrimaryMobileLink`
      - `setShareDialogMobileFallbackLinks`
      - `formatOtpForDisplay`
      - `createMobileAnswerPolling`
      - `scheduleMobileAnswerPoll`
    - Added focused helper coverage:
      - `src/renderer/components/share-dialog/share-dialog-mobile-pairing.test.ts`
    - Updated mobile contract test source aggregation to include the new module:
      - `src/renderer/components/share-dialog/share-dialog-mobile.contract.test.ts`

16. **Mobile inspector Android candidate dedupe (P1)**
    - Removed duplicated Android SDK root/path expansion logic from:
      - `src/main/mobile-inspector-helpers.ts`
    - `getAndroidBinaryCandidates` now delegates to the single source of truth:
      - `src/main/mobile-dependency-doctor-binaries.ts`
    - Added focused regression tests:
      - `src/main/mobile-inspector-helpers.android-binaries.test.ts`
    - Result:
      - Reduced duplicate binary discovery logic in main runtime and aligned inspector path candidates with dependency doctor behavior.

17. **Mobile inspector parsing helper coverage (P1)**
    - Added direct unit coverage for parser/extractor helpers in:
      - `src/main/mobile-inspector-helpers.parsing.test.ts`
    - Covered:
      - `parseJson`
      - `extractAppiumErrorMessage`
      - `extractAppiumSessionId`
    - Result:
      - Improved runtime-safety checks around Appium response parsing and session id extraction edge-cases.

18. **i18n pattern monolith decomposition (P1)**
    - Refactored:
      - `src/renderer/i18n-pattern-translations.ts`
    - `createPatternTranslations` split into orchestrated helper builders:
      - `createWorkflowAndInstallPatterns`
      - `createPolicyAndRoutingPatterns`
      - `createRelativeTimePatterns`
      - `createCliSurfaceSummaryPatterns`
      - `createInspectorAndErrorPatterns`
    - Expanded coverage in:
      - `src/renderer/i18n-pattern-translations.test.ts`

19. **Browser auth controller decomposition (P1)**
    - Refactored:
      - `src/renderer/components/browser-tab/auth-controller.ts`
    - `createBrowserAuthController` moved to helper-driven orchestration (URL/origin resolution, action state, profile refresh, fill/save/delete flows).
    - Added focused runtime coverage:
      - `src/renderer/components/browser-tab/auth-controller.test.ts`

20. **Browser bridge hook-script decomposition + windows harness hardening (P1)**
    - Refactored:
      - `src/main/browser-bridge.ts`
    - `createNodeOpenHookScript` now composes three script sections:
      - prelude, process patch, module patch.
    - Hardened tests:
      - `src/main/browser-bridge.test.ts`
      - `src/main/pty-manager.windows.test.ts` (`setupWindowsPtyHarness` naming + isolation checks).

21. **Preferences background-task section decomposition (P1)**
    - Refactored:
      - `src/renderer/components/preferences/preferences-background-task-discovery.ts`
    - `renderProjectBackgroundTaskSection` now helper-driven orchestrator.
    - Added targeted tests:
      - `src/renderer/components/preferences/preferences-background-task-discovery.test.ts`

22. **Session inspector timeline decomposition (P1)**
    - Refactored:
      - `src/renderer/components/session-inspector/session-inspector-timeline.ts`
    - `renderTimeline` split into helper renderers for group/range/meta description concerns.
    - Extended tests:
    - `src/renderer/components/session-inspector/session-inspector-timeline.test.ts`

23. **Calder mobile app decomposition (P1)**
   - Refactored:
     - `apps/calder-mobile/App.tsx`
   - Extracted mobile app internals into dedicated modules:
     - `apps/calder-mobile/src/app/types.ts`
     - `apps/calder-mobile/src/app/copy.ts`
     - `apps/calder-mobile/src/app/live-bridge.ts`
     - `apps/calder-mobile/src/app/styles.ts`
     - `apps/calder-mobile/src/app/use-mobile-controller.ts`
     - `apps/calder-mobile/src/app/mobile-tab-panel.tsx`
   - Result:
     - App shell became orchestrator-first.
     - Mobile interaction logic moved into dedicated controller + tab-panel modules.
     - `apps/calder-mobile/App.tsx` reduced to a thin container (`122` lines).

24. **Parallel monolith closure wave with subagents (P0/P1)**
   - Completed in one parallel pass across desktop + mobile ownership slices.
   - Function-size closures achieved:
     - `useMobileController`: `386 -> 163` lines
     - `createTabBarCliUpdatePanel`: `289 -> 114` lines
     - `createCustomSelect`: `279 -> 229` lines
     - `createCliSurfaceRuntimeManager`: `264 -> 147` lines
     - `startShare`: `262 -> 67` lines
     - `renderProjectContextSection`: `258 -> 34` lines
     - `installMobileDependency`: `255 -> 59` lines
     - `showSessionTabContextMenu`: `254 -> 247` lines
   - New helper modules added:
     - `apps/calder-mobile/src/app/use-mobile-controller-live-actions.ts`
     - `apps/calder-mobile/src/app/use-mobile-controller-session-bridge.ts`
     - `src/main/cli-surface-runtime-helpers.ts`
   - Result:
     - `code-review-graph find_large_functions(min_lines=250)` now reports **0** remaining functions.

## Metric impact

- `src/renderer/components` direct file count:
  - **Before:** 188
  - **After:** 105
  - **Delta:** -83

- `src/main` direct file count:
  - **Before:** 179
  - **After:** 165
  - **Delta:** -14

- Security report location:
  - **Before:** root `security-report/`
  - **After:** `docs/reports/security/`

- Function-size reductions in this slice:
  - `renderAutoApprovalSection`: **343 -> 153**
  - `renderPreferencesModalContent`: **268 -> 214**
  - `createShareDialogFlowController`: **273 -> 237**
  - `createPatternTranslations`: **429 -> <300**
  - `createBrowserAuthController`: **322 -> <300**
  - `createNodeOpenHookScript`: **301 -> <300**
  - `renderProjectBackgroundTaskSection`: **336 -> <300**
  - `renderTimeline`: **306 -> <300**
  - `apps/calder-mobile/App.tsx`: **1296 -> 122**
  - `useMobileController`: **386 -> 163**
  - `createTabBarCliUpdatePanel`: **289 -> 114**
  - `createCustomSelect`: **279 -> 229**
  - `createCliSurfaceRuntimeManager`: **264 -> 147**
  - `startShare`: **262 -> 67**
  - `renderProjectContextSection`: **258 -> 34**
  - `installMobileDependency`: **255 -> 59**
  - `showSessionTabContextMenu`: **254 -> 247**

## Validation status

- `rtk npm run build` -> PASS
- `rtk npm test` -> PASS (`357/357`, `2531/2531`)
- `rtk npm run audit:deep` -> PASS
  - Includes the new `Structure audit` step.
- `rtk code-review-graph status --repo /Users/batuhanyuksel/Documents/browser` -> PASS
  - Nodes: `7468`, Edges: `80655`, Files: `819`
- `code-review-graph find_large_functions(min_lines=300)`:
  - Remaining `>=300` function count: **0**
- `code-review-graph find_large_functions(min_lines=250)`:
  - Remaining `>=250` function count: **0**

## Next recommended slice

1. Optional graph test-gap hygiene sweep:
   - add direct coverage for helper-level symbols flagged by graph heuristics when needed.
2. Optional next debt wave:
   - reduce the current `>=220` function list (`tab-bar-session-context-menu`, `preferences-checkpoint-discovery`, `browser-tab/pane-layout`, `share-dialog-flow-controller`, `preferences-modal-sections`, `tab-bar-branch-menu-controller`, `cli-surface/pane-elements`, `split-layout`, `provider-updater`).
