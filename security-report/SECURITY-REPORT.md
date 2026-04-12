# Güvenlik Değerlendirme Raporu
Proje    : calder
Tarih    : 2026-04-12
Risk Skoru: 4/10 (Medium Risk)

Risk Skoru Hesaplama:
- Her High: +1.0 x 3 = +3.0
- Her Medium: +0.3 x 1 = +0.3
- Renderer tarafinda tekrarlanan output-encoding eksigi: +0.5
- Mevcut guvenlik kontrolleri (contextIsolation, CSP, path allowlist, browser-bridge token): -0.3
- Sonuc: 3.5, ortam baglami ve Electron'in yuksek yetkili desktop etkisi dikkate alinarak 4/10 Medium olarak yuvarlandi

| Metrik               | Değer |
|----------------------|-------|
| Toplam Bulgu         | 4 |
| Critical             | 0 |
| High                 | 3 |
| Medium               | 1 |
| Low                  | 0 |
| Info                 | 0 |
| False Positive Elenen| 1 |

En kritik 3 risk:
1. Yerel browser surface taramasi sirasinda gelen title/metin, Electron arayuzune kacislama olmadan yaziliyor. Bu, kullanicinin ayni makinede actigi kotu niyetli bir localhost uygulamasinin Calder UI'ini zehirlemesine izin verebilir.
2. CLI quick-setup modal'i proje yolu gibi kullanici kontrollu metinleri HTML olarak basiyor. Kotu niyetli sekilde adlandirilmis bir repo/klasor UI injection yaratabilir.
3. Release workflow'u manuel version input'unu shell'e dogrudan geciyor. Workflow'u tetikleyebilen bir aktor runner uzerinde beklenmeyen komut calistirabilir.

## Bölüm 2: Tarama İstatistikleri

| İstatistik               | Değer |
|--------------------------|-------|
| Taranan Dosya            | 388 |
| Kod Satırı               | 60873 |
| Tespit Edilen Diller     | TypeScript, JavaScript, HTML, CSS |
| Tespit Edilen Frameworks | Electron, node-pty, xterm, MCP SDK |
| Çalışan Skill Sayısı     | 36 |
| Ham Bulgu                | 5 |
| Elenen FP                | 1 |
| Doğrulanan Bulgu         | 4 |

Kategori dağılımı:

| Kategori   | Critical | High | Medium | Low | Info |
|------------|----------|------|--------|-----|------|
| Injection  | 0 | 2 | 0 | 0 | 0 |
| Auth       | 0 | 0 | 1 | 0 | 0 |
| Infra      | 0 | 1 | 0 | 0 | 0 |
| Data       | 0 | 0 | 0 | 0 | 0 |
| Server     | 0 | 0 | 0 | 0 | 0 |
| Client     | 0 | 0 | 0 | 0 | 0 |
| Logic      | 0 | 0 | 0 | 0 | 0 |
| API        | 0 | 0 | 0 | 0 | 0 |

## Bölüm 3: High Bulgular

### VULN-001: Browser target picker'da localhost title kaynakli DOM injection
Severity: High | Confidence: 75/100 | CWE: CWE-79 | OWASP: A03:2021

**Dosya:** `src/renderer/components/browser-tab/pane.ts:220`

**Açıklama:** `target.meta` alani localhost uygulamasinin `<title>` etiketinden gelerek `innerHTML` icine yaziliyor. Bu veri akisi `src/main/local-dev-targets.ts:117-140` -> `window.calder.browser.listLocalTargets()` -> `src/renderer/components/browser-tab/pane.ts:220-223` zinciri ile dogrudan izlenebiliyor.

**Savunmasız Kod:**
```ts
btn.innerHTML = `
  <span class="browser-ntp-link-label">${target.label}</span>
  <span class="browser-ntp-link-meta">${target.meta}</span>
`;
```

**Etki:** Kullanici ayni makinede kotu niyetli bir localhost servisi calistirir veya boyle bir araci acarsa, Calder arayuzu icinde DOM injection uretilebilir. Electron renderer baglaminda bu, UI suistimali, phishing benzeri overlay'ler ve potansiyel olarak uygulama-ici yetkili aksiyonlara zincirlenebilecek bir foothold yaratir.

