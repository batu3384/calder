export type PatternTranslation = {
  pattern: RegExp;
  replace: (match: RegExpMatchArray) => string;
};

type Translate = (value: string) => string;

function createWorkflowAndInstallPatterns(translate: Translate): PatternTranslation[] {
  return [
    {
      pattern: /^Session (\d+)$/u,
      replace: (match) => `Oturum ${match[1]}`,
    },
    {
      pattern: /^What's New in v(.+)$/u,
      replace: (match) => `v${match[1]} sürümündeki yenilikler`,
    },
    {
      pattern: /^Version:\s*(.+)$/u,
      replace: (match) => `Sürüm: ${match[1]}`,
    },
    {
      pattern: /^Released\s+(.+)$/u,
      replace: (match) => `Yayın tarihi ${match[1]}`,
    },
    {
      pattern: /^Update v(.+) available — downloading\.\.\.$/u,
      replace: (match) => `v${match[1]} güncellemesi mevcut — indiriliyor...`,
    },
    {
      pattern: /^Downloading (.+)\.\.\.(?: (\d+)%)?$/u,
      replace: (match) => (match[2]
        ? `Güncelleme indiriliyor: ${match[1]} (%${match[2]})`
        : `Güncelleme indiriliyor: ${match[1]}`),
    },
    {
      pattern: /^Update (.+) ready\.$/u,
      replace: (match) => `Güncelleme hazır: ${match[1]}.`,
    },
    {
      pattern: /^Update failed:\s*(.+)$/u,
      replace: (match) => `Güncelleme başarısız: ${translate(match[1])}`,
    },
    {
      pattern: /^Progress:\s*(\d+)\/(\d+)\s+\((\d+)%\)$/u,
      replace: (match) => `İlerleme: ${match[1]}/${match[2]} (%${match[3]})`,
    },
    {
      pattern: /^Ready:\s*(\d+)\s+·\s+Warnings:\s*(\d+)\s+·\s+Required missing:\s*(\d+)$/u,
      replace: (match) => `Hazır: ${match[1]} · Uyarı: ${match[2]} · Zorunlu eksik: ${match[3]}`,
    },
    {
      pattern: /^(.+)\s+·\s+Install progress$/u,
      replace: (match) => `${translate(match[1])} · Kurulum ilerlemesi`,
    },
    {
      pattern: /^Progress:\s*(\d+)%$/u,
      replace: (match) => `İlerleme: %${match[1]}`,
    },
    {
      pattern: /^Step:\s*(\d+)\/(\d+)$/u,
      replace: (match) => `Adım: ${match[1]}/${match[2]}`,
    },
    {
      pattern: /^Downloaded:\s*([0-9.]+\s*MB)$/u,
      replace: (match) => `İndirilen: ${match[1]}`,
    },
    {
      pattern: /^Remaining:\s*([0-9.]+\s*MB)$/u,
      replace: (match) => `Kalan: ${match[1]}`,
    },
    {
      pattern: /^Step progress:\s*(\d+)%$/u,
      replace: (match) => `Adım ilerlemesi: %${match[1]}`,
    },
    {
      pattern: /^Command:\s*(.+)$/u,
      replace: (match) => `Komut: ${match[1]}`,
    },
    {
      pattern: /^Install driver with `appium driver install (.+)`\.$/u,
      replace: (match) => `Sürücüyü \`appium driver install ${match[1]}\` ile kurun.`,
    },
    {
      pattern: /^Detected Java (\d+); Java 17 or newer is required\.$/u,
      replace: (match) => `Java ${match[1]} algılandı; Java 17 veya üzeri gerekli.`,
    },
    {
      pattern: /^(.+) is not installed\.$/u,
      replace: (match) => `${match[1]} kurulu değil.`,
    },
    {
      pattern: /^(.+) is installed\.$/u,
      replace: (match) => `${match[1]} kurulu.`,
    },
    {
      pattern: /^(.+) installed successfully\.$/u,
      replace: (match) => `${match[1]} başarıyla kuruldu.`,
    },
    {
      pattern: /^(.+) installation started…$/u,
      replace: (match) => `${match[1]} kurulumu başlatıldı…`,
    },
    {
      pattern: /^(.+) was not found on PATH\.$/u,
      replace: (match) => `PATH üzerinde ${match[1]} bulunamadı.`,
    },
    {
      pattern: /^Command not found:\s*(.+)\.\s*Install it and ensure PATH is configured\.$/u,
      replace: (match) => `Komut bulunamadı: ${match[1]}. Kurun ve PATH'in doğru yapılandırıldığından emin olun.`,
    },
    {
      pattern: /^(.+) was not found on PATH or known Android SDK locations\.$/u,
      replace: (match) => `PATH üzerinde veya bilinen Android SDK konumlarında ${match[1]} bulunamadı.`,
    },
    {
      pattern: /^Running step (\d+)\/(\d+)$/u,
      replace: (match) => `Adım ${match[1]}/${match[2]} çalışıyor`,
    },
    {
      pattern: /^Step (\d+)\/(\d+) completed\.$/u,
      replace: (match) => `Adım ${match[1]}/${match[2]} tamamlandı.`,
    },
    {
      pattern: /^(.+) exists but version check failed\.$/u,
      replace: (match) => `${match[1]} mevcut ancak sürüm kontrolü başarısız oldu.`,
    },
    {
      pattern: /^(.+) is available\.$/u,
      replace: (match) => `${match[1]} kullanılabilir.`,
    },
    {
      pattern: /^Started:\s*(.+)$/u,
      replace: (match) => `Başlangıç: ${translate(match[1])}`,
    },
    {
      pattern: /^Last run:\s*(.+)$/u,
      replace: (match) => `Son çalıştırma: ${translate(match[1])}`,
    },
    {
      pattern: /^Default policy for this Mac\.\s+Current:\s+(.+)\.$/u,
      replace: (match) => `Bu Mac için varsayılan politika. Şu an: ${translate(match[1])}.`,
    },
    {
      pattern: /^Repository-level policy\.\s+Current:\s+(.+)\.$/u,
      replace: (match) => `Depo düzeyinde politika. Şu an: ${translate(match[1])}.`,
    },
    {
      pattern: /^Temporary policy for the active session\.\s+Current:\s+(.+)\.$/u,
      replace: (match) => `Aktif oturum için geçici politika. Şu an: ${translate(match[1])}.`,
    },
    {
      pattern: /^Updating CLI tools \((\d+)\/(\d+)\)$/u,
      replace: (match) => `CLI araçları güncelleniyor (${match[1]}/${match[2]})`,
    },
    {
      pattern: /^Cancelling CLI update \((\d+)\/(\d+)\)$/u,
      replace: (match) => `CLI güncellemesi iptal ediliyor (${match[1]}/${match[2]})`,
    },
    {
      pattern: /^Completed with (\d+) issue(s?)\.$/u,
      replace: (match) => `${match[1]} sorunla tamamlandı.`,
    },
    {
      pattern: /^(\d+) provider(s?) updated\.$/u,
      replace: (match) => `${match[1]} sağlayıcı güncellendi.`,
    },
    {
      pattern: /^(\d+) provider(s?) waiting for package sync\.$/u,
      replace: (match) => `${match[1]} sağlayıcı paket senkronunu bekliyor.`,
    },
    {
      pattern: /^(\d+)\/(\d+) providers finished before cancellation\.$/u,
      replace: (match) => `${match[1]}/${match[2]} sağlayıcı iptalden önce tamamlandı.`,
    },
    {
      pattern: /^(\d+) provider(s?) finished before cancellation\.$/u,
      replace: (match) => `${match[1]} sağlayıcı iptalden önce tamamlandı.`,
    },
    {
      pattern: /^Finished (.+)\.$/u,
      replace: (match) => `Bitiş: ${translate(match[1])}.`,
    },
    {
      pattern: /^(.+) in progress\.$/u,
      replace: (match) => `${match[1]} sürüyor.`,
    },
  ];
}

