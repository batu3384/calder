import { appState } from './state.js';
import type { UiLanguage } from '../shared/types.js';

const DEFAULT_LANGUAGE: UiLanguage = 'en';

const EXCLUDED_SELECTOR = [
  'pre',
  'code',
  'textarea',
  'webview',
  '.xterm',
  '.xterm-viewport',
  '.xterm-screen',
  '.xterm-rows',
  '.xterm-helper-textarea',
  '.terminal-pane',
  '.project-terminal-container',
  '.remote-terminal-pane',
  '.ansi-buffer',
].join(', ');

const ATTRIBUTES_TO_LOCALIZE = ['title', 'aria-label', 'placeholder'] as const;

const DIRECT_TRANSLATIONS = new Map<string, string>([
  ['Project Index', 'Proje Dizini'],
  ['Toggle Sidebar (Cmd+B)', 'Kenar Çubuğunu Aç/Kapat (Cmd+B)'],
  ['Toggle sidebar', 'Kenar çubuğunu aç/kapat'],
  ['Preferences', 'Ayarlar'],
  ['Open preferences', 'Ayarları aç'],
  ['New Project (Ctrl+Shift+P)', 'Yeni Proje (Ctrl+Shift+P)'],
  ['Create new project', 'Yeni proje oluştur'],
  ['New Session (Ctrl+Shift+N)', 'Yeni Oturum (Ctrl+Shift+N)'],
  ['Create new session', 'Yeni oturum oluştur'],
  ['Quick Terminal', 'Hızlı Terminal'],
  ['Close Terminal', 'Terminali Kapat'],
  ['Workspace', 'Çalışma Alanı'],
  ['Overview', 'Genel Bakış'],
  ['Close Context Inspector', 'Bağlam Denetçisini Kapat'],
  ['Close context inspector', 'Bağlam denetçisini kapat'],
  ['Cancel', 'İptal'],
  ['Create', 'Oluştur'],
  ['Done', 'Tamam'],
  ['Back', 'Geri'],
  ['Close', 'Kapat'],
  ['Delete', 'Sil'],
  ['Rename', 'Yeniden Adlandır'],
  ['Open', 'Aç'],
  ['Preview', 'Önizle'],
  ['Restore', 'Geri Yükle'],
  ['Reset', 'Sıfırla'],
  ['Fix', 'Düzelt'],
  ['Fix All', 'Tümünü Düzelt'],
  ['Fixing…', 'Düzeltiliyor…'],
  ['Loading…', 'Yükleniyor…'],
  ['Checking...', 'Kontrol ediliyor...'],
  ['Checking configuration…', 'Yapılandırma kontrol ediliyor…'],
  ['Workspace Center', 'Çalışma Alanı Merkezi'],
  ['Calder workspace', 'Calder çalışma alanı'],
  ['Defaults, layout, integrations, and the rules that shape every session.', 'Varsayılanlar, düzen, entegrasyonlar ve her oturumu şekillendiren kurallar.'],
  ['Session', 'Oturum'],
  ['Layout', 'Düzen'],
  ['Keys', 'Kısayollar'],
  ['Integrations', 'Entegrasyonlar'],
  ['About', 'Hakkında'],
  ['How Calder starts and remembers work', 'Calder\'ın nasıl başladığı ve çalışmayı nasıl hatırladığı'],
  ['Surface and rail visibility defaults', 'Yüzey ve panel görünürlük varsayılanları'],
  ['Command bindings and overrides', 'Komut atamaları ve özelleştirmeler'],
  ['Tool health, orchestration phases, and tracking', 'Araç sağlığı, orkestrasyon fazları ve izleme'],
  ['Version, updates, and project links', 'Sürüm, güncellemeler ve proje bağlantıları'],
  ['Launch defaults', 'Başlangıç varsayılanları'],
  ['Choose how Calder opens new work, how it names sessions, and which signals stay on while you code.', 'Calder\'ın yeni işleri nasıl açacağını, oturumları nasıl adlandıracağını ve kod yazarken hangi sinyallerin açık kalacağını seçin.'],
  ['Language', 'Dil'],
  ['English', 'İngilizce'],
  ['Türkçe', 'Türkçe'],
  ['Applies to the full Calder interface.', 'Tüm Calder arayüzüne uygulanır.'],
  ['Interface language', 'Arayüz dili'],
  ['Language changes apply after the interface refreshes.', 'Dil değişiklikleri arayüz yenilendikten sonra uygulanır.'],
  ['Default coding tool', 'Varsayılan kodlama aracı'],
  ['Calder falls back to the next installed tool if this one is missing.', 'Bu araç yoksa Calder bir sonraki yüklü araca geçer.'],
  ['New sessions use this tool unless a workflow picks a different one.', 'Bir iş akışı farklı birini seçmediği sürece yeni oturumlar bu aracı kullanır.'],
  ['This default is not installed on this Mac. Calder will fall back to the next installed tool until you install it.', 'Bu varsayılan araç bu Mac\'te kurulu değil. Siz kurana kadar Calder bir sonraki yüklü araca geçer.'],
  ['Play sound when session finishes work', 'Oturum işi bitirdiğinde ses çal'],
  ['Desktop notifications when sessions need attention', 'Oturumlar dikkat gerektirdiğinde masaüstü bildirimi göster'],
  ['Record session history when sessions close', 'Oturum kapandığında geçmişi kaydet'],
  ['Show insight alerts', 'İçgörü uyarılarını göster'],
  ['Auto-name sessions from conversation title', 'Oturumları konuşma başlığından otomatik adlandır'],
  ['Default tool', 'Varsayılan araç'],
  ['Used when a new session has no explicit provider.', 'Yeni bir oturumda açıkça bir sağlayıcı seçilmediyse kullanılır.'],
  ['History', 'Geçmiş'],
  ['On', 'Açık'],
  ['Off', 'Kapalı'],
  ['Closed sessions can stay searchable in the run log.', 'Kapanan oturumlar çalışma günlüğünde aranabilir kalır.'],
  ['Alerts', 'Uyarılar'],
  ['Desktop', 'Masaüstü'],
  ['In-app only', 'Yalnızca uygulama içi'],
  ['Sound and notification behavior stays local to this workspace.', 'Ses ve bildirim davranışı bu çalışma alanına özeldir.'],
  ['Workspace', 'Çalışma Alanı'],
  ['Stage layout', 'Sahne düzeni'],
  ['Keep the left surface stable while deciding which support modules stay visible around active sessions.', 'Etkin oturumların etrafında hangi destek modüllerinin görünür kalacağını belirlerken sol yüzeyi sabit tutun.'],
  ['Ops rail', 'Operasyon paneli'],
  ['Ops Rail modules', 'Operasyon paneli modülleri'],
  ['Choose which support modules stay visible in the right-side operations rail.', 'Sağ taraftaki operasyon panelinde hangi destek modüllerinin görünür kalacağını seçin.'],
  ['Live View behavior', 'Canlı Görünüm davranışı'],
  ['Live View stays anchored on the left when a browser session is open so page context never disappears.', 'Tarayıcı oturumu açıkken Canlı Görünüm solda sabit kalır, böylece sayfa bağlamı kaybolmaz.'],
  ['Session Deck defaults', 'Oturum Alanı varsayılanları'],
  ['Tune the shared AI work area and the strip above active sessions.', 'Paylaşılan yapay zekâ çalışma alanını ve etkin oturumların üstündeki şeridi ayarlayın.'],
  ['Toolkit', 'Araç Seti'],
  ['Git', 'Git'],
  ['Run log', 'Çalıştırma günlüğü'],
  ['Spend chip', 'Maliyet rozeti'],
  ['Browser sessions automatically hold the left stage so inspection and handoff stay visible while you work.', 'Tarayıcı oturumları sol sahneyi otomatik sabitler, böylece inceleme ve devir süreci çalışırken görünür kalır.'],
  ['Keyboard', 'Klavye'],
  ['Working keys', 'Çalışma kısayolları'],
  ['Keep the shortcuts you use every day close to hand and override only the ones that really help.', 'Her gün kullandığınız kısayolları yakın tutun ve sadece gerçekten faydalı olanları özelleştirin.'],
  ['Customized', 'Özelleştirilmiş'],
  ['Only explicit overrides are tracked here.', 'Burada yalnızca açıkça yapılan özelleştirmeler izlenir.'],
  ['Focus', 'Odak'],
  ['Session + surface', 'Oturum + yüzey'],
  ['Bindings cover sessions, the left stage, and shell navigation.', 'Kısayollar oturumları, sol sahneyi ve kabuk gezintisini kapsar.'],
  ['Style', 'Stil'],
  ['Command-first', 'Komut odaklı'],
  ['Record a new combo directly from the keyboard when you need one.', 'İhtiyaç duyduğunuzda yeni kombinasyonu doğrudan klavyeden kaydedin.'],
  ['Press keys...', 'Tuşlara basın...'],
  ['Reset to default', 'Varsayılana sıfırla'],
  ['Integrations', 'Entegrasyonlar'],
  ['Tool connections', 'Araç bağlantıları'],
  ['Check binaries, hooks, and tracking health without leaving the workspace.', 'Çalışma alanından çıkmadan binary, hook ve izleme sağlığını kontrol edin.'],
  ['Checks', 'Kontroller'],
  ['Live', 'Canlı'],
  ['Binary status and tracking checks are refreshed from the local setup.', 'Binary durumu ve izleme kontrolleri yerel kurulumdan yenilenir.'],
  ['Tracking', 'İzleme'],
  ['Status line + hooks', 'Durum satırı + hook\'lar'],
  ['Cost, context, and session activity depend on these staying healthy.', 'Maliyet, bağlam ve oturum etkinliği bunların sağlıklı kalmasına bağlıdır.'],
  ['Scope', 'Kapsam'],
  ['All coding tools', 'Tüm kodlama araçları'],
  ['Claude, Codex, Gemini, Qwen, and the rest share one health view.', 'Claude, Codex, Gemini, Qwen ve diğerleri aynı sağlık görünümünü paylaşır.'],
  ['Ready', 'Hazır'],
  ['Needs attention', 'Dikkat gerekiyor'],
  ['Installed', 'Kurulu'],
  ['Not found', 'Bulunamadı'],
  ['Configured', 'Yapılandırıldı'],
  ['Not configured', 'Yapılandırılmadı'],
  ['Overwritten by another tool', 'Başka bir araç tarafından üzerine yazıldı'],
  ['All hooks installed', 'Tüm hook\'lar kurulu'],
  ['No hooks installed', 'Hiç hook kurulu değil'],
  ['Some hooks missing', 'Bazı hook\'lar eksik'],
  ['Status Line', 'Durum Satırı'],
  ['Session Hooks', 'Oturum Hook\'ları'],
  ['Required for cost tracking and context window monitoring.', 'Maliyet takibi ve bağlam penceresi izleme için gereklidir.'],
  ['Required for session activity tracking.', 'Oturum etkinliği takibi için gereklidir.'],
  ['Project', 'Proje'],
  ['Calder', 'Calder'],
  ['Version: loading...', 'Sürüm: yükleniyor...'],
  ['A focused desktop workspace for browser context, CLI surfaces, and AI session flow.', 'Tarayıcı bağlamı, CLI yüzeyleri ve yapay zekâ oturum akışı için odaklı bir masaüstü çalışma alanı.'],
  ['Check for Updates', 'Güncellemeleri Kontrol Et'],
  ['You’re up to date.', 'Güncelsiniz.'],
  ['Update check failed.', 'Güncelleme kontrolü başarısız oldu.'],
  ['GitHub', 'GitHub'],
  ['Report a Bug', 'Hata Bildir'],
  ['Calder is open source. ', 'Calder açık kaynaklıdır. '],
  ['Contribute on GitHub', 'GitHub\'da katkı sağla'],
  ['Debug Mode', 'Hata Ayıklama Modu'],
  ['Channel', 'Kanal'],
  ['Desktop app', 'Masaüstü uygulama'],
  ['This workspace is tuned for side-by-side surface and session work.', 'Bu çalışma alanı yan yana yüzey ve oturum çalışmasına göre ayarlanmıştır.'],
  ['Source', 'Kaynak'],
  ['Open source', 'Açık kaynak'],
  ['The repo and issue tracker stay one click away.', 'Repo ve issue takip sistemi tek tık uzağınızda.'],
  ['Updates', 'Güncellemeler'],
  ['Manual check', 'Manuel kontrol'],
  ['Run a direct check whenever you want to confirm a newer build.', 'Yeni bir sürüm olup olmadığını doğrulamak istediğinizde doğrudan kontrol edin.'],
  ['Quick Open', 'Hızlı Aç'],
  ['Search files in the current workspace and jump straight into them.', 'Mevcut çalışma alanında dosya ara ve doğrudan aç.'],
  ['No matching files', 'Eşleşen dosya yok'],
  ['Start typing to search files', 'Aramak için yazmaya başlayın'],
  ['Search', 'Ara'],
  ['Help', 'Yardım'],
  ['Usage Stats', 'Kullanım İstatistikleri'],
  ['Refresh', 'Yenile'],
  ['Loading...', 'Yükleniyor...'],
  ['Last 7 Days', 'Son 7 Gün'],
  ['Model Usage', 'Model Kullanımı'],
  ['Activity by Hour', 'Saatlik Etkinlik'],
  ['No usage data found yet. Stats appear after supported CLI sessions record activity.', 'Henüz kullanım verisi yok. Desteklenen CLI oturumları etkinlik kaydettikten sonra istatistikler görünür.'],
  ['What\'s New in v', 'v sürümünde yenilikler'],
  ['Got it', 'Anladım'],
  ['P2P Session', 'P2P Oturumu'],
  ['Share Session', 'Oturum Paylaş'],
  ['Join Remote Session', 'Uzak Oturuma Katıl'],
  ['Access level', 'Erişim seviyesi'],
  ['Copy Code', 'Kodu Kopyala'],
  ['Copied!', 'Kopyalandı!'],
  ['Copy Response', 'Yanıtı Kopyala'],
  ['Join', 'Katıl'],
  ['Connecting...', 'Bağlanıyor...'],
  ['Generating response code...', 'Yanıt kodu oluşturuluyor...'],
  ['CLI Surface Suggestions', 'CLI Surface Önerileri'],
  ['No launch command detected yet.', 'Henüz bir başlatma komutu algılanmadı.'],
  ['Try Calder\'s built-in demo to preview the workflow, or set up your own CLI command manually.', 'İş akışını önizlemek için Calder\'ın yerleşik demosunu deneyin veya kendi CLI komutunuzu manuel olarak kurun.'],
  ['Best match', 'En iyi eşleşme'],
  ['Mixed workspace', 'Karma çalışma alanı'],
  ['Node workspace', 'Node çalışma alanı'],
  ['Python workspace', 'Python çalışma alanı'],
  ['Rust workspace', 'Rust çalışma alanı'],
  ['Go workspace', 'Go çalışma alanı'],
  ['CLI workspace', 'CLI çalışma alanı'],
  ['Run', 'Çalıştır'],
  ['Edit', 'Düzenle'],
  ['Try demo', 'Demoyu dene'],
  ['Manual setup', 'Manuel kurulum'],
  ['Open in Live View', 'Canlı Görünümde Aç'],
  ['Open workspace shell', 'Çalışma alanı kabuğunu aç'],
  ['Restart preview runtime', 'Önizleme çalışma zamanını yeniden başlat'],
  ['Restart failed', 'Yeniden başlatma başarısız'],
  ['Restarting…', 'Yeniden başlatılıyor…'],
  ['Live View', 'Canlı Görünüm'],
  ['Capture context', 'Bağlamı yakala'],
  ['Ready to capture', 'Yakalamaya hazır'],
  ['Offline', 'Çevrimdışı'],
  ['Runtime', 'Çalışma Zamanı'],
  ['Capture', 'Yakalama'],
  ['Manual checkpoint', 'Manuel kontrol noktası'],
  ['New Checkpoint', 'Yeni Kontrol Noktası'],
  ['Checkpoint label', 'Kontrol noktası etiketi'],
  ['Checkpoint label is required', 'Kontrol noktası etiketi zorunludur'],
  ['Create checkpoint', 'Kontrol noktası oluştur'],
  ['Restore Checkpoint', 'Kontrol Noktasını Geri Yükle'],
  ['Restore mode', 'Geri yükleme modu'],
  ['Keep current layout (additive)', 'Mevcut düzeni koru (eklemeli)'],
  ['Replace current layout', 'Mevcut düzeni değiştir'],
  ['Saved', 'Kaydedilen'],
  ['Latest', 'Son'],
  ['Changed files', 'Değişen dosyalar'],
  ['Preview center', 'Önizleme merkezi'],
  ['No local preview targets are responding right now. Start a dev server and it will show up here.', 'Şu anda hiçbir yerel önizleme hedefi yanıt vermiyor. Bir geliştirme sunucusu başlatın, burada görünecektir.'],
  ['Scanning local preview targets…', 'Yerel önizleme hedefleri taranıyor…'],
  ['Open a CLI session first', 'Önce bir CLI oturumu açın'],
  ['No CLI session', 'CLI oturumu yok'],
  ['Unknown error', 'Bilinmeyen hata'],
  ['Working tree clean', 'Çalışma ağacı temiz'],
  ['This folder is not a Git repo yet', 'Bu klasör henüz bir Git deposu değil'],
  ['Git is clean', 'Git temiz'],
  ['Close All Sessions', 'Tüm Oturumları Kapat'],
  ['Remove Project', 'Projeyi Kaldır'],
  ['Remove project', 'Projeyi kaldır'],
  ['New Project', 'Yeni Proje'],
  ['Name', 'Ad'],
  ['Path', 'Yol'],
  ['Browse', 'Gözat'],
  ['My Project', 'Projem'],
  ['/path/to/project', '/proje/yolu'],
  ['Directory does not exist', 'Dizin mevcut değil'],
  ['Agent', 'Ajan'],
  ['Notification', 'Bildirim'],
  ['Session started', 'Oturum başlatıldı'],
  ['Session ended', 'Oturum sonlandı'],
  ['User prompt submitted', 'Kullanıcı istemi gönderildi'],
  ['Response completed', 'Yanıt tamamlandı'],
  ['Response stopped with error', 'Yanıt hata ile durdu'],
  ['Waiting for permission', 'İzin bekleniyor'],
  ['Context compaction starting', 'Bağlam sıkıştırma başlıyor'],
  ['Context compaction complete', 'Bağlam sıkıştırma tamamlandı'],
  ['Task created', 'Görev oluşturuldu'],
  ['Task completed', 'Görev tamamlandı'],
  ['Worktree created', 'Worktree oluşturuldu'],
  ['Worktree removed', 'Worktree kaldırıldı'],
  ['Working directory changed', 'Çalışma dizini değişti'],
  ['File changed', 'Dosya değişti'],
  ['Config changed', 'Yapılandırma değişti'],
  ['Elicitation requested', 'Soru yöneltildi'],
  ['Elicitation answered', 'Soru yanıtlandı'],
  ['Instructions loaded', 'Talimatlar yüklendi'],
  ['No additional details', 'Ek detay yok'],
  ['Raw Tool', 'Ham Araç'],
  ['Close All', 'Tümünü Kapat'],
  ['Close Others', 'Diğerlerini Kapat'],
  ['Close to the Right', 'Sağdakileri Kapat'],
  ['Close to the Left', 'Soldakileri Kapat'],
  ['Move Left', 'Sola Taşı'],
  ['Move Right', 'Sağa Taşı'],
  ['Share Session…', 'Oturumu Paylaş…'],
  ['Stop Sharing', 'Paylaşımı Durdur'],
  ['Copy CLI Session ID', 'CLI Oturum Kimliğini Kopyala'],
  ['Copy Internal ID', 'Dahili Kimliği Kopyala'],
  ['Sharing', 'Paylaşılıyor'],
  ['Drag to reorder', 'Yeniden sıralamak için sürükle'],
  ['Close session', 'Oturumu kapat'],
  ['Loading branches…', 'Branchler yükleniyor…'],
  ['No matching branches', 'Eşleşen branch yok'],
  ['Create New Branch…', 'Yeni Branch Oluştur…'],
  ['Failed to load branches', 'Branchler yüklenemedi'],
  ['Branch name', 'Branch adı'],
  ['New Session', 'Yeni Oturum'],
  ['New Custom Session…', 'Yeni Özel Oturum…'],
  ['Join Remote Session…', 'Uzak Oturuma Katıl…'],
  ['New Browser Tab', 'Yeni Tarayıcı Sekmesi'],
  ['Arguments', 'Argümanlar'],
  ['e.g. --model sonnet', 'örn. --model sonnet'],
  ['Open a secure peer-to-peer handoff, choose the access level, and guide the other person through the connection flow.', 'Güvenli bir eşler arası devir başlatın, erişim seviyesini seçin ve diğer kişiyi bağlantı akışında yönlendirin.'],
  ['Your full terminal scrollback history will be shared with the peer.', 'Terminal geçmişinizin tamamı karşı tarafla paylaşılacaktır.'],
  ['Read-write mode allows the peer to type into your terminal and execute commands. Only share with people you trust.', 'Okuma-yazma modu karşı tarafın terminalinize yazmasına ve komut çalıştırmasına izin verir. Sadece güvendiğiniz kişilerle paylaşın.'],
  ['Share this one-time passphrase with your peer', 'Bu tek kullanımlık parolayı karşı tarafla paylaşın'],
  ['Generated passphrases are stronger than short numeric PINs and work best when copied as-is.', 'Oluşturulan parolalar kısa sayısal PIN\'lerden daha güçlüdür ve olduğu gibi kopyalandığında en iyi şekilde çalışır.'],
  ['One-time passphrase', 'Tek kullanımlık parola'],
  ['Send this code to your peer', 'Bu kodu karşı tarafa gönderin'],
  ['Paste your peer\'s response code', 'Karşı tarafın yanıt kodunu yapıştırın'],
  ['Next', 'İleri'],
  ['Start Sharing', 'Paylaşımı Başlat'],
  ['Connect', 'Bağlan'],
  ['Establishing connection...', 'Bağlantı kuruluyor...'],
  ['Generating code...', 'Kod oluşturuluyor...'],
  ['Generating connection code...', 'Bağlantı kodu oluşturuluyor...'],
  ['Share this passphrase with your peer', 'Bu parolayı karşı tarafla paylaşın'],
  ['Waiting for peer to connect...', 'Karşı tarafın bağlanması bekleniyor...'],
  ['Enter the host passphrase, paste the connection code, and Calder will generate the response you send back.', 'Sunucunun parolasını girin, bağlantı kodunu yapıştırın ve Calder size geri göndereceğiniz yanıt kodunu oluştursun.'],
  ['Enter the passphrase from the host', 'Sunucudan aldığınız parolayı girin'],
  ['Legacy 8-digit PINs are still supported when you connect to an older app version.', 'Eski uygulama sürümlerine bağlanırken 8 haneli eski PIN\'ler hâlâ desteklenir.'],
  ['Passphrase or legacy PIN', 'Parola veya eski PIN'],
  ['Paste the host\'s connection code', 'Sunucunun bağlantı kodunu yapıştırın'],
  ['Send this response code back to the host', 'Bu yanıt kodunu sunucuya geri gönderin'],
  ['Please paste the connection code from the host.', 'Lütfen sunucudan gelen bağlantı kodunu yapıştırın.'],
  ['Send the response code to the host. The session will appear once they connect.', 'Yanıt kodunu sunucuya gönderin. Bağlandıktan sonra oturum görünecektir.'],
  ['Could not decrypt connection code. Check the passphrase and try again.', 'Bağlantı kodu çözülemedi. Parolayı kontrol edip tekrar deneyin.'],
  ['Resume', 'Devam Et'],
  ['No run history yet', 'Henüz çalışma geçmişi yok'],
  ['Clear Log', 'Günlüğü Temizle'],
  ['Enabling…', 'Etkinleştiriliyor…'],
  ['Enable tracking', 'İzlemeyi etkinleştir'],
  ['Select Session', 'Oturum Seç'],
  ['Open Sessions', 'Açık Oturumlar'],
  ['Send to Custom Session…', 'Özel Oturuma Gönder…'],
  ['Scanning for active localhost targets…', 'Etkin localhost hedefleri taranıyor…'],
  ['Scanning…', 'Taranıyor…'],
  ['Record browser flow', 'Tarayıcı akışını kaydet'],
  ['Choose target session', 'Hedef oturumu seç'],
  ['Select Session ▾', 'Oturum Seç ▾'],
  ['Select an open session target first.', 'Önce açık bir hedef oturum seçin.'],
  ['Open or select a CLI session first.', 'Önce bir CLI oturumu açın veya seçin.'],
  ['Failed to deliver prompt to the selected session.', 'İstem seçili oturuma gönderilemedi.'],
  ['Failed to capture screenshot. Try again.', 'Ekran görüntüsü alınamadı. Tekrar deneyin.'],
  ['Open address', 'Adresi aç'],
  ['Status: ready', 'Durum: hazır'],
  ['Match Case', 'Büyük/Küçük Harf Eşleşsin'],
  ['Use Regular Expression', 'Düzenli İfade Kullan'],
  ['Previous Match (Shift+Enter)', 'Önceki Eşleşme (Shift+Enter)'],
  ['Next Match (Enter)', 'Sonraki Eşleşme (Enter)'],
  ['Close (Escape)', 'Kapat (Escape)'],
  ['Remove from history', 'Geçmişten kaldır'],
  ['Remove step', 'Adımı kaldır'],
  ['Selector', 'Seçici'],
  ['Select an element', 'Bir öğe seçin'],
  ['Click a page element to capture its selector and send a focused prompt.', 'Seçicisini yakalamak ve odaklı bir istem göndermek için sayfadaki bir öğeye tıklayın.'],
]);

