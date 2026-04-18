import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf8');
const stateSource = readFileSync(new URL('../state.ts', import.meta.url), 'utf8');
const sharedTypesSource = readFileSync(new URL('../../shared/types.ts', import.meta.url), 'utf8');

describe('tab bar surface placement contract', () => {
  it('adds reorder handle support for surface tabs', () => {
    expect(source).toContain("dataTransfer!.setData('text/plain', `__surface:${kind}`)");
    expect(source).toContain("if (draggedId.startsWith('__surface:'))");
  });

  it('persists surface tab placement and ordering metadata', () => {
    expect(sharedTypesSource).toContain("tabPlacement?: 'start' | 'end';");
    expect(sharedTypesSource).toContain("tabOrder?: Array<'cli' | 'mobile'>;");
    expect(stateSource).toContain('tabPlacement');
    expect(stateSource).toContain('tabOrder');
  });
});
