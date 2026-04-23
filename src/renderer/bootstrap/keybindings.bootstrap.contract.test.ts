import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const keybindingsSource = readFileSync(new URL('../keybindings.ts', import.meta.url), 'utf-8');
const bridgeSource = readFileSync(new URL('./keybindings-action-bridge.ts', import.meta.url), 'utf-8');

describe('keybindings bootstrap bridge contract', () => {
  it('routes shortcut and menu actions through a dedicated action bridge', () => {
    expect(keybindingsSource).toContain("import { createKeybindingActionBridge } from './bootstrap/keybindings-action-bridge.js';");
    expect(keybindingsSource).toContain('const actions = createKeybindingActionBridge();');
    expect(keybindingsSource).toContain('window.calder.menu.onProjectTerminal(() => actions.toggleProjectTerminal());');
    expect(keybindingsSource).toContain('window.calder.menu.onNewMcpInspector(() => actions.newMcpInspector());');
    expect(keybindingsSource).toContain('window.calder.menu.onSessionIndicatorsHelp(() => actions.showSessionIndicatorsHelp());');
  });

  it('keeps session/search/mcp inspector implementations in the bridge module', () => {
    expect(bridgeSource).toContain('showSearchBar(shellSessionId, ShellTerminalSearchBackend(shellSessionId));');
    expect(bridgeSource).toContain('showSearchBar(session.id, new DomSearchBackend(body, getFileReaderTextSelector(session.id)));');
    expect(bridgeSource).toContain("showModal('New MCP Inspector'");
    expect(bridgeSource).toContain('appState.addMcpInspectorSession(project.id, name);');
    expect(bridgeSource).toContain('appState.setActiveProject(target.id);');
  });
});
