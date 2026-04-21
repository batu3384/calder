import type { ProjectRecord } from '../../shared/types.js';
import {
  describePreviewRuntimeHealth,
  focusCliPreviewSurface,
  openPreviewTargetInLiveView,
  openWorkspaceShellLogs,
  restartPreviewRuntime,
} from '../project-preview-actions.js';

export interface RenderProjectPreviewCenterSectionArgs {
  container: HTMLElement;
  project: ProjectRecord | null;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  onCloseModalWide: () => void;
}

export function renderProjectPreviewCenterSection(args: RenderProjectPreviewCenterSectionArgs): void {
  const card = args.appendSectionCard(
    args.container,
    'Preview center',
    'Spot local preview targets, open them in Live View, and jump straight to the CLI or workspace shell when you need logs.',
  );

  const shell = document.createElement('div');
  shell.className = 'preview-discovery-shell';
  card.appendChild(shell);

  if (!args.project) {
    const empty = document.createElement('div');
    empty.className = 'preview-discovery-empty';
    empty.textContent = 'Open a project to inspect local preview targets and connect them to Live View.';
    shell.appendChild(empty);
    return;
  }
  const project = args.project;

  const actions = document.createElement('div');
  actions.className = 'preview-discovery-actions';

  const focusCliBtn = document.createElement('button');
  focusCliBtn.className = 'preview-discovery-action-btn';
  focusCliBtn.type = 'button';
  focusCliBtn.textContent = 'Focus CLI Surface';
  focusCliBtn.addEventListener('click', () => {
    focusCliPreviewSurface(project.id);
    args.onCloseModalWide();
  });
  actions.appendChild(focusCliBtn);

  const openShellBtn = document.createElement('button');
  openShellBtn.className = 'preview-discovery-action-btn';
  openShellBtn.type = 'button';
  openShellBtn.textContent = 'Open workspace shell';
  openShellBtn.addEventListener('click', () => {
    openWorkspaceShellLogs(project.id);
    args.onCloseModalWide();
  });
  actions.appendChild(openShellBtn);

  const restartRuntimeBtn = document.createElement('button');
  restartRuntimeBtn.className = 'preview-discovery-action-btn';
  restartRuntimeBtn.type = 'button';
  restartRuntimeBtn.textContent = 'Restart preview runtime';
  restartRuntimeBtn.addEventListener('click', async () => {
    restartRuntimeBtn.disabled = true;
    restartRuntimeBtn.textContent = 'Restarting…';
    const result = await restartPreviewRuntime(project.id);
    if (result.ok) {
      focusCliPreviewSurface(project.id);
      openWorkspaceShellLogs(project.id);
      args.onCloseModalWide();
    } else {
      restartRuntimeBtn.disabled = false;
      restartRuntimeBtn.textContent = 'Restart failed';
    }
  });
  actions.appendChild(restartRuntimeBtn);

  shell.appendChild(actions);

  const surface = project.surface;
  const cliRuntime = surface?.cli?.runtime;
  const runtimeHealth = describePreviewRuntimeHealth(project.id);
  const activeSurfaceLabel =
    surface?.kind === 'cli' ? 'CLI Surface' : surface?.kind === 'mobile' ? 'Mobile Surface' : 'Live View';

  const summary = document.createElement('div');
  summary.className = 'preview-discovery-summary';
  summary.innerHTML = `
      <div class="preview-discovery-stat">
        <span class="preview-discovery-stat-label">Project</span>
        <span class="preview-discovery-stat-value">${project.name}</span>
      </div>
      <div class="preview-discovery-stat">
        <span class="preview-discovery-stat-label">Active surface</span>
        <span class="preview-discovery-stat-value">${activeSurfaceLabel}</span>
      </div>
      <div class="preview-discovery-stat">
        <span class="preview-discovery-stat-label">Runtime health</span>
        <span class="preview-discovery-stat-value">${runtimeHealth.statusLabel}</span>
      </div>
    `;
  shell.appendChild(summary);

  const health = document.createElement('div');
  health.className = 'preview-discovery-health';
  health.dataset.tone = runtimeHealth.tone;

  const healthHeader = document.createElement('div');
  healthHeader.className = 'preview-discovery-health-header';

  const healthStatus = document.createElement('div');
  healthStatus.className = 'preview-discovery-health-status';
  healthStatus.textContent = runtimeHealth.statusLabel;
  healthHeader.appendChild(healthStatus);

  const healthDetail = document.createElement('div');
  healthDetail.className = 'preview-discovery-health-detail';
  healthDetail.textContent = runtimeHealth.detail;
  healthHeader.appendChild(healthDetail);

  health.appendChild(healthHeader);

  if (runtimeHealth.lastExitLabel || runtimeHealth.lastErrorLabel) {
    const facts = document.createElement('div');
    facts.className = 'preview-discovery-health-facts';

    if (runtimeHealth.lastExitLabel) {
      const exit = document.createElement('div');
      exit.className = 'preview-discovery-health-fact';
      exit.textContent = `Last exit: ${runtimeHealth.lastExitLabel}`;
      facts.appendChild(exit);
    }

    if (runtimeHealth.lastErrorLabel) {
      const error = document.createElement('div');
      error.className = 'preview-discovery-health-fact';
      error.textContent = `Last error: ${runtimeHealth.lastErrorLabel}`;
      facts.appendChild(error);
    }

    health.appendChild(facts);
  } else if (cliRuntime?.cwd) {
    const cwd = document.createElement('div');
    cwd.className = 'preview-discovery-health-fact';
    cwd.textContent = `Runtime cwd: ${cliRuntime.cwd}`;
    health.appendChild(cwd);
  }

  shell.appendChild(health);

  const list = document.createElement('div');
  list.className = 'preview-discovery-list';
  shell.appendChild(list);

  const loading = document.createElement('div');
  loading.className = 'preview-discovery-empty';
  loading.textContent = 'Scanning local preview targets…';
  list.appendChild(loading);

  void window.calder.browser
    .listLocalTargets()
    .then((targets) => {
      if (!list.isConnected) return;
      list.innerHTML = '';

      if (targets.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'preview-discovery-empty';
        empty.textContent = 'No local preview targets are responding right now. Start a dev server and it will show up here.';
        list.appendChild(empty);
        return;
      }

      for (const target of targets) {
        const item = document.createElement('div');
        item.className = 'preview-discovery-item';

        const header = document.createElement('div');
        header.className = 'preview-discovery-item-header';

        const copy = document.createElement('div');
        copy.className = 'preview-discovery-item-copy';

        const title = document.createElement('div');
        title.className = 'preview-discovery-item-title';
        title.textContent = target.label;

        const meta = document.createElement('div');
        meta.className = 'preview-discovery-item-meta';
        meta.textContent = target.meta ? `${target.meta} · ${target.url}` : target.url;

        copy.appendChild(title);
        copy.appendChild(meta);
        header.appendChild(copy);

        const itemActions = document.createElement('div');
        itemActions.className = 'preview-discovery-item-actions';

        const openLiveViewBtn = document.createElement('button');
        openLiveViewBtn.className = 'preview-discovery-item-btn';
        openLiveViewBtn.type = 'button';
        openLiveViewBtn.textContent = 'Open in Live View';
        openLiveViewBtn.addEventListener('click', () => {
          openPreviewTargetInLiveView(project.id, target.url);
          args.onCloseModalWide();
        });
        itemActions.appendChild(openLiveViewBtn);

        header.appendChild(itemActions);
        item.appendChild(header);
        list.appendChild(item);
      }
    })
    .catch(() => {
      if (!list.isConnected) return;
      list.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'preview-discovery-empty';
      empty.textContent = 'Preview discovery is unavailable right now. You can still open the workspace shell and check logs manually.';
      list.appendChild(empty);
    });
}
