import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./terminal-pane.ts', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../styles/terminal.css', import.meta.url), 'utf-8');

describe('terminal stage contract', () => {
  it('adds a terminal chrome header for live session framing', () => {
    expect(source).toContain('terminal-pane-chrome');
    expect(source).toContain('terminal-pane-provider');
    expect(source).toContain('terminal-pane-workspace');
    expect(source).toContain('active run');
    expect(source).toContain('linked run');
  });

  it('styles the terminal stage header and elevated frame', () => {
    expect(css).toContain('.terminal-pane-chrome');
    expect(css).toContain('.terminal-pane-provider');
    expect(css).toContain('.terminal-pane-workspace');
    expect(css).toContain('.terminal-pane-session');
    expect(css).toContain('font-family: var(--font-display);');
    expect(css).toContain('.terminal-pane.focused .terminal-pane-chrome');
  });
});
