import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appearsInTestContent,
  escapeRegExp,
  lineTextAt,
  runDetectChanges,
  walkFiles,
} from '../../scripts/graph-gap-audit-lib.mjs';

describe('graph-gap-audit-lib', () => {
  describe('runDetectChanges', () => {
    it('returns missing when code-review-graph is unavailable', () => {
      const missingError = new Error('missing command') as Error & { code?: string };
      missingError.code = 'ENOENT';
      const result = runDetectChanges({
        repoRoot: '/repo',
        baseRef: 'HEAD',
        spawn: () => ({ error: missingError }),
      });
      expect(result).toEqual({ kind: 'missing' });
    });

    it('returns none when no changes are detected', () => {
      const result = runDetectChanges({
        repoRoot: '/repo',
        baseRef: 'HEAD',
        spawn: () => ({ status: 0, stdout: 'No changes detected.' }),
      });
      expect(result).toEqual({ kind: 'none' });
    });

    it('parses JSON payloads prefixed with log output', () => {
      const result = runDetectChanges({
        repoRoot: '/repo',
        baseRef: 'HEAD',
        spawn: () => ({
          status: 0,
          stdout: 'log line\\n{ \"test_gaps\": [ { \"name\": \"x\" } ] }\\n',
        }),
      });
      expect(result).toEqual({ kind: 'ok', data: { test_gaps: [{ name: 'x' }] } });
    });

    it('throws for malformed JSON payloads', () => {
      expect(() =>
        runDetectChanges({
          repoRoot: '/repo',
          baseRef: 'HEAD',
          spawn: () => ({ status: 0, stdout: '{invalid' }),
        })
      ).toThrow('Unable to parse detect-changes output as JSON');
    });
  });

  describe('walkFiles', () => {
    it('collects files recursively based on a predicate', () => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'graph-gap-walk-'));
      try {
        mkdirSync(path.join(root, 'nested'));
        writeFileSync(path.join(root, 'root.test.ts'), 'ok');
        writeFileSync(path.join(root, 'nested', 'child.test.ts'), 'ok');
        writeFileSync(path.join(root, 'nested', 'ignore.txt'), 'nope');

        const files = walkFiles(root, (filePath) => filePath.endsWith('.test.ts')).map((filePath) =>
          path.relative(root, filePath)
        );
        expect(files.sort()).toEqual(['nested/child.test.ts', 'root.test.ts']);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe('escapeRegExp', () => {
    it('escapes all regexp metacharacters', () => {
      const escaped = escapeRegExp('a+b(c)?[x]');
      expect(escaped).toBe('a\\+b\\(c\\)\\?\\[x\\]');
    });
  });

  describe('lineTextAt', () => {
    it('returns trimmed lines and caches file reads', () => {
      const cache = new Map<string, string[]>();
      let reads = 0;
      const deps = {
        existsSync: () => true,
        readFileSync: () => {
          reads += 1;
          return ' first \nsecond\nthird';
        },
      };

      expect(lineTextAt('/tmp/sample.ts', 1, cache, deps)).toBe('first');
      expect(lineTextAt('/tmp/sample.ts', 2, cache, deps)).toBe('second');
      expect(reads).toBe(1);
    });

    it('returns an empty string for missing files', () => {
      const cache = new Map<string, string[]>();
      const deps = {
        existsSync: () => false,
        readFileSync: () => {
          throw new Error('should not read');
        },
      };
      expect(lineTextAt('/tmp/missing.ts', 1, cache, deps)).toBe('');
    });
  });

  describe('appearsInTestContent', () => {
    it('matches function names only when the source stem is present', () => {
      const testContents = [
        {
          filePath: '/tmp/a.test.ts',
          content: 'runDetectChanges(); // graph-gap-audit-lib',
        },
      ];
      expect(appearsInTestContent('runDetectChanges', '/tmp/graph-gap-audit-lib.mjs', testContents)).toBe(true);
      expect(appearsInTestContent('runDetectChanges', '/tmp/other-file.mjs', testContents)).toBe(false);
    });
  });
});
