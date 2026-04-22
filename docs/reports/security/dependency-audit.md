# Dependency Audit

## Summary

- Package manager: `npm`
- Lockfile: `package-lock.json`
- Direct production dependencies: 13
- Direct development dependencies: 8
- Total dependency tree:
  - prod: 130
  - dev: 462
  - optional: 100
  - peer: 13
  - total: 591

## Current Security Posture

- `npm audit --omit=dev --json`: 0 findings
- `npm audit --json`: 0 findings

Latest verification timestamp: 2026-04-17.

## Scope and Limitations

This audit relies on lockfile analysis plus live npm advisory checks (`npm audit`).
For defense-in-depth, keep additional feeds in place:

- [OSV.dev](https://osv.dev/)
- [GitHub Security Advisories](https://github.com/advisories)
- Dependabot or Renovate

## Direct Dependencies

### Production

| Package | Version | Security Note |
|---|---|---|
| `@floating-ui/dom` | `^1.7.6` | Actively maintained |
| `@modelcontextprotocol/sdk` | `^1.29.0` | High-impact network-facing integration |
| `@xterm/addon-fit` | `^0.11.0` | Actively maintained |
| `@xterm/addon-search` | `^0.16.0` | Actively maintained |
| `@xterm/addon-serialize` | `^0.14.0` | Actively maintained |
| `@xterm/addon-web-links` | `^0.12.0` | Link handling should stay policy-guarded |
| `@xterm/addon-webgl` | `^0.19.0` | Actively maintained |
| `@xterm/xterm` | `^6.0.0` | Critical UI/runtime terminal surface |
| `dompurify` | `^3.3.3` | Core XSS control |
| `electron-updater` | `^6.8.3` | High trust impact (update path) |
| `marked` | `^17.0.5` | Must remain paired with sanitization |
| `node-pty` | `^1.1.0` | Native process boundary package |
| `picomatch` | `^4.0.4` | Low risk utility dependency |

### Development

| Package | Version | Security Note |
|---|---|---|
| `@types/dompurify` | `^3.0.5` | Deprecated, removable |
| `@types/picomatch` | `^4.0.3` | Actively maintained |
| `@vitest/coverage-v8` | `^4.1.4` | Actively maintained |
| `electron` | `^41.2.0` | High-impact runtime |
| `electron-builder` | `^26.8.1` | Packaging and install-path impact |
| `esbuild` | `^0.27.7` | Minor update available |
| `typescript` | `^5.7.0` | Major upgrade path available |
| `vitest` | `^4.1.4` | Actively maintained |

## Outdated Snapshot

From `npm outdated --json`:

| Package | Current | Wanted | Latest | Action |
|---|---:|---:|---:|---|
| `esbuild` | `0.27.7` | `0.27.7` | `0.28.0` | Track and schedule upgrade |
| `marked` | `17.0.5` | `17.0.6` | `18.0.0` | Track closely due to render pipeline relevance |
| `typescript` | `5.9.3` | `5.9.3` | `6.0.2` | Toolchain planning item |

## Supply Chain Assessment

### Risk Drivers

- `postinstall` script executes extra setup code at install time
- Native/platform-aware dependencies (`node-pty`, `electron`, `electron-builder`)
- Large transitive tree (591 packages)

### Positive Signals

- No current advisory findings from npm audit
- Most direct dependencies have recent release activity
- `dompurify` is directly included for sanitization

### Recommended Actions

1. Remove deprecated `@types/dompurify`
2. Keep `marked` + sanitization path under contract tests
3. Track Electron and updater release security notes
4. Run periodic CI jobs for:
   - `npm audit`
   - dependency freshness checks
   - lockfile drift monitoring

## Conclusion

- No direct critical/high dependency vulnerabilities were detected in current lockfile state.
- Supply-chain risk remains **low to medium** because advisory status is clean, but privileged native/runtime dependencies are present.
