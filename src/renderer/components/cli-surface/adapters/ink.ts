import type { CliSurfaceAdapter } from './registry.js';

export const inkAdapter: CliSurfaceAdapter = {
  id: 'ink',
  detect(input) {
    return /ink/i.test(input.title ?? '') || (input.args ?? []).some((arg) => /ink/i.test(arg));
  },
  enrich(meta) {
    return { ...meta, framework: 'Ink' };
  },
};
