# Mimari Haritalama

## Teknoloji Tespiti

### Dil ve dosya özeti

- TypeScript: 314 dosya, yaklaşık 51,853 satır
- JavaScript: 2 dosya, yaklaşık 251 satır
- HTML: 1 dosya, 108 satır
- CSS: 23 dosya, yaklaşık 8,314 satır
- Toplam taranan kaynak/arayüz satırı: yaklaşık 60,582

### Framework ve ana kütüphaneler

- Electron masaüstü uygulaması
  Kanıt: `package.json` içinde `electron`, `electron-builder`, `main`, `build`, `mac.hardenedRuntime`; `src/main/main.ts`
- Vanilla TypeScript renderer + preload bridge
  Kanıt: `src/renderer/index.ts`, `src/preload/preload.ts`, `src/renderer/index.html`
- Terminal/PTY katmanı
  Kanıt: `node-pty`, `@xterm/*`, `src/main/pty-manager.ts`, `src/renderer/components/terminal-pane.ts`
- MCP istemcisi
  Kanıt: `@modelcontextprotocol/sdk`, `src/main/mcp-client.ts`
- P2P paylaşım
  Kanıt: `src/renderer/sharing/peer-host.ts`, `src/renderer/sharing/peer-guest.ts`, `src/renderer/sharing/share-crypto.ts`

### Veritabanı / ORM / veri depolama

- Görünür bir SQL/NoSQL veritabanı yok.
- ORM tespit edilmedi.
- Kalıcı uygulama durumu düz JSON olarak kullanıcı home dizininde tutuluyor:
  `~/.calder/state.json` (`src/main/store.ts`)
- Geçici ekran görüntüleri sistem temp dizininde tutuluyor:
  `os.tmpdir()/calder-screenshots` (`src/main/ipc-handlers.ts`)

## Uygulama Tipi

- Desktop App
  Gerekçe: Electron `BrowserWindow`, preload bridge, renderer/main ayrımı, paketleme ayarları
- Monolith
  Gerekçe: tek `package.json`, tek uygulama paketi, `packages/`, `services/`, `apps/` yapısı yok
- CLI Orchestrator
  Gerekçe: yerel PTY oturumları başlatıyor, CLI binary tespiti ve session watcher kullanıyor
- Embedded Browser Surface
  Gerekçe: `<webview>` tabanlı gömülü tarayıcı akışları ve `browser-tab-preload.ts`

## Entry Point Haritası

### Ana uygulama başlangıcı

- Uygulama bootstrap:
  `src/main/main.ts`
- Ana pencere ve güvenlik ayarları:
  `nodeIntegration: false`, `contextIsolation: true`, `sandbox: false`, `webviewTag: true`
- Renderer giriş noktası:
  `src/renderer/index.ts`
- Preload köprüsü:
  `src/preload/preload.ts`

### Renderer -> Main IPC yüzeyi

Not: Bu uygulama HTTP API yerine Electron IPC kullanıyor. Aşağıdaki çağrılar renderer tarafından kullanılabiliyor; uygulama içinde ayrı bir kullanıcı kimlik doğrulama katmanı yok. Bu nedenle preload üzerinden açılan operasyonel yüzeyler `[NO AUTH]` olarak işaretlenmiştir.

#### `[NO AUTH]` PTY / CLI oturum yönetimi

- `pty:create`
- `pty:createShell`
- `pty:write`
- `pty:resize`
- `pty:kill`
- `pty:getCwd`
- `cli-surface:start`
- `cli-surface:discover`
- `cli-surface:stop`
- `cli-surface:restart`
- `cli-surface:write`
- `cli-surface:resize`

Handler dosyası:
`src/main/ipc-handlers.ts`

Ana sink:
OS üzerinde PTY ve komut çalıştırma (`src/main/pty-manager.ts`)

#### `[NO AUTH]` Dosya sistemi / proje keşfi

- `fs:isDirectory`
- `fs:expandPath`
- `fs:listDirs`
- `fs:browseDirectory`
- `fs:listFiles`
- `fs:readFile`
- `fs:watchFile`
- `fs:unwatchFile`

