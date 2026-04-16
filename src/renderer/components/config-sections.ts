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
type SectionPresentation = 'compact' | 'expanded' | 'promoted' | 'ultra';
let lastCapabilitiesPresentation: SectionPresentation = 'expanded';

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
};

const AUTO_APPROVAL_MODE_OPTIONS: Array<{ value: AutoApprovalMode; label: string }> = [
  { value: 'off', label: AUTO_APPROVAL_MODE_LABELS.off },
  { value: 'edit_only', label: AUTO_APPROVAL_MODE_LABELS.edit_only },
  { value: 'edit_plus_safe_tools', label: AUTO_APPROVAL_MODE_LABELS.edit_plus_safe_tools },
];
const PROJECT_INHERIT_VALUE = '__inherit_global__';
const SESSION_INHERIT_VALUE = '';

const AUTO_APPROVAL_SCOPE_HELP = {
  global: 'Default for this Mac.',
  project: 'Override for this repository.',
  session: 'Temporary override for the active session.',
} as const;

function autoApprovalSourceLabel(source: AutoApprovalPolicySource): string {
  switch (source) {
    case 'session':
      return 'Session override';
    case 'project':
      return 'Project policy';
    case 'global':
      return 'Global default';
    case 'fallback':
    default:
      return 'Fallback default';
  }
}

function autoApprovalModeBehavior(mode: AutoApprovalMode): string {
  if (mode === 'off') {
    return 'Always asks for approval before actions.';
  }
  if (mode === 'edit_only') {
    return 'Auto-approves file edits only.';
  }
  return 'Auto-approves file edits and safe read-only commands.';
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
    effectiveExplanation = 'Session override is active, so Session setting applies.';
  } else if (autoApproval.policySource === 'project') {
    effectiveExplanation = 'Session is inherit, so Project setting applies.';
  } else if (autoApproval.policySource === 'global') {
    effectiveExplanation = 'Project and Session are inherit, so Global setting applies.';
  }

  return {
    global: AUTO_APPROVAL_MODE_LABELS[autoApproval.globalMode],
    project: autoApproval.projectMode
      ? AUTO_APPROVAL_MODE_LABELS[autoApproval.projectMode]
      : 'Inherit (Global)',
    session: autoApproval.sessionMode
      ? AUTO_APPROVAL_MODE_LABELS[autoApproval.sessionMode]
      : 'Inherit (Project/Global)',
    effectiveSource: autoApprovalSourceLabel(autoApproval.policySource),
    effectiveExplanation,
    effectiveBehavior: autoApprovalModeBehavior(autoApproval.effectiveMode),
  };
}

function createAutoApprovalScopeCard(
  title: string,
  currentValue: string,
  helperText: string,
  select: HTMLSelectElement,
): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'auto-approval-control auto-approval-scope-card';
  card.title = helperText;

  const header = document.createElement('div');
  header.className = 'auto-approval-scope-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'auto-approval-scope-title';
  titleEl.textContent = title;

  const currentChip = document.createElement('span');
  currentChip.className = 'scope-badge control-chip';
  currentChip.textContent = `Currently: ${currentValue}`;

  header.appendChild(titleEl);
  header.appendChild(currentChip);

  const helper = document.createElement('div');
  helper.className = 'auto-approval-scope-helper';
  helper.textContent = helperText;

  const control = document.createElement('div');
  control.className = 'auto-approval-scope-control';
  control.appendChild(select);

  card.appendChild(header);
  card.appendChild(helper);
  card.appendChild(control);
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

