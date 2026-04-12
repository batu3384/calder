import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');
const tabBarSource = readFileSync(new URL('../components/tab-bar.ts', import.meta.url), 'utf-8');

describe('command deck stylesheet contract', () => {
  it('renders status and launcher controls as compact instrument blocks', () => {
    expect(tabsCss).toContain('.command-deck-status');
    expect(tabsCss).toContain('#workspace-spend');
    expect(tabsCss).toContain('#git-status');
    expect(tabsCss).toContain('.session-launcher-group');
    expect(tabsCss).toContain('border-radius: 10px;');
    expect(tabsCss).toContain('background: color-mix(in srgb, var(--surface-muted) 64%, black);');
  });

  it('keeps launcher and provider selection in the same compact rhythm', () => {
    expect(tabsCss).toContain('.command-deck-provider-select .custom-select-trigger');
    expect(tabsCss).toContain('min-height: 30px;');
    expect(tabsCss).toContain('padding: 3px;');
    expect(tabsCss).toContain('.tab-action-primary');
  });

  it('uses operational project metadata instead of live archived jargon', () => {
    expect(tabBarSource).toContain('workspace-project-meta');
    expect(tabBarSource).toContain('open');
    expect(tabBarSource).toContain('logged');
    expect(tabBarSource).toContain('Cost');
    expect(tabBarSource).not.toContain('archived');
    expect(tabsCss).toContain('.workspace-project-name');
    expect(tabsCss).toContain('font-family: var(--font-display);');
  });
});
