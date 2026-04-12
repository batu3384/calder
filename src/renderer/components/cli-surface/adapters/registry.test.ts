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
});
