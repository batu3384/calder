import { appState } from '../state.js';
import { showMcpAddModal } from './mcp-add-modal.js';
import { isTrackingHealthy } from '../../shared/tracking-health.js';
import type { UiLanguage } from '../../shared/types.js';
import type {
  AutoApprovalMode,
  AutoApprovalPolicySource,
  ProviderConfig,
  ProviderId,
  McpServer,
  Agent,
  Skill,
  Command,
  CliProviderMeta,
  ProjectGovernanceAutoApprovalState,
  ProjectGovernanceState,
  SettingsValidationResult,
} from '../types.js';

const collapsed: Record<string, boolean> = {};
let refreshGeneration = 0;
let refreshQueued = false;

type ToolchainSection = {
  id: string;
  title: string;
  items: HTMLElement[];
  count: number;
  onAdd?: () => void;
  emptyText?: string;
};

type ConfigMetadataKind = 'skill' | 'command';

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
  ['mmx-cli', 'MiniMax CLI ile metin, görsel, video ve ses üretimini yönlendirir.'],
  ['mobile-logo-iteration', 'Logo ve ikon tasarımlarını geri bildirime göre rafine eder.'],
]);

const TURKISH_COMMAND_SUMMARIES = new Map<string, string>([
  ['commit', 'Düzenli commit mesajlarıyla temiz commit oluşturur.'],
]);

const AUTO_APPROVAL_MODE_LABELS: Record<AutoApprovalMode, string> = {
  off: 'Off',
  edit_only: 'Edit Only',
  edit_plus_safe_tools: 'Edit + Safe Tools',
  full_auto: 'Full Auto (All)',
};

const AUTO_APPROVAL_MODE_LABELS_TR: Record<AutoApprovalMode, string> = {
  off: 'Kapalı',
  edit_only: 'Sadece Düzenleme',
  edit_plus_safe_tools: 'Düzenleme + Güvenli Komutlar',
  full_auto: 'Tam Otomatik (Tümü)',
};

const AUTO_APPROVAL_MODE_OPTIONS: Array<{ value: AutoApprovalMode; label: string }> = [
  { value: 'off', label: AUTO_APPROVAL_MODE_LABELS.off },
  { value: 'edit_only', label: AUTO_APPROVAL_MODE_LABELS.edit_only },
  { value: 'edit_plus_safe_tools', label: AUTO_APPROVAL_MODE_LABELS.edit_plus_safe_tools },
  { value: 'full_auto', label: AUTO_APPROVAL_MODE_LABELS.full_auto },
];
const PROJECT_INHERIT_VALUE = '__inherit_global__';
const SESSION_INHERIT_VALUE = '';
const queueFrame = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (callback: FrameRequestCallback): number => setTimeout(() => callback(Date.now()), 0);

const AUTO_APPROVAL_SCOPE_HELP = {
  global: 'Default policy for this Mac.',
  project: 'Repository-level policy.',
  session: 'Temporary policy for the active session.',
} as const;

function isTurkishUiLanguage(): boolean {
  return appState.preferences.language === 'tr';
}

function localizedText(english: string, turkish: string): string {
  return isTurkishUiLanguage() ? turkish : english;
}

function autoApprovalModeLabel(mode: AutoApprovalMode): string {
  return isTurkishUiLanguage()
    ? AUTO_APPROVAL_MODE_LABELS_TR[mode]
    : AUTO_APPROVAL_MODE_LABELS[mode];
}

function projectInheritLabel(): string {
  return localizedText('Use Global Default', 'Global varsayılanını kullan');
}

function sessionInheritLabel(): string {
  return localizedText('Use Project / Global Default', 'Proje / Global varsayılanını kullan');
}

function autoApprovalSourceLabel(source: AutoApprovalPolicySource): string {
  const tr = isTurkishUiLanguage();
  switch (source) {
    case 'session':
      return tr ? 'Oturum geçersiz kılması' : 'Session override';
    case 'project':
      return tr ? 'Proje politikası' : 'Project policy';
    case 'global':
      return tr ? 'Global varsayılan' : 'Global default';
    case 'fallback':
    default:
      return tr ? 'Yedek varsayılan' : 'Fallback default';
  }
}