function createPolicyAndRoutingPatterns(translate: Translate): PatternTranslation[] {
  return [
    {
      pattern: /^(\d+)\s+session$/u,
      replace: (match) => `${match[1]} oturum`,
    },
    {
      pattern: /^(\d+)\s+sessions$/u,
      replace: (match) => `${match[1]} oturum`,
    },
    {
      pattern: /^Input\s+(\d+)$/u,
      replace: (match) => `Girdi ${match[1]}`,
    },
    {
      pattern: /^New\s+(\d+)$/u,
      replace: (match) => `Yeni ${match[1]}`,
    },
    {
      pattern: /^Live\s+(\d+)$/u,
      replace: (match) => `Canlı ${match[1]}`,
    },
    {
      pattern: /^Queue\s+(\d+)$/u,
      replace: (match) => `Kuyruk ${match[1]}`,
    },
    {
      pattern: /^(\d+)\s+session needs input$/u,
      replace: (match) => `${match[1]} oturum girdi bekliyor`,
    },
    {
      pattern: /^(\d+)\s+sessions need input$/u,
      replace: (match) => `${match[1]} oturum girdi bekliyor`,
    },
    {
      pattern: /^(\d+)\s+session has new output$/u,
      replace: (match) => `${match[1]} oturumda yeni çıktı var`,
    },
    {
      pattern: /^(\d+)\s+sessions have new output$/u,
      replace: (match) => `${match[1]} oturumda yeni çıktı var`,
    },
    {
      pattern: /^(\d+)\s+active run$/u,
      replace: (match) => `${match[1]} aktif çalışma`,
    },
    {
      pattern: /^(\d+)\s+active runs$/u,
      replace: (match) => `${match[1]} aktif çalışma`,
    },
    {
      pattern: /^(\d+)\s+queued task$/u,
      replace: (match) => `${match[1]} kuyruk görevi`,
    },
    {
      pattern: /^(\d+)\s+queued tasks$/u,
      replace: (match) => `${match[1]} kuyruk görevi`,
    },
    {
      pattern: /^Latest:\s*(.+)$/u,
      replace: (match) => `Son sürüm: ${match[1]}`,
    },
    {
      pattern: /^Calder found (\d+) runnable option(s?) for this project\.$/u,
      replace: (match) => `Calder bu proje için çalıştırılabilir ${match[1]} seçenek buldu.`,
    },
    {
      pattern: /^(\d+) commands$/u,
      replace: (match) => `${match[1]} komut`,
    },
    {
      pattern: /^(\d+) running$/u,
      replace: (match) => `${match[1]} çalışıyor`,
    },
    {
      pattern: /^Flow \((\d+) steps?\)$/u,
      replace: (match) => `Akış (${match[1]} adım)`,
    },
    {
      pattern: /^Auto-scroll:\s*(ON|OFF)$/u,
      replace: (match) => `Otomatik kaydırma: ${match[1] === 'ON' ? 'AÇIK' : 'KAPALI'}`,
    },
    {
      pattern: /^Will send:\s*(.+)$/u,
      replace: (match) => `Gönderilecek: ${translate(match[1])}`,
    },
    {
      pattern: /^Currently:\s*(.+)$/u,
      replace: (match) => `Şu an: ${translate(match[1])}`,
    },
    {
      pattern: /^Resolved from:\s*(.+)\s+·\s+Provider:\s*(.+)$/u,
      replace: (match) => `Çözülen kaynak: ${translate(match[1])} · Sağlayıcı: ${match[2]}`,
    },
    {
      pattern: /^Global:\s*(.+)\s+·\s+Project:\s*(.+)\s+·\s+Session:\s*(.+)$/u,
      replace: (match) => `Global: ${translate(match[1])} · Proje: ${translate(match[2])} · Oturum: ${translate(match[3])}`,
    },
    {
      pattern: /^Routing to\s+(.+)$/u,
      replace: (match) => `${translate(match[1])} oturumuna yönlendiriliyor`,
    },
  ];
}

