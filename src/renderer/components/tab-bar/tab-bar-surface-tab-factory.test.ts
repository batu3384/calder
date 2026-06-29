import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const surfaceFactorySource = readFileSync(new URL('./tab-bar-surface-tab-factory.ts', import.meta.url), 'utf-8');

describe('tab bar surface tab factory extraction', () => {
  it('delegates surface tab creation to dedicated helper', () => {
    expect(tabBarSource).toContain("from './tab-bar-surface-tab-factory.js'");
    expect(tabBarSource).toContain('createSurfaceModeTab({');
  });

  it('keeps surface drag reorder behavior in helper module', () => {
    expect(surfaceFactorySource).toContain("tab.className = 'tab-item tab-surface-item'");
    expect(surfaceFactorySource).toContain("event.dataTransfer!.setData('text/plain', `__surface:${options.kind}`)");
    expect(surfaceFactorySource).toContain("if (draggedId.startsWith('__surface:'))");
    expect(surfaceFactorySource).toContain('tabOrder: filtered');
    expect(surfaceFactorySource).toContain('tabPlacement: desiredPlacement');
  });
});
