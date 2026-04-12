import { beforeEach, describe, expect, it, vi } from 'vitest';

const menuHandlers: Record<string, (() => void) | undefined> = {};

const registerMenuHandler = (key: string) => (callback: () => void) => {
  menuHandlers[key] = callback;
  return () => {
    if (menuHandlers[key] === callback) {
      delete menuHandlers[key];
    }
  };
};

function makeClassList(initial: string[] = []) {
  const values = new Set(initial);
  return {
    add: (...tokens: string[]) => tokens.forEach((token) => values.add(token)),
    remove: (...tokens: string[]) => tokens.forEach((token) => values.delete(token)),
    toggle: (token: string, force?: boolean) => {
      if (force === true) {
        values.add(token);
        return true;
      }
      if (force === false) {
        values.delete(token);
        return false;
      }
      if (values.has(token)) {
        values.delete(token);
        return false;
      }
      values.add(token);
      return true;
    },
    contains: (token: string) => values.has(token),
    toString: () => Array.from(values).join(' '),
  };
}

function makeElement(initialClasses: string[] = []) {
  return {
    classList: makeClassList(initialClasses),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    closest: vi.fn(() => null),
    focus: vi.fn(),
  };
}

vi.mock('./state.js', () => ({
  appState: {
    cycleSession: vi.fn(),
    gotoSession: vi.fn(),
    navigateBack: vi.fn(),
    navigateForward: vi.fn(),
    activeSession: null,
  },
}));

vi.mock('./components/sidebar.js', () => ({
  promptNewProject: vi.fn(),
  toggleSidebar: vi.fn(),
}));

vi.mock('./components/tab-bar.js', () => ({
  quickNewSession: vi.fn(),
}));

vi.mock('./components/project-terminal.js', () => ({
  toggleProjectTerminal: vi.fn(),
  getActiveShellSessionId: vi.fn(() => null),
}));

vi.mock('./components/debug-panel.js', () => ({
  toggleDebugPanel: vi.fn(),
}));

vi.mock('./components/help-dialog.js', () => ({
  showHelpDialog: vi.fn(),
}));

vi.mock('./components/terminal-pane.js', () => ({
  getFocusedSessionId: vi.fn(() => null),
}));

vi.mock('./components/search-bar.js', () => ({
  showSearchBar: vi.fn(),
  TerminalSearchBackend: vi.fn(),
  ShellTerminalSearchBackend: vi.fn(),
}));

vi.mock('./components/git-panel.js', () => ({
  toggleGitPanel: vi.fn(),
}));

vi.mock('./components/quick-open.js', () => ({
  showQuickOpen: vi.fn(),
}));

vi.mock('./shortcuts.js', () => ({
  shortcutManager: {
    registerHandler: vi.fn(),
    matchEvent: vi.fn(),
  },
}));

vi.mock('./components/file-reader.js', () => ({
  getFileReaderInstance: vi.fn(() => null),
  getFileReaderTextSelector: vi.fn(() => '.file-reader-line-text'),
  showGoToLineBar: vi.fn(),
}));

vi.mock('./components/file-viewer.js', () => ({
  getFileViewerInstance: vi.fn(() => null),
}));

vi.mock('./components/dom-search-backend.js', () => ({
  DomSearchBackend: vi.fn(),
}));

vi.mock('./components/session-inspector.js', () => ({
  toggleInspector: vi.fn(),
}));

vi.mock('./components/preferences-modal.js', () => ({
  showPreferencesModal: vi.fn(),
}));

vi.mock('./components/modal.js', () => ({
  closeModal: vi.fn(),
  showModal: vi.fn(),
}));

describe('initKeybindings control panel wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key of Object.keys(menuHandlers)) delete menuHandlers[key];

    const mainArea = makeElement(['context-inspector-open']);
    const inspector = makeElement(['context-inspector-open', 'control-panel-surface']);
    const closeButton = makeElement();
    const elements = new Map<string, ReturnType<typeof makeElement>>([
      ['main-area', mainArea],
      ['context-inspector', inspector],
      ['btn-close-context-inspector', closeButton],
    ]);

    vi.stubGlobal('document', {
      body: {},
      activeElement: null,
      getElementById: (id: string) => elements.get(id) ?? null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    vi.stubGlobal('window', {
      calder: {
        menu: {
          onPreferences: registerMenuHandler('preferences'),
          onNewProject: registerMenuHandler('newProject'),
          onNewSession: registerMenuHandler('newSession'),
          onNextSession: registerMenuHandler('nextSession'),
          onPrevSession: registerMenuHandler('prevSession'),
          onGotoSession: (callback: (index: number) => void) => {
            menuHandlers['gotoSession'] = () => callback(0);
            return () => delete menuHandlers['gotoSession'];
          },
          onToggleDebug: registerMenuHandler('toggleDebug'),
          onUsageStats: registerMenuHandler('usageStats'),
          onProjectTerminal: registerMenuHandler('projectTerminal'),
          onNewMcpInspector: registerMenuHandler('newMcpInspector'),
          onSessionIndicatorsHelp: registerMenuHandler('sessionIndicatorsHelp'),
          onToggleInspector: registerMenuHandler('toggleInspector'),
          onToggleContextPanel: registerMenuHandler('toggleContextPanel'),
          onCloseSession: registerMenuHandler('closeSession'),
        },
      },
    });
  });

  it('toggles the control panel open state from the forwarded menu event', async () => {
    const { initKeybindings } = await import('./keybindings.js');

    initKeybindings();

    expect(menuHandlers['toggleContextPanel']).toBeTypeOf('function');

    const mainArea = document.getElementById('main-area')!;
    const inspector = document.getElementById('context-inspector')!;

    expect(mainArea.classList.contains('context-inspector-open')).toBe(true);
    expect(inspector.classList.contains('context-inspector-open')).toBe(true);

    menuHandlers['toggleContextPanel']?.();

    expect(mainArea.classList.contains('context-inspector-open')).toBe(false);
    expect(inspector.classList.contains('context-inspector-open')).toBe(false);
    expect(inspector.classList.contains('context-inspector-closed')).toBe(true);

    menuHandlers['toggleContextPanel']?.();

    expect(mainArea.classList.contains('context-inspector-open')).toBe(true);
    expect(inspector.classList.contains('context-inspector-open')).toBe(true);
    expect(inspector.classList.contains('context-inspector-closed')).toBe(false);
  });
});
