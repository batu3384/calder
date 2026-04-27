# Calder Kapsamlı İyileştirme Raporu

**Tarih:** 2026-04-24
**Kapsam:** UI/UX, Özellikler, Provider Abstraction, Mimari & Teknik Borç
**Önceliklendirme:** Son kullanıcıya görünür UX değeri

---

## Bağlam (Context)

**Proje:** Calder — Electron tabanlı, CLI AI tool (Claude Code, Copilot, Codex, Gemini, Qwen) oturumlarını sarmalayan terminal-merkezli IDE. Vanilla TypeScript renderer, üç-süreçli Electron mimarisi, `~/.calder/state.json`'a kalıcı state.

**Neden bu rapor?** Projenin mevcut durumu hem arayüz hem özellik açısından kapsamlı olarak denetlendi ve geliştirilebilecek alanlar UX etkisine göre önceliklendirildi.

**Nasıl üretildi?** Üç paralel Explore ajanı (UI/UX, Özellikler, Mimari) + hedeflenmiş doğrulama komutlarıyla (tema dosyaları, provider listesi, quick-open kapsamı, preferences bölümleri) çapraz kontrol edildi. Tüm bulgular dosya + satır referansı ile bağlanmıştır.

**Önem dereceleri:**
- **🔴 Critical** — günlük kullanımda fark edilen, iş akışını bozan
- **🟠 High** — kullanıcı deneyimini belirgin şekilde iyileştirir
- **🟡 Medium** — polish / power-user değeri
- **🟢 Low** — nice-to-have / teknik cila

**Genel sağlık:** Mimari iskelet güçlü (strict TypeScript, context isolation, path policy, structure audit, 364 test dosyası). Darboğaz, "son %20 cilası": UI tutarlılığı, eksik modern IDE paternleri, provider parity ve teknik borç baselineları.

---

## 📋 Yönetici Özeti

| # | Başlık | Öncelik | Tahmini Efor |
|---|--------|---------|--------------|
| 1 | Tema sistemini birleştir + Light tema | 🔴 Critical | L (5-7 gün) |
| 2 | Gerçek Command Palette (Cmd+Shift+P) | 🔴 Critical | M (3-4 gün) |
| 3 | Empty state + loading skeleton kapsaması | 🟠 High | M (2-3 gün) |
| 4 | Onboarding / first-run deneyimi | 🟠 High | M (3-4 gün) |
| 5 | Global search (transcript + session) | 🟠 High | L (4-6 gün) |
| 6 | Provider capability enforcement | 🟠 High | M (3-4 gün) |
| 7 | Preferences içi arama + conflict detection | 🟡 Medium | S (1-2 gün) |
| 8 | Hata mesajları + retry paternleri | 🟡 Medium | M (2-3 gün) |
| 9 | Workspace/çoklu pencere desteği | 🟡 Medium | L (7-10 gün) |
| 10 | Baseline-frozen testleri parçala | 🟡 Medium | L (4-6 gün) |
| 11 | ESLint/Prettier ekle | 🟢 Low | S (1 gün) |
| 12 | IPC contract'larına Zod şeması | 🟢 Low | M (3-5 gün) |

**Öne çıkan 3 kazanım:** Command Palette + Light Tema + Empty States. Birlikte uygulandığında uygulamanın "premium IDE" hissi büyük sıçrama yapar.

---

## 1️⃣ UI/UX ve Tasarım Bulguları

### 1.1 Tema Sistemi Parçalılığı — 🔴 Critical

**Şu an:** İki ayrı "dark" tema (`src/renderer/styles/theme-aurora.css` 1504 satır + `theme-command-studio.css` 1725 satır). Her ikisi de karanlık. **Light tema yok** (grep `prefers-color-scheme` / `lightTheme` → 0 sonuç). `base.css` içinde 182+ hardcoded renk / color-mix() ifadesi iki tema arasında duplike edilmiş.

**Etkisi:** (a) Kullanıcı gündüz/parlak ortamda kullanamıyor. (b) İki tema arasındaki farklar (hover gradyanları, border tonu, status renkleri) tutarsız — aynı component iki temada görsel olarak farklı davranıyor. (c) Yeni bir renk token'ı eklemek iki dosyada senkronize edit gerektiriyor.

**Önerilen çözüm:**
1. `base.css`'i **tek doğru kaynak** yap; tüm renkleri CSS custom property ile tanımla (`--surface-1`, `--surface-2`, `--text-primary`, `--accent`, `--status-working`, vb.).
2. `theme-aurora.css` ve `theme-command-studio.css` yalnızca **override** katmanı olarak kalsın (varsayılanı aurora). Ortak 70-80 satırlık tema dosyaları hedefle.
3. `[data-theme="light"]` scope'u ekle: 1 light tema + 2 dark tema (Aurora dark / Command Studio dark / default light).
4. Preferences > Appearance altında theme picker (currently yok).
5. `prefers-color-scheme: light` otomatik algılama + "System" seçeneği.