Koruma:
`isAllowedReadPath()` ile proje kökü ve belirli CLI config path'leri allowlist altında tutuluyor (`src/main/ipc-handlers.ts`)

#### `[NO AUTH]` Git ve IDE yardımcı yüzeyi

- `git:getStatus`
- `git:getRemoteUrl`
- `git:getFiles`
- `git:getDiff`
- `git:getWorktrees`
- `git:stageFile`
- `git:unstageFile`
- `git:discardFile`
- `git:watchProject`
- `git:listBranches`
- `git:checkoutBranch`
- `git:createBranch`
- `git:openInEditor`

#### `[NO AUTH]` Uygulama / dış URL / browser yüzeyi

- `app:getVersion`
- `app:getBrowserPreloadPath`
- `app:openExternal`
- `app:focus`
- `browser:saveScreenshot`
- `browser:listLocalTargets`

Koruma:
`app:openExternal` yalnızca `http` ve `https` kabul ediyor (`src/main/ipc-handlers.ts`)

#### `[NO AUTH]` Sağlayıcılar / readiness / istatistik / ayarlar

- `provider:getConfig`
- `provider:getMeta`
- `provider:listProviders`
- `provider:checkBinary`
- `session:buildResumeWithPrompt`
- `readiness:analyze`
- `stats:getCache`
- `settings:reinstall`
- `settings:validate`

#### `[NO AUTH]` MCP istemci yüzeyi

- `mcp:connect`
- `mcp:disconnect`
- `mcp:listTools`
- `mcp:listResources`
- `mcp:listPrompts`
- `mcp:callTool`
- `mcp:readResource`
- `mcp:getPrompt`
- `mcp:addServer`
- `mcp:removeServer`

Toplam görünür IPC handler sayısı:
yaklaşık 65

### Yerel HTTP entry point

- `POST /open`
  Dosya: `src/main/browser-bridge.ts`
  Amaç: dış tarayıcı açma isteklerini gömülü browser sekmesine yönlendirmek
  Auth: token başlığı ile korunuyor (`X-Calder-Token`)
  Bind: `127.0.0.1` üzerinde rastgele port

### Webview / DOM entry point'leri

- `element-selected`
- `flow-element-picked`
- `draw-stroke-end`

Kaynak:
`src/preload/browser-tab-preload.ts`

Amaç:
Gömülü webview içindeki DOM seçimlerini host renderer'a iletmek

### P2P / WebRTC giriş yüzeyi

- Offer üretimi ve answer kabulü:
  `src/renderer/sharing/peer-host.ts`
- Offer çözme ve answer üretimi:
  `src/renderer/sharing/peer-guest.ts`
- Data channel mesaj tipleri:
  `init`, `data`, `resize`, `input`, `ping`, `pong`, `auth-challenge`, `auth-response`, `auth-result`, `end`

### Scheduler / watcher / event handler yüzeyi

- Auto updater periyodik kontrolü:
  `src/main/auto-updater.ts`
- Güç durumundan dönüşte re-sync:
  `src/main/main.ts`
- Git watcher:
  `src/main/git-watcher.ts`
- Dosya watcher:
  `src/main/file-watcher.ts`
- Codex / Blackbox session watcher:
  `src/main/codex-session-watcher.ts`, `src/main/blackbox-session-watcher.ts`

### HTTP route / GraphQL / gRPC / WebSocket / MQ durumu

- REST API yok
- GraphQL yok
- gRPC yok
- Message queue subscriber yok
- Harici WebSocket sunucusu yok
- WebRTC data channel var

## Veri Akışı (Source -> Process -> Sink)

### Kaynaklar

- Renderer kullanıcı girdisi
  dosya yolu, URL, MCP sunucu URL'si, paylaşım kodu, PIN, proje yolu, CLI profile bilgisi
- Webview DOM olayları
  seçilen element metadatası, selector, textContent, page URL
