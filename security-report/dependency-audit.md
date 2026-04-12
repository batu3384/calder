# Bağımlılık Denetimi

## Özet

- Paket yöneticisi: npm
- Lockfile: `package-lock.json`
- Doğrudan prod bağımlılık: 13
- Doğrudan dev bağımlılık: 8
- Toplam bağımlılık ağacı:
  - prod: 130
  - dev: 462
  - optional: 100
  - peer: 13
  - toplam: 591

## Güncel güvenlik görünümü

- `npm audit --omit=dev --json` sonucu:
  0 bulgu
- `npm audit --json` sonucu:
  0 bulgu

Not:
Bu çıktı 2026-04-12 tarihinde canlı npm advisory verisi ile kontrol edildi. Yine de CI içinde düzenli doğrulama önerilir.

## Önemli sınırlama

LLM bilgi kesiti sonrası çıkan CVE'leri tek başına güvenilir biçimde bilemem. Bu repo için canlı kontrol yaptım; ayrıca düzenli olarak şu komutlar da çalıştırılmalı:

```bash
npm audit
```

Ek doğrulama kaynakları:

- OSV.dev
- GitHub Security Advisories
- Dependabot veya Renovate

## Doğrudan bağımlılıklar

### Prod bağımlılıkları

| Paket | Sürüm Aralığı | Son yayın sinyali | Not |
|---|---:|---|---|
| `@floating-ui/dom` | `^1.7.6` | 2026-03-03 | Aktif bakım sinyali var |
| `@modelcontextprotocol/sdk` | `^1.29.0` | 2026-03-30 | Ağ/uzak MCP yüzeyi nedeniyle yüksek etki alanı |
| `@xterm/addon-fit` | `^0.11.0` | 2026-04-06 | Aktif bakım |
| `@xterm/addon-search` | `^0.16.0` | 2026-04-06 | Aktif bakım |
| `@xterm/addon-serialize` | `^0.14.0` | 2026-04-06 | Aktif bakım |
| `@xterm/addon-web-links` | `^0.12.0` | 2026-04-06 | Link açma davranışı nedeniyle güvenlik açısından önemli |
| `@xterm/addon-webgl` | `^0.19.0` | 2026-04-06 | Aktif bakım |
| `@xterm/xterm` | `^6.0.0` | 2026-04-06 | Kritik UI/terminal yüzeyi |
| `dompurify` | `^3.3.3` | 2026-03-11 | XSS savunmasında kritik, iyi seçim |
| `electron-updater` | `^6.8.3` | 2026-02-12 | Update zinciri yüksek güven etkisine sahip |
| `marked` | `^17.0.5` | 2026-04-07 | HTML render zinciri; sanitization ile birlikte kullanılmalı |
| `node-pty` | `^1.1.0` | 2026-03-12 | Native modül, komut yürütme yüzeyine çok yakın |
| `picomatch` | `^4.0.4` | 2026-03-23 | Düşük riskli yardımcı bağımlılık |

### Dev bağımlılıkları

| Paket | Sürüm Aralığı | Son yayın sinyali | Not |
|---|---:|---|---|
| `@types/dompurify` | `^3.0.5` | 2024-11-19 | Deprecated; DOMPurify kendi type tanımlarını sağlıyor |
| `@types/picomatch` | `^4.0.3` | 2026-04-03 | Aktif bakım |
| `@vitest/coverage-v8` | `^4.1.4` | 2026-04-09 | Aktif bakım |
| `electron` | `^41.2.0` | 2026-04-10 | Güvenlik etkisi yüksek çekirdek runtime |
| `electron-builder` | `^26.8.1` | 2026-03-04 | Paketleme zinciri, install script etkisi var |
| `esbuild` | `^0.27.7` | 2026-04-02 | Güncel sürüm mevcut |
| `typescript` | `^5.7.0` | 2026-04-01 | Güncel majör 6.x mevcut |
| `vitest` | `^4.1.4` | 2026-04-09 | Aktif bakım |

## Outdated paketler

`npm outdated --json` çıktısına göre:

| Paket | Mevcut | Wanted | Latest | Değerlendirme |
|---|---:|---:|---:|---|
| `esbuild` | `0.27.7` | `0.27.7` | `0.28.0` | Takip edilmeli, doğrudan acil risk sinyali yok |
| `marked` | `17.0.5` | `17.0.6` | `18.0.0` | Markdown işleme zinciri nedeniyle yakından takip edilmeli |
| `typescript` | `5.9.3` | `5.9.3` | `6.0.2` | Güvenlikten çok toolchain güncelliği konusu |

## Supply Chain Değerlendirmesi

### Düşük-orta riskli alanlar

- `package.json` içinde `postinstall` script'i var.
  Bu, `npm install` sırasında ek kod çalıştırıldığı anlamına gelir.
- `node-pty`, `electron`, `electron-builder` native / platforma duyarlı bağımlılıklar.
  Derleme ve kurulum zincirinde daha geniş etki alanına sahiptir.
- Toplam bağımlılık ağacı 591 paket.
  Advisory temiz olsa da transitif zincir geniş.

### Olumlu sinyaller

- Doğrudan prod bağımlılıklarının neredeyse tamamında 2026 Q1-Q2 yayın aktivitesi var.
- `npm audit` temiz.
- Güvenlik için kritik olan `dompurify` doğrudan bağımlılık olarak bulunuyor.

### Dikkat edilmesi gerekenler

- `@types/dompurify` deprecated.
  Gereksiz bağımlılık azaltımı için kaldırılabilir.
- `marked` HTML render zincirinde yer alıyor.
  Sanitization bağı koparsa XSS riski artar.
- `electron-updater` ve `electron` runtime zinciri güvenlik etkisi yüksek olduğundan release notları izlenmeli.

## Prod ortamında olmaması gereken dev paketler

- Doğrudan prod dependency setinde bariz test-only paket görünmüyor.
- Dev tool'lar (`vitest`, `coverage`, `electron-builder`, `typescript`) devDependencies altında doğru konumda.

## Transitif risk notu

- Audit temiz olsa da transitif bağımlılık sayısı yüksek.
- Özellikle Electron ekosistemi ve native modüllerde advisory'ler hızlı değişebilir.
- CI içinde düzenli güvenlik taraması önerilir.

## Sonuç

- Mevcut lockfile ve canlı npm audit verisine göre doğrudan görünür kritik/yüksek bağımlılık zafiyeti yok.
- En belirgin bakım konusu:
  - deprecated `@types/dompurify`
  - minor/major update bekleyen `marked`, `esbuild`, `typescript`
- Supply chain risk seviyesi:
  düşük-orta
  çünkü advisory temiz, ancak Electron/native/install-script zinciri güçlü yetkilerle çalışıyor
