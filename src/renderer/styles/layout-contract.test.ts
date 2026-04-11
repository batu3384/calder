import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const imports = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8');
const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');
const railCss = readFileSync(new URL('./sidebar.css', import.meta.url), 'utf-8');
const contextCss = readFileSync(new URL('./context-inspector.css', import.meta.url), 'utf-8');
const browserCss = readFileSync(new URL('./browser-tab.css', import.meta.url), 'utf-8');

describe('layout stylesheet contract', () => {
  it('imports the context inspector stylesheet and command deck selectors', () => {
    expect(imports).toContain("./styles/context-inspector.css");
    expect(imports).toContain("./styles/primitives.css");
    expect(tabsCss).toContain('.command-deck-status');
    expect(tabsCss).toContain('.workspace-spend-value');
    expect(tabsCss).toContain('.session-launcher-group');
    expect(tabsCss).toContain('.tab-bar-surface');
    expect(tabsCss).toContain('.session-deck-surface');
    expect(railCss).toContain('#sidebar-content');
    expect(railCss).toContain('.sidebar-project-row');
    expect(contextCss).toContain('.ops-rail-surface');
    expect(browserCss).toContain('.live-view-surface');
  });
});
