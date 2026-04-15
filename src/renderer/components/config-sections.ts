import { appState } from '../state.js';
import { showMcpAddModal } from './mcp-add-modal.js';
import { isTrackingHealthy } from '../../shared/tracking-health.js';
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
  ProjectGovernanceState,
  SettingsValidationResult,
} from '../types.js';

const collapsed: Record<string, boolean> = {};
let refreshGeneration = 0;

type ToolchainSection = {
  id: string;
  title: string;
  items: HTMLElement[];
  count: number;
  onAdd?: () => void;
  emptyText?: string;
};

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

function skillItem(skill: Skill): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable calder-list-row';
  el.innerHTML = `<span class="config-item-name">${esc(skill.name)}</span><span class="config-item-detail">${esc(skill.description)}</span>${scopeBadge(skill.scope)}`;
  el.addEventListener('click', () => openConfigFile(skill.filePath));
  return el;
}

function commandItem(cmd: Command): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable calder-list-row';
  el.innerHTML = `<span class="config-item-name">/${esc(cmd.name)}</span><span class="config-item-detail">${esc(cmd.description)}</span>${scopeBadge(cmd.scope)}`;
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
): HTMLElement | null {
  const autoApproval = governanceState?.autoApproval;
  if (!autoApproval) return null;

  const sessionId = getActiveCliSessionId();
  const item = document.createElement('div');
  item.className = 'config-item auto-approval-item';

  const summary = document.createElement('div');
  summary.className = 'auto-approval-summary';
  summary.innerHTML = `
    <div class="auto-approval-summary-header">
      <span class="config-item-name">Effective Mode</span>
      <span class="scope-badge control-chip">${esc(AUTO_APPROVAL_MODE_LABELS[autoApproval.effectiveMode])}</span>
    </div>
    <div class="auto-approval-summary-meta">
      Source: ${esc(autoApprovalSourceLabel(autoApproval.policySource))} · Provider: ${esc(providerLabel(providerId))}
    </div>
  `;
  item.appendChild(summary);

  const controls = document.createElement('div');
  controls.className = 'auto-approval-controls';

  const createModeControl = (
    label: string,
    currentMode: AutoApprovalMode,
    onChange: (nextMode: AutoApprovalMode) => Promise<void>,
  ): HTMLDivElement => {
    const row = document.createElement('div');
    row.className = 'auto-approval-control';

    const title = document.createElement('label');
    title.className = 'auto-approval-label';
    title.textContent = label;

    const select = document.createElement('select');
    select.className = 'auto-approval-select';
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

    row.appendChild(title);
    row.appendChild(select);
    return row;
  };

  controls.appendChild(createModeControl('Global', autoApproval.globalMode, async (nextMode) => {
    const nextState = await window.calder.governance.setAutoApprovalMode(
      projectPath,
      'global',
      nextMode,
      sessionId,
    );
    appState.setProjectGovernance(projectId, nextState);
    void refresh();
  }));

  controls.appendChild(createModeControl('Project', autoApproval.projectMode ?? autoApproval.globalMode, async (nextMode) => {
    const nextState = await window.calder.governance.setAutoApprovalMode(
      projectPath,
      'project',
      nextMode,
      sessionId,
    );
    appState.setProjectGovernance(projectId, nextState);
    void refresh();
  }));

  const sessionRow = document.createElement('div');
  sessionRow.className = 'auto-approval-control';
  const sessionLabel = document.createElement('label');
  sessionLabel.className = 'auto-approval-label';
  sessionLabel.textContent = 'Session';
  const sessionSelect = document.createElement('select');
  sessionSelect.className = 'auto-approval-select';
  const inheritOption = document.createElement('option');
  inheritOption.value = '';
  inheritOption.textContent = 'Inherit';
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
    const selectedMode = sessionSelect.value === ''
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
  sessionRow.appendChild(sessionLabel);
  sessionRow.appendChild(sessionSelect);
  controls.appendChild(sessionRow);

  const hint = document.createElement('div');
  hint.className = 'auto-approval-hint';
  hint.textContent = sessionId
    ? 'Session override applies only to the active CLI session.'
    : 'Open a CLI session to apply a temporary session override.';
  controls.appendChild(hint);

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
