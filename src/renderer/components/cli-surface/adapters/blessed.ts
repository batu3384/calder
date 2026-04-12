import type { CliSurfaceAdapter } from './registry.js';

export const blessedAdapter: CliSurfaceAdapter = {
  id: 'blessed',
  detect(input) {
    return input.adapterHint === 'blessed' || (input.args ?? []).some((arg) => /blessed/i.test(arg));
  },
  enrich(meta) {
    return { ...meta, framework: 'Blessed' };
  },
};