**İlgili dosyalar:**
- `src/renderer/styles/base.css` (tek-kaynak yapılacak)
- `src/renderer/styles/theme-aurora.css` (slimleştirilecek)
- `src/renderer/styles/theme-command-studio.css` (slimleştirilecek)
- `src/renderer/styles/theme-contract.test.ts` (mevcut — genişlet)
- Yeni: `src/renderer/styles/theme-light.css`
- `src/renderer/components/preferences/preferences-modal-sections-general-content.ts` (appearance bölümü ekle)

**Tahmini efor:** L (5-7 gün)

---

### 1.2 Command Palette Eksikliği (gerçek manada) — 🔴 Critical

**Şu an:**
- `quick-open.ts` (Cmd+P) **sadece dosya açıcı** — modern IDE'lerin "Quick Open" paradigması.
- "Command Deck" kavramı adıyla var ama bu aslında **tab bar surface kontrolü** (bkz. `src/renderer/components/tab-bar/tab-bar-command-deck.test.ts`) — VS Code tarzı command palette DEĞİL.
- Grep ile `palette`, `cmd+shift+p`, `commandPalette` → 0 sonuç.

**Etkisi:** Yeni kullanıcı özellikleri klavyeyle bulamıyor → menüde kaybolmak zorunda. Power user için en büyük hız aracı yok. "Toggle Git Panel", "Switch Provider", "Open Preferences", "Create Session" gibi eylemler sadece mouse ile ulaşılabiliyor.

**Önerilen çözüm:**
1. `src/renderer/components/command-palette.ts` oluştur (quick-open pattern'ini örnek al).
2. `src/renderer/commands/registry.ts` — `{id, label, category, run, when}` yapısında action kayıt defteri. Tüm UI aksiyonları bu kayıt defterinde (Git Panel toggle, New Session, Switch Project, Open File, Rename Session, vb.).
3. Fuzzy search (basit substring veya `fzf`-tarzı score). Kategoriler: Session, Project, Git, View, Settings.
4. Keyboard: Cmd/Ctrl+Shift+P aç, ↑/↓ gezin, Enter çalıştır, Esc kapat.
5. `shortcuts.ts`'teki tüm shortcut'lar palette'de aranabilsin.
6. Hem "Command Palette" (aksiyonlar) hem "Quick Open" (dosyalar) iki ayrı overlay olarak kalsın — VS Code paradigması.

**İlgili dosyalar:**
- Yeni: `src/renderer/components/command-palette.ts`
- Yeni: `src/renderer/commands/registry.ts`
- `src/renderer/bootstrap/keybindings-action-bridge.ts:10` — `showCommandPalette` bridge ekle
- `src/renderer/shortcuts.ts:42` — `command-palette` shortcut kaydı
- `src/renderer/keybindings.ts:46` — handler bağla
- Re-use: `quick-open.ts` yapısı (overlay + fuzzy input + result list)

**Tahmini efor:** M (3-4 gün)

---

### 1.3 Empty State & Loading State Kapsama Eksiği — 🟠 High

**Şu an:** 17 `.empty-state` CSS kuralı var (çoğunlukla gradient text). Ancak:
- **Loading skeleton yok** — pane geçişlerinde / git status çekerken UI "dondu" görünür.
- Git Panel yeni bir repo için empty state vermiyor (agent raporu).
- Mobile inspector, MCP inspector, Session history gibi panellerde boş durumlar jenerik.
- Hiçbir panelde "spinner / shimmer" görülmedi.

**Etkisi:** Kullanıcı "sistem cevap veriyor mu?" diye emin olamıyor. Özellikle uzak bir git remote veya yavaş bir MCP inspector operasyonunda süreksizlik hissi yaşıyor.

**Önerilen çözüm:**
1. Ortak component: `src/renderer/components/empty-state.ts` — `{ icon, title, body, ctaLabel?, onCta? }` API.
2. Ortak component: `src/renderer/components/loading-skeleton.ts` — shimmer ile `<div>` iskeletleri (sidebar liste, git panel, inspector satırları için varyantlar).
3. Her majör pane'de empty/loading/error üçlüsü: Git Panel, MCP Inspector, Session Inspector, Session History, File Viewer, Browser Tab.
4. CSS: `styles/empty-state.css` + `styles/loading-skeleton.css` (yeni dosyalar; UI-dev skill kurallarına göre yeni bileşen grubu).
5. Hata durumu varyantı: `showEmptyState({ variant: 'error', ctaLabel: 'Retry', onCta })`.

**İlgili dosyalar:**
- `src/renderer/styles/base.css:274-380` (mevcut `.empty-state` stillerini genişlet)
- `src/renderer/components/git-panel.ts` (empty/loading branşları ekle)
- `src/renderer/components/mcp-inspector.ts` (490 satır — kalabalık, bu sırada modülarize edilebilir)
- `src/renderer/components/session-inspector.ts`
- `src/renderer/components/file-reader.ts` (491 satır)

**Tahmini efor:** M (2-3 gün)

---

### 1.4 Onboarding / First-Run Deneyimi — 🟠 High

**Şu an:** `find -iname "*onboard*" -o -iname "*welcome*" -o -iname "*first-run*"` → **0 sonuç.** İlk açılışta kullanıcı boş ekranla karşılaşıyor. Hangi CLI'nin bulunduğunu, nasıl proje eklendiğini, keyboard shortcutlarını bilmeden keşfetmek zorunda.

**Etkisi:** En büyük terk nedeni. İlk 60 saniyede "bu neye yarar, nasıl başlarım?" sorusu cevapsız.

**Önerilen çözüm:**
1. `src/renderer/components/onboarding/` klasörü:
   - `welcome-modal.ts` — 4 slide: Ne bu? → CLI algıla → İlk proje ekle → Shortcuts.
   - İlk açılışta `appState.hasCompletedOnboarding` false ise açılır.
2. CLI algılama: `src/main/providers/registry.ts`'deki prerequisite kontrolünü kullan; eksik olanları "Install" CTA ile göster (`provider-updater.ts`'e bağla).
3. "Skip" opsiyonu ile her zaman tekrar açılabilsin (Preferences > About > "Replay walkthrough").
4. Empty state + hero overlay: hiç proje yokken sidebar üstünde "Add your first project" kartı.
5. İlk PTY spawn'undan sonra "tooltip tour" (shift+enter, cmd+t, cmd+shift+p).

