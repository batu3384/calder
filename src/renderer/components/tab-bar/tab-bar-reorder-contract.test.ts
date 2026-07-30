import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const tabListRendererSource = readFileSync(
  new URL('./tab-bar-tab-list-renderer.ts', import.meta.url),
  'utf-8',
);
const sessionTabFactorySource = readFileSync(
  new URL('./tab-bar-session-tab-factory.ts', import.meta.url),
  'utf-8',
);
const styles = readFileSync(new URL('../../styles/tabs.css', import.meta.url), 'utf-8');

describe('tab bar reorder affordance contract', () => {
  it('lets the whole tab act as the drag affordance (IDE convention)', () => {
    expect(tabListRendererSource).toContain("from './tab-bar-session-tab-factory.js'");
    expect(tabListRendererSource).toContain('createSessionTab({');
    expect(sessionTabFactorySource).not.toContain('tab-reorder-handle');
    expect(sessionTabFactorySource).toContain('tab.draggable = true;');
  });

  it('does not render a dedicated grab handle in tab chrome', () => {
    expect(styles).not.toContain('.tab-reorder-handle');
  });

  it('keeps dragstart on the tab with interactive children guarded', () => {
    expect(sessionTabFactorySource).toContain("closest('button, input')");
    expect(sessionTabFactorySource).toContain("tab.addEventListener('dragstart'");
    expect(sessionTabFactorySource).toContain("tab.addEventListener('dragend'");
  });
});
