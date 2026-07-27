import type { ProjectRecord, SessionRecord } from '../../state.js';
import { createSessionTab } from './tab-bar-session-tab-factory.js';
import { getProjectSurface, updateProjectSurface } from './tab-bar-surface-state.js';
import { createSurfaceModeTab } from './tab-bar-surface-tab-factory.js';

interface RenderTabListOptions {
  project: ProjectRecord;
  tabListEl: HTMLElement;
  cliSurfaceTabActive: boolean;
  escapeHtml: (value: string) => string;
  startRename: (tab: HTMLElement, project: ProjectRecord, session: SessionRecord) => void;
  showTabContextMenu: (
    x: number,
    y: number,
    project: ProjectRecord,
    session: SessionRecord,
    tab: HTMLElement,
  ) => void;
  buildCliSurfaceTabTitle: (project: ProjectRecord) => string;
  focusCliSurfaceTab: (projectId: string) => void;
  closeCliSurface: (projectId: string) => void;
}

export function renderTabList(options: RenderTabListOptions): void {
  const {
    project,
    tabListEl,
    cliSurfaceTabActive,
    escapeHtml,
    startRename,
    showTabContextMenu,
    buildCliSurfaceTabTitle,
    focusCliSurfaceTab,
    closeCliSurface,
  } = options;

  const surfaceState = getProjectSurface(project);
  const surfaceTabPlacement = surfaceState.tabPlacement === 'start' ? 'start' : 'end';

  const sessionTabNodes: HTMLElement[] = [];
  const surfaceTabNodes: HTMLElement[] = [];

  for (const session of project.sessions) {
    sessionTabNodes.push(
      createSessionTab({
        project,
        session,
        tabListEl,
        cliSurfaceTabActive,
        escapeHtml,
        startRename,
        showTabContextMenu,
        getProjectSurface,
        updateProjectSurface,
      }),
    );
  }

  if (project.surface?.active && project.surface.kind === 'cli') {
    const cliTab = createSurfaceModeTab({
      project,
      tabListEl,
      active: cliSurfaceTabActive,
      title: buildCliSurfaceTabTitle(project),
      badgeMarkup: '<span class="tab-cli-surface-badge">CLI</span>',
      label: 'CLI Surface',
      onFocus: () => focusCliSurfaceTab(project.id),
      onClose: () => closeCliSurface(project.id),
      getProjectSurface,
      updateProjectSurface,
    });
    surfaceTabNodes.push(cliTab);
  }

  const appendTabs = (nodes: HTMLElement[]): void => {
    for (const node of nodes) {
      tabListEl.appendChild(node);
    }
  };

  if (surfaceTabPlacement === 'start') {
    appendTabs(surfaceTabNodes);
    appendTabs(sessionTabNodes);
  } else {
    appendTabs(sessionTabNodes);
    appendTabs(surfaceTabNodes);
  }
}
