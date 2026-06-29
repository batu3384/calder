import { showCommandPalette } from '../components/command-palette.js';
import { toggleContextInspector } from '../components/context-inspector.js';
import { toggleDebugPanel } from '../components/debug-panel.js';
import { DomSearchBackend } from '../components/dom-search-backend.js';
import {
  getFileReaderInstance,
  getFileReaderTextSelector,
  showGoToLineBar,
} from '../components/file-reader.js';
import { getFileViewerInstance } from '../components/file-viewer.js';
import { toggleGitPanel } from '../components/git-panel.js';
import { showHelpDialog } from '../components/help-dialog.js';
import { closeModal, showModal } from '../components/modal.js';
import { showPreferencesModal } from '../components/preferences/preferences-modal.js';
import { getActiveShellSessionId, toggleProjectTerminal } from '../components/project-terminal.js';
import { showQuickOpen } from '../components/quick-open.js';
import {
  ShellTerminalSearchBackend,
  showSearchBar,
  TerminalSearchBackend,
} from '../components/search-bar.js';
import { toggleInspector } from '../components/session-inspector/session-inspector.js';
import { promptNewProject, toggleSidebar } from '../components/sidebar.js';
import { quickNewSession } from '../components/tab-bar/tab-bar.js';
import { getFocusedSessionId } from '../components/terminal-pane.js';
import { appState } from '../state.js';

export interface KeybindingActionBridge {
  showPreferences: () => void;
  newProject: () => void;
  newSession: () => void;
  nextSession: () => void;
  prevSession: () => void;
  gotoSession: (index: number) => void;
  toggleDebug: () => void;
  toggleProjectTerminal: () => void;
  newMcpInspector: () => void;
  showSessionIndicatorsHelp: () => void;
  toggleInspector: () => void;
  toggleContextPanel: () => void;
  closeSession: () => void;
  nextProject: () => void;
  prevProject: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
  toggleSidebar: () => void;
  toggleGitPanel: () => void;
  quickOpen: () => void;
  commandPalette: () => void;
  findInTerminal: () => void;
  gotoLine: () => void;
  help: () => void;
}

export function createKeybindingActionBridge(): KeybindingActionBridge {
  return {
    showPreferences: () => showPreferencesModal(),
    newProject: () => promptNewProject(),
    newSession: () => quickNewSession(),
    nextSession: () => appState.cycleSession(1),
    prevSession: () => appState.cycleSession(-1),
    gotoSession: (index) => appState.gotoSession(index),
    toggleDebug: () => toggleDebugPanel(),
    toggleProjectTerminal: () => toggleProjectTerminal(),
    newMcpInspector: () => promptNewMcpInspector(),
    showSessionIndicatorsHelp: () => showHelpDialog(),
    toggleInspector: () => toggleInspector(),
    toggleContextPanel: () => toggleContextInspector(),
    closeSession: () => {
      const project = appState.activeProject;
      const session = appState.activeSession;
      if (project && session) appState.removeSession(project.id, session.id);
    },
    nextProject: () => cycleProject(1),
    prevProject: () => cycleProject(-1),
    navigateBack: () => appState.navigateBack(),
    navigateForward: () => appState.navigateForward(),
    toggleSidebar: () => toggleSidebar(),
    toggleGitPanel: () => toggleGitPanel(),
    quickOpen: () => showQuickOpen(),
    commandPalette: () => showCommandPalette(),
    findInTerminal: () => findInTerminal(),
    gotoLine: () => gotoLine(),
    help: () => showHelpDialog(),
  };
}

function findInTerminal(): void {
  const shellPanel = document.getElementById('project-terminal-panel');
  if (
    shellPanel &&
    !shellPanel.classList.contains('hidden') &&
    shellPanel.contains(document.activeElement)
  ) {
    const shellSessionId = getActiveShellSessionId();
    if (shellSessionId) {
      showSearchBar(shellSessionId, ShellTerminalSearchBackend(shellSessionId));
      return;
    }
  }

  const session = appState.activeSession;
  if (!session) return;

  if (session.type === 'file-reader') {
    const instance = getFileReaderInstance(session.id);
    if (!instance) return;
    const body = instance.element.querySelector('.file-reader-body') as HTMLElement;
    if (!body) return;
    showSearchBar(session.id, new DomSearchBackend(body, getFileReaderTextSelector(session.id)));
  } else if (session.type === 'diff-viewer') {
    const instance = getFileViewerInstance(session.id);
    if (!instance) return;
    const body = instance.element.querySelector('.file-viewer-body') as HTMLElement;
    if (!body) return;
    showSearchBar(session.id, new DomSearchBackend(body, '.diff-line'));
  } else {
    const sessionId = getFocusedSessionId();
    if (sessionId) showSearchBar(sessionId, TerminalSearchBackend(sessionId));
  }
}

function gotoLine(): void {
  const session = appState.activeSession;
  if (session?.type === 'file-reader') {
    showGoToLineBar(session.id);
  }
}

function promptNewMcpInspector(): void {
  const project = appState.activeProject;
  if (!project) return;

  const inspectorNum =
    project.sessions.filter((session) => session.type === 'mcp-inspector').length + 1;
  showModal(
    'New MCP Inspector',
    [
      {
        label: 'Name',
        id: 'inspector-name',
        placeholder: `Inspector ${inspectorNum}`,
        defaultValue: `Inspector ${inspectorNum}`,
      },
    ],
    (values) => {
      const name = values['inspector-name']?.trim();
      if (!name) return;

      closeModal();
      appState.addMcpInspectorSession(project.id, name);
    },
  );
}

function cycleProject(direction: 1 | -1): void {
  const projects = appState.projects;
  if (!projects.length) return;

  const currentIndex = appState.activeProjectId
    ? projects.findIndex((project) => project.id === appState.activeProjectId)
    : 0;
  const normalizedIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (normalizedIndex + direction + projects.length) % projects.length;
  const target = projects[nextIndex];
  if (!target) return;
  appState.setActiveProject(target.id);
}