type PatternTranslation = {
  pattern: RegExp;
  replace: (match: RegExpMatchArray) => string;
};

const PATTERN_TRANSLATIONS: PatternTranslation[] = [
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
    pattern: /^Calder found (\d+) runnable option(s?) for this project\.$/u,
    replace: (match) => `Calder bu proje için çalıştırılabilir ${match[1]} seçenek buldu.`,
  },
  {
    pattern: /^(\d+) commands$/u,
    replace: (match) => `${match[1]} komut`,
  },
  {
    pattern: /^(\d+) earlier events not shown$/u,
    replace: (match) => `${match[1]} önceki etkinlik gösterilmiyor`,
  },
  {
    pattern: /^Updated (\d+)m ago$/u,
    replace: (match) => `${match[1]} dk önce güncellendi`,
  },
  {
    pattern: /^Updated (\d+)h ago$/u,
    replace: (match) => `${match[1]} sa önce güncellendi`,
  },
  {
    pattern: /^Updated (\d+)d ago$/u,
    replace: (match) => `${match[1]} gün önce güncellendi`,
  },
  {
    pattern: /^Updated just now$/u,
    replace: () => 'Az önce güncellendi',
  },
  {
    pattern: /^(\d+) session(s?) · (\d+) changed file(s?)$/u,
    replace: (match) => `${match[1]} oturum · ${match[3]} değişen dosya`,
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
    pattern: /^Agent started: (.+)$/u,
    replace: (match) => `Ajan başlatıldı: ${match[1]}`,
  },
  {
    pattern: /^Teammate idle: (.+)$/u,
    replace: (match) => `Ekip arkadaşı boşta: ${match[1]}`,
  },
];

