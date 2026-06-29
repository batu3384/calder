# Calder Project Structure and Filing Audit

Date: 2026-04-22  
Repo: `/Users/batuhanyuksel/Documents/browser`  
Scope: Folder layout, file placement, naming consistency, repository hygiene, and maintainability risks (no feature behavior review).

## 1) Executive Summary

The repository is functionally healthy (`build/test/audit:deep` all pass), but structural debt remains in three places:

1. **Top-level and tooling clutter** (tracked backup content and mixed operational artifacts).
2. **Flat heavy zones** (`src/main` and especially `src/renderer/components` hold too many direct files).
3. **Multi-app packaging debt** (`apps/calder-mobile` is embedded but dependency management is isolated and heavy).

Core architecture separation is good (`main/preload/renderer/shared`), but discoverability and long-term maintainability are limited by file placement density and ambiguous ownership boundaries.

## 2) Validation Baseline

### Runtime and quality checks

- `rtk npm run audit:deep` -> PASS
  - `351/351` test files passed
  - `2506/2506` tests passed
  - `build` passed
  - `npm audit --omit=dev` passed
  - `knip` passed

### Graph baseline

- `rtk code-review-graph status --repo /Users/batuhanyuksel/Documents/browser`
  - Nodes: `6990`
  - Edges: `78040`
  - Files: `688`
  - Last updated: `2026-04-22T19:29:11`
  - Built at commit: `8ca6b7ef5e3f`

## 3) Repo Topology Snapshot

### Root-level size hot spots

- `apps/` -> `365M` (almost entirely `apps/calder-mobile/node_modules`)
- `node_modules/` -> `775M`
- `dist/` -> `310M` (ignored, not tracked)
- `coverage/` -> `23M` (ignored, not tracked)
- `src/` -> `6.3M`

### Tracked files

- Total tracked files: `982`
- Top-level tracked distribution:
  - `src`: `824`
  - `docs`: `52`
  - `security-report`: `42`
  - `apps`: `11`
  - `.codex-ui-backups`: `10`

### Source placement density

- `src/main`: `179` direct files (`345` total in tree)
- `src/renderer`: `101` direct files (`443` total in tree)
- `src/renderer/components`: `188` direct files (`281` total in tree)

This indicates strong growth pressure in flat directories.

## 4) What Is Already Good

1. **Clear process-layer split**: `main`, `preload`, `renderer`, `shared` are distinct.
2. **Test depth is strong**: broad contract/runtime coverage and deep audit gate.
3. **Type decomposition exists**: `src/shared/types/` has domain slices (`governance`, `mobile`, `project`, `provider`, `session`).
4. **Domain islands exist in main**: `calder-*` folders and `mobile-control-bridge` indicate a move toward bounded modules.

## 5) Findings (Prioritized)

## P0 - Immediate Structural Risks

### P0.1 Tracked backup payload in root namespace

- `.codex-ui-backups/` contains tracked backup snapshots (`10` files).
- This is production repo history mixed with archival artifacts.
- Risk: noise in code search/review, unclear source of truth, accidental stale reference usage.

### P0.2 `src/renderer/components` is overly flat

- `188` direct files at one level.
- Large direct files include:
  - `split-layout.ts` (`950` lines)
  - `preferences-modal-sections.ts` (`822`)
  - `terminal-pane.ts` (`644`)
  - `tab-bar.ts` (`599`)
  - `config-sections-auto-approval.ts` (`573`)
- Risk: ownership ambiguity, harder onboarding, brittle cross-component coupling.

### P0.3 `src/main` root remains too dense

- `179` direct files at one level.
- Major large files still live in root (`mobile-inspector.ts`, `mobile-dependency-doctor.ts`, `provider-updater.ts`, `claude-cli.ts`, etc.).
- Risk: broad edit collision zone and rising merge complexity.

## P1 - Near-Term Maintainability Debt

