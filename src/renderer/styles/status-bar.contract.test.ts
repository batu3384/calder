import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const statusBarCss = readFileSync(new URL('./status-bar.css', import.meta.url), 'utf-8');
const imports = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8');
const orchestratorSource = readFileSync(
  new URL('../bootstrap/renderer-session-orchestrator.ts', import.meta.url),
  'utf-8',
);

describe('global status bar contract', () => {
  it('exposes one fixed footer with status role and quiet live region', () => {
    expect(html).toContain('id="status-bar"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="off"');
    expect(html).toContain('aria-label="Workspace status"');
  });

  it('mirrors git, provider, and session as labeled items', () => {
    expect(html).toContain('id="status-bar-git"');
    expect(html).toContain('id="status-bar-provider"');
    expect(html).toContain('id="status-bar-session"');
    expect(html).toContain('aria-label="Git branch and working tree status"');
    expect(html).toContain('aria-label="Session provider"');
  });

  it('styles the bar as a 26px IDE strip', () => {
    expect(statusBarCss).toContain('height: 26px;');
    expect(statusBarCss).toContain('font-family: var(--font-mono);');
    expect(statusBarCss).toContain('border-top: 1px solid');
    expect(statusBarCss).toContain('position: fixed;');
    expect(statusBarCss).toContain('bottom: 0;');
  });

  it('loads the stylesheet with feature styles and wires init', () => {
    expect(imports).toContain("@import url('./styles/status-bar.css');");
    expect(orchestratorSource).toContain("from '../components/status-bar.js'");
    expect(orchestratorSource).toContain('initStatusBar();');
  });
});