function getCapabilitiesPresentation(container: HTMLElement): SectionPresentation {
  const wrapper = container.closest('.context-inspector-section') as HTMLElement | null;
  const value = wrapper?.dataset?.presentation;
  if (value === 'compact' || value === 'expanded' || value === 'promoted' || value === 'ultra') {
    return value;
  }
  return 'expanded';
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
): HTMLElement | null {
  const autoApproval = governanceState?.autoApproval;
  if (!autoApproval) return null;

  const sessionId = getActiveCliSessionId();
  const item = document.createElement('div');
  item.className = 'config-item auto-approval-item';

  const summary = document.createElement('div');
  summary.className = 'auto-approval-summary';
  const scopeSummary = describeAutoApprovalScopes(autoApproval);
  summary.innerHTML = `
    <div class="auto-approval-summary-header auto-approval-current-card">
      <span class="config-item-name">Current Behavior</span>
      <span class="scope-badge control-chip">${esc(AUTO_APPROVAL_MODE_LABELS[autoApproval.effectiveMode])}</span>
    </div>
    <div class="auto-approval-summary-meta">
      ${esc(scopeSummary.effectiveBehavior)}
    </div>
    <div class="auto-approval-summary-meta">
      Resolved from: ${esc(scopeSummary.effectiveSource)} · Provider: ${esc(providerLabel(providerId))}
    </div>
    <div class="auto-approval-state-strip">
      <span class="control-chip">G: ${esc(scopeSummary.global)}</span>
      <span class="control-chip">P: ${esc(scopeSummary.project)}</span>
      <span class="control-chip">S: ${esc(scopeSummary.session)}</span>
    </div>
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
      el.textContent = option.label;
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

  const stackIntro = document.createElement('div');
  stackIntro.className = 'auto-approval-stack-intro';
  stackIntro.innerHTML = `<div class="auto-approval-stack-title">Policy Stack</div>`;
  controls.appendChild(stackIntro);

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
    'Global (This Mac)',
    scopeSummary.global,
    AUTO_APPROVAL_SCOPE_HELP.global,
    globalSelect,
  ));

  const projectSelect = document.createElement('select');
  projectSelect.className = 'auto-approval-select';
  projectSelect.title = AUTO_APPROVAL_SCOPE_HELP.project;
  const projectInheritOption = document.createElement('option');
  projectInheritOption.value = PROJECT_INHERIT_VALUE;
  projectInheritOption.textContent = 'Inherit (Global)';
  if (autoApproval.projectMode === undefined) {
    projectInheritOption.selected = true;
  }
  projectSelect.appendChild(projectInheritOption);
  for (const option of AUTO_APPROVAL_MODE_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
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
    'Project (This Repo)',
    scopeSummary.project,
    AUTO_APPROVAL_SCOPE_HELP.project,
    projectSelect,
  ));

  const sessionSelect = document.createElement('select');
  sessionSelect.className = 'auto-approval-select';
  sessionSelect.title = AUTO_APPROVAL_SCOPE_HELP.session;
  const inheritOption = document.createElement('option');
  inheritOption.value = SESSION_INHERIT_VALUE;
  inheritOption.textContent = 'Inherit (Project/Global)';
  sessionSelect.appendChild(inheritOption);
  for (const option of AUTO_APPROVAL_MODE_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
    if (autoApproval.sessionMode === option.value) {
      el.selected = true;
    }
    sessionSelect.appendChild(el);
  }
  if (autoApproval.sessionMode === undefined) {
    inheritOption.selected = true;
  }
  sessionSelect.disabled = !sessionId;
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
    'Session (Active CLI)',
    scopeSummary.session,
    AUTO_APPROVAL_SCOPE_HELP.session,
    sessionSelect,
  ));

  item.appendChild(controls);
  return renderSection('auto-approval', 'Auto Approval', [item], 1, undefined, 'Auto approval unavailable');
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
  const presentation = getCapabilitiesPresentation(container);
  if (presentation === 'ultra' && lastCapabilitiesPresentation !== 'ultra') {
    for (const key of Object.keys(collapsed)) {
      collapsed[key] = true;
    }
  }
  lastCapabilitiesPresentation = presentation;

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

function watchActiveProject(): void {
  const project = appState.activeProject;
  if (project) {
    window.calder.provider.watchProject(getConfigProviderId(), project.path);
  }
}

export function initConfigSections(): void {
  appState.on('project-changed', () => { watchActiveProject(); refresh(); });
  appState.on('state-loaded', () => { watchActiveProject(); refresh(); });
  appState.on('session-changed', () => { watchActiveProject(); refresh(); });
  appState.on('preferences-changed', () => applyVisibility());
  window.calder.provider.onConfigChanged(() => refresh());
}
