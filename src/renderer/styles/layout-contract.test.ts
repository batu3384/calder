import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const imports = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8');
const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');
const railCss = readFileSync(new URL('./sidebar.css', import.meta.url), 'utf-8');

describe('layout stylesheet contract', () => {
  it('imports the context inspector stylesheet and command deck selectors', () => {
    expect(imports).toContain("./styles/context-inspector.css");
    expect(tabsCss).toContain('.command-deck-status');
    expect(tabsCss).toContain('.workspace-spend-value');
    expect(railCss).toContain('#sidebar-content');
  });
});
