# Security Policy

## Reporting a Vulnerability

If you discover a security issue in Calder, please report it privately:

- Open a [GitHub Security Advisory](https://github.com/batu3384/calder/security/advisories/new), or
- Email the maintainer via the contact listed on the GitHub profile.

Please do not open public issues for exploitable vulnerabilities.

## Supported Versions

Security fixes are applied to the latest `main` branch and the most recent release.

## Secrets and Environment Files

- Never commit `.env`, API keys, tokens, PEM private keys, or `credentials.json`.
- Use `.env.example` as a template only; copy to `.env` locally (gitignored).
- Provider credentials belong in your OS login shell or user-level CLI config (`~/.claude`, `~/.codex`, etc.), not in the repository.

## Release Integrity

- `bin/release-checksums.json` pins SHA-256 hashes for release assets consumed by `bin/calder.js`.
- Regenerate checksums during release with `npm run checksums:generate -- <assets-dir> <asset-files...>`.
- Set `CALDER_REQUIRE_CHECKSUM=1` to refuse downloads without a pinned checksum.

## Automated Checks

CI and local hooks run:

- `npm run audit:secrets` — scan tracked files for accidental secrets
- `npm audit --omit=dev --audit-level=high` — production dependency advisories
- ESLint, tests, and structure guardrails