**Düzeltme:** HTML string basmak yerine DOM node'lari ile yalnizca metin ekleyin.
```ts
const label = document.createElement('span');
label.className = 'browser-ntp-link-label';
label.textContent = target.label;

const meta = document.createElement('span');
meta.className = 'browser-ntp-link-meta';
meta.textContent = target.meta;

btn.replaceChildren(label, meta);
```

**Referanslar:**
- https://cwe.mitre.org/data/definitions/79.html
- https://owasp.org/Top10/A03_2021-Injection/
- https://www.electronjs.org/docs/latest/tutorial/security

### VULN-002: CLI quick setup modal'inda project path kaynakli DOM injection
Severity: High | Confidence: 60/100 | CWE: CWE-79 | OWASP: A03:2021

**Dosya:** `src/renderer/components/cli-surface/quick-setup.ts:97`

**Açıklama:** `candidate.cwd` degeri proje path'inden geliyor ve modal icinde kacislanmadan HTML olarak yazdiriliyor. Uygulamanin baska bolumlerinde kullanilan `esc()` yardimcisi burada yok.

**Savunmasız Kod:**
```ts
card.innerHTML = `
  <div class="cli-surface-quick-setup-command">${formatCommand(candidate)}</div>
  <div class="cli-surface-quick-setup-reason">${candidate.reason}</div>
  <div class="cli-surface-quick-setup-cwd">${candidate.cwd ?? ''}</div>
  <div class="cli-surface-quick-setup-actions">
    <button type="button" data-action="run" data-candidate-id="${candidate.id}">Run</button>
    <button type="button" data-action="edit" data-candidate-id="${candidate.id}">Edit</button>
  </div>
`;
```

**Etki:** Kotu niyetli sekilde adlandirilmis bir klasor veya repo Calder tarafindan acildiginda, setup modal'i DOM injection'a maruz kalabilir. Bu da masaustu istemcide guven sinirini zedeler.

**Düzeltme:** `textContent` ve `dataset` kullanarak HTML string uretimini kaldirin.
```ts
const cwd = document.createElement('div');
cwd.className = 'cli-surface-quick-setup-cwd';
cwd.textContent = candidate.cwd ?? '';

const run = document.createElement('button');
run.type = 'button';
run.dataset.action = 'run';
run.dataset.candidateId = candidate.id;
run.textContent = 'Run';
```

**Referanslar:**
- https://cwe.mitre.org/data/definitions/79.html
- https://owasp.org/Top10/A03_2021-Injection/
- https://www.electronjs.org/docs/latest/tutorial/security

### VULN-004: Release workflow input'u shell command injection'a acik
Severity: High | Confidence: 100/100 | CWE: CWE-78 | OWASP: A03:2021

**Dosya:** `.github/workflows/release.yml:46`

**Açıklama:** `workflow_dispatch` input'u `npm version` komutunun icine quoting/validation olmadan yerlestiriliyor. Bu, workflow dispatch yetkisi olan biri tarafindan shell operator'leri ile komut zinciri kurmaya imkan verir.

**Savunmasız Kod:**
```yaml
- name: Bump version
  run: npm version ${{ inputs.version }} --no-git-tag-version
```

**Etki:** Runner uzerinde keyfi komut calistirilarak repo yazma yetkili `GITHUB_TOKEN` ve release pipeline baglami suistimal edilebilir. CI/CD guvenligi ve yayin zinciri etkilenir.

**Düzeltme:** Input'u allowlist ile dogrulayin ve quoted arguman olarak gecin.
```yaml
- name: Validate version input
  run: |
    case "${{ inputs.version }}" in
      patch|minor|major|[0-9]*.[0-9]*.[0-9]*) ;;
      *) echo "Invalid version input"; exit 1 ;;
    esac

- name: Bump version
  run: npm version "${{ inputs.version }}" --no-git-tag-version
```

**Referanslar:**
- https://cwe.mitre.org/data/definitions/78.html
- https://owasp.org/Top10/A03_2021-Injection/
- https://docs.github.com/actions/security-guides/security-hardening-for-github-actions

## Bölüm 4: Medium Bulgular

### VULN-003: P2P share akisi dusuk entropili sayisal PIN'e dayaniyor
Severity: Medium | Confidence: 70/100 | CWE: CWE-521 | OWASP: A07:2021

**Dosya:** `src/renderer/sharing/share-crypto.ts:24`

