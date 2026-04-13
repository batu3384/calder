import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const projectTerminalSource = readFileSync(new URL('./project-terminal.ts', import.meta.url), 'utf-8');
const remoteTerminalSource = readFileSync(new URL('./remote-terminal-pane.ts', import.meta.url), 'utf-8');
const terminalCss = readFileSync(new URL('../styles/terminal.css', import.meta.url), 'utf-8');

describe('terminal exit surface contract', () => {
  it('uses structured exit overlay content for local and remote terminal endings', () => {
    expect(projectTerminalSource).toContain('terminal-exit-shell');
    expect(projectTerminalSource).toContain('terminal-exit-title');
    expect(projectTerminalSource).toContain('respawn-btn calder-button');
    expect(remoteTerminalSource).toContain('terminal-exit-shell');
    expect(remoteTerminalSource).toContain('terminal-exit-title');
  });

  it('styles exit overlays as product shells instead of raw centered text', () => {
    expect(terminalCss).toContain('.terminal-exit-shell');
    expect(terminalCss).toContain('.terminal-exit-title');
    expect(terminalCss).toContain('.respawn-btn.calder-button');
  });
});
