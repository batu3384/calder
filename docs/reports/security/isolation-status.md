# Calder güvenlik raporu (post-fix)

## Yönetici özeti

**Verdict: PASS with P2 follow-ups** (CRITICAL izolasyon ihlalleri kapatıldı)

1. MCP yazımı yalnız `project/.mcp.json` — user-scope reddedilir
2. Path containment realpath + symlink escape reddi
3. `git:getDiff` / untracked read containment; `git:watchProject` known-project gate
4. Auto-approval: event.cwd ile boundary rewrite yok; in-flight race kilidi
5. External hook injection, settings-guard, MCP governance write, statusline template — kaldırıldı
6. P2P share + mobile remote control — kaldırıldı (2026-07-27); `apps/` ve mobile IPC yüzeyi repo dışı — yalnızca `store` migration strip kalır

## Kapatılan HIGH

| ID                             | Durum                                             |
| ------------------------------ | ------------------------------------------------- |
| HIGH-02 MCP user-scope write   | **FIXED** — IPC + modal silindi                   |
| HIGH-03 git diff traversal     | **FIXED**                                         |
| HIGH-01 symlink escape         | **FIXED** (`projectWritePath`)                    |
| Approval cwd poison / race     | **FIXED**                                         |
| Unsupported provider resume ID | **FIXED** — migration strips stale `cliSessionId` |

## Açık (P2)

- **HIGH-04** `electron-updater` → `builder-util-runtime` credential advisory — `npm audit --omit=dev` temiz (2026-07-31); yine de major bump öncesi smoke test
- PTY exit race, binary cache, async kill

## İstisna

Provider Update Center sistem CLI binary’lerini günceller (npm/brew/curl). Calder-private ikili CLI kopyası yok.

## Verify

Re-run before release:

```bash
npm run lint
npx vitest run
npm run audit:knip
```

## Remediasyon kalan

1. electron-updater / builder-util-runtime patch sürümü (uyumluluk testli)