function createRelativeTimePatterns(): PatternTranslation[] {
  return [
    { pattern: /^(\d+) earlier events not shown$/u, replace: (match) => `${match[1]} önceki etkinlik gösterilmiyor` },
    { pattern: /^Updated (\d+)m ago$/u, replace: (match) => `${match[1]} dk önce güncellendi` },
    { pattern: /^Updated (\d+)h ago$/u, replace: (match) => `${match[1]} sa önce güncellendi` },
    { pattern: /^Updated (\d+)d ago$/u, replace: (match) => `${match[1]} gün önce güncellendi` },
    { pattern: /^Updated just now$/u, replace: () => 'Az önce güncellendi' },
    { pattern: /^(\d+)m ago$/u, replace: (match) => `${match[1]} dk önce` },
    { pattern: /^(\d+)h ago$/u, replace: (match) => `${match[1]} sa önce` },
  ];
}

function createCliSurfaceSummaryPatterns(translate: Translate): PatternTranslation[] {
  return [
    {
      pattern: /^(\d+) session(s?) · (\d+) changed file(s?)$/u,
      replace: (match) => `${match[1]} oturum · ${match[3]} değişen dosya`,
    },
    {
      pattern: /^Status:\s*(\S+)\s+Session:\s*(.+)\s+Drag to reorder$/u,
      replace: (match) => `Durum: ${translate(match[1])} · Oturum: ${match[2]} · Yeniden sıralamak için sürükle`,
    },
    {
      pattern: /^CLI Surface\s+Profile:\s*(.+)$/u,
      replace: (match) => `CLI Yüzeyi · Profil: ${translate(match[1])}`,
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
      pattern: /^(\d+) MCP server(s?) connected$/u,
      replace: (match) => `${match[1]} MCP sunucusu bağlı`,
    },
    {
      pattern: /^(\d+) agent(s?) available$/u,
      replace: (match) => `${match[1]} ajan kullanılabilir`,
    },
    {
      pattern: /^(\d+) skill(s?) ready$/u,
      replace: (match) => `${match[1]} beceri hazır`,
    },
    {
      pattern: /^(\d+) custom command(s?) available$/u,
      replace: (match) => `${match[1]} özel komut kullanılabilir`,
    },
    {
      pattern: /^(.+)\s+·\s+(live|starting|stopped|error|idle)$/u,
      replace: (match) => `${match[1]} · ${translate(match[2])}`,
    },
  ];
}

