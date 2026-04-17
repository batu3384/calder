# Security Assessment Report

Project: `calder`  
Date: 2026-04-12  
Overall Risk Score: **4/10 (Medium)**

## Risk Scoring Rationale

- High findings: `3 x 1.0 = +3.0`
- Medium findings: `1 x 0.3 = +0.3`
- Repeated renderer output-encoding gap pattern: `+0.5`
- Existing baseline controls (`contextIsolation`, CSP, path allowlist, browser-bridge token): `-0.3`
- Rounded result: `3.5 -> 4/10` (desktop/electron impact considered)

## Metrics

| Metric | Value |
|---|---:|
| Total Findings | 4 |
| Critical | 0 |
| High | 3 |
| Medium | 1 |
| Low | 0 |
| Info | 0 |
| Rejected False Positives | 1 |

## Top Risks

1. Local browser target metadata can be injected into renderer HTML without proper escaping.
2. CLI quick-setup modal renders user-influenced project path values via `innerHTML`.
3. Release workflow version input can reach shell execution if validation drifts or is bypassed.

## Scan Statistics

| Statistic | Value |
|---|---:|
| Scanned Files | 388 |
| Scanned LOC | 60,873 |
| Languages | TypeScript, JavaScript, HTML, CSS |
| Frameworks | Electron, node-pty, xterm, MCP SDK |
| Raw Findings | 5 |
| Confirmed Findings | 4 |
| Rejected False Positives | 1 |

## Confirmed Findings

### VULN-001: Browser Target Picker DOM Injection

- Severity: High
- Confidence: 75/100
- CWE: CWE-79
- OWASP: A03:2021 Injection
- File: `src/renderer/components/browser-tab/pane.ts`

The `target.meta` value (derived from localhost page metadata) is rendered into `innerHTML`. This creates a renderer-level injection surface.

Recommended fix:

```ts
const label = document.createElement('span');
label.className = 'browser-ntp-link-label';
label.textContent = target.label;

const meta = document.createElement('span');
meta.className = 'browser-ntp-link-meta';
meta.textContent = target.meta;

button.replaceChildren(label, meta);
```

### VULN-002: CLI Quick-Setup Modal DOM Injection

- Severity: High
- Confidence: 60/100
- CWE: CWE-79
- OWASP: A03:2021 Injection
- File: `src/renderer/components/cli-surface/quick-setup.ts`

`candidate.cwd`, `candidate.reason`, and command preview values are rendered via HTML templating in a context that can include user-controlled data.

Recommended fix:

- Replace HTML string templating with explicit DOM node creation.
- Write user-facing strings with `textContent`.
- Use `dataset` only for controlled IDs.

### VULN-004: Release Workflow Command Injection Risk

- Severity: High
- Confidence: 100/100
- CWE: CWE-78
- OWASP: A03:2021 Injection
- File: `.github/workflows/release.yml`

The workflow dispatch `version` input may become shell-sensitive if not strictly validated and quoted.

Recommended fix (already aligned in workflow):

```yaml
- name: Validate version input
  run: |
    case "$VERSION_INPUT" in
      patch|minor|major|prepatch|preminor|premajor|prerelease) ;;
      [0-9]*.[0-9]*.[0-9]*|[0-9]*.[0-9]*.[0-9]*-[0-9A-Za-z.-]*) ;;
      *) exit 1 ;;
    esac

- name: Bump version
  run: npm version "$VERSION_INPUT" --no-git-tag-version
```

### VULN-003: Low-Entropy Numeric PIN for P2P Share

- Severity: Medium
- Confidence: 70/100
- CWE: CWE-521
- OWASP: A07:2021 Identification and Authentication Failures
- File: `src/renderer/sharing/share-crypto.ts`

PIN-only constraints reduce entropy and increase offline brute-force feasibility if offer/answer material leaks.

Recommended fix:

- Prefer high-entropy one-time tokens or stronger passphrases.
- Increase minimum secret length and move away from numeric-only PIN mode.

## Clean / Lower-Risk Areas

- No hardcoded production secrets were confirmed in this audit pass.
- `npm audit` reported no current vulnerabilities.
- Browser bridge is localhost-bound and token-protected.
- File read paths use explicit allowlist checks.

## Remediation Roadmap

### Phase 1 (Immediate, 1-3 days)

- Close VULN-001 and VULN-002 with DOM-safe rendering patterns.

### Phase 2 (Short-term, 1-2 weeks)

- Enforce release workflow validation hardening and regression checks.
- Improve P2P secret policy (VULN-003).

### Phase 3 (Medium-term, 1-2 months)

- Standardize safe renderer rendering helpers across UI surfaces.
- Add recurring CI security checks (`audit`, static scans, secret scanning).

### Phase 4 (Continuous)

- Dependency and Electron hardening review cadence.
- Workflow security policy checks for shell inputs and secret handling.

## Methodology and Limitations

- Primary method: static analysis with targeted manual validation.
- No dynamic exploit execution or fuzzing in this pass.
- Electron threat model outcomes may change with runtime environment and local trust assumptions.
- Advisory status can change over time; re-run scans regularly.
