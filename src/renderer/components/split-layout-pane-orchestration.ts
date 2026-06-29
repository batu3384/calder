import type { ProviderId } from '../../shared/types/provider.js';
import type { SessionRecord } from '../../shared/types/session.js';
import { appState, type ProjectRecord } from '../state.js';
import {
  attachBrowserTabToContainer,
  createBrowserTabPane,
  destroyBrowserTabPane,
  getBrowserTabInstance,
  hideAllBrowserTabPanes,
  showBrowserTabPane,
} from './browser-tab-pane.js';
import { hideAllCliSurfacePanes } from './cli-surface/pane.js';
import {
  attachFileReaderToContainer,
  createFileReaderPane,
  destroyFileReaderPane,
  getFileReaderInstance,
  hideAllFileReaderPanes,
  setFileReaderLine,
  showFileReaderPane,
} from './file-reader.js';
import {
  attachFileViewerToContainer,
  createFileViewerPane,
  destroyFileViewerPane,
  getFileViewerInstance,
  hideAllFileViewerPanes,
  showFileViewerPane,
} from './file-viewer.js';
import {
  attachInspectorToContainer,
  createInspectorPane,
  destroyInspectorPane,
  disconnectInspector,
  getInspectorInstance,
  hideAllInspectorPanes,
  showInspectorPane,
} from './mcp-inspector.js';
import { hideAllMobileSurfacePanes } from './mobile-surface/pane.js';
import {
  attachRemoteToContainer,
  destroyRemoteTerminal,
  getRemoteTerminalInstance,
  hideAllRemotePanes,
  showRemotePane,
} from './remote-terminal-pane.js';
import {
  attachToContainer,
  createTerminalPane,
  destroyTerminal,
  fitAllVisible,
  getTerminalInstance,
  hideAllPanes,
  setPendingPrompt,
  showPane,
  spawnTerminal,
} from './terminal-pane.js';

type RenderLayout = () => void;

export function hideAllSplitLayoutPanes(): void {
  hideAllPanes();
  hideAllInspectorPanes();
  hideAllFileViewerPanes();
  hideAllFileReaderPanes();
  hideAllRemotePanes();
  hideAllBrowserTabPanes();
  hideAllCliSurfacePanes();
  hideAllMobileSurfacePanes();
}

export function removeSplitLayoutMosaicArtifacts(container: HTMLElement): void {
  container.querySelectorAll('.swarm-grid-wrapper').forEach((element) => element.remove());
  container.querySelectorAll('.swarm-browser-column').forEach((element) => element.remove());
  container.querySelectorAll('.swarm-empty-cell').forEach((element) => element.remove());
  container.querySelectorAll('.mosaic-session-canvas').forEach((element) => element.remove());
  container.querySelectorAll('.mosaic-browser-column').forEach((element) => element.remove());
  container.querySelectorAll('.mosaic-divider-browser').forEach((element) => element.remove());
}

export function ensureSplitLayoutSessionInstances(project: ProjectRecord): void {
  for (const session of project.sessions) {
    if (session.type === 'file-reader') {
      if (!getFileReaderInstance(session.id)) {
        createFileReaderPane(session.id, session.fileReaderPath || '', session.fileReaderLine);
      }
    } else if (session.type === 'diff-viewer') {
      if (!getFileViewerInstance(session.id)) {
        createFileViewerPane(session.id, session.diffFilePath || '', session.diffArea || '', session.worktreePath);
      }
    } else if (session.type === 'mcp-inspector') {
      if (!getInspectorInstance(session.id)) {
        createInspectorPane(session.id);
      }
    } else if (session.type === 'remote-terminal') {
      // Remote terminal instances are created by share-manager, skip here
    } else if (session.type === 'browser-tab') {
      if (!getBrowserTabInstance(session.id)) {
        createBrowserTabPane(session.id, session.browserTabUrl);
      }
    } else if (!getTerminalInstance(session.id)) {
      createTerminalPane(
        session.id,
        project.path,
        session.cliSessionId,
        !!session.cliSessionId,
        session.args || '',
        session.providerId || 'claude',
        project.id,
      );
    }
  }
}

interface SessionAddedPayload {
  projectId: string;
  session: SessionRecord;
}

