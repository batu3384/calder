import { describe, expect,it } from 'vitest';

import {
  sanitizeArg,
  sanitizeArgs,
  sanitizeExtraArgs,
  sanitizeInitialPrompt,
  sanitizeSessionId,
  sanitizeSpawnArgs,
  validateCwd,
  validateRuntimePath,
} from './sanitize';

describe('sanitize', () => {
  describe('sanitizeArg', () => {
    it('accepts alphanumeric args', () => {
      expect(sanitizeArg('claude')).toEqual({ ok: true, value: 'claude' });
      expect(sanitizeArg('session-123')).toEqual({ ok: true, value: 'session-123' });
      expect(sanitizeArg('arg_with_underscore')).toEqual({ ok: true, value: 'arg_with_underscore' });
    });

    it('accepts args with allowed special chars', () => {
      expect(sanitizeArg('--session-id=abc123')).toEqual({ ok: true, value: '--session-id=abc123' });
      expect(sanitizeArg('/path/to/file')).toEqual({ ok: true, value: '/path/to/file' });
      expect(sanitizeArg('-r')).toEqual({ ok: true, value: '-r' });
    });

    it('rejects shell metacharacters', () => {
      const dangerous = [
        'rm -rf /',
        'foo; bar',
        'baz | grep',
        '$(whoami)',
        '`id`',
        'foo && bar',
        'foo || bar',
        'foo > /dev/null',
        'foo < input.txt',
        'foo\nbar',
        'foo\rbar',
        'foo\x00bar',
      ];
      for (const arg of dangerous) {
        const result = sanitizeArg(arg);
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('rejects args with newlines or null bytes', () => {
      expect(sanitizeArg('foo\nbar').ok).toBe(false);
      expect(sanitizeArg('foo\rbar').ok).toBe(false);
      expect(sanitizeArg('foo\x00bar').ok).toBe(false);
    });

    it('returns empty string for empty arg', () => {
      expect(sanitizeArg('')).toEqual({ ok: true, value: '' });
    });
  });

  describe('sanitizeArgs', () => {
    it('passes through clean args', () => {
      expect(sanitizeArgs(['-r', 'session-123', '--verbose'])).toEqual(['-r', 'session-123', '--verbose']);
    });

    it('throws on dangerous args', () => {
      expect(() => sanitizeArgs(['-r', 'session; rm -rf /'])).toThrow(/Potentially unsafe/);
    });

    it('throws on first dangerous arg', () => {
      expect(() => sanitizeArgs(['--flag', 'foo && bar'])).toThrow(/Potentially unsafe/);
    });
  });

  describe('sanitizeSessionId', () => {
    it('accepts valid session IDs', () => {
      expect(sanitizeSessionId('abc123')).toEqual({ ok: true, value: 'abc123' });
      expect(sanitizeSessionId('session-abc-123')).toEqual({ ok: true, value: 'session-abc-123' });
      expect(sanitizeSessionId('a')).toEqual({ ok: true, value: 'a' });
    });

    it('rejects empty session ID', () => {
      expect(sanitizeSessionId('')).toEqual({ ok: false, error: 'Session ID cannot be empty' });
    });

    it('rejects session IDs with special chars', () => {
      const invalid = ['foo bar', 'foo;bar', 'foo/bar', 'foo&bar', 'foo|bar', 'foo>bar'];
      for (const id of invalid) {
        const result = sanitizeSessionId(id);
        expect(result.ok).toBe(false);
      }
    });

    it('rejects session IDs with path traversal', () => {
      expect(sanitizeSessionId('../etc/passwd').ok).toBe(false);
      expect(sanitizeSessionId('..\\windows\\system32').ok).toBe(false);
    });
  });

  describe('validateRuntimePath', () => {
    it('accepts paths within .calder', () => {
      expect(validateRuntimePath('.calder', '.calder/runtime').ok).toBe(true);
      expect(validateRuntimePath('.calder', '.calder/runtime/events').ok).toBe(true);
    });

    it('rejects path traversal', () => {
      expect(validateRuntimePath('.calder', '../../../etc/passwd').ok).toBe(false);
      expect(validateRuntimePath('.calder', '.calder/../../etc').ok).toBe(false);
    });

    it('rejects paths outside .calder', () => {
      expect(validateRuntimePath('.calder', 'usr/bin').ok).toBe(false);
      expect(validateRuntimePath('.calder', 'home/user/.ssh').ok).toBe(false);
    });

    it('rejects empty path', () => {
      expect(validateRuntimePath('.calder', '').ok).toBe(false);
    });
  });

  describe('validateCwd', () => {
    it('accepts normal working directories', () => {
      expect(validateCwd('/Users/batuhanyuksel/projects').ok).toBe(true);
      expect(validateCwd('/home/user/code').ok).toBe(true);
      expect(validateCwd('C:\\Users\\batuhanyuksel').ok).toBe(true);
    });

    it('rejects system directories', () => {
      const blocked = ['/etc', '/sys', '/proc', '/root', '/boot', '/dev', '/srv'];
      for (const dir of blocked) {
        expect(validateCwd(dir).ok).toBe(false);
        expect(validateCwd(`${dir}/subdir`).ok).toBe(false);
      }
    });

    it('rejects empty CWD', () => {
      expect(validateCwd('')).toEqual({ ok: false, error: 'CWD cannot be empty' });
    });
  });

  describe('sanitizeInitialPrompt', () => {
    it('accepts natural-language prompts with spaces', () => {
      expect(sanitizeInitialPrompt('fix the bug')).toEqual({ ok: true, value: 'fix the bug' });
      expect(sanitizeInitialPrompt('Run tests, then commit.')).toEqual({
        ok: true,
        value: 'Run tests, then commit.',
      });
    });

    it('rejects shell metacharacters', () => {
      expect(sanitizeInitialPrompt('foo; rm -rf /').ok).toBe(false);
      expect(sanitizeInitialPrompt('foo && bar').ok).toBe(false);
      expect(sanitizeInitialPrompt('$(whoami)').ok).toBe(false);
    });

    it('rejects empty prompt', () => {
      expect(sanitizeInitialPrompt('')).toEqual({ ok: false, error: 'Initial prompt cannot be empty' });
    });
  });

  describe('sanitizeSpawnArgs', () => {
    it('allows spaced prompt arg while keeping strict rules for flags', () => {
      const prompt = 'fix the linter';
      expect(sanitizeSpawnArgs(['--session-id', 'abc', prompt], prompt)).toEqual([
        '--session-id',
        'abc',
        prompt,
      ]);
    });

    it('throws when prompt contains shell metacharacters', () => {
      const prompt = 'fix; rm -rf /';
      expect(() => sanitizeSpawnArgs([prompt], prompt)).toThrow(/unsafe initial prompt/i);
    });

    it('throws on dangerous non-prompt args', () => {
      expect(() => sanitizeSpawnArgs(['foo && bar'])).toThrow(/Potentially unsafe/);
    });
  });

  describe('sanitizeExtraArgs', () => {
    it('splits and sanitizes whitespace-separated args', () => {
      expect(sanitizeExtraArgs('-v --session-id abc123')).toEqual(['-v', '--session-id', 'abc123']);
    });

    it('filters empty tokens', () => {
      expect(sanitizeExtraArgs('  -v   --flag  ')).toEqual(['-v', '--flag']);
    });

    it('returns empty array for empty input', () => {
      expect(sanitizeExtraArgs('')).toEqual([]);
    });

    it('throws on dangerous tokens', () => {
      expect(() => sanitizeExtraArgs('-v; rm -rf /')).toThrow(/Potentially unsafe/);
    });
  });
});