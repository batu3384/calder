import { appState } from '../state.js';
import { showMcpAddModal } from './mcp-add-modal.js';
import type { ProviderConfig, ProviderId, McpServer, Agent, Skill, Command } from '../types.js';

const collapsed: Record<string, boolean> = {};
type ToolchainSection = {
  id: string;
  title: string;
  items: HTMLElement[];
  count: number;
  onAdd?: () => void;
};

export function scopeBadge(scope: 'user' | 'project'): string {
  return `<span class="scope-badge control-chip ${scope}">${scope}</span>`;
}

function renderSection(id: string, title: string, items: HTMLElement[], count: number, onAdd?: () => void): HTMLElement {
  const section = document.createElement('div');
  section.className = 'config-section';

  const isCollapsed = collapsed[id] ?? true;

  const header = document.createElement('div');
  header.className = 'config-section-header';

  const heading = document.createElement('div');
  heading.className = 'config-section-heading';
  heading.innerHTML = `
    <span class="config-section-toggle ${isCollapsed ? 'collapsed' : ''}">&#x25BC;</span>
    <span class="config-section-title">${title}</span>
  `;
  header.appendChild(heading);

  const meta = document.createElement('div');
  meta.className = 'config-section-meta';

  const countBadge = document.createElement('span');
  countBadge.className = 'config-section-count control-chip';
  countBadge.textContent = String(count);
  meta.appendChild(countBadge);

  if (onAdd) {
    const addBtn = document.createElement('button');
    addBtn.className = 'config-section-add-btn';
    addBtn.textContent = '+';
    addBtn.title = `Add ${title.replace(/s$/, '')}`;
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); onAdd(); });
    meta.appendChild(addBtn);
  }
  header.appendChild(meta);

  const body = document.createElement('div');
  body.className = `config-section-body${isCollapsed ? ' hidden' : ''}`;

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'config-empty';
    empty.textContent = 'None configured';
    body.appendChild(empty);
  } else {
    items.forEach(el => body.appendChild(el));
  }

  header.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.config-section-add-btn')) return;
    collapsed[id] = !collapsed[id];
    const toggle = header.querySelector('.config-section-toggle')!;
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
  el.className = 'config-item config-item-clickable';
  el.innerHTML = `<span class="config-item-name">${esc(server.name)}</span><span class="config-item-detail">${esc(server.status)}</span>${scopeBadge(server.scope)}`;

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
  el.className = 'config-item config-item-clickable';
  el.innerHTML = `<span class="config-item-name">${esc(agent.name)}</span><span class="config-item-detail">${esc(agent.model)}</span>${scopeBadge(agent.scope)}`;
  el.addEventListener('click', () => openConfigFile(agent.filePath));
  return el;
}

function skillItem(skill: Skill): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable';
  el.innerHTML = `<span class="config-item-name">${esc(skill.name)}</span><span class="config-item-detail">${esc(skill.description)}</span>${scopeBadge(skill.scope)}`;
  el.addEventListener('click', () => openConfigFile(skill.filePath));
  return el;
}

function commandItem(cmd: Command): HTMLElement {
  const el = document.createElement('div');
  el.className = 'config-item config-item-clickable';
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
    default: return providerId;
  }
}

function renderToolchainSummary(providerId: ProviderId, sections: ToolchainSection[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'toolchain-summary';

  const provider = document.createElement('div');
  provider.className = 'toolchain-provider';
  provider.innerHTML = `
    <span class="toolchain-provider-kicker">Active provider</span>
    <span class="toolchain-provider-value">${esc(providerLabel(providerId))}</span>
  `;
  wrap.appendChild(provider);

  const chips = document.createElement('div');
  chips.className = 'toolchain-summary-chips';

  const visibleCounts = sections.filter((section) => section.count > 0);
  if (visibleCounts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'toolchain-summary-empty';
    empty.textContent = 'No active toolchain items yet';
    wrap.appendChild(empty);
    return wrap;
  }

  for (const section of visibleCounts) {
    const chip = document.createElement('div');
    chip.className = 'toolchain-summary-chip control-chip';
    chip.innerHTML = `
      <span class="toolchain-summary-chip-label">${esc(section.title)}</span>
      <span class="toolchain-summary-chip-value">${section.count}</span>
    `;
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

async function refresh(): Promise<void> {
  const container = document.getElementById('config-sections');
  if (!container) return;

  applyVisibility();

  const project = appState.activeProject;
  if (!project) {
    container.innerHTML = '';
    return;
  }

  // Only show loading indicator on first render (when container is empty)
  const isFirstLoad = container.children.length === 0;
  if (isFirstLoad) {
    container.innerHTML = '<div class="config-loading">Loading...</div>';
  }

  const providerId = getConfigProviderId();
  let config: ProviderConfig;
  try {
    config = await window.calder.provider.getConfig(providerId, project.path);
  } catch {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';
  const sections: ToolchainSection[] = [
    {
      id: 'mcp',
      title: 'Integrations',
      items: config.mcpServers.map(mcpItem),
      count: config.mcpServers.length,
      onAdd: providerId === 'claude' ? () => showMcpAddModal(() => refresh()) : undefined,
    },
    {
      id: 'agents',
      title: 'Agents',
      items: config.agents.map(agentItem),
      count: config.agents.length,
    },
    {
      id: 'skills',
      title: 'Skills Library',
      items: config.skills.map(skillItem),
      count: config.skills.length,
    },
  ];

  if (providerId !== 'codex') {
    sections.push({
      id: 'commands',
      title: 'Custom Commands',
      items: config.commands.map(commandItem),
      count: config.commands.length,
    });
  }

  container.appendChild(renderToolchainSummary(providerId, sections));

  const visibleSections = sections.filter((section) => section.count > 0 || !!section.onAdd);
  for (const section of visibleSections) {
    container.appendChild(renderSection(
      section.id,
      section.title,
      section.items,
      section.count,
      section.onAdd,
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
