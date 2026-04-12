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
    expect(source).toContain('renderSessionProviderSelector');
    expect(source).toContain('resolvePreferredProviderForLaunch');
    expect(source).toContain('syncQuickSessionButtonMeta');
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
