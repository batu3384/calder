import type { ProjectRecord, SessionRecord } from '../../state.js';
import { createSessionTab } from './tab-bar-session-tab-factory.js';
import { getProjectSurface, updateProjectSurface } from './tab-bar-surface-state.js';
import { createSurfaceModeTab } from './tab-bar-surface-tab-factory.js';

interface RenderTabListOptions {
  project: ProjectRecord;
  tabListEl: HTMLElement;
  cliSurfaceTabActive: boolean;
  mobileSurfaceTabActive: boolean;
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
  focusMobileSurfaceTab: (projectId: string) => void;
  closeMobileSurface: (projectId: string) => void;
}

export function renderTabList(options: RenderTabListOptions): void {
  const {
    project,
    tabListEl,
    cliSurfaceTabActive,
    mobileSurfaceTabActive,
    escapeHtml,
    startRename,
    showTabContextMenu,
    buildCliSurfaceTabTitle,
    focusCliSurfaceTab,
    closeCliSurface,
    focusMobileSurfaceTab,
    closeMobileSurface,
  } = options;

  const surfaceState = getProjectSurface(project);
  const surfaceTabPlacement = surfaceState.tabPlacement === 'start' ? 'start' : 'end';
  const surfaceTabOrder: Array<'cli' | 'mobile'> =
    Array.isArray(surfaceState.tabOrder) &&
    surfaceState.tabOrder.length === 2 &&
    surfaceState.tabOrder.includes('cli') &&
    surfaceState.tabOrder.includes('mobile')
      ? surfaceState.tabOrder
      : ['cli', 'mobile'];

  const sessionTabNodes: HTMLElement[] = [];
  const surfaceTabNodes: HTMLElement[] = [];

  for (const session of project.sessions) {
    sessionTabNodes.push(
      createSessionTab({
        project,
        session,
        tabListEl,
        cliSurfaceTabActive,
        mobileSurfaceTabActive,
        escapeHtml,
        startRename,
        showTabContextMenu,
        getProjectSurface,
        updateProjectSurface,
      }),
    );
  }

  const surfaceTabFactories: Record<'cli' | 'mobile', () => HTMLElement | null> = {
    cli: () => {
      if (!(project.surface?.active && project.surface.kind === 'cli')) return null;
      return createSurfaceModeTab({
        kind: 'cli',
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
    },
    mobile: () => {
      if (!(project.surface?.active && project.surface.kind === 'mobile')) return null;
      return createSurfaceModeTab({
        kind: 'mobile',
        project,
        tabListEl,
        active: mobileSurfaceTabActive,
        title: 'Mobile Surface',
        badgeMarkup: '<span class="tab-browser-badge">MOB</span>',
        label: 'Mobile Surface',
        onFocus: () => focusMobileSurfaceTab(project.id),
        onClose: () => closeMobileSurface(project.id),
        getProjectSurface,
        updateProjectSurface,
      });
    },
  };

  for (const kind of surfaceTabOrder) {
    const next = surfaceTabFactories[kind]();
    if (next) surfaceTabNodes.push(next);
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