function autoApprovalModeBehavior(mode: AutoApprovalMode): string {
  const tr = isTurkishUiLanguage();
  if (mode === 'off') {
    return tr
      ? 'Her işlemden önce onay ister.'
      : 'Always asks for approval before actions.';
  }
  if (mode === 'edit_only') {
    return tr
      ? 'Yalnızca dosya düzenlemelerini otomatik onaylar.'
      : 'Auto-approves file edits only.';
  }
  if (mode === 'edit_plus_safe_tools') {
    return tr
      ? 'Dosya düzenlemeleri ve güvenli salt-okunur komutları otomatik onaylar.'
      : 'Auto-approves file edits and safe read-only commands.';
  }
  return tr
    ? 'Riskli ve yıkıcı eylemler dahil tüm işlemleri otomatik onaylar.'
    : 'Auto-approves every operation, including risky and destructive actions.';
}

function autoApprovalModeGuideSummary(mode: AutoApprovalMode): string {
  const tr = isTurkishUiLanguage();
  if (mode === 'off') {
    return tr ? 'İşlemleri onaylamadan önce sorar.' : 'Asks before approving operations.';
  }
  if (mode === 'edit_only') {
    return tr ? 'Dosya düzenlemelerini otomatik onaylar.' : 'Auto-approves file edits.';
  }
  if (mode === 'edit_plus_safe_tools') {
    return tr
      ? 'Düzenlemeleri ve güvenli salt-okunur komutları otomatik onaylar.'
      : 'Auto-approves edits and read-only safe commands.';
  }
  return tr
    ? 'Sormadan tüm işlemleri otomatik onaylar.'
    : 'Auto-approves every operation without asking.';
}

export function describeAutoApprovalScopes(autoApproval: ProjectGovernanceAutoApprovalState): {
  global: string;
  project: string;
  session: string;
  effectiveSource: string;
  effectiveExplanation: string;
  effectiveBehavior: string;
} {
  let effectiveExplanation = 'No explicit setting found; fallback Off applies.';
  if (autoApproval.policySource === 'session') {
    effectiveExplanation = localizedText(
      'Session override is active, so Session setting applies.',
      'Oturum geçersiz kılması aktif, bu yüzden Oturum ayarı uygulanır.',
    );
  } else if (autoApproval.policySource === 'project') {
    effectiveExplanation = localizedText(
      'Session follows Project, so Project setting applies.',
      'Oturum Projeyi izlediği için Proje ayarı uygulanır.',
    );
  } else if (autoApproval.policySource === 'global') {
    effectiveExplanation = localizedText(
      'Project and Session follow higher scope, so Global setting applies.',
      'Proje ve Oturum üst kapsamı izlediği için Global ayar uygulanır.',
    );
  }
  if (autoApproval.policySource === 'fallback') {
    effectiveExplanation = localizedText(
      'No explicit setting found; fallback Off applies.',
      'Açık bir ayar bulunamadı; yedek Kapalı modu uygulanır.',
    );
  }

  return {
    global: autoApprovalModeLabel(autoApproval.globalMode),
    project: autoApproval.projectMode
      ? autoApprovalModeLabel(autoApproval.projectMode)
      : projectInheritLabel(),
    session: autoApproval.sessionMode
      ? autoApprovalModeLabel(autoApproval.sessionMode)
      : sessionInheritLabel(),
    effectiveSource: autoApprovalSourceLabel(autoApproval.policySource),
    effectiveExplanation,
    effectiveBehavior: autoApprovalModeBehavior(autoApproval.effectiveMode),
  };
}

function createAutoApprovalScopeCard(
  title: string,
  helperText: string,
  select: HTMLSelectElement,
): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'auto-approval-control auto-approval-scope-card';
  card.title = helperText;

  const row = document.createElement('div');
  row.className = 'auto-approval-scope-row';

  const titleEl = document.createElement('div');
  titleEl.className = 'auto-approval-scope-title';
  titleEl.textContent = title;

  const control = document.createElement('div');
  control.className = 'auto-approval-scope-control';
  control.appendChild(select);
  row.appendChild(titleEl);
  row.appendChild(control);

  const helper = document.createElement('div');
  helper.className = 'auto-approval-scope-helper';
  helper.textContent = helperText;

  card.appendChild(row);
  card.appendChild(helper);
  return card;
}