- Local browser bridge
  `POST /open` body parametreleri: `url`, `cwd`, `preferEmbedded`
- Dış ağ kaynakları
  MCP endpoint URL'leri, auto-update endpoint'i, localhost hedef taraması
- Yerel CLI çıktıları
  PTY verisi, session id watcher dosyaları, stats cache

### Process katmanı

- Path çözümleme ve allowlist kontrolü
  `isWithinKnownProject()`, `isAllowedReadPath()`
- URL normalizasyonu ve protokol kontrolü
  `openUrlWithBrowserPolicy()`, `app:openExternal`
- Gömülü browser seçim metadata üretimi
  `browser-tab-preload.ts`
- P2P paylaşım kriptografisi
  PBKDF2 + AES-GCM + HMAC challenge-response (`share-crypto.ts`)
- HTML sanitization
  Markdown/rich content render sırasında DOMPurify (`src/renderer/components/file-reader.ts`)
- Sağlayıcı ayar doğrulama / tracking health
  `src/main/ipc-handlers.ts`, `src/shared/tracking-health.ts`

### Sink'ler

- OS komut/PTY yürütmesi
  `node-pty`, login shell PATH çözümü, provider binary launch
- Dosya okuma / yazma
  `fs:readFile`, `store.save`, screenshot yazımı, temp dosyalar
- Dış URL açma
  `shell.openExternal`
- Uzak HTTP bağlantıları
  `MCP connect`, `electron-updater`, localhost probe `fetch`
- Uzak peer veri akışı
  WebRTC data channel
- UI render sink'leri
  `innerHTML`, `textContent`, DOM oluşturma; çoğu renderer bileşeninde manuel DOM inşası

## Güven Sınırları (Trust Boundaries)

### 1. Renderer <-> Main process

- Köprü: `contextBridge.exposeInMainWorld('calder', api)`
- Risk: preload yüzeyi ayrı bir authz katmanı olmadan çok sayıda güçlü IPC çağrısı açıyor
- Mevcut kontrol:
  `nodeIntegration: false`, `contextIsolation: true`

### 2. Main process <-> OS / dosya sistemi / subprocess

- PTY başlatma, shell çözümleme, git komutları, dosya okuma/yazma
- Risk: renderer kaynaklı parametreler doğrudan sistem seviyesine kadar ilerliyor
- Mevcut kontrol:
  bazı path allowlist'leri ve URL şema kontrolleri

### 3. Gömülü web içeriği <-> Host renderer

- `webviewTag` aktif
- `browser-tab-preload.ts` host'a DOM verisi gönderiyor
- Risk: dış web içeriği, inspect/handoff akışları üzerinden UI veya prompt zincirlerini etkileyebilir

### 4. Yerel loopback bridge <-> dış uygulamalar / tarayıcı

- `127.0.0.1` üzerinde `POST /open`
- Risk: lokal origin'ler ve aynı makinedeki süreçler
- Mevcut kontrol:
  bearer-benzeri statik olmayan token başlığı, body boyut limiti

### 5. Uzak peer <-> P2P paylaşım

- WebRTC offer/answer kodu ile oturum paylaşımı
- Risk: yetkisiz bağlanma, scrollback ve canlı terminal verisi sızıntısı
- Mevcut kontrol:
  PIN/passphrase, PBKDF2, AES-GCM, HMAC tabanlı doğrulama, keepalive

### 6. Uzak servisler <-> uygulama

- Auto updater
- MCP sunucuları
- Localhost web yüzeyi keşfi

## Authentication / Authorization Mimarisi

- Uygulama genelinde klasik kullanıcı hesabı temelli auth yok
  Session, JWT, OAuth2, API key veya SSO mimarisi tespit edilmedi
- Güven modeli esasen yerel masaüstü güvenine dayanıyor
- P2P paylaşım için ayrı bir kimlik doğrulama akışı var:
  - PIN/passphrase girişi
  - Offer/answer kodları şifreleniyor
  - Host tarafı HMAC challenge-response ile peer doğruluyor
