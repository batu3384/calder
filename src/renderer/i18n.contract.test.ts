import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./i18n.ts', import.meta.url), 'utf-8');

describe('i18n contract', () => {
  it('covers key workspace Turkish translations for rail and settings copy', () => {
    expect(source).toContain("['Hybrid context', 'Hibrit bağlam']");
    expect(source).toContain("['Workflows & checkpoints', 'İş akışları ve kontrol noktaları']");
    expect(source).toContain("['Review & preview loop', 'İnceleme ve önizleme döngüsü']");
    expect(source).toContain("['Governance layer', 'Yönetişim katmanı']");
    expect(source).toContain("['Background tasks', 'Arka plan görevleri']");
    expect(source).toContain("['Team context', 'Ekip bağlamı']");
  });

  it('covers settings shell subgroup copy in Turkish', () => {
    expect(source).toContain("['Provider health', 'Sağlayıcı durumu']");
    expect(source).toContain("['Orchestration phases', 'Orkestrasyon fazları']");
    expect(source).toContain("['Tracking & fixes', 'İzleme ve düzeltmeler']");
    expect(source).toContain("['Installed tools, defaults, and repair actions.', 'Yüklü araçlar, varsayılanlar ve onarım eylemleri.']");
  });

  it('covers session inspector and usage modal labels in Turkish', () => {
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
    expect(source).toContain("['No matching branches', 'Eşleşen dal yok']");
    expect(source).toContain("['Failed to load branches', 'Dallar yüklenemedi']");
    expect(source).toContain("['Branch name is required', 'Dal adı zorunludur']");
    expect(source).toContain("['Branch name cannot contain spaces', 'Dal adı boşluk içeremez']");
  });

  it('includes dynamic error translation patterns for mixed-language surfaces', () => {
    expect(source).toContain('pattern: /^Authentication failed:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Error:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Bootstrap failed:\\s*(.+)$/u');
    expect(source).toContain('pattern: /^Last error:\\s*(.+)$/u');
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
});
