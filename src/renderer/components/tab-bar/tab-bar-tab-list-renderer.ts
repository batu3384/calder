import type { ProjectRecord, SessionRecord } from '../../state.js';
import { createSessionTab } from './tab-bar-session-tab-factory.js';

interface RenderTabListOptions {
  project: ProjectRecord;
  tabListEl: HTMLElement;
  escapeHtml: (value: string) => string;
  startRename: (tab: HTMLElement, project: ProjectRecord, session: SessionRecord) => void;
  showTabContextMenu: (
    x: number,
    y: number,
    project: ProjectRecord,
    session: SessionRecord,
    tab: HTMLElement,
  ) => void;
}

export function renderTabList(options: RenderTabListOptions): void {
  const { project, tabListEl, escapeHtml, startRename, showTabContextMenu } = options;

  for (const session of project.sessions) {
    tabListEl.appendChild(
      createSessionTab({
        project,
        session,
        tabListEl,
        escapeHtml,
        startRename,
        showTabContextMenu,
      }),
    );
  }
}