export function scopeBadge(scope: 'user' | 'project'): string {
  return `<span class="scope-badge control-chip ${scope}">${scope}</span>`;
}

function renderSection(id: string, title: string, items: HTMLElement[], count: number, onAdd?: () => void, emptyText = 'None configured'): HTMLElement {
  const section = document.createElement('div');
  section.className = 'config-section';

  const isCollapsed = collapsed[id] ?? true;

  const header = document.createElement('div');
  header.className = 'config-section-header';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'config-section-heading config-section-toggle-button';
  button.setAttribute('aria-expanded', String(!isCollapsed));
  button.innerHTML = `
    <span class="config-section-toggle ${isCollapsed ? 'collapsed' : ''}">&#x25BC;</span>
    <span class="config-section-title">${title}</span>
  `;
  header.appendChild(button);

  const meta = document.createElement('div');
  meta.className = 'config-section-meta';

  const countBadge = document.createElement('span');
  countBadge.className = 'config-section-count control-chip';
  countBadge.textContent = String(count);
  meta.appendChild(countBadge);

  if (onAdd) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'config-section-add-btn';
    addBtn.textContent = '+';
    addBtn.title = `Add ${title.replace(/s$/, '')}`;
    addBtn.ariaLabel = `Add ${title.replace(/s$/, '')}`;
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); onAdd(); });
    meta.appendChild(addBtn);
  }
  header.appendChild(meta);

  const body = document.createElement('div');
  body.className = `config-section-body${isCollapsed ? ' hidden' : ''}`;

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'config-empty ops-rail-note';
    empty.dataset.tone = 'muted';
    empty.textContent = emptyText;
    body.appendChild(empty);
  } else {
    items.forEach(el => body.appendChild(el));
  }

  button.addEventListener('click', () => {
    collapsed[id] = !collapsed[id];
    button.setAttribute('aria-expanded', String(!collapsed[id]));
    const toggle = button.querySelector('.config-section-toggle')!;
    toggle.classList.toggle('collapsed');
    body.classList.toggle('hidden');
  });

  section.appendChild(header);
  section.appendChild(body);
  return section;
}

function openConfigFile(filePath: string): void {
  const project = appState.activeProject;
  if (project && filePath) {
    appState.addFileReaderSession(project.id, filePath);
  }
}

