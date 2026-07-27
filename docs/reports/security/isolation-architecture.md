# Calder izolasyon mimarisi

## Kapsam

İnceleme, isolation refactor ve Electron main process kaynak kodu üzerinden yapıldı (2026-07-27).

## Güvenlik sınırı

- Global Calder beyni: `~/.calder/`.
- Proje beyni: `<known-project>/.calder/`.
- `~/.claude`, `~/.codex`, `~/.gemini`, `~/.cursor`: yalnızca keşif, watcher veya transcript **okuması**; Calder **yazmaz**.
- External hook injection, settings-guard, MCP add/remove IPC ve statusline template üretimi **kaldırıldı**.
- P2P share, mobile HTTP bridge, Appium inspect — **kaldırıldı**.
- Electron renderer `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- Provider updater: kullanıcı onayıyla sistem CLI kurulumu — beklenen istisna.

## Yazma yolları (izinli)

| Hedef                  | Modül                                 | Not                            |
| ---------------------- | ------------------------------------- | ------------------------------ |
| `~/.calder/state.json` | `store.ts`                            | Uygulama state                 |
| `~/.calder/runtime/*`  | `hook-status.ts`, session watcher'lar | Status/event okuma; inject yok |
| `<project>/.calder/*`  | `calder-*/scaffold.ts`                | `projectWritePath` ile sınırlı |
| `userData/browser-*`   | browser vault/storage                 | Uygulama verisi                |
| Sistem CLI             | `provider-updater`                    | Onaylı güncelleme              |

## Okuma yolları (read-only toolchain)

- Provider config discovery / watcher: `~/.claude`, `~/.codex`, `~/.gemini` — okuma only.
- `cursor` provider: external config watcher yok; boş toolchain.
- MCP inspector: runtime connect/read; user-scope config yazımı yok.

## Kapatılan riskler (bu refactor)

- MCP governance external write → IPC + modal silindi
- Git IPC traversal → `resolvePathWithinProject` + symlink rejection
- Scaffold symlink escape → `projectWritePath` tüm scaffold writer'larda
- Auto-approval in-flight false allow → `finalDecision = 'ask'`
- Cursor config watcher `~/.claude` fallback → kaldırıldı
- P2P / mobile remote attack surface → ürün dışı

## Güvenlik sonucu

Calder artık provider home dizinlerine yazmıyor. Kalan yazım yalnızca `~/.calder`, proje `.calder` ve onaylı sistem CLI güncellemeleriyle sınırlı.
