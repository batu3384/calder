# Troubleshooting

Symptoms and fixes grounded in the [2026-08-16 codebase audit](https://github.com/batu3384/calder/blob/main/docs/codebase-audit/2026-08-16.md) and current architecture.

## Blank or frozen window on startup

**Symptom:** `#app` stays invisible or shows an empty shell.

**Cause:** Bootstrap waits on provider metadata IPC before painting; a hung or failing `listProviders` delays or skips UI init.

**Try:**

1. Restart Calder.
2. Run from a terminal: `npm run dev` and check main-process logs.
3. Verify Node 24 and a clean `npm install`.
4. If a provider adapter misbehaves, temporarily move aside external CLI configs and relaunch.

Recent fix: early `markUiReady()` and `appState.load()` before heavy init — pull latest `main`.

## CLI not listed / empty provider dropdown

**Symptom:** Tab bar has no provider selector; sessions always launch as default `claude`.

**Cause:** Selector was hidden when fewer than two CLIs passed `checkBinary`. Missing binaries were not shown as disabled rows.

**Try:**

1. **Workspace Center → Provider health** — refresh binary checks.
2. Ensure the CLI is on `PATH` in the same environment that launches Calder (GUI apps on macOS may differ from your shell).
3. Reinstall via Update Center if offered.
4. After external reinstall, use **Refresh** (cache clears only on `forceRefresh`).

Recent fix: show selector with disabled “not installed” entries when registry exists.

## Turkish (or other locale) does not stick

**Symptom:** Language set to Turkish but chrome stays English until reload.

**Try:**

1. **Preferences → General → Language** — click **Save** after changing (draft alone does not persist).
2. After Save, Calder reloads to apply `t()`-backed strings.
3. Some legacy strings may still be English until i18n migration completes — see [Roadmap](Roadmap).

## UI feels sluggish

**Symptom:** Fan noise, jank with Turkish locale or Pixel Office visible.

**Cause:** Broad `MutationObserver` on `document.body` for in-place translation; Pixel Office game loop.

**Try:**

1. **Preferences → Safety → Pixel Office → Off**
2. Enable **Reduce motion** in OS accessibility settings (Calder respects `prefers-reduced-motion` for Office).
3. Prefer English locale until observer scope is fully narrowed.

## Hook timeline empty or “unknown” completion

**Symptom:** Inspector timeline missing events; Cursor session ends as `unknown`.

**Cause:** Provider hook coverage varies. Cursor may not emit session-end hooks Calder understands.

**Try:**

1. Confirm hooks write to `~/.calder/runtime/` per provider docs.
2. Read diagnostics banner in Context Inspector when tracking is unavailable.
3. Do not treat `unknown` as `interrupted` — semantics differ by provider.

## Browser inspect cannot target element

**Symptom:** Cross-origin iframe, canvas, or icon click fails.

**Cause:** Platform limits (cross-origin iframe, closed shadow root, non-DOM canvas).

**Try:**

1. Use **Draw** to annotate a screenshot.
2. Click a parent interactive element instead of SVG/icon leaf.
3. Route prompt from parent page context.

## Structure / CI failures (developers)

```bash
npm run audit:structure   # file size + forbidden paths
npm run lint
npm run format:check
npm test
```

Pre-push hook runs the full gate. Emergency bypass: `CALDER_SKIP_PRE_PUSH=1 git push` (not for normal workflow).

## Still stuck?

- Search [Issues](https://github.com/batu3384/calder/issues)
- Security-sensitive bugs: [Security Advisories](https://github.com/batu3384/calder/security/advisories/new) — not public issues
- Include Calder version, OS, provider ID, and redacted logs from `~/.calder/logs/`