- Session saklama:
  uygulama durumu `~/.calder/state.json` içinde saklanıyor
- Token/session lifetime:
  uygulama için görünür değil
- Password hash:
  uygulama auth sistemi yok; P2P paylaşımda passphrase doğrudan PBKDF2 ile anahtar türetmek için kullanılıyor
- MFA / account lockout:
  görünür değil, uygulanmıyor

## Güvenlik Kontrolleri

- Electron hardening:
  `nodeIntegration: false`
  `contextIsolation: true`
- CSP meta etiketi:
  `src/renderer/index.html`
- Dış URL kısıtı:
  yalnızca `http/https` şemaları
- Path allowlist:
  proje kökleri ve sınırlı config path'leri
- DOM sanitization:
  DOMPurify kullanımı
- P2P kriptografi:
  PBKDF2, AES-GCM, HMAC challenge-response
- Browser bridge token koruması:
  `X-Calder-Token`
- Screenshot boyut ve yaş limiti:
  temp dosyalar için pruning ve size check
- macOS build hardening:
  `hardenedRuntime`, notarization, entitlements
- Settings/tracking validation:
  sağlayıcı hook/status doğrulama

## Rate Limiting / Input Validation / CSRF / CORS

- Rate limiting:
  görünür bir global veya endpoint bazlı rate limiting yok
- Input validation library:
  Zod/Joi/Pydantic benzeri merkezi doğrulama kütüphanesi yok; çoğu kontrol özel kod ile yapılıyor
- CSRF:
  klasik web oturum modeli olmadığı için doğrudan uygulanabilir değil
- CORS:
  backend HTTP API olmadığı için klasik CORS politikası yok
- Browser/webview tarafında CSP var; ancak `frame-src *` geniş

## Hassas Dosyalar ve Path'ler

- Uygulama yüzeyi:
  `src/main/ipc-handlers.ts`
  `src/main/main.ts`
  `src/preload/preload.ts`
  `src/preload/browser-tab-preload.ts`
  `src/main/browser-bridge.ts`
  `src/main/pty-manager.ts`
  `src/main/mcp-client.ts`
  `src/renderer/sharing/peer-host.ts`
  `src/renderer/sharing/peer-guest.ts`
  `src/renderer/sharing/share-crypto.ts`
- Konfigürasyon / paketleme:
  `package.json`
  `build/entitlements.mac.plist`
  `.github/workflows/*.yml`
- Kullanıcı state/config path'leri:
  `~/.calder/state.json`
  `~/.claude*`
  `~/.codex/`
  `~/.copilot/`
  `~/.qwen/`
  `~/.mmx/`
  `~/.blackboxcli/`

## Monorepo / Çoklu Servis Tespiti

- Monorepo değil
- Tek servis / tek uygulama paketi
- Shared library olarak kullanılan `src/shared/` var; ancak aynı uygulamanın iç parçası
- Servisler arası HTTP çağrı katmanı görünür değil

## Dil Özeti — Faz 2 İçin Kritik

- TypeScript (~99.5% yürütülebilir kod satırı) -> sc-lang-typescript aktif
- JavaScript (~0.5% yürütülebilir kod satırı) -> sc-lang-typescript ile birlikte değerlendirilecek
- HTML/CSS mevcut ancak Faz 2 derin tarama dili olarak değil, XSS/CSP/UI güvenlik bağlamında ele alınacak

## Faz 2 İçin Öncelikli İnceleme Notları

- IPC yüzeyi geniş ve çoğu kanal `[NO AUTH]`; renderer->main trust boundary kritik
- `webviewTag: true` ve `sandbox: false` kombinasyonu yüksek dikkat gerektiriyor
- Gömülü browser ve `shell.openExternal` akışları URL/SSRF/open redirect açısından incelenecek
- PTY / shell / external binary başlatma akışları komut enjeksiyonu ve RCE açısından incelenecek
- P2P paylaşım ve MCP bağlantıları veri sızıntısı / authz / SSRF açısından incelenecek