let activeLanguage: UiLanguage = DEFAULT_LANGUAGE;
let observer: MutationObserver | null = null;
let suppressObserver = false;
let pendingReloadTimer: number | null = null;

function normalizeLanguage(input: unknown): UiLanguage {
  return input === 'tr' ? 'tr' : 'en';
}

function withSuppressedObserver(work: () => void): void {
  suppressObserver = true;
  try {
    work();
  } finally {
    suppressObserver = false;
  }
}

function shouldSkipElement(element: Element | null): boolean {
  if (!element) return true;
  if (element.closest(EXCLUDED_SELECTOR)) return true;
  const tag = element.tagName;
  return tag === 'SCRIPT' || tag === 'STYLE';
}

function translate(value: string): string {
  if (activeLanguage !== 'tr') return value;
  const direct = DIRECT_TRANSLATIONS.get(value);
  if (direct) return direct;
  for (const entry of PATTERN_TRANSLATIONS) {
    const match = value.match(entry.pattern);
    if (match) return entry.replace(match);
  }
  return value;
}

function localizeTextNode(node: Text): void {
  const raw = node.nodeValue;
  if (!raw) return;
  if (!raw.trim()) return;
  const parent = node.parentElement;
  if (shouldSkipElement(parent)) return;

  const core = raw.trim();
  const translated = translate(core);
  if (translated === core) return;
  node.nodeValue = raw.replace(core, translated);
}

