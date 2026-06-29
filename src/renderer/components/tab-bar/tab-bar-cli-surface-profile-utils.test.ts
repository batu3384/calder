import { describe, expect, it } from 'vitest';

import {
  isLikelyFixedPortCompatible,
  parseCliSurfaceArgs,
  parseCliSurfacePortMode,
} from './tab-bar-cli-surface-profile-utils.js';

describe('tab-bar-cli-surface-profile-utils', () => {
  describe('parseCliSurfaceArgs', () => {
    it('returns undefined for blank input', () => {
      expect(parseCliSurfaceArgs('')).toBeUndefined();
      expect(parseCliSurfaceArgs('   ')).toBeUndefined();
    });

    it('parses quoted and unquoted arguments', () => {
      expect(parseCliSurfaceArgs(`-m textual run "app file.py"`)).toEqual([
        '-m',
        'textual',
        'run',
        'app file.py',
      ]);
      expect(parseCliSurfaceArgs(`'--port' 3000`)).toEqual(['--port', '3000']);
    });
  });

  describe('parseCliSurfacePortMode', () => {
    it('accepts known mode values', () => {
      expect(parseCliSurfacePortMode('auto')).toBe('auto');
      expect(parseCliSurfacePortMode('fixed')).toBe('fixed');
      expect(parseCliSurfacePortMode('off')).toBe('off');
    });

    it('falls back for unknown values', () => {
      expect(parseCliSurfacePortMode('invalid')).toBe('auto');
      expect(parseCliSurfacePortMode('invalid', 'fixed')).toBe('fixed');
    });
  });

  describe('isLikelyFixedPortCompatible', () => {
    it('accepts common framework CLIs', () => {
      expect(isLikelyFixedPortCompatible('vite', ['dev'])).toBe(true);
      expect(isLikelyFixedPortCompatible('/usr/local/bin/next', ['dev'])).toBe(true);
      expect(isLikelyFixedPortCompatible('NuXi', ['dev'])).toBe(true);
    });

    it('accepts package manager scripts and rejects non-script invocations', () => {
      expect(isLikelyFixedPortCompatible('npm', ['run', 'dev'])).toBe(true);
      expect(isLikelyFixedPortCompatible('pnpm', ['dev'])).toBe(true);
      expect(isLikelyFixedPortCompatible('yarn', ['dev'])).toBe(true);
      expect(isLikelyFixedPortCompatible('npm', ['install'])).toBe(false);
    });

    it('rejects unknown binaries', () => {
      expect(isLikelyFixedPortCompatible('python', ['app.py'])).toBe(false);
    });
  });
});
