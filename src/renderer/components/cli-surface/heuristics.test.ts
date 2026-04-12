import { describe, expect, it } from 'vitest';
import { inferCliRegions } from './heuristics.js';

describe('cli surface heuristics', () => {
  it('detects a boxed settings panel', () => {
    const regions = inferCliRegions([
      '╭ Settings ───────────────╮',
      '│ Theme: midnight         │',
      '│ Accent: amber           │',
      '╰─────────────────────────╯',
    ]);

    expect(regions[0]).toEqual(
      expect.objectContaining({
        label: 'settings panel',
        selection: { mode: 'region', startRow: 0, endRow: 3, startCol: 0, endCol: 27 },
      }),
    );
  });

  it('detects footer actions as a separate region', () => {
    const regions = inferCliRegions([
      'Project build status',
      '',
      '[r] restart   [q] quit   [enter] open',
    ]);

    expect(regions.some((region) => region.label === 'footer actions')).toBe(true);
  });
});