### P1.1 Multi-app dependency model is expensive

- `apps/calder-mobile` tracks only `11` source/config files but carries local `node_modules` (`364M`) and its own lockfile.
- Risk: duplicate dependency trees, CI/local install overhead, and less predictable reproducibility across root and mobile app.

### P1.2 Tooling directories have mixed governance at root

- `.code-review-graph` is ignored (good), but `.codex-ui-backups` and `.claude` are tracked.
- `security-report/` is fully tracked with machine-oriented findings payloads.
- Risk: root navigability degradation and blurred boundary between source code and operational artifacts.

### P1.3 Shared type coupling still broad

- Imports referencing `shared/types/` submodules exist across `237` files.
- Exact `shared/types` module import appears in `6` files.
- Risk: central contract changes can fan out widely unless import policy is tightened per domain.

## P2 - Hygiene and Professional Packaging Gaps

### P2.1 No module-level architecture docs inside `src/`

- No `README.md` or `ARCHITECTURE.md` found under `src/**`.
- Risk: tribal knowledge dependency and slower onboarding.

### P2.2 Duplicate generic filenames across many domains

- Repeated names like `discovery.ts`, `watcher.ts`, `scaffold.ts`, `pane.ts`, `store.ts`.
- Risk: low search precision and context switching overhead.

### P2.3 Deep audit does not include structure guards

- `scripts/deep-system-audit.mjs` validates runtime quality but not folder/file-budget policy.
- Risk: structure debt can regrow even while tests stay green.

## 6) Recommended Target Structure (Safe, Incremental)

Use domain-first grouping while preserving existing API contracts:

```text
src/
  main/
    runtime/
    providers/
    governance/
    mobile/
    bridge/
    ipc/
  renderer/
    core/
    components/
      layout/
      session/
      preferences/
      share/
      browser-tab/
      cli-surface/
      mobile-surface/
    state/
    styles/
  shared/
    types/
      governance.ts
      mobile.ts
      project.ts
      provider.ts
      session.ts
```

Note: this is a directional map. Migrations should be done in slices with compatibility re-exports when needed.

## 7) Recommended Action Plan

### Phase A (P0 cleanup, low risk)

1. Move tracked backup assets from `.codex-ui-backups/` to `docs/archive/` or remove from tracked tree after explicit archival decision.
2. Define folder ownership map for `src/renderer/components` and migrate direct files into bounded subfolders by domain.
3. Continue extracting large `src/main` root files into domain folders without changing runtime behavior.

### Phase B (P1 normalization)

1. Decide single dependency strategy for `apps/calder-mobile`:
   - Option 1: workspace-managed install from root.
   - Option 2: explicit standalone app boundary (with clear scripts and CI split).
2. Move machine-oriented reports (`security-report`) behind a `docs/reports/security/` convention or generate on demand.
3. Add import-boundary policy for `shared/types/*` to reduce accidental cross-domain coupling.

### Phase C (P2 guardrails)

1. Add module-level docs (`README.md`) for `src/main`, `src/renderer`, and large domain folders.
2. Add structural audit checks:
   - max direct file count per folder
   - max file LOC per category
   - forbidden tracked paths (backup/temp artifacts)
3. Include structure checks in `audit:deep`.

## 8) Suggested Structural KPIs

Track these every sprint:

1. `src/renderer/components` direct file count: `188 -> <= 90`
2. `src/main` direct file count: `179 -> <= 100`
3. Tracked backup artifacts in root: `>0 -> 0`
4. `shared/types/*` importer files: `237 -> <= 180` (first milestone)
5. `audit:deep` + structure guard pass rate: keep at `100%`

## 9) Conclusion

The system is stable in runtime quality but still carries organizational debt in folder density and repository hygiene.  
No urgent functional break is detected.  
Professionalization priority should focus on **folder ownership clarity + tracked artifact cleanup + enforceable structure guardrails**.
