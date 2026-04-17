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
  it('pins dompurify and hono to non-vulnerable versions in package-lock.json', () => {
    const lockfilePath = path.resolve(process.cwd(), 'package-lock.json');
    const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8')) as {
      packages?: Record<string, { version?: string }>;
    };

    const dompurifyVersion = lockfile.packages?.['node_modules/dompurify']?.version;
    const honoVersion = lockfile.packages?.['node_modules/hono']?.version;

    expect(dompurifyVersion).toBeDefined();
    expect(honoVersion).toBeDefined();
    expect(isAtLeast(dompurifyVersion!, '3.4.0')).toBe(true);
    expect(isAtLeast(honoVersion!, '4.12.14')).toBe(true);
  });
});
