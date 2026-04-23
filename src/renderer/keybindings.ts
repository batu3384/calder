import { shortcutManager } from './shortcuts.js';
import { createKeybindingActionBridge } from './bootstrap/keybindings-action-bridge.js';

let initialized = false;

export function initKeybindings(): void {
  if (initialized) return;
  initialized = true;
  const actions = createKeybindingActionBridge();

  // Menu-based shortcuts (registered via Electron menu accelerators)
  // These handlers receive events forwarded from the main process menu
  window.calder.menu.onPreferences(() => actions.showPreferences());
  window.calder.menu.onNewProject(() => actions.newProject());
  window.calder.menu.onNewSession(() => actions.newSession());
  window.calder.menu.onNextSession(() => actions.nextSession());
  window.calder.menu.onPrevSession(() => actions.prevSession());
  window.calder.menu.onGotoSession((index) => actions.gotoSession(index));
  window.calder.menu.onToggleDebug(() => actions.toggleDebug());
  window.calder.menu.onProjectTerminal(() => actions.toggleProjectTerminal());
  window.calder.menu.onNewMcpInspector(() => actions.newMcpInspector());
  window.calder.menu.onSessionIndicatorsHelp(() => actions.showSessionIndicatorsHelp());
  window.calder.menu.onToggleInspector(() => actions.toggleInspector());
  const toggleContextInspector = (): void => actions.toggleContextPanel();
  window.calder.menu.onToggleContextPanel(() => toggleContextInspector());
  window.calder.menu.onCloseSession(() => actions.closeSession());

  // Register shortcut handlers
  shortcutManager.registerHandler('new-session', () => actions.newSession());
  shortcutManager.registerHandler('new-session-alt', () => actions.newSession());
  shortcutManager.registerHandler('new-project', () => actions.newProject());
  for (let i = 1; i <= 9; i++) {
    shortcutManager.registerHandler(`goto-session-${i}`, () => actions.gotoSession(i - 1));
  }
  shortcutManager.registerHandler('next-session', () => actions.nextSession());
  shortcutManager.registerHandler('prev-session', () => actions.prevSession());
  shortcutManager.registerHandler('next-project', () => actions.nextProject());
  shortcutManager.registerHandler('prev-project', () => actions.prevProject());
  shortcutManager.registerHandler('tab-back', () => actions.navigateBack());
  shortcutManager.registerHandler('tab-forward', () => actions.navigateForward());
  shortcutManager.registerHandler('toggle-sidebar', () => actions.toggleSidebar());
  shortcutManager.registerHandler('project-terminal', () => actions.toggleProjectTerminal());
  shortcutManager.registerHandler('project-terminal-alt', () => actions.toggleProjectTerminal());
  shortcutManager.registerHandler('debug-panel', () => actions.toggleDebug());
  shortcutManager.registerHandler('git-panel', () => actions.toggleGitPanel());
  shortcutManager.registerHandler('quick-open', () => actions.quickOpen());
  shortcutManager.registerHandler('find-in-terminal', () => actions.findInTerminal());
  shortcutManager.registerHandler('goto-line', () => actions.gotoLine());
  shortcutManager.registerHandler('help', () => actions.help());

  document.addEventListener('keydown', (e) => {
    shortcutManager.matchEvent(e);
  });
}

export function _resetKeybindingsForTesting(): void {
  initialized = false;
}
