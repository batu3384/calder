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
    expect(source).toContain('command-deck-provider-select');
    expect(source).not.toContain('session-provider-chipbar');
    expect(source).not.toContain('session-provider-chip');
    expect(source).not.toContain('SESSION_PROVIDER_SHORT_LABELS');
  });

  it('pins launcher dropdowns to the right edge and stabilizes the launcher shell while they are open', () => {
    expect(source).toContain("placement: 'bottom-end'");
    expect(source).toContain("strategy: 'fixed'");
    expect(source).toContain("function setSessionLauncherSelectOpen(selectKey: LauncherSelectKey, open: boolean): void");
    expect(source).toContain('const anyOpen = launcherSelectOpenState.profile || launcherSelectOpenState.provider;');
    expect(source).toContain("onOpenChange: (open) => setSessionLauncherSelectOpen('provider', open)");
    expect(source).toContain("onOpenChange: (open) => setSessionLauncherSelectOpen('profile', open)");
  });

  it('keeps the inline provider picker mounted instead of rebuilding it on every preference write', () => {
    expect(source).toContain('function syncSessionProviderSelector(): void');
    expect(source).toContain('let sessionProviderSelectorSignature =');
    expect(source).toContain('sessionProviderSelect?.setValue(selectedProvider);');
    expect(source).not.toContain("appState.on('preferences-changed', renderSessionProviderSelector);");
  });

  it('keeps surface controls mounted when signatures have not changed to avoid dropdown flicker', () => {
    expect(source).toContain('let surfaceControlsSignature =');
    expect(source).toContain('function buildSurfaceControlsSignature(project: ProjectRecord): string');
    expect(source).toContain('if (nextSignature === surfaceControlsSignature) return;');
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
