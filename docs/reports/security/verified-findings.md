### VULN-001: Browser Target Picker DOM Injection

- Severity: High
- Confidence: 75/100
- CWE: CWE-79
- OWASP: A03:2021 Injection
- File: `src/renderer/components/browser-tab/pane.ts`
- Reachability: Indirect
- Sanitization: None in affected path
- Framework-level mitigation: Partial
- Why valid: `target.meta` (derived from localhost target metadata) is rendered through `innerHTML` in renderer UI flow.
- Fix direction: Build DOM nodes explicitly and assign content with `textContent`.

### VULN-002: CLI Quick-Setup DOM Injection

- Severity: High
- Confidence: 60/100
- CWE: CWE-79
- OWASP: A03:2021 Injection
- File: `src/renderer/components/cli-surface/quick-setup.ts`
- Reachability: Indirect
- Sanitization: None in affected path
- Framework-level mitigation: Partial
- Why valid: user-influenced values such as `candidate.cwd` are rendered via HTML templating.
- Fix direction: replace HTML string templates with explicit DOM creation and safe `textContent` assignment.

### VULN-003: Weak P2P Share Secret Policy (Numeric PIN Entropy)

- Severity: Medium (historical)
- Status: **REMEDIATED_BY_REMOVAL** (2026-07-27)
- Confidence: 70/100 (at time of finding)
- CWE: CWE-521
- OWASP: A07:2021 Identification and Authentication Failures
- File (removed): `src/renderer/sharing/share-crypto.ts`
- Reachability: None — P2P share + mobile remote deleted
- Why valid historically: 4–8 digit numeric-only policy significantly reduced entropy for offline brute-force scenarios.
- Fix applied: entire sharing/mobile remote surface removed from product.

### VULN-004: Release Workflow Shell Input Risk

- Severity: High
- Confidence: 100/100
- CWE: CWE-78
- OWASP: A03:2021 Injection
- File: `.github/workflows/release.yml`
- Reachability: Direct (workflow dispatch input)
- Why valid: shell execution context is sensitive to unvalidated input expansion.
- Fix direction: strict allowlist validation + quoted argument usage for version bump command.

## Rejected False Positive

- `INJ-3-003` at `src/renderer/components/usage-modal.ts` was rejected from final scoring.
- Reason: effective exploitation requires prior local compromise of user-home stats cache (`~/.claude/stats-cache.json`), which is outside the app’s direct trust boundary assumptions for this report.
