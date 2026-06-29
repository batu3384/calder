import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

function expectTranslation(source: string, en: string, tr: string) {
  expect(source).toContain(`'${en}'`);
  expect(source).toContain(`'${tr}'`);
}

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
    expectTranslation(source, 'Skip to workspace', 'Çalışma alanına atla');
    expectTranslation(source, 'Command studio', 'Komut stüdyosu');
    expectTranslation(source, 'Project Dock', 'Proje Paneli');
    expectTranslation(
      source,
      'Switch context without losing live work.',
      'Canlı işi kaybetmeden bağlam değiştirin.',
    );
    expectTranslation(source, 'Workspace Pulse', 'Çalışma Alanı Nabzı');
    expectTranslation(
      source,
      'Run controls, project state, and tools stay separated so the rail stays readable.',
      'Çalışma kontrolleri, proje durumu ve araçlar ayrı kalır; panel okunabilirliğini korur.',
    );
    expectTranslation(source, 'Hybrid context', 'Hibrit bağlam');
    expectTranslation(source, 'Agent command desk', 'Ajan komut masası');
    expectTranslation(source, 'Add MCP Server', 'MCP sunucusu ekle');
    expectTranslation(source, 'Run Log', 'Çalışma günlüğü');
    expectTranslation(source, 'Workflows & checkpoints', 'İş akışları ve kontrol noktaları');
    expectTranslation(source, 'Review & preview loop', 'İnceleme ve önizleme döngüsü');
    expectTranslation(source, 'Governance layer', 'Yönetişim katmanı');
    expectTranslation(source, 'Background tasks', 'Arka plan görevleri');
    expectTranslation(source, 'Team context', 'Ekip bağlamı');
  });

  it('covers settings shell subgroup copy in Turkish', () => {
    expectTranslation(
      source,
      'Session defaults, interface behavior, tool health, automation, and safety rules.',
      'Oturum varsayılanları, arayüz davranışı, araç sağlığı, otomasyon ve güvenlik kuralları.',
    );
    expectTranslation(source, 'Interface', 'Arayüz');
    expectTranslation(source, 'Automation', 'Otomasyon');
    expectTranslation(source, 'Safety', 'Güvenlik');
    expectTranslation(
      source,
      'Startup, language, and session memory',
      'Başlangıç, dil ve oturum belleği',
    );
    expectTranslation(
      source,
      'Shell layout, rails, and live view behavior',
      'Kabuk düzeni, paneller ve Canlı Görünüm davranışı',
    );
    expectTranslation(
      source,
      'CLI providers and mobile dependency health',
      'CLI sağlayıcıları ve mobil bağımlılık sağlığı',
    );
    expectTranslation(source, 'Provider health', 'Sağlayıcı durumu');
    expectTranslation(source, 'Orchestration phases', 'Orkestrasyon fazları');
    expectTranslation(source, 'Tracking & fixes', 'İzleme ve düzeltmeler');
    expectTranslation(
      source,
      'Installed tools, defaults, and repair actions.',
      'Yüklü araçlar, varsayılanlar ve onarım eylemleri.',
    );
  });

  it('covers session inspector and usage modal labels in Turkish', () => {
    expectTranslation(source, 'Usage', 'Kullanım');
    expectTranslation(source, 'Workspace activity snapshot', 'Çalışma alanı etkinlik özeti');
    expectTranslation(source, 'Guide', 'Rehber');
    expectTranslation(
      source,
      'Workspace signals and shortcuts',
      'Çalışma alanı sinyalleri ve kısayollar',
    );
    expectTranslation(source, 'Tab Status Dot', 'Sekme durum noktası');
    expectTranslation(source, 'Git Status', 'Git durumu');
    expectTranslation(source, 'Timeline', 'Zaman çizelgesi');
    expectTranslation(source, 'Costs', 'Maliyetler');
    expectTranslation(source, 'Tools', 'Araçlar');
    expectTranslation(source, 'Total Sessions', 'Toplam Oturum');
    expectTranslation(source, 'Total Messages', 'Toplam Mesaj');
    expectTranslation(source, 'Using Since', 'Kullanım Başlangıcı');
    expectTranslation(source, 'Last Updated', 'Son Güncelleme');
  });

  it('keeps branch and validation copy consistent in Turkish', () => {
    expectTranslation(source, 'Branch name', 'Dal adı');
    expectTranslation(source, 'Loading branches…', 'Dallar yükleniyor…');
    expectTranslation(source, 'Filter branches…', 'Dalları filtrele…');
    expectTranslation(source, 'Filter branches', 'Dalları filtrele');
    expectTranslation(source, 'No matching branches', 'Eşleşen dal yok');
    expectTranslation(source, 'Failed to load branches', 'Dallar yüklenemedi');
    expectTranslation(source, 'Branch name is required', 'Dal adı zorunludur');
    expectTranslation(source, 'Branch name cannot contain spaces', 'Dal adı boşluk içeremez');
    expect(source).not.toContain('Branchler yükleniyor…');
    expect(source).not.toContain('Eşleşen branch yok');
    expect(source).not.toContain('Branchler yüklenemedi');
    expect(source).not.toContain('Branch adı');
  });

  it('covers update center accessibility and runtime status copy in Turkish', () => {
    expectTranslation(source, 'Cancel CLI update', 'CLI güncellemesini iptal et');
    expectTranslation(source, 'Close update panel', 'Güncelleme panelini kapat');
    expectTranslation(
      source,
      'Cancellation requested. Waiting for the active command to stop...',
      'İptal istendi. Etkin komutun durması bekleniyor...',
    );
    expectTranslation(
      source,
      'Waiting for provider progress...',
      'Sağlayıcı ilerlemesi bekleniyor...',
    );
    expectTranslation(
      source,
      'All providers are already up to date.',
      'Tüm sağlayıcılar zaten güncel.',
    );
    expectTranslation(source, 'Session actions', 'Oturum eylemleri');
    expectTranslation(source, 'Branch actions', 'Dal eylemleri');
    expectTranslation(source, 'New session actions', 'Yeni oturum eylemleri');
  });

  it('keeps shared-rules translation terminology consistent', () => {
    expectTranslation(
      source,
      'Provider memory + shared rules connected.',
      'Sağlayıcı belleği + paylaşılan kurallar bağlı.',
    );
    expectTranslation(source, 'Shared rules connected.', 'Paylaşılan kurallar bağlı.');
    expectTranslation(
      source,
      'No provider memory or shared rules discovered yet.',
      'Henüz sağlayıcı belleği veya paylaşılan kural bulunamadı.',
    );
    expect(source).not.toContain('Sağlayıcı belleği + ortak kurallar bağlı.');
    expect(source).not.toContain('Ortak kurallar bağlı.');
    expect(source).not.toContain('Henüz sağlayıcı belleği veya ortak kural bulunmadı.');
  });

  it('includes dynamic error translation patterns for mixed-language surfaces', () => {
    expect(source).toContain('pattern: /^Authentication failed:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Error:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Bootstrap failed:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Last error:\\s*(.+)$/u');
  });

  it('covers dynamic shell tooltip and launcher translations in Turkish', () => {
    expectTranslation(source, 'Drag to reorder', 'Yeniden sıralamak için sürükle');
    expectTranslation(
      source,
      'Drag to resize Live View and sessions',
      'Canlı Görünüm ve oturumları yeniden boyutlandırmak için sürükle',
    );
    expectTranslation(source, 'Drag to reorder pane', 'Paneli yeniden sıralamak için sürükle');
    expectTranslation(source, 'No profile selected', 'Profil seçilmedi');
    expectTranslation(source, 'configured', 'yapılandırıldı');
    expectTranslation(source, 'inherit', 'devral');
    expectTranslation(source, 'Restored terminal surface', 'Geri yüklenen terminal yüzeyi');
    expectTranslation(source, 'Live terminal surface', 'Canlı terminal yüzeyi');
    expectTranslation(source, 'linked run', 'bağlı çalışma');
    expectTranslation(source, 'active run', 'aktif çalışma');
    expect(source).toContain('pattern: /^New (.+) Session \\(Ctrl\\+Shift\\+N\\)$/u');
    expect(source).toContain('pattern: /^Shortcuts:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Create new (.+) session$/u');
    expect(source).toContain(
      'pattern: /^Status:\\s*(\\S+)\\s+Session:\\s*(.+)\\s+Drag to reorder$/u',
    );
    expect(source).toContain('pattern: /^CLI Surface\\s+Profile:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Configured for (.+)$/u');
    expect(source).toContain('pattern: /^(\\d+) MCP server(s?) connected$/u');
    expect(source).toContain('pattern: /^(\\d+) agent(s?) available$/u');
    expect(source).toContain('pattern: /^(\\d+) skill(s?) ready$/u');
    expect(source).toContain('pattern: /^(\\d+) custom command(s?) available$/u');
    expect(source).toContain('pattern: /^(.+)\\s+·\\s+(live|starting|stopped|error|idle)$/u');
    expect(source).toContain('pattern: /^Profile:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Session:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Status:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^(.+) \\(not installed\\)$/u');
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
    expectTranslation(source, 'Browser View', 'Tarayıcı Görünümü');
    expectTranslation(source, 'Go back', 'Geri git');
    expectTranslation(source, 'Go forward', 'İleri git');
    expectTranslation(source, 'Reload current page', 'Geçerli sayfayı yenile');
    expectTranslation(source, 'Describe what you want to do…', 'Ne yapmak istediğinizi açıklayın…');
    expectTranslation(source, 'Inspect mode is active', 'İnceleme modu etkin');
    expectTranslation(source, 'Flow recording is active', 'Akış kaydı etkin');
  });

  it('covers repo and mcp inspection copy in Turkish', () => {
    expectTranslation(source, 'Connect an MCP server', 'Bir MCP sunucusu bağlayın');
    expectTranslation(source, 'No tools available', 'Araç yok');
    expectTranslation(source, 'No resources available', 'Kaynak yok');
    expectTranslation(source, 'No prompts available', 'İstem şablonu yok');
    expectTranslation(source, 'Discard Changes', 'Değişiklikleri Sil');
    expectTranslation(source, 'Open in Editor', 'Düzenleyicide Aç');
    expectTranslation(source, 'Copy Path', 'Yolu Kopyala');
  });

  it('covers orchestration and history labels in Turkish', () => {
    expectTranslation(source, 'Calder orchestration map', 'Calder orkestrasyon haritası');
    expectTranslation(source, 'System health', 'Sistem sağlığı');
    expectTranslation(source, 'Governance policies', 'Yönetişim politikaları');
    expectTranslation(source, 'Workflow templates', 'İş akışı şablonları');
    expectTranslation(source, 'Recovery checkpoints', 'Kurtarma kontrol noktaları');
    expectTranslation(source, 'Filter run history', 'Çalıştırma geçmişini filtrele');
    expectTranslation(source, 'No events yet', 'Henüz olay yok');
  });

  it('covers session inspector timeline and guard warnings in Turkish', () => {
    expectTranslation(source, 'Subagent', 'Alt ajan');
    expectTranslation(source, 'Type', 'Tür');
    expectTranslation(source, 'Duration', 'Süre');
    expectTranslation(source, 'Cost tracking', 'Maliyet takibi');
    expectTranslation(source, 'No context data yet', 'Henüz bağlam verisi yok');
    expectTranslation(source, 'Toggle auto-scroll to bottom', 'Otomatik aşağı kaydırmayı aç/kapat');
    expectTranslation(
      source,
      'Tracking is off for this coding tool. Calder cannot show cost, context usage, or session activity yet.',
      'Bu kodlama aracı için izleme kapalı. Calder henüz maliyet, bağlam kullanımı veya oturum etkinliğini gösteremez.',
    );
  });

  it('covers mobile dependency doctor copy and dynamic status translation patterns', () => {
    expectTranslation(source, 'Mobile automation readiness', 'Mobil otomasyon hazırlığı');
    expectTranslation(source, 'Mobile Dependency Doctor', 'Mobil Bağımlılık Doktoru');
    expectTranslation(source, 'iOS simulator inspect', 'iOS simülatör inceleme');
    expectTranslation(source, 'Android emulator inspect', 'Android emülatör inceleme');
    expectTranslation(source, 'Optional tools', 'İsteğe bağlı araçlar');
    expectTranslation(source, 'Install', 'Kur');
    expectTranslation(source, 'Installing…', 'Kuruluyor…');
    expect(source).toContain(
      'pattern: /^Ready:\\s*(\\d+)\\s+·\\s+Warnings:\\s*(\\d+)\\s+·\\s+Required missing:\\s*(\\d+)$/u',
    );
    expect(source).toContain('pattern: /^Command:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^(.+) was not found on PATH\\.$/u');
  });
});
