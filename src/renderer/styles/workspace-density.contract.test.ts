import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const tabsCss = readFileSync(new URL('./tabs.css', import.meta.url), 'utf-8');
const terminalCss = readFileSync(new URL('./terminal.css', import.meta.url), 'utf-8');
const contextCss = readFileSync(new URL('./context-inspector.css', import.meta.url), 'utf-8');
const browserCss = readFileSync(new URL('./browser-tab.css', import.meta.url), 'utf-8');
const splitLayoutSource = readFileSync(new URL('../components/split-layout.ts', import.meta.url), 'utf-8');

describe('workspace density contract', () => {
  it('treats the shell and workspace stack as responsive containers', () => {
    expect(contextCss).toContain('container: workspace-shell / inline-size;');
    expect(contextCss).toContain('container: workspace-stack / inline-size;');
    expect(tabsCss).toContain('@container workspace-stack');
    expect(browserCss).toContain('@container workspace-stack');
    expect(terminalCss).toContain('@container workspace-stack');
    expect(contextCss).toContain('@container workspace-shell');
  });

  it('lets the command deck reflow before the middle workspace gets crushed', () => {
    expect(tabsCss).toContain('grid-template-areas:');
    expect(tabsCss).toContain('"main meta actions"');
    expect(tabsCss).toContain('"main actions"');
    expect(tabsCss).toContain('"meta actions"');
    expect(tabsCss).toContain('#workspace-identity');
    expect(tabsCss).toContain('display: none;');
  });

  it('uses a slimmer live surface minimum width so sessions stay readable', () => {
    expect(splitLayoutSource).toContain("const SURFACE_COLUMN_MIN = '288px';");
    expect(splitLayoutSource).toContain('minmax(${SURFACE_COLUMN_MIN},');
  });
});