function mcpItem(server: McpServer): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable calder-list-row';
  const detail = server.url
    ? `${server.status} · ${server.url}`
    : server.status;
  el.innerHTML = `<span class="config-item-name">${esc(server.name)}</span><span class="config-item-detail" title="${esc(detail)}">${esc(detail)}</span>${scopeBadge(server.scope)}`;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'config-item-remove-btn';
  removeBtn.textContent = '\u00d7';
  removeBtn.title = 'Remove server';
  removeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Remove MCP server "${server.name}"?`)) return;
    const projectPath = appState.activeProject?.path;
    await window.calder.mcp.removeServer(server.name, server.filePath, server.scope, projectPath);
    refresh();
  });
  el.appendChild(removeBtn);

  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.config-item-remove-btn')) return;
    openConfigFile(server.filePath);
  });
  return el;
}

function agentItem(agent: Agent): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable calder-list-row';
  el.innerHTML = `<span class="config-item-name">${esc(agent.name)}</span><span class="config-item-detail">${esc(agent.model)}</span>${scopeBadge(agent.scope)}`;
  el.addEventListener('click', () => openConfigFile(agent.filePath));
  return el;
}

function getMetadataLanguage(): UiLanguage {
  return appState.preferences.language === 'tr' ? 'tr' : 'en';
}

export function localizeConfigMetadataDetail(
  kind: ConfigMetadataKind,
  name: string,
  description: string,
  language: UiLanguage = getMetadataLanguage(),
): string {
  if (language !== 'tr') return description;
  const normalizedName = kind === 'command'
    ? name.replace(/^\//u, '').trim()
    : name.trim();
  const summaries = kind === 'skill' ? TURKISH_SKILL_SUMMARIES : TURKISH_COMMAND_SUMMARIES;
  return summaries.get(normalizedName) ?? description;
}

function skillItem(skill: Skill): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable calder-list-row';
  const detail = localizeConfigMetadataDetail('skill', skill.name, skill.description);
  el.innerHTML = `<span class="config-item-name">${esc(skill.name)}</span><span class="config-item-detail">${esc(detail)}</span>${scopeBadge(skill.scope)}`;
  el.addEventListener('click', () => openConfigFile(skill.filePath));
  return el;
}

function commandItem(cmd: Command): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable calder-list-row';
  const detail = localizeConfigMetadataDetail('command', cmd.name, cmd.description);
  el.innerHTML = `<span class="config-item-name">/${esc(cmd.name)}</span><span class="config-item-detail">${esc(detail)}</span>${scopeBadge(cmd.scope)}`;
  el.addEventListener('click', () => openConfigFile(cmd.filePath));
  return el;
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function providerLabel(providerId: ProviderId): string {
  switch (providerId) {
    case 'codex': return 'Codex CLI';
    case 'claude': return 'Claude Code';
    case 'copilot': return 'GitHub Copilot';
    case 'gemini': return 'Gemini CLI';
    case 'qwen': return 'Qwen Code';
    case 'minimax': return 'MiniMax CLI';
    case 'blackbox': return 'Blackbox CLI';
    default: return providerId;
  }
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function sectionSummaryText(section: ToolchainSection): string {
  switch (section.id) {
    case 'mcp':
      return section.count === 1
        ? '1 MCP server connected'
        : `${section.count} MCP servers connected`;
    case 'agents':
      return `${section.count} ${pluralize(section.count, 'agent')} available`;
    case 'skills':
      return `${section.count} ${pluralize(section.count, 'skill')} ready`;
    case 'commands':
      return section.count === 1
        ? '1 custom command available'
        : `${section.count} custom commands available`;
    default:
      return `${section.count} configured`;
  }
}

function getVisibleToolchainSections(sections: ToolchainSection[]): ToolchainSection[] {
  return sections.filter((section) => section.count > 0 || !!section.onAdd);
}

function renderToolchainSummary(
  providerId: ProviderId,
  sections: ToolchainSection[],
  trackingHealthy: boolean,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'toolchain-summary toolchain-summary-tools-focus';

  const provider = document.createElement('div');
  provider.className = 'toolchain-provider';
  provider.innerHTML = `
    <span class="toolchain-provider-kicker">Toolkit</span>
    <span class="toolchain-provider-value">Configured for ${esc(providerLabel(providerId))}</span>
  `;
  wrap.appendChild(provider);

  const status = document.createElement('div');
  status.className = `toolchain-summary-status ${trackingHealthy ? 'is-healthy' : 'is-warning'}`;
  status.textContent = trackingHealthy ? 'Tracking on' : 'Tracking limited';
  wrap.appendChild(status);

  const chips = document.createElement('div');
  chips.className = 'toolchain-summary-chips';

  if (sections.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'toolchain-summary-empty';
    empty.textContent = 'No project MCP, skills, or commands connected yet.';
    wrap.appendChild(empty);
    return wrap;
  }

  for (const section of sections) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'toolchain-summary-chip control-chip';
    chip.innerHTML = `
      <span class="toolchain-summary-chip-label">${esc(section.title)}</span>
      <span class="toolchain-summary-chip-value">${esc(sectionSummaryText(section))}</span>
    `;
    chip.addEventListener('click', () => {
      collapsed[section.id] = false;
      void refresh();
    });
    chips.appendChild(chip);
  }

  wrap.appendChild(chips);
  return wrap;
}

function renderAutoApprovalSection(
  projectId: string,
  projectPath: string,
  providerId: ProviderId,
  governanceState: ProjectGovernanceState | undefined,
  supportsPermissionHooks: boolean,
): HTMLElement | null {
  const autoApproval = governanceState?.autoApproval;
  if (!autoApproval) return null;

  const sessionId = getActiveCliSessionId();
  const item = document.createElement('div');
  item.className = 'config-item auto-approval-item';

  const summary = document.createElement('div');
  summary.className = 'auto-approval-summary';
  const scopeSummary = describeAutoApprovalScopes(autoApproval);
  const providerName = providerLabel(providerId);
  const priorityRule = localizedText(
    'Priority: Session > Project > Global.',
    'Öncelik sırası: Oturum > Proje > Global.',
  );
  const effectiveModeLabel = localizedText('Effective Mode', 'Etkin Mod');
  const effectiveSourceLabel = localizedText('Effective Source', 'Etkin Kaynak');
  const currentBehaviorLabel = localizedText('Current Behavior', 'Mevcut Davranış');
  const providerLabelText = localizedText('Provider', 'Sağlayıcı');
  const policyStackLabel = localizedText('Policy Stack', 'Politika Katmanı');
  const globalPolicyLabel = localizedText('Global Default', 'Global Varsayılan');
  const projectPolicyLabel = localizedText('Project Policy', 'Proje Politikası');
  const sessionPolicyLabel = localizedText('Session Policy', 'Oturum Politikası');
  const effectiveShortLabel = localizedText('Effective', 'Etkin');
  const fullAutoWarning = localizedText(
    'Warning: Full Auto approves all operations without asking.',
    'Uyarı: Tam Otomatik mod tüm işlemleri sormadan onaylar.',
  );
  const priorityMapLabel = localizedText(
    'Applied order: Global -> Project -> Session -> Effective.',
    'Uygulama sırası: Global -> Proje -> Oturum -> Etkin.',
  );
  summary.innerHTML = `
    <div class="auto-approval-summary-header auto-approval-current-card">
      <span class="config-item-name">${esc(effectiveModeLabel)}</span>
      <span class="scope-badge control-chip">${esc(autoApprovalModeLabel(autoApproval.effectiveMode))}</span>
    </div>
    <div class="auto-approval-priority-note ops-rail-note" data-tone="default">
      ${esc(priorityRule)}
    </div>
    <div class="auto-approval-priority-map">${esc(priorityMapLabel)}</div>
    <div class="auto-approval-meta-card">
      <div class="auto-approval-meta-row">
        <span class="auto-approval-meta-label">${esc(effectiveSourceLabel)}</span>
        <span class="auto-approval-meta-value">${esc(scopeSummary.effectiveSource)}</span>
      </div>
      <div class="auto-approval-meta-row">
        <span class="auto-approval-meta-label">${esc(currentBehaviorLabel)}</span>
        <span class="auto-approval-meta-value">${esc(scopeSummary.effectiveBehavior)}</span>
      </div>
      <div class="auto-approval-meta-row">
        <span class="auto-approval-meta-label">${esc(providerLabelText)}</span>
        <span class="auto-approval-meta-value">${esc(providerName)}</span>
      </div>
      <div class="auto-approval-meta-row">
        <span class="auto-approval-meta-label">${esc(localizedText('Why this applies', 'Neden bu uygulanıyor'))}</span>
        <span class="auto-approval-meta-value">${esc(scopeSummary.effectiveExplanation)}</span>
      </div>
    </div>
    <div class="auto-approval-policy-stack" aria-label="${esc(policyStackLabel)}">
      <div class="auto-approval-policy-row">
        <span class="auto-approval-policy-name">${esc(globalPolicyLabel)}</span>
        <span class="scope-badge control-chip">${esc(scopeSummary.global)}</span>
      </div>
      <div class="auto-approval-policy-row">
        <span class="auto-approval-policy-name">${esc(projectPolicyLabel)}</span>
        <span class="scope-badge control-chip">${esc(scopeSummary.project)}</span>
      </div>
      <div class="auto-approval-policy-row">
        <span class="auto-approval-policy-name">${esc(sessionPolicyLabel)}</span>
        <span class="scope-badge control-chip">${esc(scopeSummary.session)}</span>
      </div>
      <div class="auto-approval-policy-row is-effective">
        <span class="auto-approval-policy-name">${esc(effectiveShortLabel)}</span>
        <span class="scope-badge control-chip">${esc(autoApprovalModeLabel(autoApproval.effectiveMode))}</span>
      </div>
    </div>
    ${autoApproval.effectiveMode === 'full_auto'
      ? `<div class="auto-approval-risk-note">${esc(fullAutoWarning)}</div>`
      : ''}
  `;
  item.appendChild(summary);

  const controls = document.createElement('div');
  controls.className = 'auto-approval-controls';

  const createModeSelect = (
    currentMode: AutoApprovalMode,
    helperText: string,
    onChange: (nextMode: AutoApprovalMode) => Promise<void>,
  ): HTMLSelectElement => {
    const select = document.createElement('select');
    select.className = 'auto-approval-select';
    select.title = helperText;
    for (const option of AUTO_APPROVAL_MODE_OPTIONS) {
      const el = document.createElement('option');
      el.value = option.value;
      el.textContent = autoApprovalModeLabel(option.value);
      if (option.value === currentMode) {
        el.selected = true;
      }
      select.appendChild(el);
    }

    select.addEventListener('change', async () => {
      const nextMode = select.value as AutoApprovalMode;
      select.disabled = true;
      try {
        await onChange(nextMode);
      } finally {
        select.disabled = false;
      }
    });

    return select;
  };

  const controlsIntro = document.createElement('div');
  controlsIntro.className = 'auto-approval-controls-intro';
  controlsIntro.textContent = localizedText(
    'Session policy is temporary and takes priority (Session > Project > Global).',
    'Oturum politikası geçicidir ve en yüksek önceliğe sahiptir (Oturum > Proje > Global).',
  );
  controls.appendChild(controlsIntro);

  const controlsHint = document.createElement('div');
  controlsHint.className = 'auto-approval-controls-hint';
  controlsHint.textContent = localizedText(
    'Recommended: set Global once, keep Project for repo defaults, then use Session only when needed.',
    'Öneri: Globali bir kez ayarlayın, Projeyi depo varsayılanı için kullanın, Oturumu yalnızca gerektiğinde açın.',
  );
  controls.appendChild(controlsHint);

  const globalSelect = createModeSelect(autoApproval.globalMode, AUTO_APPROVAL_SCOPE_HELP.global, async (nextMode) => {
    const nextState = await window.calder.governance.setAutoApprovalMode(
      projectPath,
      'global',
      nextMode,
      sessionId,
    );
    appState.setProjectGovernance(projectId, nextState);
    void refresh();
  });
  controls.appendChild(createAutoApprovalScopeCard(
    globalPolicyLabel,
    localizedText(
      `${AUTO_APPROVAL_SCOPE_HELP.global} Current: ${scopeSummary.global}.`,
      `${AUTO_APPROVAL_SCOPE_HELP.global.replace('Default policy for this Mac.', 'Bu Mac için varsayılan politika.')} Şu an: ${scopeSummary.global}.`,
    ),
    globalSelect,
  ));

  const projectSelect = document.createElement('select');
  projectSelect.className = 'auto-approval-select';
  projectSelect.title = AUTO_APPROVAL_SCOPE_HELP.project;
  const projectInheritOption = document.createElement('option');
  projectInheritOption.value = PROJECT_INHERIT_VALUE;
  projectInheritOption.textContent = projectInheritLabel();
  if (autoApproval.projectMode === undefined) {
    projectInheritOption.selected = true;
  }
  projectSelect.appendChild(projectInheritOption);
  for (const option of AUTO_APPROVAL_MODE_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = autoApprovalModeLabel(option.value);
    if (autoApproval.projectMode === option.value) {
      el.selected = true;
    }
    projectSelect.appendChild(el);
  }
  projectSelect.addEventListener('change', async () => {
    const selectedMode = projectSelect.value === PROJECT_INHERIT_VALUE
      ? null
      : (projectSelect.value as AutoApprovalMode);
    projectSelect.disabled = true;
    try {
      const nextState = await window.calder.governance.setAutoApprovalMode(
        projectPath,
        'project',
        selectedMode,
        sessionId,
      );
      appState.setProjectGovernance(projectId, nextState);
      void refresh();
    } finally {
      projectSelect.disabled = false;
    }
  });
  controls.appendChild(createAutoApprovalScopeCard(
    projectPolicyLabel,
    localizedText(
      `${AUTO_APPROVAL_SCOPE_HELP.project} Current: ${scopeSummary.project}.`,
      `${AUTO_APPROVAL_SCOPE_HELP.project.replace('Repository-level policy.', 'Depo düzeyinde politika.')} Şu an: ${scopeSummary.project}.`,
    ),
    projectSelect,
  ));

  const sessionSelect = document.createElement('select');
  sessionSelect.className = 'auto-approval-select';
  sessionSelect.title = supportsPermissionHooks
    ? AUTO_APPROVAL_SCOPE_HELP.session
    : 'Auto approval unavailable';
  const inheritOption = document.createElement('option');
  inheritOption.value = SESSION_INHERIT_VALUE;
  inheritOption.textContent = sessionInheritLabel();
  sessionSelect.appendChild(inheritOption);
  for (const option of AUTO_APPROVAL_MODE_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = autoApprovalModeLabel(option.value);
    if (autoApproval.sessionMode === option.value) {
      el.selected = true;
    }
    sessionSelect.appendChild(el);
  }
  if (autoApproval.sessionMode === undefined) {
    inheritOption.selected = true;
  }
  sessionSelect.disabled = !sessionId || !supportsPermissionHooks;
  sessionSelect.addEventListener('change', async () => {
    if (!sessionId) return;
    const selectedMode = sessionSelect.value === SESSION_INHERIT_VALUE
      ? null
      : (sessionSelect.value as AutoApprovalMode);
    sessionSelect.disabled = true;
    try {
      await window.calder.governance.setSessionAutoApprovalOverride(sessionId, selectedMode);
      const nextState = await window.calder.governance.getProjectState(projectPath, sessionId);
      appState.setProjectGovernance(projectId, nextState);
      void refresh();
    } finally {
      sessionSelect.disabled = false;
    }
  });
  controls.appendChild(createAutoApprovalScopeCard(
    sessionPolicyLabel,
    !supportsPermissionHooks
      ? localizedText(
        'Active provider does not support permission hooks, so session auto-approval cannot run.',
        'Aktif sağlayıcı izin hooklarını desteklemediği için oturum otomatik onayı çalışmaz.',
      )
      : (sessionId
        ? localizedText(
          `${AUTO_APPROVAL_SCOPE_HELP.session} Current: ${scopeSummary.session}.`,
          `${AUTO_APPROVAL_SCOPE_HELP.session.replace('Temporary policy for the active session.', 'Aktif oturum için geçici politika.')} Şu an: ${scopeSummary.session}.`,
        )
        : localizedText(
          'Open a CLI session to apply a temporary session override.',
          'Geçici oturum politikası uygulamak için bir CLI oturumu açın.',
        )),
    sessionSelect,
  ));

  const modeGuide = document.createElement('div');
  modeGuide.className = 'auto-approval-mode-guide';
  const modeGuideToggle = document.createElement('button');
  modeGuideToggle.type = 'button';
  modeGuideToggle.className = 'auto-approval-mode-guide-toggle';
  modeGuideToggle.textContent = localizedText('Mode Guide', 'Mod Rehberi');
  modeGuideToggle.setAttribute('aria-expanded', 'false');

  const modeGuideBody = document.createElement('div');
  modeGuideBody.className = 'auto-approval-mode-guide-body hidden';
  for (const option of AUTO_APPROVAL_MODE_OPTIONS) {
    const row = document.createElement('div');
    row.className = 'auto-approval-mode-guide-row';
    row.innerHTML = `
      <span class="auto-approval-mode-guide-row-label">${esc(option.label)}</span>
      <span class="auto-approval-mode-guide-row-detail">${esc(autoApprovalModeGuideSummary(option.value))}</span>
    `;
    modeGuideBody.appendChild(row);
  }

  modeGuideToggle.addEventListener('click', () => {
    const expanded = modeGuideToggle.getAttribute('aria-expanded') === 'true';
    modeGuideToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    modeGuideBody.classList.toggle('hidden', expanded);
  });

  modeGuide.appendChild(modeGuideToggle);
  modeGuide.appendChild(modeGuideBody);
  controls.appendChild(modeGuide);

  item.appendChild(controls);
  return renderSection(
    'auto-approval',
    localizedText('Auto Approval', 'Otomatik Onay'),
    [item],
    1,
    undefined,
    localizedText('Auto approval unavailable', 'Otomatik onay kullanılamıyor'),
  );
}

function applyVisibility(): void {
  const container = document.getElementById('config-sections');
  if (!container) return;
  const visible = appState.preferences.sidebarViews?.configSections ?? true;
  container.classList.toggle('hidden', !visible);
}

export function getConfigProviderId(): ProviderId {
  const project = appState.activeProject;
  if (!project) return 'claude';

  const activeSession = appState.activeSession;
  if (activeSession && !activeSession.type) {
    return (activeSession.providerId || 'claude') as ProviderId;
  }

  const recentCliSession = [...project.sessions].reverse().find(session => !session.type);
  return (recentCliSession?.providerId || 'claude') as ProviderId;
}

function getActiveCliSessionId(): string | undefined {
  const activeSession = appState.activeSession;
  if (activeSession && !activeSession.type) {
    return activeSession.id;
  }
  return undefined;
}

async function refresh(): Promise<void> {
  const container = document.getElementById('config-sections');
  if (!container) return;
  const generation = ++refreshGeneration;

  applyVisibility();

  const project = appState.activeProject;
  if (!project) {
    container.innerHTML = '';
    return;
  }

  // Only show loading indicator on first render (when container is empty)
  const isFirstLoad = container.children.length === 0;
  if (isFirstLoad) {
    container.innerHTML = '<div class="config-loading">Loading…</div>';
  }

  const providerId = getConfigProviderId();
  let config: ProviderConfig;
  let meta: CliProviderMeta | null = null;
  let validation: SettingsValidationResult | null = null;
  try {
    [config, meta, validation] = await Promise.all([
      window.calder.provider.getConfig(providerId, project.path),
      window.calder.provider.getMeta(providerId).catch(() => null),
      window.calder.settings.validate(providerId).catch(() => null),
    ]);
  } catch {
    if (generation !== refreshGeneration) return;
    container.innerHTML = '';
    return;
  }

  if (generation !== refreshGeneration) return;

  const trackingHealthy = Boolean(meta && validation && isTrackingHealthy(meta, validation));

  container.innerHTML = '';
  const sections: ToolchainSection[] = [
    {
      id: 'mcp',
      title: 'MCP Servers',
      items: config.mcpServers.map(mcpItem),
      count: config.mcpServers.length,
      onAdd: providerId === 'claude' ? () => showMcpAddModal(() => refresh()) : undefined,
      emptyText: 'No MCP servers configured. Model Context Protocol servers connect coding tools to external data and actions.',
    },
    {
      id: 'agents',
      title: 'Agents',
      items: config.agents.map(agentItem),
      count: config.agents.length,
    },
    {
      id: 'skills',
      title: 'Skills',
      items: config.skills.map(skillItem),
      count: config.skills.length,
    },
  ];

  if (providerId !== 'codex') {
    sections.push({
      id: 'commands',
      title: 'Commands',
      items: config.commands.map(commandItem),
      count: config.commands.length,
    });
  }

  const autoApprovalSection = renderAutoApprovalSection(
    project.id,
    project.path,
    providerId,
    project.projectGovernance,
    Boolean(meta?.capabilities.hookStatus),
  );
  if (autoApprovalSection) {
    container.appendChild(autoApprovalSection);
  }

  const visibleSections = getVisibleToolchainSections(sections);
  container.appendChild(renderToolchainSummary(providerId, visibleSections, trackingHealthy));
  for (const section of visibleSections) {
    container.appendChild(renderSection(
      section.id,
      section.title,
      section.items,
      section.count,
      section.onAdd,
      section.emptyText,
    ));
  }
}

function scheduleRefresh(): void {
  if (refreshQueued) {
    return;
  }
  refreshQueued = true;
  queueFrame(() => {
    refreshQueued = false;
    void refresh();
  });
}

function watchActiveProject(): void {
  const project = appState.activeProject;
  if (project) {
    window.calder.provider.watchProject(getConfigProviderId(), project.path);
  }
}

export function initConfigSections(): void {
  appState.on('project-changed', () => { watchActiveProject(); scheduleRefresh(); });
  appState.on('state-loaded', () => { watchActiveProject(); scheduleRefresh(); });
  appState.on('session-changed', () => { watchActiveProject(); scheduleRefresh(); });
  appState.on('preferences-changed', () => {
    applyVisibility();
    scheduleRefresh();
  });
  window.calder.provider.onConfigChanged(() => scheduleRefresh());
}
