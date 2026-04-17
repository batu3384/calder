import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const base = readFileSync(new URL('./base.css', import.meta.url), 'utf-8');
const primitives = readFileSync(new URL('./primitives.css', import.meta.url), 'utf-8');
const contextInspector = readFileSync(new URL('./context-inspector.css', import.meta.url), 'utf-8');
const browser = readFileSync(new URL('./browser-tab.css', import.meta.url), 'utf-8');
const terminal = readFileSync(new URL('./terminal.css', import.meta.url), 'utf-8');
const modalSource = readFileSync(new URL('../components/modal.ts', import.meta.url), 'utf-8');
const selectSource = readFileSync(new URL('../components/custom-select.ts', import.meta.url), 'utf-8');

describe('native-first UI system contract', () => {
  it('imports the shared primitives directly after cockpit tokens', () => {
    expect(styles).toContain("@import url('./styles/cockpit.css');\n@import url('./styles/primitives.css');");
  });

  it('defines the native-first token groups', () => {
    expect(base).toContain('--surface-shell');
    expect(base).toContain('--border-hairline');
    expect(base).toContain('--accent-line');
    expect(base).toContain('--motion-fast');
    expect(base).toContain('--motion-panel');
  });

  it('defines reduced motion rules at the token layer', () => {
    expect(base).toContain('@media (prefers-reduced-motion: reduce)');
    expect(base).toContain('--motion-fast: 0ms');
    expect(base).toContain('animation-duration: 0.001ms');
  });

  it('provides shared primitive classes instead of one-off surface styling only', () => {
    expect(primitives).toContain('.calder-button');
    expect(primitives).toContain('.calder-icon-button');
    expect(primitives).toContain('.calder-list-row');
    expect(primitives).toContain('.calder-popover');
    expect(primitives).toContain('.calder-floating-list');
    expect(primitives).toContain('.calder-inline-notice');
    expect(primitives).toContain('.calder-status-pill');
    expect(primitives).toContain('.calder-section-heading');
  });

  it('keeps the app operational surface-oriented instead of card-grid oriented', () => {
    expect(contextInspector).toContain('.control-panel-surface');
    expect(contextInspector).not.toContain('dashboard-card-grid');
    expect(browser).toContain('.browser-toolbar-primary');
    expect(terminal).toContain('.terminal-pane.focused');
  });

  it('keeps modal and custom-select surfaces accessible to assistive tech', () => {
    expect(modalSource).toContain("role', 'dialog'");
    expect(modalSource).toContain("aria-modal', 'true'");
    expect(selectSource).toContain("role', 'listbox'");
    expect(selectSource).toContain("role', 'option'");
  });
});