**İlgili dosyalar:**
- Yeni: `src/renderer/components/onboarding/welcome-modal.ts`
- Yeni: `src/renderer/components/onboarding/tour.ts`
- `src/renderer/state.ts` (`hasCompletedOnboarding` alanı; store.ts migration)
- `src/main/store.ts` (persisted state schema genişlet)
- `src/renderer/components/sidebar.ts` (hero card)

**Tahmini efor:** M (3-4 gün)

---

### 1.5 Preferences İçinde Arama + Shortcut Conflict Detection — 🟡 Medium

**Şu an:** `preferences.css` 2238 satır; `src/renderer/components/preferences/` 25+ dosya. Arama kutusu yok → kullanıcı ilgili ayarı bulmak için bütün menüyü gezer. `preferences-shortcuts-section.ts` shortcut çakışmasını UI'da göstermiyor.

**Etkisi:** "Sessions how to resume" gibi spesifik bir ayar aranamıyor. Kullanıcı iki aksiyona aynı kısayolu atayabiliyor; çakışma runtime'da sessiz.

**Önerilen çözüm:**
1. Preferences modal üst kısmına `<input class="preferences-search">` — her bölümü etiket/label indeksle match et, match olmayan satırları gizle.
2. Shortcut conflict detection: `shortcuts.ts`'in `registerHandler` çağrılarını topla; çift binding varsa kırmızı uyarı rozeti + "Reset to default" butonu.
3. "Reset all shortcuts" toplu aksiyon.

**İlgili dosyalar:**
- `src/renderer/components/preferences/preferences-modal.ts`
- `src/renderer/components/preferences/preferences-shortcuts-section.ts`
- `src/renderer/shortcuts.ts` (conflict API ekle)

**Tahmini efor:** S (1-2 gün)

---

### 1.6 Görsel Tutarsızlıklar & Cila — 🟡 Medium

**Şu an (Explore raporu + doğrulanmış):**
- Focus ring (`:focus-visible`) base.css:206 tanımlı ama proje listesi, tab item, bazı icon butonlarda **uygulanmıyor**.
- Scrollbar stili theme dosyalarında tekrar tanımlı; tutarsız hover renkleri.
- Transition süresi 120ms-220ms arasında oynuyor; bazı yerlerde animasyon yok, bazı yerlerde 300ms "ağır" hissi.
- `--text-muted` ve `--text-dim` dark bg üzerinde **WCAG AA'yı geçmeyebilir** — kontrast testi yok.
- Emoji + unicode icon karışık kullanımı (tab durum indikatörleri).
- `--space-*` token'ları var ama yer yer `10px` hardcode. Kenar hizalama sapmaları.

