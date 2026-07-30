import { appState } from '../../state.js';
import type { CliProviderMeta, ProviderId } from '../../types.js';
import {
  describeAutoApprovalScopes as describeAutoApprovalScopesCore,
  renderAutoApprovalSection as renderAutoApprovalSectionCore,
} from './config-sections-auto-approval.js';

const collapsed: Record<string, boolean> = {};

export const describeAutoApprovalScopes = describeAutoApprovalScopesCore;

function renderSection(
  id: string,
  title: string,
  items: HTMLElement[],
  count: number,
  emptyText = 'None configured',
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'config-section';

  const isCollapsed = collapsed[id] ?? false;

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
  if (count > 0) {
    meta.appendChild(countBadge);
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
    items.forEach((el) => body.appendChild(el));
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

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function applyVisibility(): void {
  const container = document.getElementById('config-sections');
  if (!container) return;
  const visible = appState.preferences.sidebarViews?.configSections ?? true;
  container.classList.toggle('hidden', !visible);
}

export function getActiveCliProviderId(): ProviderId {
  const project = appState.activeProject;
  if (!project) return 'claude';

  const activeSession = appState.activeSession;
  if (activeSession && !activeSession.type) {
    return (activeSession.providerId || 'claude') as ProviderId;
  }

  const recentCliSession = [...project.sessions].reverse().find((session) => !session.type);
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

  applyVisibility();

  const project = appState.activeProject;
  if (!project) {
    container.innerHTML = '';
    return;
  }

  const providerId = getActiveCliProviderId();
  const meta: CliProviderMeta | null = await window.calder.provider
    .getMeta(providerId)
    .catch(() => null);

  // Active project may have changed while awaiting provider metadata.
  if (appState.activeProject?.id !== project.id) return;

  container.innerHTML = '';

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
}

export function initConfigSections(): void {
  appState.on('project-changed', () => {
    void refresh();
  });
  appState.on('state-loaded', () => {
    void refresh();
  });
  appState.on('session-changed', () => {
    void refresh();
  });
  appState.on('preferences-changed', () => {
    applyVisibility();
    void refresh();
  });
  void refresh();
}
