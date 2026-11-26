import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function parseVersion(version: string): [number, number, number] {
  const [major = '0', minor = '0', patch = '0'] = version
    .split('.')
    .map((part) => part.replace(/[^0-9].*$/, ''));
  return [Number(major), Number(minor), Number(patch)];
}

function isAtLeast(version: string, minimum: string): boolean {
  const current = parseVersion(version);
  const target = parseVersion(minimum);

  for (let index = 0; index < 3; index += 1) {
    if (current[index] > target[index]) return true;
    if (current[index] < target[index]) return false;
  }

  return true;
}

describe('dependency security lockfile', () => {
  it('pins known-vulnerable dependency lanes at patched minimum versions', () => {
    const lockfilePath = path.resolve(process.cwd(), 'package-lock.json');
    const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8')) as {
      packages?: Record<string, { version?: string }>;
    };

    const versionsForPackage = (packageName: string): string[] => {
      const suffix = `node_modules/${packageName}`;
      return Object.entries(lockfile.packages ?? {})
        .filter(([key]) => key === suffix || key.endsWith(`/${suffix}`))
        .map(([, entry]) => entry.version)
        .filter((version): version is string => typeof version === 'string');
    };

    const minimums: Record<string, string> = {
      '@hono/node-server': '2.1.9',
      '@modelcontextprotocol/sdk': '1.32.2',
      'body-parser': '2.4.0',
      dompurify: '3.4.18',
      electron: '42.11.18',
      'fast-uri': '3.1.9',
      hono: '4.13.19',
      'ip-address': '10.7.6',
      'js-yaml': '4.3.2',
      'proxy-addr': '2.0.8',
      qs: '6.16.2',
      vite: '8.4.0',
      vitest: '4.1.12',
      zod: '4.6.7',
    };

    for (const [packageName, minimum] of Object.entries(minimums)) {
      const versions = versionsForPackage(packageName);
      expect(versions.length, `${packageName} is missing from package-lock.json`).toBeGreaterThan(
        0,
      );
      for (const version of versions) {
        expect(isAtLeast(version, minimum), `${packageName} ${version} must be >= ${minimum}`).toBe(
          true,
        );
      }
    }
  });
});
