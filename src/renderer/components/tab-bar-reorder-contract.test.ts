import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const styles = readFileSync(new URL('../styles/tabs.css', import.meta.url), 'utf-8');

describe('tab bar reorder affordance contract', () => {
  it('renders a visible drag affordance for tabs', () => {
    expect(source).toContain('tab-reorder-handle');
    expect(source).toContain('Drag to reorder');
  });

  it('styles the drag affordance as a grab handle', () => {
    expect(styles).toContain('.tab-reorder-handle');
    expect(styles).toContain('cursor: grab');
  });

  it('limits drag reordering to the dedicated handle instead of the whole tab', () => {
    expect(source).not.toContain('tab.draggable = true;');
    expect(source).toContain("const reorderHandleEl = tab.querySelector('.tab-reorder-handle') as HTMLElement | null;");
    expect(source).toContain('if (reorderHandleEl) {');
    expect(source).toContain('reorderHandleEl.draggable = true;');
    expect(source).toContain("reorderHandleEl.addEventListener('dragstart'");
    expect(source).toContain("reorderHandleEl.addEventListener('dragend'");
  });
});
