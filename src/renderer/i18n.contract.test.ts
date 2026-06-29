import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = [
  readFileSync(new URL('./i18n.ts', import.meta.url), 'utf-8'),
  readFileSync(new URL('./i18n-translations.ts', import.meta.url), 'utf-8'),
  readFileSync(new URL('./i18n-translations-core-part-1.ts', import.meta.url), 'utf-8'),
  readFileSync(new URL('./i18n-translations-core-part-2.ts', import.meta.url), 'utf-8'),
  readFileSync(new URL('./i18n-translations-core-part-3.ts', import.meta.url), 'utf-8'),
  readFileSync(new URL('./i18n-translations-tab-terminal.ts', import.meta.url), 'utf-8'),
  readFileSync(new URL('./i18n-translations-preferences.ts', import.meta.url), 'utf-8'),
  readFileSync(new URL('./i18n-translations-mobile.ts', import.meta.url), 'utf-8'),
  readFileSync(new URL('./i18n-translations-errors.ts', import.meta.url), 'utf-8'),
  readFileSync(new URL('./i18n-pattern-translations.ts', import.meta.url), 'utf-8'),
].join('\n');

describe('i18n contract', () => {
  it('covers key workspace Turkish translations for rail and settings copy', () => {
    expect(source).toContain("['Skip to workspace', 'Çalışma alanına atla']");
    expect(source).toContain("['Command studio', 'Komut stüdyosu']");
    expect(source).toContain("['Project Dock', 'Proje Paneli']");
    expect(source).toContain("['Switch context without losing live work.', 'Canlı işi kaybetmeden bağlam değiştirin.']");
    expect(source).toContain("['Workspace Pulse', 'Çalışma Alanı Nabzı']");
    expect(source).toContain("['Run controls, project state, and tools stay separated so the rail stays readable.', 'Çalışma kontrolleri, proje durumu ve araçlar ayrı kalır; panel okunabilirliğini korur.']");
    expect(source).toContain("['Hybrid context', 'Hibrit bağlam']");
    expect(source).toContain("['Agent command desk', 'Ajan komut masası']");
    expect(source).toContain("['Add MCP Server', 'MCP sunucusu ekle']");
    expect(source).toContain("['Run Log', 'Çalışma günlüğü']");
    expect(source).toContain("['Workflows & checkpoints', 'İş akışları ve kontrol noktaları']");
    expect(source).toContain("['Review & preview loop', 'İnceleme ve önizleme döngüsü']");
    expect(source).toContain("['Governance layer', 'Yönetişim katmanı']");
    expect(source).toContain("['Background tasks', 'Arka plan görevleri']");
    expect(source).toContain("['Team context', 'Ekip bağlamı']");
  });

  it('covers settings shell subgroup copy in Turkish', () => {
    expect(source).toContain("['Session defaults, interface behavior, tool health, automation, and safety rules.', 'Oturum varsayılanları, arayüz davranışı, araç sağlığı, otomasyon ve güvenlik kuralları.']");
    expect(source).toContain("['Interface', 'Arayüz']");
    expect(source).toContain("['Automation', 'Otomasyon']");
    expect(source).toContain("['Safety', 'Güvenlik']");
    expect(source).toContain("['Startup, language, and session memory', 'Başlangıç, dil ve oturum belleği']");
    expect(source).toContain("['Shell layout, rails, and live view behavior', 'Kabuk düzeni, paneller ve Canlı Görünüm davranışı']");
    expect(source).toContain("['CLI providers and mobile dependency health', 'CLI sağlayıcıları ve mobil bağımlılık sağlığı']");
    expect(source).toContain("['Provider health', 'Sağlayıcı durumu']");
    expect(source).toContain("['Orchestration phases', 'Orkestrasyon fazları']");
    expect(source).toContain("['Tracking & fixes', 'İzleme ve düzeltmeler']");
    expect(source).toContain("['Installed tools, defaults, and repair actions.', 'Yüklü araçlar, varsayılanlar ve onarım eylemleri.']");
  });

  it('covers session inspector and usage modal labels in Turkish', () => {
    expect(source).toContain("['Usage', 'Kullanım']");
    expect(source).toContain("['Workspace activity snapshot', 'Çalışma alanı etkinlik özeti']");
    expect(source).toContain("['Guide', 'Rehber']");
    expect(source).toContain("['Workspace signals and shortcuts', 'Çalışma alanı sinyalleri ve kısayollar']");
    expect(source).toContain("['Tab Status Dot', 'Sekme durum noktası']");
    expect(source).toContain("['Git Status', 'Git durumu']");
    expect(source).toContain("['Timeline', 'Zaman çizelgesi']");
    expect(source).toContain("['Costs', 'Maliyetler']");
    expect(source).toContain("['Tools', 'Araçlar']");
    expect(source).toContain("['Total Sessions', 'Toplam Oturum']");
    expect(source).toContain("['Total Messages', 'Toplam Mesaj']");
    expect(source).toContain("['Using Since', 'Kullanım Başlangıcı']");
    expect(source).toContain("['Last Updated', 'Son Güncelleme']");
  });

  it('keeps branch and validation copy consistent in Turkish', () => {
    expect(source).toContain("['Branch name', 'Dal adı']");
    expect(source).toContain("['Loading branches…', 'Dallar yükleniyor…']");
    expect(source).toContain("['Filter branches…', 'Dalları filtrele…']");
    expect(source).toContain("['Filter branches', 'Dalları filtrele']");
    expect(source).toContain("['No matching branches', 'Eşleşen dal yok']");
    expect(source).toContain("['Failed to load branches', 'Dallar yüklenemedi']");
    expect(source).toContain("['Branch name is required', 'Dal adı zorunludur']");
    expect(source).toContain("['Branch name cannot contain spaces', 'Dal adı boşluk içeremez']");
    expect(source).not.toContain("['Loading branches…', 'Branchler yükleniyor…']");
    expect(source).not.toContain("['No matching branches', 'Eşleşen branch yok']");
    expect(source).not.toContain("['Failed to load branches', 'Branchler yüklenemedi']");
    expect(source).not.toContain("['Branch name', 'Branch adı']");
  });

  it('covers update center accessibility and runtime status copy in Turkish', () => {
    expect(source).toContain("['Cancel CLI update', 'CLI güncellemesini iptal et']");
    expect(source).toContain("['Close update panel', 'Güncelleme panelini kapat']");
    expect(source).toContain("['Cancellation requested. Waiting for the active command to stop...', 'İptal istendi. Etkin komutun durması bekleniyor...']");
    expect(source).toContain("['Waiting for provider progress...', 'Sağlayıcı ilerlemesi bekleniyor...']");
    expect(source).toContain("['All providers are already up to date.', 'Tüm sağlayıcılar zaten güncel.']");
    expect(source).toContain("['Session actions', 'Oturum eylemleri']");
    expect(source).toContain("['Branch actions', 'Dal eylemleri']");
    expect(source).toContain("['New session actions', 'Yeni oturum eylemleri']");
  });

  it('keeps shared-rules translation terminology consistent', () => {
    expect(source).toContain("['Provider memory + shared rules connected.', 'Sağlayıcı belleği + paylaşılan kurallar bağlı.']");
    expect(source).toContain("['Shared rules connected.', 'Paylaşılan kurallar bağlı.']");
    expect(source).toContain("['No provider memory or shared rules discovered yet.', 'Henüz sağlayıcı belleği veya paylaşılan kural bulunamadı.']");
    expect(source).not.toContain("['Provider memory + shared rules connected.', 'Sağlayıcı belleği + ortak kurallar bağlı.']");
    expect(source).not.toContain("['Shared rules connected.', 'Ortak kurallar bağlı.']");
    expect(source).not.toContain("['No provider memory or shared rules discovered yet.', 'Henüz sağlayıcı belleği veya ortak kural bulunmadı.']");
  });

  it('includes dynamic error translation patterns for mixed-language surfaces', () => {
    expect(source).toContain('pattern: /^Authentication failed:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Error:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Bootstrap failed:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Last error:\\s*(.+)$/u');
  });

  it('covers dynamic shell tooltip and launcher translations in Turkish', () => {
    expect(source).toContain("['Drag to reorder', 'Yeniden sıralamak için sürükle']");
    expect(source).toContain("['Drag to resize Live View and sessions', 'Canlı Görünüm ve oturumları yeniden boyutlandırmak için sürükle']");
    expect(source).toContain("['Drag to reorder pane', 'Paneli yeniden sıralamak için sürükle']");
    expect(source).toContain("['No profile selected', 'Profil seçilmedi']");
    expect(source).toContain("['configured', 'yapılandırıldı']");
    expect(source).toContain("['inherit', 'devral']");
    expect(source).toContain("['Restored terminal surface', 'Geri yüklenen terminal yüzeyi']");
    expect(source).toContain("['Live terminal surface', 'Canlı terminal yüzeyi']");
    expect(source).toContain("['linked run', 'bağlı çalışma']");
    expect(source).toContain("['active run', 'aktif çalışma']");
    expect(source).toContain("pattern: /^New (.+) Session \\(Ctrl\\+Shift\\+N\\)$/u");
    expect(source).toContain("pattern: /^Shortcuts:\\s*(.+)$/u");
    expect(source).toContain("pattern: /^Create new (.+) session$/u");
    expect(source).toContain("pattern: /^Status:\\s*(\\S+)\\s+Session:\\s*(.+)\\s+Drag to reorder$/u");
    expect(source).toContain("pattern: /^CLI Surface\\s+Profile:\\s*(.+)$/u");
    expect(source).toContain("pattern: /^Configured for (.+)$/u");
    expect(source).toContain("pattern: /^(\\d+) MCP server(s?) connected$/u");
    expect(source).toContain("pattern: /^(\\d+) agent(s?) available$/u");
    expect(source).toContain("pattern: /^(\\d+) skill(s?) ready$/u");
    expect(source).toContain("pattern: /^(\\d+) custom command(s?) available$/u");
    expect(source).toContain("pattern: /^(.+)\\s+·\\s+(live|starting|stopped|error|idle)$/u");
    expect(source).toContain("pattern: /^Profile:\\s*(.+)$/u");
    expect(source).toContain("pattern: /^Session:\\s*(.+)$/u");
    expect(source).toContain("pattern: /^Status:\\s*(.+)$/u");
    expect(source).toContain("pattern: /^(.+) \\(not installed\\)$/u");
    expect(source).toContain("value.includes('\\n')");
  });

  it('keeps terminal localization exclusions narrow enough for shell chrome labels', () => {
    expect(source).not.toContain("'.terminal-pane',");
    expect(source).not.toContain("'.project-terminal-container',");
    expect(source).not.toContain("'.remote-terminal-pane',");
    expect(source).toContain("'.xterm',");
    expect(source).toContain("'.ansi-buffer',");
  });

  it('covers live view and capture controls in Turkish', () => {
    expect(source).toContain("['Browser View', 'Tarayıcı Görünümü']");
    expect(source).toContain("['Go back', 'Geri git']");
    expect(source).toContain("['Go forward', 'İleri git']");
    expect(source).toContain("['Reload current page', 'Geçerli sayfayı yenile']");
    expect(source).toContain("['Describe what you want to do…', 'Ne yapmak istediğinizi açıklayın…']");
    expect(source).toContain("['Inspect mode is active', 'İnceleme modu etkin']");
    expect(source).toContain("['Flow recording is active', 'Akış kaydı etkin']");
  });

  it('covers repo and mcp inspection copy in Turkish', () => {
    expect(source).toContain("['Connect an MCP server', 'Bir MCP sunucusu bağlayın']");
    expect(source).toContain("['No tools available', 'Araç yok']");
    expect(source).toContain("['No resources available', 'Kaynak yok']");
    expect(source).toContain("['No prompts available', 'İstem şablonu yok']");
    expect(source).toContain("['Discard Changes', 'Değişiklikleri Sil']");
    expect(source).toContain("['Open in Editor', 'Düzenleyicide Aç']");
    expect(source).toContain("['Copy Path', 'Yolu Kopyala']");
  });

  it('covers orchestration and history labels in Turkish', () => {
    expect(source).toContain("['Calder orchestration map', 'Calder orkestrasyon haritası']");
    expect(source).toContain("['System health', 'Sistem sağlığı']");
    expect(source).toContain("['Governance policies', 'Yönetişim politikaları']");
    expect(source).toContain("['Workflow templates', 'İş akışı şablonları']");
    expect(source).toContain("['Recovery checkpoints', 'Kurtarma kontrol noktaları']");
    expect(source).toContain("['Filter run history', 'Çalıştırma geçmişini filtrele']");
    expect(source).toContain("['No events yet', 'Henüz olay yok']");
  });

  it('covers session inspector timeline and guard warnings in Turkish', () => {
    expect(source).toContain("['Subagent', 'Alt ajan']");
    expect(source).toContain("['Type', 'Tür']");
    expect(source).toContain("['Duration', 'Süre']");
    expect(source).toContain("['Cost tracking', 'Maliyet takibi']");
    expect(source).toContain("['No context data yet', 'Henüz bağlam verisi yok']");
    expect(source).toContain("['Toggle auto-scroll to bottom', 'Otomatik aşağı kaydırmayı aç/kapat']");
    expect(source).toContain("['Tracking is off for this coding tool. Calder cannot show cost, context usage, or session activity yet.', 'Bu kodlama aracı için izleme kapalı. Calder henüz maliyet, bağlam kullanımı veya oturum etkinliğini gösteremez.']");
  });

  it('covers mobile dependency doctor copy and dynamic status translation patterns', () => {
    expect(source).toContain("['Mobile automation readiness', 'Mobil otomasyon hazırlığı']");
    expect(source).toContain("['Mobile Dependency Doctor', 'Mobil Bağımlılık Doktoru']");
    expect(source).toContain("['iOS simulator inspect', 'iOS simülatör inceleme']");
    expect(source).toContain("['Android emulator inspect', 'Android emülatör inceleme']");
    expect(source).toContain("['Optional tools', 'İsteğe bağlı araçlar']");
    expect(source).toContain("['Install', 'Kur']");
    expect(source).toContain("['Installing…', 'Kuruluyor…']");
    expect(source).toContain('pattern: /^Ready:\\s*(\\d+)\\s+·\\s+Warnings:\\s*(\\d+)\\s+·\\s+Required missing:\\s*(\\d+)$/u');
    expect(source).toContain('pattern: /^Command:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^(.+) was not found on PATH\\.$/u');
  });
});
