import type { UiLanguage } from '../../shared/types/provider.js';

export type ConfigMetadataKind = 'skill' | 'command';

const TURKISH_SKILL_SUMMARIES = new Map<string, string>([
  ['skill-creator', 'Yeni beceri oluşturma, mevcut becerileri geliştirme ve performans ölçümü için kullanılır.'],
  ['claude-md-improver', 'Repodaki CLAUDE.md dosyalarını denetler ve hedefli iyileştirmeler yapar.'],
  ['claude-automation-recommender', 'Kod tabanı için Claude Code otomasyonları ve kurulum önerileri üretir.'],
  ['hf-cli', 'Hugging Face Hub CLI ile model, veri kümesi ve Space yönetimi yapar.'],
  ['huggingface-community-evals', 'Hugging Face modellerini yerel donanımda değerlendirme akışını yürütür.'],
  ['huggingface-datasets', 'Dataset Viewer API ile metadata, satır ve parquet verisini inceler.'],
  ['huggingface-gradio', 'Python ile Gradio arayüzleri ve demoları oluşturur.'],
  ['huggingface-jobs', 'Hugging Face Jobs üzerinde genel amaçlı iş yüklerini çalıştırmayı yönlendirir.'],
  ['huggingface-llm-trainer', 'LLM eğitim ve ince ayar işlerini Hugging Face Jobs üzerinde kurar.'],
  ['huggingface-paper-publisher', 'Araştırma makalelerini Hugging Face Hub üzerinde yayınlar ve yönetir.'],
  ['huggingface-papers', 'Hugging Face paper sayfalarını okur ve araştırma makalelerini özetler.'],
  ['huggingface-trackio', 'Trackio ile eğitim deneylerini izler ve görselleştirir.'],
  ['huggingface-vision-trainer', 'Görüntü modellerinin eğitim ve ince ayar akışını Hugging Face Jobs üzerinde kurar.'],
  ['transformers-js', 'Transformers.js ile tarayıcıda veya Node.js içinde model çalıştırmayı yönlendirir.'],
  ['playground', 'Canlı önizlemeli etkileşimli HTML playgroundları oluşturur.'],
  ['frontend-design', 'Yüksek tasarım kalitesine sahip üretim seviyesi frontend arayüzleri üretir.'],
  ['writing-hookify-rules', 'Hookify kuralları yazma ve yapılandırma konusunda yönlendirir.'],
  ['agent-development', 'Claude Code için ajan yapısı, frontmatter ve tetikleme kurallarını tasarlar.'],
  ['command-development', 'Slash komut yapısı, argümanlar ve etkileşimli komut akışlarını kurar.'],
  ['hook-development', 'Claude Code hooklarını güvenli ve gelişmiş biçimde tasarlar.'],
  ['mcp-integration', 'Claude Code eklentilerine MCP sunucusu entegrasyonu kurar.'],
  ['plugin-settings', 'Eklenti ayarlarını, yerel durum dosyalarını ve yapılandırma akışını düzenler.'],
  ['plugin-structure', 'Claude Code eklenti klasör yapısını ve manifest düzenini kurar.'],
  ['skill-development', 'Yeni beceri yazımı ve beceri içeriğinin düzenlenmesi için yönlendirir.'],
  ['pinecone:assistant', 'Pinecone Assistant oluşturma, belge yükleme ve soru-cevap akışlarını yönetir.'],
  ['pinecone:cli', 'Pinecone CLI ile index, namespace ve vektör yönetimini yönlendirir.'],
  ['pinecone:docs', 'Pinecone API ve veri formatları için derlenmiş dokümantasyon rehberi sunar.'],
  ['pinecone:help', 'Pinecone becerilerinin ne işe yaradığını ve başlangıç kurulumunu açıklar.'],
  ['pinecone:mcp', 'Pinecone MCP sunucusundaki araçları ve parametrelerini açıklar.'],
  ['pinecone:query', 'Entegre Pinecone indexlerinde metin tabanlı sorgu akışını kurar.'],
  ['pinecone:quickstart', 'Yeni başlayanlar için adım adım Pinecone başlangıç akışı sunar.'],
  ['brainstorming', 'Uygulamaya geçmeden önce fikirleri tasarım ve kapsam kararlarına dönüştürür.'],
  ['dispatching-parallel-agents', 'Bağımsız işleri paralel alt ajanlara bölerek hızlandırır.'],
  ['executing-plans', 'Yazılmış uygulama planlarını kontrollü adımlarla uygular.'],
  ['finishing-a-development-branch', 'Geliştirme bitince birleşme, PR ve kapanış akışını düzenler.'],
  ['receiving-code-review', 'Gelen code review yorumlarını teknik doğrulukla değerlendirir.'],
  ['requesting-code-review', 'İş bitiminde kapsamlı code review isteme akışını başlatır.'],
  ['subagent-driven-development', 'Plan uygulanırken bağımsız işleri alt ajanlara dağıtır.'],
  ['systematic-debugging', 'Hata kök nedenini sistematik biçimde buldurur.'],
  ['test-driven-development', 'Önce testi yazıp sonra minimal çözüm üretme akışını uygular.'],
  ['using-git-worktrees', 'İzolasyon gereken işlerde güvenli git worktree akışı kurar.'],
  ['using-superpowers', 'Konuşma başında doğru beceri ve süper güç akışını başlatır.'],
  ['verification-before-completion', 'Tamamlandı demeden önce test, build ve kanıt kontrolü yaptırır.'],
  ['writing-plans', 'Spec veya gereksinimlerden ayrıntılı uygulama planı çıkarır.'],
  ['writing-skills', 'Yeni beceri oluşturma ve mevcut becerileri iyileştirme akışını yönetir.'],
  ['autofix', 'CodeRabbit yorumlarını toplayıp toplu veya etkileşimli düzeltme akışı sunar.'],
  ['code-review', 'CodeRabbit destekli kod incelemesi yapar.'],
  ['algorithmic-art', 'p5.js ile özgün algoritmik sanat üretimi yönlendirir.'],
  ['brand-guidelines', 'Anthropic marka dili ve görsel standartlarını uygular.'],
  ['canvas-design', 'Statik poster ve görsel tasarımlar üretir.'],
  ['doc-coauthoring', 'Belgeleri birlikte yazma ve iteratif iyileştirme akışını yönlendirir.'],
  ['docx', 'Word belgeleri oluşturma, düzenleme ve dönüştürme işlerini yönetir.'],
  ['internal-comms', 'İç iletişim metinlerini şirket formatlarına uygun hazırlar.'],
  ['mcp-builder', 'Yüksek kaliteli MCP sunucuları tasarlama ve oluşturma rehberi sunar.'],
  ['pdf', 'PDF okuma, birleştirme, oluşturma ve OCR akışlarını yönetir.'],
  ['pptx', 'Sunum dosyalarını oluşturma, okuma ve düzenleme akışını yürütür.'],
  ['slack-gif-creator', 'Slack için optimize edilmiş animasyonlu GIF üretimi sağlar.'],
  ['theme-factory', 'Farklı artefaktlara hazır veya özel tema uygular.'],
  ['web-artifacts-builder', 'React, Tailwind ve shadcn ile zengin HTML artefaktlar kurar.'],
  ['webapp-testing', 'Playwright ile yerel web uygulamalarını test eder ve doğrular.'],
  ['xlsx', 'Spreadsheet dosyalarını oluşturur, temizler ve dönüştürür.'],
  ['qodo-get-rules', 'Göreve en uygun Qodo kurallarını yükler.'],
  ['qodo-pr-resolver', 'Qodo PR geri bildirimlerini inceleyip çözüm akışı sunar.'],
  ['app-icon-design', 'Mobil uygulama ikonları ve logo varyasyonları tasarlar.'],
  ['mmx-cli', 'MiniMax modelleri ile metin, görsel, video ve ses üretimini yönlendirir.'],
  ['mobile-logo-iteration', 'Logo ve ikon tasarımlarını geri bildirime göre rafine eder.'],
]);

const TURKISH_COMMAND_SUMMARIES = new Map<string, string>([
  ['commit', 'Düzenli commit mesajlarıyla temiz commit oluşturur.'],
]);

export function localizeConfigMetadataSummary(
  kind: ConfigMetadataKind,
  name: string,
  description: string,
  language: UiLanguage,
): string {
  if (language !== 'tr') return description;
  const normalizedName = kind === 'command'
    ? name.replace(/^\//u, '').trim()
    : name.trim();
  const summaries = kind === 'skill' ? TURKISH_SKILL_SUMMARIES : TURKISH_COMMAND_SUMMARIES;
  return summaries.get(normalizedName) ?? description;
}