**Etkisi:** Uygulamanın "premium" hissini bozan çok sayıda küçük cila kusuru. Tek başına büyük şikayet değil, toplamda "hıra hissi" yaratan ana sebep.

**Önerilen çözüm:**
1. **Motion token'ları:** `--motion-fast: 120ms`, `--motion-default: 180ms`, `--motion-slow: 240ms`, `--easing-standard: cubic-bezier(...)`. Tüm transition'lar bu token'ları kullansın.
2. **Contrast audit:** `theme-contract.test.ts`'e `wcag-contrast` npm paketi ile kontrast testi ekle (dark arka plan üzerinde `--text-muted` en az 4.5:1).
3. **Icon library:** Tek bir SVG sprite (`src/renderer/assets/icons/sprite.svg`) — durum göstergeleri, butonlar emoji yerine. `<svg><use href="#icon-git"/></svg>`.
4. **Focus ring zorunluluğu:** `:focus-visible` global bir default (outline: 2px solid var(--accent)) — component'lerin opt-out etmesi gerekir, opt-in değil.
5. **Space token taraması:** Regex ile `\b\d+px\b` → token'a taşı audit (`scripts/` altına bir lint).

**İlgili dosyalar:**
- `src/renderer/styles/base.css` (motion token'ları ve global focus ring)
- `src/renderer/styles/theme-contract.test.ts` (kontrast ekle)
- Yeni: `src/renderer/assets/icons/sprite.svg`
- Tüm `styles/*.css` (pass-through refaktör)

**Tahmini efor:** M (3-4 gün)

---

### 1.7 Accessibility Boşlukları — 🟡 Medium

**Şu an:** Modal focus trap var (`modal.ts:42-48`), tab ARIA doğru (`context-inspector.ts`). Skip link var (`base.css:173-204`). Ama:
- Proje list item'ları `role="button"` / `role="menuitem"` semantiği olmadan `<div>`.
- Terminal pane / browser tab pane `aria-live` region yok — durum değişiklikleri ekran okuyucuya iletilmiyor.
- `prefers-reduced-motion` base.css:257'de respect edilmiş ama `theme-command-studio.css:1720-1725`'teki bazı animasyonlar hala çalışıyor.
- Keyboard shortcut cheat sheet yok (help-dialog.ts eksik).

**Etkisi:** Kurumsal / devlet / eğitim satışlarında uyumluluk riski. Screen reader kullanan geliştiriciler dışlanmış.

**Önerilen çözüm:**
1. `role` / `aria-*` pass: Proje listesi, tab item, session list → semantik roller.
2. Terminal durum değişikliklerini `aria-live="polite"` region ile duyur (working/waiting/completed).
3. `@media (prefers-reduced-motion)` override'ını theme dosyalarına da yay.
4. Help dialog → "Keyboard Shortcuts" tam listesi (shortcuts.ts'den üretilir).
5. Axe-core ile automated a11y test (`test/a11y/*.test.ts`).

**İlgili dosyalar:**
- `src/renderer/components/project-list.ts`
- `src/renderer/components/terminal-pane.ts`
- `src/renderer/components/help-dialog.ts`
- `src/renderer/styles/theme-command-studio.css:1720`

**Tahmini efor:** M (3-4 gün)

---

### 1.8 Responsive / Dar Pencere Davranışı — 🟢 Low

**Şu an:** 91 `@media`/`@container` kuralı var, iyi kapsama. Ancak:
- Context inspector 1120px altında overlay oluyor (`theme-command-studio.css:1248`), resize sırasında takılabiliyor.
- Preferences modal 900px altı yatay scroll ile çakışır (236px menu + 800px content).
- Tab bar provider selector 940px altında taşabilir.

**Etkisi:** Küçük ekran (MacBook Air 13", ikinci monitör split) kullanıcılarında kenarlarda kırpmalar.

**Önerilen çözüm:**
1. Preferences modal menu'yü 900px altında collapse edilebilir yap (hamburger menu pattern).
2. Tab bar provider selector overflow menüye (···) taşısın.
3. Context inspector overlay'e geçerken scroll lock ekle.

**İlgili dosyalar:**
- `src/renderer/styles/preferences.css`
- `src/renderer/styles/theme-command-studio.css:1248, 1691-1700`

**Tahmini efor:** S (1-2 gün)

---

## 2️⃣ Eksik Özellikler

### 2.1 Global Search (cross-session/transcript) — 🟠 High

**Şu an:** Sadece xterm.js SearchAddon ile tek terminal içi arama (`src/renderer/components/search-bar.ts`). Oturumlar arası transcript search, proje dosyalarında içerik araması, geçmiş aktivite araması yok.

**Etkisi:** "Geçen hafta çözdüğüm o bug neydi?" sorusuna cevap vermek için kullanıcı her oturumu elle scroll'lamak zorunda.

**Önerilen çözüm:**
1. Transcript indexing: Claude `~/.claude/projects/*.jsonl` transcriptlerini SQLite FTS (better-sqlite3 + FTS5) ile indexle. Diğer providerlar için paralel indexerlar (`src/main/search/`).
2. `window.calder.search.global(query)` IPC endpoint.
3. Command Palette'e entegre: "Search in all sessions" moduna geçiş.
4. Global arama overlay: Cmd+Shift+F → sonuç listesi (oturum + timestamp + snippet) → tıklayınca ilgili oturumu aç ve scroll et.

**İlgili dosyalar:**
- Yeni: `src/main/search/transcript-indexer.ts`
- Yeni: `src/main/search/fts-store.ts`
- Yeni: `src/renderer/components/global-search.ts`
- `src/preload/preload.ts` (search namespace)
- `src/main/providers/*/getTranscriptPath` (her providerdan transcript path al)

**Tahmini efor:** L (4-6 gün)

---

### 2.2 Workspace / Çoklu Pencere Desteği — 🟡 Medium

**Şu an:** `ipc-handlers.ts:44` → `BrowserWindow.getAllWindows()[0]` tek pencere varsayımı. Workspace kavramı yok (tek-düze "project list"). İkinci pencereyi aynı anda açmak mümkün değil.

**Etkisi:** İki farklı client'a ait projeleri yan yana çalıştırmak isteyen kullanıcı iki app açamıyor. Geniş ekranda "workspace per monitor" imkansız.

**Önerilen çözüm:**
1. Workspace = proje grubu + layout tercihleri + son açık tab'lar. Store schema'sına `workspaces: Workspace[]`.
2. Menu > File > New Window → ayrı `BrowserWindow`. Her window kendi workspace'ini yükler.
3. IPC broadcast hedefini `BrowserWindow.fromWebContents(event.sender)` ile göndericiye döndür (globalden vazgeç).
4. "Move session to new window" drag action.

**İlgili dosyalar:**
- `src/main/main.ts` (window factory)
- `src/main/ipc-handlers.ts:44` ve tüm `BrowserWindow.getAllWindows()[0]` çağrıları
- `src/main/store.ts` (workspace schema)
- `src/renderer/state.ts` (window-scoped state izolasyonu)

**Tahmini efor:** L (7-10 gün)

---

### 2.3 Session Operations (rename/duplicate/export/pin) — 🟡 Medium

**Şu an:** Oturum oluşturma + kill var. Ama rename UI'ı belirsiz, duplicate (template) yok, export (JSON/markdown) yok, pin/favori yok.

**Etkisi:** Uzun süreli projelerde "önemli oturumları" yukarıda tutmak zor. Oturum replay / paylaşım iş akışı noksan.

**Önerilen çözüm:**
1. Tab context menu'ye: Rename, Duplicate, Pin, Export as Markdown, Export as JSON.
2. Pinned session'lar tab bar'ın solunda sabit.
3. Export: transcript + cost summary + git stash snapshot. Shared linkler zaten var (mobile/remote), bunu "transcript paylaşımı"na genişlet.

**İlgili dosyalar:**
- `src/renderer/components/tab-bar/tab-bar-*`
- `src/main/ipc-handlers.ts` (session namespace)
- `src/renderer/state.ts` (`isPinned`, `displayName`)

**Tahmini efor:** M (2-3 gün)

---

### 2.4 Hata Mesajları + Retry Paternleri — 🟡 Medium

**Şu an:** `i18n-translations-errors.ts` sadece 11 jenerik mesaj ("Failed to...", "Error"). `auto-updater.ts:15` hata silent swallow. Provider update başarısız olduğunda UI'da "skipped" olarak görünüyor (agent raporu). PTY spawn başarısız olduğunda kullanıcıya aktarılan mesaj belirsiz.

**Etkisi:** Kullanıcı sorunun nedenini (PATH mı, izin mi, binary eksik mi) anlayamıyor. Destek talebi artıyor.

**Önerilen çözüm:**
1. `src/renderer/errors/error-presenter.ts` — `{ code, title, body, actions: [{label, run}] }` kontratı.
2. Provider errors için "Open Install Guide", "Check PATH", "Retry" aksiyonlu alert banner'lar.
3. `auto-updater.ts:15`'teki silent catch'i explicit state transition'a çevir (`updateState = 'error'` + error log).
4. PTY spawn hataları için `provider-updater.ts` flow'una link.

**İlgili dosyalar:**
- Yeni: `src/renderer/errors/error-presenter.ts`
- `src/main/auto-updater.ts:15`
- `src/main/provider-updater.ts`
- `src/renderer/components/alert-banner.ts` (zaten var — genişlet)

**Tahmini efor:** M (2-3 gün)

---

### 2.5 Extension / Plugin Sistemi — 🟢 Low (uzun vadeli)

**Şu an:** Hiç yok. Özellik seti donmuş, sadece ana geliştirici tarafından eklenebilir.

**Etkisi:** Topluluk katkısı sıfır. Niche kullanım durumları için (custom provider, custom inspector) fork gerekiyor.

**Öneri (roadmap notu):** Electron context'inde güvenli plugin sandbox zor iş. Kısa vadede **custom provider registration API** daha makul hedef: `~/.calder/providers/*.js` — registry'nin dinamik yüklemesi. İleride tam extension sistemi.

**Tahmini efor:** L (10+ gün, stratejik)

---

## 3️⃣ Provider Abstraction Olgunluğu

### 3.1 Capability Enforcement Eksik — 🟠 High

**Şu an:** `CliProvider.meta.capabilities` alanı tanımlı ama UI/IPC katmanında **tüketilmiyor**. `ipc-handlers.ts:81` sadece `hookStatus` kapasitesini kontrol ediyor, diğerleri sessiz varsayılıyor.

**Spesifik tutarsızlıklar (explore raporundan):**
- `cost tracking`: Sadece Claude + Qwen `parseCostFromOutput()` implement ediyor. Copilot/Codex/Gemini'de cost yok — ama UI her zaman cost sütunu gösteriyor.
- `hook status`: Copilot tamamen boş implementation. Status line widget Copilot oturumlarında her zaman "—" gösteriyor.
- `shift-enter newline`: Sadece Claude'de `\x1b[13;2u` döner. Diğer providerlarda Shift+Enter satır eklemiyor ama UI fark göstermiyor.
- `session resume syntax`: Claude `-r`, Copilot `--resume`, Codex positional. `pty-manager.ts:20`'deki `RESUME_SESSION_MISSING_PATTERN` tek regex ile tüm CLI'lar için "session not found" yakalıyor → kırılgan.
- `plan mode`: Claude + Gemini/Qwen farklı flag (`--approval-mode=plan` vs `--permission-mode plan`); Copilot + Codex'de karşılığı yok.

**Önerilen çözüm:**
1. `CliProviderCapabilities` tipini zorunlu alanlarla genişlet: `cost: 'structured' | 'regex' | 'none'`, `hooks: boolean`, `planMode: { flag: string } | null`, `shiftEnterSequence: string | null`, `sessionResumeFlag: string`.
2. Renderer'da her yerde `const caps = activeProvider.capabilities; if (!caps.cost) hideColumn()` kontrolü.
3. `session-cost.ts` → `caps.cost === 'none'` ise aggregate'e dahil etme.
4. `pty-manager.ts` RESUME_SESSION_MISSING_PATTERN → provider başına custom regex.
5. Shift-Enter: `caps.shiftEnterSequence === null` ise status bar "Use \\n manually" ipucu göster.

**İlgili dosyalar:**
- `src/main/providers/provider.ts` (capability tipleri)
- `src/main/providers/{claude,codex,copilot,gemini,qwen}-provider.ts`
- `src/main/pty-manager.ts:20`
- `src/renderer/session-cost.ts`
- `src/renderer/components/tab-bar/tab-bar-provider-selector-controller.ts`

**Tahmini efor:** M (3-4 gün)

---

### 3.2 Provider Updater Kırılganlığı — 🟡 Medium

**Şu an:** `src/main/provider-updater.ts` kompleks fallback chain (self → npm → brew). Stage progress detection heuristic string match (satır 69-78). CHECK_TIMEOUT_MS = 20s — yavaş bağlantılarda yetersiz. Update failures silent swallow.

**Etkisi:** Yavaş ağda update sessizce "skipped". Stage detection CLI output'u değişince kırılır.

**Önerilen çözüm:**
1. Timeout config: `preferences.updater.checkTimeoutMs` ayarı.
2. Stage progress: heuristic yerine **structured output parser** (her provider kendi parser'ını sunar).
3. Silent swallow'ları structured error'a çevir; alert banner ile göster.
4. Retry logic: exponential backoff 3 deneme.

**İlgili dosyalar:**
- `src/main/provider-updater.ts:69-78`
- `src/main/providers/provider.ts` (updater output parser capability)

**Tahmini efor:** M (2-3 gün)

---

### 3.3 Config Watcher Debouncing — 🟢 Low

**Şu an:** `src/main/config-watcher.ts` tüm providerlar tarafından paylaşılıyor. Debouncing / coalescing görünmüyor. Rapid file changes thrashing yaratabilir.

**Öneri:** 200ms debounce + aynı path için last-write-wins.

**Tahmini efor:** S (0.5 gün)

---

## 4️⃣ Mimari ve Teknik Borç

### 4.1 Frozen Baseline Test Dosyaları — 🟡 Medium

**Şu an:**
- `src/renderer/state.test.ts` — **2701 satır** (state mutation test'leri tek dosyada)
- `src/renderer/components/cli-surface/pane.test.ts` — 1713 satır
- `src/main/mobile-inspector.runtime.test.ts` — 1762 satır
- Toplam 4 dosya, ~6176 satır test kodu (tüm test kodunun %48'i)

`scripts/structure-audit-baseline.json`'da donuk → normal refactor gate kilidi.

**Etkisi:** AppState'e tek alan eklemek bu 2701 satırlık test dosyasının etkilenmesine neden oluyor; test suite bakımı git zaman alıyor. Yeni developer için cognitive load yüksek.

**Önerilen çözüm:**
1. `state.test.ts`'i domain bazlı parçala:
   - `state-project.test.ts` — proje CRUD
   - `state-session.test.ts` — session lifecycle
   - `state-cost.test.ts` — cost aggregation
   - `state-persistence.test.ts` — load/save/migration
2. Her parça <500 satır. Baseline'dan çıkart.
3. `state.ts`'i de paralel olarak domain modüllerine ayır (opsiyonel).

**İlgili dosyalar:**
- `src/renderer/state.test.ts`
- `scripts/structure-audit-baseline.json`
- Diğer 3 baseline dosyası

**Tahmini efor:** L (4-6 gün)

---

### 4.2 Lint/Format Tooling Yokluğu — 🟢 Low (ama ucuz kazanım)

**Şu an:** CLAUDE.md açıkça "No lint tooling is configured". ESLint, Prettier, Biome → hiçbiri yok. Code style PR review'da manuel.

**Etkisi:** Import sıralama, unused import, consistent quotes gibi 1000+ potansiyel küçük issue otomatize edilmiyor. Yeni developer IDE setup'ında friction.

**Önerilen çözüm:**
1. **Biome** (ESLint + Prettier tek araç, Rust ile hızlı) → `biome.json` + `npm run lint` + `npm run format`.
2. `lint-staged` + pre-commit hook (mevcut hook sistemi var).
3. Mevcut kod için ilk `biome check --write` pass'ı — büyük ama tek-seferlik değişiklik commit'i.
4. CI adımı ekle.

**İlgili dosyalar:**
- Yeni: `biome.json`
- `package.json` (scripts)
- `scripts/install-git-hooks.mjs` (lint-staged entegrasyonu)

**Tahmini efor:** S (1 gün)

---

### 4.3 IPC Contract Validation Eksik — 🟢 Low

**Şu an:** `ipc-handlers.ts:43-46` gibi yerlerde IPC payload tipsiz. Zod/io-ts yok. Renderer yanlış şekilde veri göndermiş olsa silent runtime error.

**Etkisi:** Büyük feature eklerken "main ↔ renderer" kontratı implicit; refactor riskli.

**Önerilen çözüm:**
1. `src/shared/ipc-schemas/` — Zod schema per channel.
2. `defineIpcHandler(schema, handler)` wrapper → main'de validate.
3. `window.calder.*` API'sinin tipini schema'dan infer et (shared types).

**İlgili dosyalar:**
- `src/main/ipc-*.ts` (15 dosya)
- `src/preload/preload.ts`
- Yeni: `src/shared/ipc-schemas/`

**Tahmini efor:** M (3-5 gün)

---

### 4.4 Silent Error Catches — 🟢 Low

**Şu an:** 6 adet `.catch(() => {})` patterni:
- `src/renderer/components/share-dialog/share-dialog-flow-controller.ts`
- `src/renderer/components/split-layout.ts`
- `src/main/auto-updater.ts:15`

**Öneri:** Her birini inline comment + telemetry log ile değiştir: `.catch(err => { logger.debug('ignored: intentional fire-and-forget', err); })`.

**Tahmini efor:** S (0.5 gün)

---

### 4.5 Büyük Dosyalar Limitine Yaklaşanlar — 🟢 Low

**Şu an:** 500 satır ceiling'e yaklaşanlar:
- `src/renderer/components/file-reader.ts` (491)
- `src/renderer/components/mcp-inspector.ts` (490)
- `src/renderer/components/custom-select.ts` (462)
- `src/renderer/components/sidebar.ts` (459)
- `src/main/browser-bridge.ts` (467)
- `src/main/provider-updater.ts` (454)
- `src/preload/browser-tab-preload.ts` (489)

**Öneri:** Yeni feature yerine her biri için hafif modülarizasyon (zaten browser-tab-pane yapıldığı gibi).

**Tahmini efor:** M (dosya başına 0.5 gün; toplam 3-4 gün — acil değil).

---

### 4.6 Cross-Process E2E Testleri — 🟢 Low

**Şu an:** 364 test dosyası, 3574 test; çoğu unit/contract. Full round-trip (spawn PTY → write → xterm render → switch tab → pause → resume) testi yok.

**Öneri:** Playwright Electron runner ile 5-10 critical journey testi (`test/e2e/`).

**Tahmini efor:** M (2-3 gün, setup + 5 journey).

---

## 5️⃣ Doğrulama Planı

Rapor raporlama olduğu için kod değişikliği yok; doğrulama **bulguların doğruluğu** için yapılır:

1. **Tema bulguları:** `grep -c '\-\-' src/renderer/styles/base.css` (token sayısı); `grep -r "prefers-color-scheme" src/renderer` (0 beklenen).
2. **Command palette yokluğu:** `grep -rn "command.palette\|CommandPalette\|cmd.shift.p" src/renderer` (0 beklenen). ✓ doğrulandı.
3. **Quick-open file-only scope:** `head -80 src/renderer/components/quick-open.ts` — file arama açık. ✓ doğrulandı.
4. **Onboarding yokluğu:** `find src/renderer -iname "*onboard*"` → 0 dosya. ✓ doğrulandı.
5. **Provider capability enforcement:** `grep -c "capabilities\." src/renderer` vs `grep -c "capabilities\." src/main` karşılaştırması.
6. **Baseline frozen tests:** `cat scripts/structure-audit-baseline.json | jq '.files | keys'` → 4 dosya beklenir.
7. **Test koşumu:** `npm run test -- --reporter=verbose` → başarı; `npm run audit:deep` → sessiz.
8. **Light tema implementasyonundan sonra** (gelecek): `npm run test -- theme-contract` + görsel regresyon Electron pencere screenshot'larıyla.

---

## 🗺️ Önerilen Uygulama Sırası

**UX-odaklı önceliklendirme** seçildiği için:

**Sprint 1 (1-2 hafta, "görülebilir sıçrama"):**
- 1.1 Tema birleştirme + Light tema
- 1.2 Command Palette
- 1.3 Empty states + loading skeletons

**Sprint 2 (2-3 hafta, "polish & parity"):**
- 1.4 Onboarding
- 1.6 Motion + icon sistemi + contrast
- 2.4 Hata mesajları
- 3.1 Provider capability enforcement

**Sprint 3 (2-3 hafta, "power-user & platform"):**
- 2.1 Global search
- 2.3 Session operations
- 1.5 Preferences search
- 2.2 Workspace / çoklu pencere (uzun)

**Sprint 4 (devamlı, "tech debt"):**
- 4.1 Baseline test parçala
- 4.2 Biome lint
- 4.3 IPC Zod şemaları
- 1.7 Accessibility pass

---

## 📎 Kritik Referans Dosyaları

En çok dokunulacak 10 dosya (iyileştirme sıklığına göre):

1. `src/renderer/styles/base.css` — tema + motion + focus
2. `src/renderer/state.ts` + `src/main/store.ts` — schema + migration
3. `src/main/providers/provider.ts` — capability kontratı
4. `src/renderer/components/preferences/preferences-modal.ts` — appearance, search
5. `src/renderer/shortcuts.ts` + `src/renderer/keybindings.ts` — palette/conflict
6. `src/main/pty-manager.ts` — provider-specific resume/spawn
7. `src/renderer/components/alert-banner.ts` — error presentation
8. `src/renderer/components/quick-open.ts` — palette için pattern kaynağı
9. `src/main/auto-updater.ts` + `provider-updater.ts` — error handling
10. `scripts/structure-audit-baseline.json` — baseline unfreeze

---

## Not

Bu dosya salt **rapor**tur; bir sonraki adım hangi maddelerden devam edileceğinin seçilmesi olmalı. Her bir bölüm (1.1, 1.2, 2.1…) kendi başına bir sprint ticket'ına dönüştürülebilir; başlık + etkisi + önerilen çözüm + ilgili dosyalar + efor zaten acceptance criteria'ya yetecek detaydadır.
