import { describe, expect, it } from 'vitest';
import { buildViewportText, buildSelectionText, createSelectionPayload } from './selection.js';

const lines = [
  '╭ Settings ───────────────╮',
  '│ Theme: midnight         │',
  '│ Accent: amber           │',
  '╰─────────────────────────╯',
];

describe('cli surface selection helpers', () => {
  it('returns full lines for line mode', () => {
    expect(buildSelectionText(lines, { mode: 'line', startRow: 1, endRow: 2, startCol: 0, endCol: 80 })).toBe(
      '│ Theme: midnight         │\n│ Accent: amber           │',
    );
  });

  it('clips a rectangular region by columns', () => {
    expect(buildSelectionText(lines, { mode: 'region', startRow: 1, endRow: 2, startCol: 2, endCol: 15 })).toBe(
      'Theme: midnig\nAccent: amber',
    );
  });

  it('returns the full visible viewport for viewport mode', () => {
    expect(buildViewportText(lines)).toContain('╭ Settings');
    expect(buildViewportText(lines)).toContain('Accent: amber');
  });

  it('builds a v1 payload with viewport and nearby text', () => {
    const payload = createSelectionPayload({
      projectId: 'project-1',
      projectPath: '/tmp/demo',
      command: 'python',
      args: ['app.py'],
      cwd: '/tmp/demo',
      cols: 80,
      rows: 24,
      title: 'Settings',
      lines,
      selection: { mode: 'line', startRow: 1, endRow: 1, startCol: 0, endCol: 80 },
      ansiSnapshot: '\\u001b[32mTheme\\u001b[0m',
    });

    expect(payload.selectedText).toContain('Theme: midnight');
    expect(payload.viewportText).toContain('Accent: amber');
    expect(payload.ansiSnapshot).toContain('\\u001b[32m');
  });
});