**Açıklama:** Paylasim teklifi sifrelemesinde kullanilan passphrase yalnizca 4-8 haneli sayisal PIN ile sinirli. Kriptografik primitive'ler saglam olsa da, dusuk entropi brute-force maliyetini belirgin sekilde dusuruyor.

**Savunmasız Kod:**
```ts
const MIN_PIN_LENGTH = 4;
const MAX_PIN_LENGTH = 8;

export function validatePin(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return 'PIN must contain only digits';
```

**Etki:** Offer kodunu ele geciren bir aktor, PIN'i offline deneyerek yetkisiz uzaktan baglanti kurabilir. Read-write modda terminal girdisi de etkilenebilir.

**Düzeltme:** Numerik PIN yerine yuksek entropili passphrase veya uygulamanin urettigi tek kullanimlik token kullanin. Minimum uzunlugu anlamli sekilde arttirin.
```ts
const MIN_SECRET_LENGTH = 12;
// or generate a random token and show it to the user instead of accepting a 4-digit PIN
```

**Referanslar:**
- https://cwe.mitre.org/data/definitions/521.html
- https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/
- https://pages.nist.gov/800-63-4/sp800-63b.html

## Bölüm 5: Low Bulgular

Bu taramada dogrulanmis Low seviye bulgu kalmadi.

## Bölüm 6: Temiz / Düşük Öncelikli Alanlar

- Hardcoded secret taramasinda production key veya private key bulunmadi.
- `npm audit` hem production hem tum agac icin temiz dondu.
- SQL/NoSQL, GraphQL, LDAP, XML/XXE, upload ve klasik server-side API yuzeyleri bu repo tipinde bulunmadi.
- `fs:readFile` tarafinda `path.resolve` + allowlist kontrolu mevcut; path traversal icin guclu bir azaltici.
- Browser bridge `127.0.0.1` ve token ile sinirlandirilmis.

## Bölüm 7: Düzeltme Yol Haritası

### Faz 1: Acil (1-3 gün) — Critical bulgular

Bu taramada Critical bulgu cikmadi.

### Faz 2: Kısa Vadeli (1-2 hafta) — High bulgular + quick-win Medium

| # | Bulgu | Efor | Etki |
|---|-------|------|------|
| 1 | VULN-001: Browser target picker DOM injection | Low | High |
| 2 | VULN-002: CLI quick setup DOM injection | Low | High |
| 3 | VULN-004: Release workflow command injection | Low | High |
| 4 | VULN-003: Dusuk entropili share PIN | Medium | Medium |

### Faz 3: Orta Vadeli (1-2 ay) — Medium + bağımlılık güncellemeleri

| # | Bulgu | Efor | Etki |
|---|-------|------|------|
| 1 | Renderer genelinde `innerHTML` yerine guvenli helper/pattern standardizasyonu | Medium | Medium |
| 2 | Release workflow input validation ve reusable action hardening | Medium | Medium |
| 3 | `marked`, `esbuild`, `typescript` icin surum guncelleme planlamasi | Medium | Medium |

### Faz 4: Güçlendirme (Sürekli) — Low + defense-in-depth önerileri

| # | Öneri | Efor | Etki |
|---|-------|------|------|
| 1 | Dependabot veya Renovate ile otomatik dependency update | Low | Medium |
| 2 | CI'a Semgrep ve gitleaks ekleme | Low | Medium |
| 3 | GitHub Actions icin shell-input validation rehberi ve reusable guard step | Low | Medium |
| 4 | Electron guvenlik checklist'ine gore periyodik hardening review | Medium | Medium |

## Bölüm 8: Metodoloji ve Sınırlamalar

Bu değerlendirme LLM tabanli statik analiz ile gerceklestirildi.

Sinirlamalar:
- Sadece statik analiz yapildi; runtime exploit denemesi veya dinamik fuzzing yapilmadi.
- Electron/XSS senaryolarinda CSP'nin pratik bypass dayanimi manuel test ile ek dogrulama gerektirebilir.
- Karmaşık local-threat-model konularinda false positive ve false negative ihtimali mevcuttur.
- Bagimlilik CVE durumu icin canli advisory servisi kullanilmadi; `npm audit` temiz dondu, ancak guncel GHSA/OSV kontrolleri yine de onerilir.
- Uretim veya hassas veri isleyen desktop uygulamalari icin bagimsiz güvenlik testi ve Electron-hardening review tavsiye edilir.
