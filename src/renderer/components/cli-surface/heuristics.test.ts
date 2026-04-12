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

  it('detects boxed dialogs separately from generic panels', () => {
    const regions = inferCliRegions([
      '╭ Delete project? ───────╮',
      '│ This action cannot     │',
      '│ be undone.             │',
      '╰────────────────────────╯',
    ]);

    expect(regions.some((region) => region.label === 'dialog')).toBe(true);
  });

  it('detects task-list style groups as inspectable regions', () => {
    const regions = inferCliRegions([
      'Recent actions',
      '- Run smoke tests',
      '- Check tracking hooks',
      '- Reopen workspace center',
      '',
      '[r] restart',
    ]);

    expect(regions.some((region) => region.label === 'task list')).toBe(true);
  });
});
