import { describe, expect, it } from 'vitest';
import { detectCliAdapter } from './registry.js';

describe('cli surface adapters', () => {
  it('detects Textual from the launch command', () => {
    expect(detectCliAdapter({ command: 'python', args: ['-m', 'textual', 'run', 'app.py'] })?.id).toBe('textual');
  });

  it('detects Ink from the process title', () => {
    expect(detectCliAdapter({ command: 'node', args: ['dist/cli.js'], title: 'ink-app' })?.id).toBe('ink');
  });

  it('detects Blessed from explicit metadata', () => {
    expect(detectCliAdapter({ command: 'node', args: ['cli.js'], adapterHint: 'blessed' })?.id).toBe('blessed');
  });

  it('exposes adapter display metadata for supported frameworks', () => {
    const adapter = detectCliAdapter({ command: 'python', args: ['-m', 'textual', 'run', 'app.py'] });

    expect(adapter?.displayName).toBe('Textual');
    expect(adapter?.capabilityBadges).toContain('Widgets');
    expect(adapter?.capabilityBadges).toContain('Focus path');
  });

  it('maps semantic metadata into richer adapter hints', () => {
    const adapter = detectCliAdapter({ command: 'node', args: ['cli.js'], adapterHint: 'blessed' });
    const enriched = adapter?.enrich({
      semanticLabel: 'command menu',
      semanticMeta: {
        widgetType: 'list',
        focusPath: ['screen', 'sidebar', 'command menu'],
        stateSummary: '3 items focused',
      },
    });

    expect(enriched).toEqual(
      expect.objectContaining({
        framework: 'Blessed',
        adapterDisplayName: 'Blessed',
        widgetName: 'command menu',
        widgetType: 'list',
        focusPath: ['screen', 'sidebar', 'command menu'],
        stateSummary: '3 items focused',
      }),
    );
  });
});
