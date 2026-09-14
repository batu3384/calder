# Security

Summary of Calder’s security posture. Canonical policy: [SECURITY.md](https://github.com/batu3384/calder/blob/main/SECURITY.md) in the repository.

## Reporting vulnerabilities

**Do not** open public GitHub issues for exploitable vulnerabilities.

Report privately via:

- [GitHub Security Advisory](https://github.com/batu3384/calder/security/advisories/new), or
- Maintainer contact on the GitHub profile

Supported fixes land on latest `main` and the most recent release.

## Threat model (high level)

| Asset                                     | Risk                               | Mitigation                                                           |
| ----------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| User source code & prompts                | Local exposure via PTY/browser     | Sessions local; no P2P sharing; Evidence redaction + opt-out         |
| Provider credentials                      | Leak via repo or Calder storage    | Credentials in CLI vendor dirs only; secret scans in CI              |
| Renderer compromise                       | Privilege escalation to main       | No Node in renderer; narrow preload IPC surface                      |
| Malicious web content in embedded browser | Drive-by → shell                   | Electron isolation; routing prompts requires explicit user action    |
| Supply chain                              | Bad dependency or release artifact | `npm audit`, checksum-pinned releases (`bin/release-checksums.json`) |
| Auto-approval governance                  | Unintended tool approval           | Global / project / session precedence; user-visible Run tab          |

Detailed isolation notes: [docs/reports/security/](https://github.com/batu3384/calder/tree/main/docs/reports/security) and [docs/architecture/calder-isolation-boundary.md](https://github.com/batu3384/calder/blob/main/docs/architecture/calder-isolation-boundary.md).

## Data boundaries

**Calder writes:**

- `~/.calder/` — app state, runtime hooks, evidence
- `<project>/.calder/` — project context, governance, workflows
- Electron `userData` — browser vault
- Temp `calder-*` — screenshots and bridge files

**Calder does not write** provider home configs (`~/.claude`, `~/.codex`, `~/.cursor`, etc.).

**Calder does not read** provider MCP/skills/agents configs for UI display.

**User-consented exceptions:** Provider Update Center and mobile dependency doctor may install system binaries.

## Secrets hygiene

- Never commit `.env`, API keys, tokens, PEM keys, or `credentials.json`
- Use `env.example` as template only
- Provider auth belongs in OS/CLI config, not the Calder repo

## Release integrity

- `bin/release-checksums.json` pins SHA-256 for release assets
- Regenerate: `npm run checksums:generate -- <assets-dir> <files...>`
- Set `CALDER_REQUIRE_CHECKSUM=1` to refuse downloads without a pinned hash

## Automated checks (CI + hooks)

| Check                                     | Purpose                          |
| ----------------------------------------- | -------------------------------- |
| `npm run audit:secrets`                   | Tracked-file secret scan         |
| `npm run audit:runtime-secrets`           | `~/.calder/runtime` and logs     |
| `npm audit --omit=dev --audit-level=high` | Production dependency advisories |
| ESLint, tests, `audit:structure`          | Code quality and guardrails      |

## Session Evidence privacy

Evidence is **local**, **opt-in**, and designed for redaction before export. Disable capture in Preferences. Export JSON/Markdown only shares what you explicitly export.

## Related

- [Troubleshooting](Troubleshooting) — non-security operational issues
- [Architecture](Architecture) — IPC and isolation boundary
- [Roadmap](Roadmap) — planned security/docs work
