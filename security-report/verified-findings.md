### VULN-001: Browser target picker'da localhost title kaynakli DOM injection
- Severity     : High
- Confidence   : 75/100 (High Probability)
- CWE          : CWE-79 — Improper Neutralization of Input During Web Page Generation
- OWASP        : A03:2021 — Injection
- Dosya        : src/renderer/components/browser-tab/pane.ts:220
- Erişilebilirlik: Indirect
- Sanitization : None
- Framework    : Partial
- Açıklama     : `window.calder.browser.listLocalTargets()` cagrisi sonunda gelen `target.meta`, `src/main/local-dev-targets.ts:136-140` icinde localhost uygulamasinin `<title>` bilgisinden turetiliyor. Bu deger `src/renderer/components/browser-tab/pane.ts:220-223` satirlarinda `innerHTML` ile DOM'a yaziliyor. Kaynak ile sink arasinda kacislama veya `textContent` kullanimina rastlanmadi.
- Neden FP değil: Sink dogrudan `innerHTML`; uygulamanin diger yerlerinde kullanilan `esc()` yardimcisi burada uygulanmiyor. Mevcut CSP bazi inline payload siniflarini kisitlasa da, DOM injection yuzeyi gercek ve Electron renderer baglaminda savunma-ici davranis bozulmasina acik.
- Düzeltme     : Button icerigini `createElement`/`textContent` ile kurun veya `target.label` ve `target.meta` degerlerini `esc()` ile kacislayin. Localhost probe sonucunu sadece plain-text metadata olarak tasiyin.

### VULN-002: CLI quick setup modal'inda project path kaynakli DOM injection
- Severity     : High
- Confidence   : 60/100 (Probable)
- CWE          : CWE-79 — Improper Neutralization of Input During Web Page Generation
- OWASP        : A03:2021 — Injection
- Dosya        : src/renderer/components/cli-surface/quick-setup.ts:97
- Erişilebilirlik: Indirect
- Sanitization : None
- Framework    : Partial
- Açıklama     : `candidate.cwd` degeri, kullanicinin sectigi proje dizininden geliyor ve `src/renderer/components/cli-surface/quick-setup.ts:97-105` araliginda `innerHTML` ile render ediliyor. Benzer sekilde `formatCommand(candidate)` ve `candidate.reason` alanlari da HTML olarak basiliyor.
- Neden FP değil: `candidate.cwd` kullanici kontrollu path karakterleri tasiyabilir; repo icindeki guvenli gorunumlerde kullanilan `esc()` burada yok. Bu nedenle kotu niyetli sekilde adlandirilmis bir klasor veya repo, modal acildiginda DOM injection yaratabilir.
- Düzeltme     : Kartlari string-templating yerine DOM node'lari ile olusturun. `candidate.cwd`, `reason` ve command preview alanlarini `textContent` ile basip `data-candidate-id` icin `element.dataset.candidateId = candidate.id` kullanin.

### VULN-003: P2P share akisi dusuk entropili sayisal PIN'e dayaniyor
- Severity     : Medium
- Confidence   : 70/100 (High Probability)
- CWE          : CWE-521 — Weak Password Requirements
- OWASP        : A07:2021 — Identification and Authentication Failures
- Dosya        : src/renderer/sharing/share-crypto.ts:24
- Erişilebilirlik: Indirect
- Sanitization : None
- Framework    : Partial
- Açıklama     : `validatePin()` yalnizca 4-8 haneli sayisal PIN kabul ediyor. P2P share kodlari AES-GCM ile sifrelense de, offer/answer kodu ele gecirildiginde sayisal PIN uzayi offline brute-force icin fazla dar kaliyor.
- Neden FP değil: Bu bir pattern eslesmesi degil, dogrudan kimlik dogrulama politikasinin kendisi. `MIN_PIN_LENGTH = 4` ve `MAX_PIN_LENGTH = 8` sabitleri ile `^\\d+$` zorlamasi, entropiyi belirgin sekilde dusuruyor.
- Düzeltme     : Minimum 10-12 karakterlik rastgele passphrase veya uygulama tarafinda uretilecek tek kullanimlik yuksek entropili token zorunlu kilin. Sadece numerik PIN modelinden cikilmasi tercih edilir.

### VULN-004: Release workflow input'u shell command injection'a acik
- Severity     : High
- Confidence   : 100/100 (Confirmed)
- CWE          : CWE-78 — Improper Neutralization of Special Elements used in a Command
- OWASP        : A03:2021 — Injection
- Dosya        : .github/workflows/release.yml:46
- Erişilebilirlik: Direct
- Sanitization : None
- Framework    : None
- Açıklama     : `workflow_dispatch.inputs.version` degeri dogrudan `run: npm version ${{ inputs.version }} --no-git-tag-version` satirina aktariliyor. GitHub expression expansion sonrasinda bu satir shell tarafinda yorumlandigi icin input icine eklenen shell metakarakterleri komut zincirine donusebilir.
- Neden FP değil: Input icin allowlist veya quoting yok; sink dogrudan shell `run` adimi. Bu nedenle veri akisi belirsiz bir pattern degil, dogrudan command construction vakasi.
- Düzeltme     : Ayrı bir validation step ile yalnizca `patch`, `minor`, `major` veya `X.Y.Z` formatini kabul edin ve degiskeni quoted arguman olarak gecin. Mumkunse version bump islemini shell yerine kucuk bir Node script'i ile yapin.

## Elenen False Positive'ler
- `INJ-3-003` — `src/renderer/components/usage-modal.ts:56` ve `:108`: sink gercek olsa da veri kaynagi yalnizca kullanicinin home dizinindeki `~/.claude/stats-cache.json`. Bu dosyanin keyfi bicimde manipule edilmesi bu repo icin uygulama-disi yerel kompromi onkosulu gerektirdiginden final risk skoruna dahil edilmedi.
