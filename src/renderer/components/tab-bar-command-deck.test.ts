import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const menuSource = readFileSync(new URL('../../main/menu.ts', import.meta.url), 'utf-8');
const keybindingsSource = readFileSync(new URL('../keybindings.ts', import.meta.url), 'utf-8');

describe('tab bar command deck contract', () => {
  it('does not expose old command deck or hamburger toggle buttons', () => {
    expect(source).not.toContain('btn-command-deck-more');
    expect(source).not.toContain('btn-toggle-context-inspector');
    expect(source).not.toContain('showCommandDeckOverflowMenu');
  });

  it('renders an inline provider selector beside new session', () => {
    expect(source).toContain('session-provider-slot');
    expect(source).toContain('syncSessionProviderSelector');
    expect(source).toContain('resolvePreferredProviderForLaunch');
    expect(source).toContain('syncQuickSessionButtonMeta');
  });

  it('pins launcher dropdowns to the right edge and stabilizes the launcher shell while they are open', () => {
    expect(source).toContain("placement: 'bottom-end'");
    expect(source).toContain("strategy: 'absolute'");
    expect(source).toContain("sessionLauncher.dataset.selectOpen = open ? 'true' : 'false';");
  });

  it('keeps the inline provider picker mounted instead of rebuilding it on every preference write', () => {
    expect(source).toContain('function syncSessionProviderSelector(): void');
    expect(source).toContain('let sessionProviderSelectorSignature =');
    expect(source).toContain('sessionProviderSelect?.setValue(selectedProvider);');
    expect(source).not.toContain("appState.on('preferences-changed', renderSessionProviderSelector);");
  });

  it('keeps former command deck tools reachable from the app menu', () => {
    expect(menuSource).toContain('Project Scratch Shell');
    expect(menuSource).toContain('Usage Stats');
    expect(menuSource).toContain('New MCP Inspector');
    expect(menuSource).toContain('Session Indicators Help');
    expect(keybindingsSource).toContain('onProjectTerminal');
    expect(keybindingsSource).toContain('onNewMcpInspector');
    expect(keybindingsSource).toContain('onSessionIndicatorsHelp');
  });
});
