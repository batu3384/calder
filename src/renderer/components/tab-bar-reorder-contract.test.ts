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
});
