import type { CliSurfaceAdapter } from './registry.js';

export const textualAdapter: CliSurfaceAdapter = {
  id: 'textual',
  detect(input) {
    return input.command === 'python' && (input.args ?? []).includes('textual');
  },
  enrich(meta) {
    return { ...meta, framework: 'Textual' };
  },
};
