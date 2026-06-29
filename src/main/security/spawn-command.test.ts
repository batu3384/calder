import { describe, expect, it } from 'vitest';

import { validateSpawnCommand } from './spawn-command';

describe('validateSpawnCommand', () => {
  it('allows known package managers and runtimes', () => {
    expect(validateSpawnCommand('npm').ok).toBe(true);
    expect(validateSpawnCommand('node').ok).toBe(true);
    expect(validateSpawnCommand('vite').ok).toBe(true);
  });

  it('rejects arbitrary binaries', () => {
    const result = validateSpawnCommand('/usr/bin/curl');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not allowlisted');
    }
  });
});
