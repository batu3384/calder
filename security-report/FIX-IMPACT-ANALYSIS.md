# Duzeltme Etki Analizi
Tarih: 2026-04-12
Kapsam: `SECURITY-REPORT.md` icindeki 4 dogrulanmis bulgu icin uygulama-oncesi bozulma analizi

## Kisa Sonuc

Net cevap:
- `VULN-001` ve `VULN-002` dar kapsamli uygulanirsa urun davranisini bozmasi beklenmez.
- `VULN-004` uygulama runtime'ini bozmaz; yalnizca release pipeline'inda dikkatli validation ister.
- `VULN-003` en hassas degisikliktir. Guclu bir fix secilirse paylasim UX'i ve eski surumlerle uyumluluk etkilenebilir.

Onerilen uygulama sirasi:
1. `VULN-001` browser target DOM fix
2. `VULN-002` quick setup DOM fix
3. `VULN-004` release workflow input validation
4. `VULN-003` share PIN guclendirme (uyumluluk karari verildikten sonra)

## Baseline

Mevcut ilgili testler calistirildi ve yesil:

```bash
npm test -- --run \
  src/renderer/components/browser-tab-pane.test.ts \
  src/renderer/components/browser-stage.contract.test.ts \
  src/renderer/components/cli-surface/quick-setup.test.ts \
  src/renderer/components/share-dialog.test.ts \
  src/renderer/sharing/share-crypto.test.ts
```

Sonuc: `5` test dosyasi, `35` test, hepsi gecti.

Bu baseline onemli:
- Browser ve share akislari icin test kapsami var.
- Release workflow degisikligi icin otomatik test kapsami yok.

## Bulgu Bazli Etki Analizi

### 1. VULN-001 — Browser target picker DOM injection

**Planlanan fix**
- `src/renderer/components/browser-tab/pane.ts` icinde `target.label` ve `target.meta` render'ini `innerHTML` yerine `createElement` + `textContent` ile kurmak.

**Bozulma riski**
- Urun riski: Dusuk
- Test riski: Dusuk

**Neler etkilenebilir**
- Localhost target kartlarinin gorunumu
- Kart icindeki metinlerin CSS siniflari
- Click ile navigation akisi

**Neden dusuk risk**
- Event binding zaten butonun kendisine ekleniyor; `btn.addEventListener('click', ...)` degismeyecek.
- CSS'nin baglandigi siniflar (`browser-ntp-link-label`, `browser-ntp-link-meta`) korunursa layout bozulmaz.
- Mevcut testler bu render blogunun `innerHTML` string'ine bagli degil; daha cok feature varligini kontrol ediyor.

**Dikkat edilmesi gerekenler**
- `<span class="browser-ntp-link-label">` ve `<span class="browser-ntp-link-meta">` yapisini korumak gerekir.
- `target.label` ve `target.meta` artik raw HTML degil duz metin olarak gorunecek. Bu beklenen davranis; markup desteklemek gerekmiyor.

**Sonuc**
- Bu fix ayni PR'da guvenle uygulanabilir.
- Kritik bir fonksiyonel regression beklemiyorum.

### 2. VULN-002 — CLI quick setup DOM injection

**Planlanan fix**
- `src/renderer/components/cli-surface/quick-setup.ts` icinde summary/card render'larini `innerHTML` yerine DOM node'lari ile kurmak.

**Bozulma riski**
- Urun riski: Dusuk
- Test riski: Orta

**Neler etkilenebilir**
- Modal kart layout'u
- `Run` / `Edit` button wiring
- Contract testleri

**Neden urun riski dusuk**
- Buton event binding zaten sonradan `[data-action="run"]` ve `[data-action="edit"]` query'leri ile yapiliyor. Ayni `data-action` attributeleri korunursa davranis degismez.
- CSS siniflari (`cli-surface-quick-setup-command`, `...-reason`, `...-cwd`, `...-actions`) korunursa gorunum ayni kalir.

**Neden test riski orta**
- Mevcut contract testi dogrudan kaynak kod string'ini ariyor:
  - `src/renderer/components/cli-surface/quick-setup.test.ts:13`
  - `src/renderer/components/cli-surface/quick-setup.test.ts:14`
- Yani `data-action="run"` / `data-action="edit"` literal string'leri kaynaktan kalkarsa test kizarir.
- Bu bir urun regression'i degil, testin implementation detayina fazla bagli oldugunu gosteriyor.

**Guvenli uygulama kosullari**
- Button'larda `data-action` ve `data-candidate-id` korunmali.
- `handlers.onRun(candidate)` ve `handlers.onEdit(candidate)` akisi ayni kalmali.
- Ayni patch icinde ilgili contract test guncellenmeli.

**Sonuc**
- Urun tarafinda bozulma beklemiyorum.
- Ama testler buyuk ihtimalle ayni patch icinde guncellenmeden gecmez.

### 3. VULN-003 — P2P share PIN guclendirme

**Planlanan fix secenekleri**

#### Secenek A — Uyumluluk odakli
- PIN modelini koru
- Minimumu `4` -> `8` yap
- Maksimum `8` kalsin

#### Secenek B — Guvenlik odakli
- 10-12+ karakterlik alfanumerik passphrase'e gec
- Numeric-only filter'i kaldir
- Input, copy ve testleri yeniden tasarla

**Bozulma riski**
- Secenek A: Orta
- Secenek B: Yuksek

**Neler etkilenebilir**
- Share dialog copy:
  - `src/renderer/components/share-dialog.ts:225`
  - `src/renderer/components/share-dialog.ts:242`
