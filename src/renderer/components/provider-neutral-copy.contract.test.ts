import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const preferencesSource = readFileSync(new URL('./preferences-modal.ts', import.meta.url), 'utf-8');
const settingsGuardSource = readFileSync(new URL('./settings-guard-ui.ts', import.meta.url), 'utf-8');
const conflictModalSource = readFileSync(new URL('./statusline-conflict-modal.ts', import.meta.url), 'utf-8');
const browserStageSource = readFileSync(new URL('./browser-tab/pane.ts', import.meta.url), 'utf-8');
const contributing = readFileSync(new URL('../../../CONTRIBUTING.md', import.meta.url), 'utf-8');
const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf-8');
const pkg = readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8');

describe('provider-neutral copy contract', () => {
  it('aligns inspector toggles with the current workspace language', () => {
    expect(preferencesSource).toContain('Ops Rail modules');
    expect(preferencesSource).toContain('Live View behavior');
    expect(preferencesSource).toContain('Session Deck defaults');
    expect(preferencesSource).toContain('Providers');
    expect(preferencesSource).not.toContain('Context inspector: Toolchain');
    expect(preferencesSource).not.toContain('Context inspector: AI Setup');
  });

  it('uses provider-neutral language in settings warnings and conflict prompts', () => {
    expect(settingsGuardSource).toContain('Tracking is off for this coding tool');
    expect(conflictModalSource).toContain('Use Calder status line?');
    expect(settingsGuardSource).not.toContain('Claude Code');
    expect(conflictModalSource).not.toContain('Claude Code');
  });

  it('uses session-oriented language in the browser workspace', () => {
    expect(browserStageSource).toContain('Hand off to session');
    expect(browserStageSource).toContain('Send to selected');
  });

  it('keeps contributor guidance and package metadata provider-agnostic', () => {
    expect(contributing).toContain('Installed CLI provider version(s)');
    expect(readme).toContain('across modern AI coding CLIs');
    expect(pkg).toContain('"coding-agents"');
    expect(pkg).not.toContain('"claude"');
    expect(pkg).not.toContain('"claude-code"');
  });
});
