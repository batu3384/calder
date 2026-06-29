import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const sessionTabFactorySource = readFileSync(new URL('./tab-bar-session-tab-factory.ts', import.meta.url), 'utf-8');
const styles = readFileSync(new URL('../../styles/tabs.css', import.meta.url), 'utf-8');

describe('tab bar reorder affordance contract', () => {
  it('renders a visible drag affordance for tabs', () => {
    expect(source).toContain("from './tab-bar-session-tab-factory.js'");
    expect(source).toContain('createSessionTab({');
    expect(sessionTabFactorySource).toContain('tab-reorder-handle');
    expect(sessionTabFactorySource).toContain('Drag to reorder');
  });

  it('styles the drag affordance as a grab handle', () => {
    expect(styles).toContain('.tab-reorder-handle');
    expect(styles).toContain('cursor: grab');
  });

  it('limits drag reordering to the dedicated handle instead of the whole tab', () => {
    expect(sessionTabFactorySource).not.toContain('tab.draggable = true;');
    expect(sessionTabFactorySource).toContain("const reorderHandleEl = tab.querySelector('.tab-reorder-handle') as HTMLElement | null;");
    expect(sessionTabFactorySource).toContain('if (reorderHandleEl) {');
    expect(sessionTabFactorySource).toContain('reorderHandleEl.draggable = true;');
    expect(sessionTabFactorySource).toContain("reorderHandleEl.addEventListener('dragstart'");
    expect(sessionTabFactorySource).toContain("reorderHandleEl.addEventListener('dragend'");
  });
});