- Input davranisi:
  - `src/renderer/dom-utils.ts:22-34`
- Validation ve crypto testleri:
  - `src/renderer/sharing/share-crypto.test.ts`
- Eski surum istemcilerle paylasim uyumlulugu

**En kritik nokta: surumler arasi uyumluluk**
- Su an eski istemci `4-8` hane numeric kabul ediyor.
- Eger yeni surum `10+` karakter passphrase zorunlu kilarsa, eski istemci bu paylasimi kabul edemez.
- Bu, mixed-version sharing'i bozar.

**Secenek A neden daha guvenli rollout**
- `8` haneli numeric PIN eski istemci tarafinda da kabul edilir.
- Yani yeni host, eski guest ile hala calisabilir.
- UX degisikligi sinirlidir.
- Test ve copy guncellemeleri daha kontrolludur.

**Secenek B neden riskli**
- `createPinInput()` numeric filtreyi kaldirinca UI davranisi degisir.
- Tanimlayici metinler, placeholder, validation mesajlari, testler hep degismek zorunda kalir.
- Eski surumlerle interop bozulur.

**Ek not**
- Bu akista persisted data migration riski yok; paylasim kodlari gecici.
- Risk daha cok UX ve peer compatibility tarafinda.

**Oneri**
- Eger amac hizli ve dusuk-riskli iyilestirme ise: once `8` haneli numeric minimuma gec.
- Eger amac guclu fix ise: bunu ayri bir compatibility/UX degisikligi olarak planla; guvenlik patch'ine karistirma.

### 4. VULN-004 — Release workflow command injection

**Planlanan fix**
- `.github/workflows/release.yml` icinde `inputs.version` degeri icin validation eklemek
- `npm version` cagrishini quoted arguman ile kullanmak

**Bozulma riski**
- Uygulama runtime riski: Yok
- Release pipeline riski: Dusuk-Orta

**Neler etkilenebilir**
- Yalnizca manuel release akisi
- Gecerli version input formatlari

**Ana risk**
- Validation cok dar yazilirsa meşru release degerleri bloklanabilir.

**Ornekler**
- Guvenli ama potansiyel fazla dar regex:
  - `patch|minor|major|X.Y.Z`
- Eger ekip prerelease kullaniyorsa su formatlar da dusunulmeli:
  - `1.2.3-beta.1`
  - `prepatch`, `preminor`, `premajor`, `prerelease`

**Neden urun tarafinda risksiz**
- Bu degisiklik desktop app runtime koduna degmiyor.
- Sadece GitHub Actions workflow davranisini etkiliyor.

**Guvenli uygulama kosullari**
- Validation icin kabaca regex yerine `semver` tabanli kontrol daha saglam olur.
- En azindan description'da desteklenen tum formatlar net yazilmali.
- Bu degisiklik icin repo icinde test yok; manuel dry-run veya izole workflow denemesi onerilir.

**Sonuc**
- Runtime'a zarar vermez.
- Ama release operator deneyimini bozmamak icin validation tasarimi dikkatli yapilmali.

## Uygulanmamasi Gereken Genisletmeler

Bu turda **ayni pakete alinmamasi** gereken guclendirmeler:

### Electron sandbox'i acmak
- `src/main/main.ts:35` su an `sandbox: false`
- `SECURITY.md:18` bu tercihin `node-pty` ihtiyacindan geldigini acikca soyluyor
- Bunu simdi degistirmek, PTY/terminal akislarini bozma riski tasir

### `webviewTag` kapatmak veya browser feature'ini hizla degistirmek
- `src/main/main.ts:36` su an `webviewTag: true`
- `src/renderer/components/browser-tab/pane.ts:592-595` aktif olarak `<webview>` uretiyor
- Bunu bu patch'e koymak browser tab ozelligini kirar

### Tum repo'da toptan `innerHTML` temizligi
- Hedefli iki sink icin fix dusuk riskli
- Ama repo genelinde mekanik `innerHTML` temizligi yapmak gereksiz buyuk blast-radius yaratir
- Ilk tur yalnizca dogrulanmis sink'lerle sinirli kalmali

## Onerilen Uygulama Stratejisi

### Paket 1 — Guvenli ve dusuk-riskli
- `VULN-001`
- `VULN-002`
- `VULN-004`

Beklenen etki:
- Runtime regression dusuk
- 1 contract test dosyasi guncellenir
- Release workflow icin manuel validation gerekir

### Paket 2 — Kosullu karar sonrasi
- `VULN-003`

Karar sorusu:
- Hedefimiz hizli uyumluluk mu, guclu parola politikasi mi?

Eger uyumluluk oncelikliyse:
- 8 haneli numeric minimum

Eger guvenlik oncelikliyse:
- Alfanumerik passphrase
- Eski surumlerle uyumluluk etkisi kabul edilmeli

## Final Karar Ozeti

| Bulgu | Simdi uygulamak guvenli mi? | Urun bozma riski | Not |
|------|------------------------------|------------------|-----|
| VULN-001 | Evet | Dusuk | Yapiyi ve CSS siniflarini koru |
| VULN-002 | Evet | Dusuk | Testleri ayni patch'te guncelle |
| VULN-004 | Evet | Dusuk | Validation formatini dar yazma |
| VULN-003 | Kosullu | Orta-Yuksek | Uyumluluk karari once verilmeli |

En net sonuc:
- Ilk 3 duzeltmeyi ayri bir guvenlik patch'i olarak guvenle uygulayabiliriz.
- PIN guclendirmesini ayni patch'e koyarsak, nasil yaptigimiza bagli olarak sharing akisini bozma ihtimali var.
