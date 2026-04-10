import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./browser-tab/pane.ts', import.meta.url), 'utf-8');

describe('browser tab pane contract', () => {
  it('groups the toolbar into nav, address, and tools regions', () => {
    expect(source).toContain('browser-toolbar-nav');
    expect(source).toContain('browser-toolbar-address');
    expect(source).toContain('browser-toolbar-tools');
  });

  it('renders the Calder new tab composition', () => {
    expect(source).toContain('browser-ntp-eyebrow');
    expect(source).toContain('browser-ntp-title');
    expect(source).toContain('browser-ntp-grid');
  });

  it('renders an open-session targeting rail for browser handoff', () => {
    expect(source).toContain('Open Sessions');
    expect(source).toContain('No target session selected');
  });
});
