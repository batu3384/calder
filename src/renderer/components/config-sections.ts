import { appState } from '../state.js';
import { getProviderDisplayName } from '../provider-availability.js';
import { showMcpAddModal } from './mcp-add-modal.js';
import { localizeConfigMetadataSummary, type ConfigMetadataKind } from './config-metadata-localization.js';
import { getVisibleToolchainSections, sectionSummaryText, type ToolchainSummarySection } from './config-toolchain-summary.js';
import { createConfigSectionsRefreshController } from './config-sections-refresh-controller.js';
import {
  describeAutoApprovalScopes as describeAutoApprovalScopesCore,
  renderAutoApprovalSection as renderAutoApprovalSectionCore,
} from './config-sections-auto-approval.js';
import { isTrackingHealthy } from '../../shared/tracking-health.js';
import type { UiLanguage } from '../../shared/types.js';
import type {
  ProviderConfig,
  ProviderId,
  McpServer,
  Agent,
  Skill,
  Command,
  CliProviderMeta,
  SettingsValidationResult,
} from '../types.js';

const collapsed: Record<string, boolean> = {};

type ToolchainSection = ToolchainSummarySection & {
  title: string;
  items: HTMLElement[];
  emptyText?: string;
};

function isTurkishUiLanguage(): boolean {
  return appState.preferences.language === 'tr';
}

function localizedText(english: string, turkish: string): string {
  return isTurkishUiLanguage() ? turkish : english;
}
export const describeAutoApprovalScopes = describeAutoApprovalScopesCore;

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

function createConfigOpenButton(filePath: string): HTMLButtonElement {
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'config-item-open-btn config-item-action-btn';
  openBtn.textContent = '↗';
  const openLabel = localizedText(
    'Open source file',
    'Kaynak dosyayı aç',
  );
  openBtn.title = openLabel;
  openBtn.setAttribute('aria-label', openLabel);
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openConfigFile(filePath);
  });
  return openBtn;
}

function createConfigActionGroup(...buttons: HTMLButtonElement[]): HTMLDivElement {
  const actions = document.createElement('div');
  actions.className = 'config-item-actions';
  buttons.forEach((button) => actions.appendChild(button));
  return actions;
}

function mcpItem(server: McpServer): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item calder-list-row';
  const detail = server.url
    ? `${server.status} · ${server.url}`
    : server.status;
  el.innerHTML = `<span class="config-item-name">${esc(server.name)}</span><span class="config-item-detail" title="${esc(detail)}">${esc(detail)}</span>${scopeBadge(server.scope)}`;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'config-item-remove-btn';
  removeBtn.textContent = '\u00d7';
  const removeLabel = localizedText(
    `Remove MCP server ${server.name}`,
    `MCP sunucusunu kaldır: ${server.name}`,
  );
  removeBtn.title = removeLabel;
  removeBtn.setAttribute('aria-label', removeLabel);
  removeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Remove MCP server "${server.name}"?`)) return;
    const projectPath = appState.activeProject?.path;
    await window.calder.mcp.removeServer(server.name, server.filePath, server.scope, projectPath);
    refresh();
  });
  el.appendChild(createConfigActionGroup(createConfigOpenButton(server.filePath), removeBtn));
  return el;
}

function agentItem(agent: Agent): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item calder-list-row';
  el.innerHTML = `<span class="config-item-name">${esc(agent.name)}</span><span class="config-item-detail">${esc(agent.model)}</span>${scopeBadge(agent.scope)}`;
  el.appendChild(createConfigActionGroup(createConfigOpenButton(agent.filePath)));
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
  return localizeConfigMetadataSummary(kind, name, description, language);
}

function skillItem(skill: Skill): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item calder-list-row';
  const detail = localizeConfigMetadataDetail('skill', skill.name, skill.description);
  el.innerHTML = `<span class="config-item-name">${esc(skill.name)}</span><span class="config-item-detail">${esc(detail)}</span>${scopeBadge(skill.scope)}`;
  el.appendChild(createConfigActionGroup(createConfigOpenButton(skill.filePath)));
  return el;
}

function commandItem(cmd: Command): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item calder-list-row';
  const detail = localizeConfigMetadataDetail('command', cmd.name, cmd.description);
  el.innerHTML = `<span class="config-item-name">/${esc(cmd.name)}</span><span class="config-item-detail">${esc(detail)}</span>${scopeBadge(cmd.scope)}`;
  el.appendChild(createConfigActionGroup(createConfigOpenButton(cmd.filePath)));
  return el;
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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
    <span class="toolchain-provider-value">Configured for ${esc(getProviderDisplayName(providerId))}</span>
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

// refreshGeneration and queueing state now live in the extracted controller.
const refreshController = createConfigSectionsRefreshController({
  refresh,
  applyVisibility,
  getActiveProjectPath: () => appState.activeProject?.path,
  getProviderId: getConfigProviderId,
  watchProject: (providerId, projectPath) => window.calder.provider.watchProject(providerId, projectPath),
  onConfigChanged: (listener) => window.calder.provider.onConfigChanged(listener),
  onAppStateEvent: (event, listener) => {
    appState.on(event, listener);
  },
});

async function refresh(): Promise<void> {
  const container = document.getElementById('config-sections');
  if (!container) return;
  const generation = refreshController.beginRefresh();

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
    if (!refreshController.isCurrentGeneration(generation)) return;
    container.innerHTML = '';
    return;
  }

  if (!refreshController.isCurrentGeneration(generation)) return;

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

  const autoApprovalSection = renderAutoApprovalSectionCore({
    projectId: project.id,
    projectPath: project.path,
    providerId,
    governanceState: project.projectGovernance,
    supportsPermissionHooks: Boolean(meta?.capabilities.hookStatus),
    sessionId: getActiveCliSessionId(),
    esc,
    refresh,
    renderSection,
  });
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

export function initConfigSections(): void {
  refreshController.init();
}
