import { describe, expect, it } from 'vitest';

import { normalizePtyColorEnv } from './pty-color-env.js';

describe('normalizePtyColorEnv', () => {
  it('strips host NO_COLOR and FORCE_COLOR=0 from PTY children', () => {
    const env = normalizePtyColorEnv({
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      TERM: 'dumb',
      PATH: '/usr/bin',
    });

    expect(env.NO_COLOR).toBeUndefined();
    expect(env.FORCE_COLOR).toBe('1');
    expect(env.TERM).toBe('xterm-256color');
    expect(env.COLORTERM).toBe('truecolor');
    expect(env.PATH).toBe('/usr/bin');
  });

  it('preserves an explicit user FORCE_COLOR value', () => {
    const env = normalizePtyColorEnv({ FORCE_COLOR: '3', TERM: 'xterm-direct' });
    expect(env.FORCE_COLOR).toBe('3');
    expect(env.TERM).toBe('xterm-direct');
  });

  it('preserves an existing COLORTERM value', () => {
    const env = normalizePtyColorEnv({ COLORTERM: '24bit', TERM: 'xterm-256color' });
    expect(env.COLORTERM).toBe('24bit');
  });
});