function createInspectorAndErrorPatterns(): PatternTranslation[] {
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
      pattern: /^Teammate idle: (.+)$/u,
      replace: (match) => `Ekip arkadaşı boşta: ${match[1]}`,
    },
    {
      pattern: /^(.+)\s+is not reachable right now\. Start the local app again, then reload or rescan localhost\.$/u,
      replace: (match) => `${match[1]} şu anda erişilebilir değil. Yerel uygulamayı tekrar başlatın, sonra yeniden yükleyin veya localhost'u yeniden tarayın.`,
    },
    {
      pattern: /^(.+)\s+could not be opened right now\. Try reloading, pasting a different URL, or choosing another local surface\.$/u,
      replace: (match) => `${match[1]} şu anda açılamadı. Yeniden yüklemeyi, farklı bir URL yapıştırmayı veya başka bir yerel yüzey seçmeyi deneyin.`,
    },
    {
      pattern: /^Launching (iOS Simulator|Android Emulator)…$/u,
      replace: (match) => `${match[1] === 'iOS Simulator' ? 'iOS Simülatör' : 'Android Emülatör'} başlatılıyor…`,
    },
    {
      pattern: /^Capturing (iOS Simulator|Android Emulator) screenshot…$/u,
      replace: (match) => `${match[1] === 'iOS Simulator' ? 'iOS Simülatör' : 'Android Emülatör'} ekran görüntüsü alınıyor…`,
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
  ];
}

export function createPatternTranslations(translate: Translate): PatternTranslation[] {
  return [
    ...createWorkflowAndInstallPatterns(translate),
    ...createPolicyAndRoutingPatterns(translate),
    ...createRelativeTimePatterns(),
    ...createCliSurfaceSummaryPatterns(translate),
    ...createInspectorAndErrorPatterns(),
  ];
}
