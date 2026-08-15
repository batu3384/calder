import {
  createPolicyAndRoutingPatterns,
  createWorkflowAndInstallPatterns,
} from './i18n-pattern-workflow-policy.js';
import { createTimelinePatterns } from './i18n-timeline-patterns.js';

export type PatternTranslation = {
  pattern: RegExp;
  replace: (match: RegExpMatchArray) => string;
};

type Translate = (value: string) => string;

function createRelativeTimePatterns(): PatternTranslation[] {
  return [
    {
      pattern: /^(\d+) earlier events not shown$/u,
      replace: (match) => `${match[1]} önceki etkinlik gösterilmiyor`,
    },
    { pattern: /^Updated (\d+)m ago$/u, replace: (match) => `${match[1]} dk önce güncellendi` },
    { pattern: /^Updated (\d+)h ago$/u, replace: (match) => `${match[1]} sa önce güncellendi` },
    { pattern: /^Updated (\d+)d ago$/u, replace: (match) => `${match[1]} gün önce güncellendi` },
    { pattern: /^Updated just now$/u, replace: () => 'Az önce güncellendi' },
    { pattern: /^(\d+)m ago$/u, replace: (match) => `${match[1]} dk önce` },
    { pattern: /^(\d+)h ago$/u, replace: (match) => `${match[1]} sa önce` },
    {
      pattern: /^Checked (.+)$/u,
      replace: (match) => `Kontrol: ${translate(match[1])}`,
    },
    {
      pattern: /^(\d+)% completed$/u,
      replace: (match) => `%${match[1]} tamamlandı`,
    },
    {
      pattern: /^(.+) is ready\. Restart to apply\.$/u,
      replace: (match) => `${match[1]} hazır. Uygulamak için yeniden başlatın.`,
    },
    {
      pattern: /^(.+) is already up to date\.$/u,
      replace: (match) => `${match[1]} zaten güncel.`,
    },
  ];
}

function createTabSummaryPatterns(translate: Translate): PatternTranslation[] {
  return [
    {
      pattern: /^(\d+) session(s?) · (\d+) changed file(s?)$/u,
      replace: (match) => `${match[1]} oturum · ${match[3]} değişen dosya`,
    },
    {
      pattern: /^Status:\s*(\S+)\s+Session:\s*(.+)\s+Drag to reorder$/u,
      replace: (match) =>
        `Durum: ${translate(match[1])} · Oturum: ${match[2]} · Yeniden sıralamak için sürükle`,
    },
    {
      pattern: /^Configured for (.+)$/u,
      replace: (match) => `${match[1]} için yapılandırıldı`,
    },
    {
      pattern: /^configured\s+·\s+(.+)$/u,
      replace: (match) => `yapılandırıldı · ${match[1]}`,
    },
    {
      pattern: /^New (.+) Session \(Ctrl\+Shift\+N\)$/u,
      replace: (match) => `Yeni ${match[1]} Oturumu (Ctrl+Shift+N)`,
    },
    {
      pattern: /^Create new (.+) session$/u,
      replace: (match) => `Yeni ${match[1]} oturumu oluştur`,
    },
    {
      pattern: /^Profile:\s*(.+)$/u,
      replace: (match) => `Profil: ${translate(match[1])}`,
    },
    {
      pattern: /^Session:\s*(.+)$/u,
      replace: (match) => `Oturum: ${match[1]}`,
    },
    {
      pattern: /^Status:\s*(.+)$/u,
      replace: (match) => `Durum: ${translate(match[1])}`,
    },
    {
      pattern: /^(.+)\s+·\s+(live|starting|stopped|error|idle)$/u,
      replace: (match) => `${match[1]} · ${translate(match[2])}`,
    },
  ];
}

