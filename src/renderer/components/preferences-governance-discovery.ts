import type { ProjectRecord } from '../../shared/types/project.js';
import { appState } from '../state.js';
import { toProjectRelativeContextPath } from '../project-context-utils.js';

export interface RenderProjectGovernanceSectionArgs {
  container: HTMLElement;
  project: ProjectRecord | null;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  onRefreshProviders: () => void;
  onCloseModalWide: () => void;
}

export function renderProjectGovernanceSection(args: RenderProjectGovernanceSectionArgs): void {
  const card = args.appendSectionCard(
    args.container,
    'Governance policies',
    'Define repo-local guardrails for write, network, MCP, and budget decisions before Calder starts enforcing them.',
  );

  const shell = document.createElement('div');
  shell.className = 'governance-discovery-shell';
  card.appendChild(shell);

  if (!args.project) {
    const empty = document.createElement('div');
    empty.className = 'governance-discovery-empty';
    empty.textContent = 'Open a project to inspect or create repo-local governance policies.';
    shell.appendChild(empty);
    return;
  }
  const project = args.project;

  const actions = document.createElement('div');
  actions.className = 'governance-discovery-actions';

  const starterBtn = document.createElement('button');
  starterBtn.className = 'governance-discovery-action-btn';
  starterBtn.type = 'button';
  starterBtn.textContent = 'Create starter policy';
  starterBtn.addEventListener('click', async () => {
    starterBtn.disabled = true;
    starterBtn.textContent = 'Creating…';
    try {
      const result = await window.calder.governance.createStarterPolicy(project.path);
      appState.setProjectGovernance(project.id, result.state);
      args.onRefreshProviders();
    } catch {
      starterBtn.disabled = false;
      starterBtn.textContent = 'Create starter policy';
    }
  });
  actions.appendChild(starterBtn);
  shell.appendChild(actions);

  const policy = project.projectGovernance?.policy;
  if (!policy) {
    const empty = document.createElement('div');
    empty.className = 'governance-discovery-empty';
    empty.textContent =
      'No governance policy has been discovered for this repo yet. Start in advisory mode, tune the policy, then enforce when the team is ready.';
    shell.appendChild(empty);
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'governance-discovery-summary';
  summary.innerHTML = `
      <div class="governance-discovery-stat">
        <span class="governance-discovery-stat-label">Mode</span>
        <span class="governance-discovery-stat-value">${policy.mode}</span>
      </div>
      <div class="governance-discovery-stat">
        <span class="governance-discovery-stat-label">Tool policy</span>
        <span class="governance-discovery-stat-value">${policy.toolPolicy}</span>
      </div>
      <div class="governance-discovery-stat">
        <span class="governance-discovery-stat-label">Write policy</span>
        <span class="governance-discovery-stat-value">${policy.writePolicy}</span>
      </div>
      <div class="governance-discovery-stat">
        <span class="governance-discovery-stat-label">Network policy</span>
        <span class="governance-discovery-stat-value">${policy.networkPolicy}</span>
      </div>
      <div class="governance-discovery-stat">
        <span class="governance-discovery-stat-label">Provider profiles</span>
        <span class="governance-discovery-stat-value">${policy.providerProfileCount}</span>
      </div>
    `;
  shell.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'governance-discovery-list';

  const item = document.createElement('div');
  item.className = 'governance-discovery-item';

  const header = document.createElement('div');
  header.className = 'governance-discovery-item-header';

  const title = document.createElement('div');
  title.className = 'governance-discovery-item-title';
  title.textContent = policy.displayName;
  header.appendChild(title);

  const itemActions = document.createElement('div');
  itemActions.className = 'governance-discovery-item-actions';

  const previewBtn = document.createElement('button');
  previewBtn.className = 'governance-discovery-item-btn';
  previewBtn.type = 'button';
  previewBtn.textContent = 'Preview';
  previewBtn.addEventListener('click', () => {
    appState.addFileReaderSession(project.id, policy.path);
    args.onCloseModalWide();
  });
  itemActions.appendChild(previewBtn);

  const relativePath = toProjectRelativeContextPath(project.path, policy.path);
  if (relativePath) {
    const openBtn = document.createElement('button');
    openBtn.className = 'governance-discovery-item-btn';
    openBtn.type = 'button';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', async () => {
      openBtn.disabled = true;
      try {
        await window.calder.git.openInEditor(project.path, relativePath);
      } finally {
        openBtn.disabled = false;
      }
    });
    itemActions.appendChild(openBtn);
  }

  const status = document.createElement('div');
  status.className = 'governance-discovery-item-status';
  status.textContent = `MCP allowlist: ${policy.mcpAllowlistCount} · Provider profiles: ${policy.providerProfileCount}`;
  itemActions.appendChild(status);

  header.appendChild(itemActions);
  item.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'governance-discovery-item-meta';
  const budget = typeof policy.budgetLimitUsd === 'number' ? ` · Budget limit: $${policy.budgetLimitUsd}` : '';
  meta.textContent = `${policy.summary}${budget}`;
  item.appendChild(meta);

  list.appendChild(item);
  shell.appendChild(list);
}
