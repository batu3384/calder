# Fix Impact Analysis

Date: 2026-04-12  
Scope: Pre-implementation breakage analysis for the 4 verified findings in `SECURITY-REPORT.md`

## Executive Summary

Direct answer:

- `VULN-001` and `VULN-002` are low-risk product changes when implemented with minimal, DOM-safe refactors.
- `VULN-004` does not impact runtime behavior; it only affects release workflow input handling.
- `VULN-003` is the most sensitive change due to UX and backward-compatibility tradeoffs in the sharing flow.

Recommended rollout order:

1. `VULN-001` browser target DOM hardening
2. `VULN-002` quick-setup DOM hardening
3. `VULN-004` release workflow validation hardening
4. `VULN-003` share-secret policy strengthening (after compatibility decision)

## Baseline Verification

Baseline tests were run and passed:

```bash
npm test -- --run \
  src/renderer/components/browser-tab-pane.test.ts \
  src/renderer/components/browser-stage.contract.test.ts \
  src/renderer/components/cli-surface/quick-setup.test.ts \
  src/renderer/components/share-dialog.test.ts \
  src/renderer/sharing/share-crypto.test.ts
```

Result: all selected suites passed.

## Finding-by-Finding Impact

### 1) VULN-001 — Browser target picker DOM injection

Planned fix:

- Replace `innerHTML` rendering of target metadata with `createElement` + `textContent`.

Breakage risk:

- Product risk: Low
- Test risk: Low

Potentially affected:

- Localhost target card rendering
- Label/meta class bindings
- Click-to-navigate behavior

Why low risk:

- Event binding remains on the same button node.
- Existing class names can be preserved unchanged.
- Current tests are not tightly coupled to exact HTML string templates.

Conclusion:

- Safe to ship in a standard patch PR with minimal regression risk.

### 2) VULN-002 — CLI quick setup DOM injection

Planned fix:

- Replace card `innerHTML` templates with explicit DOM node construction.

Breakage risk:

- Product risk: Low
- Test risk: Medium

Potentially affected:

- Modal card layout
- `Run` / `Edit` action wiring
- Contract tests that assert implementation literals

Why test risk is higher:

- Some tests may assert source-level literals (`data-action` pattern style).
- Behavior can remain correct while brittle assertions fail.

Safe implementation conditions:

- Preserve `data-action` and candidate identity wiring semantics.
- Keep existing CSS hooks for layout and styling.
- Update affected tests in the same patch if they rely on template literals.

Conclusion:

- Product behavior should remain stable; test updates may be required.

### 3) VULN-003 — Low-entropy share secret policy

Fix options:

- Option A (compatibility-first):
  - Keep numeric PIN model
  - Increase minimum length modestly
- Option B (security-first):
  - Move to stronger alphanumeric/passphrase model
  - Rework input UX and message copy

Breakage risk:

- Option A: Medium
- Option B: High

Potentially affected:

- Share dialog UX copy and validation expectations
- Existing sessions/shared instructions among users
- Backward compatibility with old habits/tooling docs

Recommendation:

- Use staged rollout:
  1. Introduce stronger defaults with compatibility mode
  2. Add telemetry/feedback window
  3. Enforce stricter policy in a later minor release

### 4) VULN-004 — Release workflow command input risk

Planned fix:

- Keep strict allowlist validation for `inputs.version`.
- Keep quoted version argument in `npm version` call.

Breakage risk:

- Runtime: None
- Release operations: Low to Medium

Main operational caveat:

- Overly narrow validation may block legitimate release inputs (for example prerelease patterns).

Recommendation:

- Explicitly document supported version formats in workflow descriptions.
- Use dry-run release checks before enforcing stricter patterns.

## Final Recommendation

Proceed now with `VULN-001`, `VULN-002`, and `VULN-004`.  
Handle `VULN-003` in a planned compatibility-aware rollout rather than a rushed hard break.