function createInspectorAndErrorPatterns(translate: Translate): PatternTranslation[] {
  return [
    {
      pattern: /^Browser:\s*(.+)$/u,
      replace: (match) => `Tarayıcı: ${match[1]}`,
    },
    {
      pattern: /^File:\s*(.+)$/u,
      replace: (match) => `Dosya: ${match[1]}`,
    },
    {
      pattern: /^Remote:\s*(.+)$/u,
      replace: (match) => `Uzak: ${match[1]}`,
    },
    {
      pattern: /^Diff:\s*(.+)$/u,
      replace: (match) => `Karşılaştırma: ${match[1]}`,
    },
    {
      pattern: /^MCP Inspector$/u,
      replace: () => 'MCP Denetçisi',
    },
    {
      pattern: /^(.+) \(not installed\)$/u,
      replace: (match) => `${match[1]} (kurulu değil)`,
    },
    {
      pattern: /^Task created: (.+)$/u,
      replace: (match) => `Görev oluşturuldu: ${match[1]}`,
    },
    {
      pattern: /^Task completed: (.+)$/u,
      replace: (match) => `Görev tamamlandı: ${match[1]}`,
    },
    {
      pattern: /^Authentication failed:\s*(.+)$/u,
      replace: (match) => `Kimlik doğrulama başarısız: ${match[1]}`,
    },
    {
      pattern: /^Error:\s*(.+)$/u,
      replace: (match) => `Hata: ${match[1]}`,
    },
    {
      pattern: /^Bootstrap failed:\s*(.+)$/u,
      replace: (match) => `Başlatma hazırlığı başarısız: ${match[1]}`,
    },
    {
      pattern: /^Last error:\s*(.+)$/u,
      replace: (match) => `Son hata: ${match[1]}`,
    },
    {
      pattern: /^Agent started: (.+)$/u,
      replace: (match) => `Ajan başlatıldı: ${match[1]}`,
    },
    {
      pattern:
        /^(.+)\s+is not reachable right now\. Start the local app again, then reload or rescan localhost\.$/u,
      replace: (match) =>
        `${match[1]} şu anda erişilebilir değil. Yerel uygulamayı tekrar başlatın, sonra yeniden yükleyin veya localhost'u yeniden tarayın.`,
    },
    {
      pattern:
        /^(.+)\s+could not be opened right now\. Try reloading, pasting a different URL, or choosing another local surface\.$/u,
      replace: (match) =>
        `${match[1]} şu anda açılamadı. Yeniden yüklemeyi, farklı bir URL yapıştırmayı veya başka bir yerel yüzey seçmeyi deneyin.`,
    },
    {
      pattern: /^Launching (iOS Simulator|Android Emulator)…$/u,
      replace: (match) =>
        `${match[1] === 'iOS Simulator' ? 'iOS Simülatör' : 'Android Emülatör'} başlatılıyor…`,
    },
    {
      pattern: /^Capturing (iOS Simulator|Android Emulator) screenshot…$/u,
      replace: (match) =>
        `${match[1] === 'iOS Simulator' ? 'iOS Simülatör' : 'Android Emülatör'} ekran görüntüsü alınıyor…`,
    },
    {
      pattern: /^Prompt sent to (.+)\.$/u,
      replace: (match) => `İstem ${match[1]} oturumuna gönderildi.`,
    },
    {
      pattern: /^Selected point: (.+)$/u,
      replace: (match) => `Seçilen nokta: ${match[1]}`,
    },
    {
      pattern: /^Class:\s*(.+)$/u,
      replace: (match) => `Sınıf: ${match[1]}`,
    },
    {
      pattern: /^Resource ID:\s*(.+)$/u,
      replace: (match) => `Kaynak ID: ${match[1]}`,
    },
    {
      pattern: /^Content description:\s*(.+)$/u,
      replace: (match) => `İçerik açıklaması: ${match[1]}`,
    },
    {
      pattern: /^Text:\s*(.+)$/u,
      replace: (match) => `Metin: ${match[1]}`,
    },
    {
      pattern: /^Bounds:\s*(.+)$/u,
      replace: (match) => `Sınırlar: ${match[1]}`,
    },
    {
      pattern: /^Live: on \((\d+)ms\)$/u,
      replace: (match) => `Canlı: açık (${match[1]}ms)`,
    },
    {
      pattern: /^Frames:\s*(\d+)$/u,
      replace: (match) => `Kareler: ${match[1]}`,
    },
    {
      pattern: /^Last:\s*(.+)$/u,
      replace: (match) => `Son: ${match[1]}`,
    },
    {
      pattern: /^Coverage:\s*(.+)$/u,
      replace: (match) => `Kapsam: ${match[1]}`,
    },
    {
      pattern: /^Events (\d+) · Tools (\d+) · Policy (\d+)$/u,
      replace: (match) => `Olaylar ${match[1]} · Araçlar ${match[2]} · Politika ${match[3]}`,
    },
    {
      pattern: /^Showing (\d+) of (\d+) events$/u,
      replace: (match) => `${match[2]} olaydan ${match[1]} gösteriliyor`,
    },
    {
      pattern: /^Tool:\s*(.+)$/u,
      replace: (match) => `Araç: ${match[1]}`,
    },
    {
      pattern: /^Policy (.+) \((.+)\)$/u,
      replace: (match) => `Politika ${match[1]} (${match[2]})`,
    },
    {
      pattern: /^Evidence storage:\s*([0-9.]+) KB$/u,
      replace: (match) => `Kanıt depolama: ${match[1]} KB`,
    },
    {
      pattern: /^Completion:\s*(.+)$/u,
      replace: (match) => `Tamamlanma: ${match[1]}`,
    },
    {
      pattern: /^(.+) unavailable$/u,
      replace: (match) => `${translate(match[1])} kullanılamıyor`,
    },
    {
      pattern: /^This view is not available for (.+) sessions\.$/u,
      replace: (match) => `Bu görünüm ${match[1]} oturumları için kullanılamıyor.`,
    },
    {
      pattern: /^<(.+)> selected$/u,
      replace: (match) => `<${match[1]}> seçildi`,
    },
    {
      pattern: /^Target text:\s*(.+)$/u,
      replace: (match) => `Hedef metin: ${match[1]}`,
    },
    {
      pattern: /^Choose the best selector for this (.+) element before routing the prompt\.$/u,
      replace: (match) =>
        `İstemi yönlendirmeden önce bu ${match[1]} öğesi için en iyi seçiciyi belirleyin.`,
    },
    {
      pattern: /^(\d+) recent runs$/u,
      replace: (match) => `${match[1]} son çalışma`,
    },
    {
      pattern: /^1 matching run$/u,
      replace: () => '1 eşleşen çalışma',
    },
    {
      pattern: /^(\d+) matching runs$/u,
      replace: (match) => `${match[1]} eşleşen çalışma`,
    },
    {
      pattern: /^Remove "(.+)" from session history\?$/u,
      replace: (match) => `"${match[1]}" oturum geçmişinden kaldırılsın mı?`,
    },
    {
      pattern: /^(\d+) more items…$/u,
      replace: (match) => `${match[1]} öğe daha…`,
    },
    {
      pattern: /^(\d+)d ago$/u,
      replace: (match) => `${match[1]} gün önce`,
    },
  ];
}

export function createPatternTranslations(translate: Translate): PatternTranslation[] {
  return [
    ...createWorkflowAndInstallPatterns(translate),
    ...createPolicyAndRoutingPatterns(translate),
    ...createRelativeTimePatterns(),
    ...createTabSummaryPatterns(translate),
    ...createInspectorAndErrorPatterns(translate),
    ...createTimelinePatterns(translate),
  ];
}