export function handleSplitLayoutSessionAdded(data: unknown, renderLayout: RenderLayout): void {
  const { session } = data as SessionAddedPayload;
  const project = appState.activeProject;
  if (!project) return;

  if (session.type === 'file-reader') {
    createFileReaderPane(session.id, session.fileReaderPath || '', session.fileReaderLine);
    renderLayout();
    return;
  }
  if (session.type === 'diff-viewer') {
    createFileViewerPane(session.id, session.diffFilePath || '', session.diffArea || '', session.worktreePath);
    renderLayout();
    return;
  }
  if (session.type === 'mcp-inspector') {
    createInspectorPane(session.id);
    renderLayout();
    return;
  }
  if (session.type === 'remote-terminal') {
    // Remote terminal pane is created by share-manager before session-added fires
    renderLayout();
    return;
  }
  if (session.type === 'browser-tab') {
    createBrowserTabPane(session.id, session.browserTabUrl);
    renderLayout();
    return;
  }

  // Create and spawn immediately
  createTerminalPane(
    session.id,
    project.path,
    session.cliSessionId,
    !!session.cliSessionId,
    session.args || '',
    (session.providerId as ProviderId) || 'claude',
    project.id,
  );
  const pending = appState.consumePendingInitialPrompt(project.id, session.id);
  if (pending) {
    setPendingPrompt(session.id, pending);
  }
  renderLayout();

  // Spawn after layout is rendered so terminal has dimensions
  requestAnimationFrame(() => {
    spawnTerminal(session.id);
    fitAllVisible();
  });
}

interface SessionRemovedPayload {
  projectId: string;
  sessionId: string;
}

export function handleSplitLayoutSessionRemoved(data: unknown, renderLayout: RenderLayout): void {
  const { sessionId } = data as SessionRemovedPayload;
  if (getFileReaderInstance(sessionId)) {
    destroyFileReaderPane(sessionId);
  } else if (getFileViewerInstance(sessionId)) {
    destroyFileViewerPane(sessionId);
  } else if (getInspectorInstance(sessionId)) {
    disconnectInspector(sessionId);
    destroyInspectorPane(sessionId);
  } else if (getRemoteTerminalInstance(sessionId)) {
    destroyRemoteTerminal(sessionId);
  } else if (getBrowserTabInstance(sessionId)) {
    destroyBrowserTabPane(sessionId);
  } else {
    destroyTerminal(sessionId);
  }
  renderLayout();
}

type DisplaySession = Pick<SessionRecord, 'id' | 'type' | 'fileReaderLine'>;

export function attachSplitLayoutNonCliPane(session: DisplaySession, target: HTMLElement, inSplit: boolean): void {
  if (session.type === 'file-reader') {
    attachFileReaderToContainer(session.id, target);
    showFileReaderPane(session.id, inSplit);
    if (session.fileReaderLine) {
      setFileReaderLine(session.id, session.fileReaderLine);
    }
  } else if (session.type === 'diff-viewer') {
    attachFileViewerToContainer(session.id, target);
    showFileViewerPane(session.id, inSplit);
  } else if (session.type === 'mcp-inspector') {
    attachInspectorToContainer(session.id, target);
    showInspectorPane(session.id, inSplit);
  } else if (session.type === 'remote-terminal') {
    attachRemoteToContainer(session.id, target);
    showRemotePane(session.id, inSplit);
  } else if (session.type === 'browser-tab') {
    attachBrowserTabToContainer(session.id, target);
    showBrowserTabPane(session.id, inSplit);
  }
}

export function showSplitLayoutPanes(project: ProjectRecord, paneIds: string[], target: HTMLElement): void {
  for (const paneId of paneIds) {
    const session = project.sessions.find((entry) => entry.id === paneId);
    if (session?.type && session.type !== 'claude') {
      attachSplitLayoutNonCliPane(session, target, true);
      continue;
    }

    attachToContainer(paneId, target);
    showPane(paneId, true);

    const instance = getTerminalInstance(paneId);
    if (instance && !instance.spawned && !instance.exited) {
      requestAnimationFrame(() => spawnTerminal(paneId));
    }
  }
}