function localizeAttributes(element: Element): void {
  if (shouldSkipElement(element)) return;
  for (const attribute of ATTRIBUTES_TO_LOCALIZE) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const translated = translate(value);
    if (translated !== value) {
      element.setAttribute(attribute, translated);
    }
  }

  if (element instanceof HTMLInputElement) {
    if (element.type === 'button' || element.type === 'submit' || element.type === 'reset') {
      const translated = translate(element.value);
      if (translated !== element.value) {
        element.value = translated;
      }
    }
  }
}

function localizeNode(node: Node): void {
  if (activeLanguage !== 'tr') return;
  if (node.nodeType === Node.TEXT_NODE) {
    localizeTextNode(node as Text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  if (shouldSkipElement(element)) return;
  localizeAttributes(element);
  for (const child of element.childNodes) {
    localizeNode(child);
  }
}

function localizeDocument(): void {
  withSuppressedObserver(() => {
    if (document.body) {
      localizeNode(document.body);
    }
  });
}

function stopObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function startObserver(): void {
  if (!document.body || observer) return;
  observer = new MutationObserver((mutations) => {
    if (activeLanguage !== 'tr' || suppressObserver) return;
    withSuppressedObserver(() => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            localizeNode(node);
          }
        } else if (mutation.type === 'characterData') {
          localizeTextNode(mutation.target as Text);
        } else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          localizeAttributes(mutation.target);
        }
      }
    });
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRIBUTES_TO_LOCALIZE, 'value'],
  });
}

function applyLanguage(language: UiLanguage): void {
  activeLanguage = language;
  document.documentElement.lang = language;
  if (language === 'tr') {
    localizeDocument();
    startObserver();
    return;
  }
  stopObserver();
}

export function initLocalization(): void {
  applyLanguage(normalizeLanguage(appState.preferences.language));
  appState.on('preferences-changed', () => {
    const nextLanguage = normalizeLanguage(appState.preferences.language);
    if (nextLanguage === activeLanguage) return;
    if (nextLanguage === 'tr') {
      if (pendingReloadTimer !== null) {
        window.clearTimeout(pendingReloadTimer);
        pendingReloadTimer = null;
      }
      applyLanguage('tr');
      return;
    }

    // We mutate text nodes while translating to Turkish, so switching back to English
    // requires a clean renderer reload.
    if (pendingReloadTimer !== null) {
      window.clearTimeout(pendingReloadTimer);
    }
    pendingReloadTimer = window.setTimeout(() => {
      pendingReloadTimer = null;
      window.location.reload();
    }, 420);
  });
}
