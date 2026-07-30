import type { ProjectRecord } from '../../../shared/types/project-state.js';
import {
  openPreviewTargetInLiveView,
  openWorkspaceShellLogs,
} from '../../project-preview-actions.js';

export interface RenderProjectPreviewCenterSectionArgs {
  container: HTMLElement;
  project: ProjectRecord | null;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  onCloseModalWide: () => void;
}

function renderPreviewDiscoveryEmpty(shell: HTMLElement, message: string): void {
  const empty = document.createElement('div');
  empty.className = 'preview-discovery-empty';
  empty.textContent = message;
  shell.appendChild(empty);
}

function createPreviewDiscoveryActions(
  projectId: string,
  onCloseModalWide: () => void,
): HTMLDivElement {
  const actions = document.createElement('div');
  actions.className = 'preview-discovery-actions';

  const openShellBtn = document.createElement('button');
  openShellBtn.className = 'preview-discovery-action-btn';
  openShellBtn.type = 'button';
  openShellBtn.textContent = 'Open workspace shell';
  openShellBtn.addEventListener('click', () => {
    openWorkspaceShellLogs(projectId);
    onCloseModalWide();
  });
  actions.appendChild(openShellBtn);
  return actions;
}

function createPreviewSummary(project: ProjectRecord): HTMLDivElement {
  const summary = document.createElement('div');
  summary.className = 'preview-discovery-summary';
  summary.innerHTML = `
      <div class="preview-discovery-stat">
        <span class="preview-discovery-stat-label">Project</span>
        <span class="preview-discovery-stat-value">${project.name}</span>
      </div>
      <div class="preview-discovery-stat">
        <span class="preview-discovery-stat-label">Active surface</span>
        <span class="preview-discovery-stat-value">Live View</span>
      </div>
    `;
  return summary;
}

function createPreviewTargetItem(
  projectId: string,
  target: Awaited<ReturnType<typeof window.calder.browser.listLocalTargets>>[number],
  onCloseModalWide: () => void,
): HTMLDivElement {
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
    openPreviewTargetInLiveView(projectId, target.url);
    onCloseModalWide();
  });
  itemActions.appendChild(openLiveViewBtn);
  header.appendChild(itemActions);
  item.appendChild(header);
  return item;
}

function loadPreviewTargets(
  list: HTMLElement,
  projectId: string,
  onCloseModalWide: () => void,
): void {
  void window.calder.browser
    .listLocalTargets()
    .then((targets) => {
      if (!list.isConnected) return;
      list.innerHTML = '';

      if (targets.length === 0) {
        renderPreviewDiscoveryEmpty(
          list,
          'No local preview targets are responding right now. Start a dev server and it will show up here.',
        );
        return;
      }

      for (const target of targets) {
        list.appendChild(createPreviewTargetItem(projectId, target, onCloseModalWide));
      }
    })
    .catch(() => {
      if (!list.isConnected) return;
      list.innerHTML = '';
      renderPreviewDiscoveryEmpty(
        list,
        'Preview discovery is unavailable right now. You can still open the workspace shell and check logs manually.',
      );
    });
}

export function renderProjectPreviewCenterSection(
  args: RenderProjectPreviewCenterSectionArgs,
): void {
  const card = args.appendSectionCard(
    args.container,
    'Preview center',
    'Spot local preview targets, open them in Live View, and jump to the workspace shell when you need logs.',
  );

  const shell = document.createElement('div');
  shell.className = 'preview-discovery-shell';
  card.appendChild(shell);

  if (!args.project) {
    renderPreviewDiscoveryEmpty(
      shell,
      'Open a project to inspect local preview targets and connect them to Live View.',
    );
    return;
  }
  const project = args.project;

  shell.appendChild(createPreviewDiscoveryActions(project.id, args.onCloseModalWide));
  shell.appendChild(createPreviewSummary(project));

  const list = document.createElement('div');
  list.className = 'preview-discovery-list';
  shell.appendChild(list);
  renderPreviewDiscoveryEmpty(list, 'Scanning local preview targets…');
  loadPreviewTargets(list, project.id, args.onCloseModalWide);
}
