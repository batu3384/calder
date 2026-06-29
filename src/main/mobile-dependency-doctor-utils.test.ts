import { describe, expect, it } from 'vitest';

import {
  normalizeInstallFailureMessage,
  parseBytePairFromLine,
  parseInstalledDriverFromJson,
  parseJavaMajor,
  parsePercentFromLine,
} from './mobile-dependency-doctor-utils';

describe('mobile dependency doctor utils', () => {
  it('parses progress percentages and byte totals from install output lines', () => {
    expect(parsePercentFromLine('Downloading package: 62% (1.24 MB/2 MB)')).toBe(62);
    expect(parsePercentFromLine('no percentage here')).toBeNull();

    expect(parseBytePairFromLine('1.5 MB / 3 MB')).toEqual({
      downloadedBytes: 1572864,
      totalBytes: 3145728,
      remainingBytes: 1572864,
    });
  });

  it('normalizes command-not-found install failures', () => {
    expect(normalizeInstallFailureMessage('spawn ENOENT npm', 'npm')).toContain(
      'Command not found: npm',
    );
    expect(normalizeInstallFailureMessage('plain failure', 'npm')).toBe('plain failure');
  });

  it('parses java major versions and driver metadata from JSON payloads', () => {
    expect(parseJavaMajor('openjdk version "17.0.12" 2024-07-16')).toBe(17);
    expect(parseJavaMajor('java version "1.8.0_412"')).toBe(8);

    const drivers = JSON.stringify({
      xcuitest: {
        pkgName: 'appium-xcuitest-driver',
        version: '11.0.0',
        installed: true,
      },
    });
    expect(parseInstalledDriverFromJson(drivers, 'xcuitest')).toEqual({
      installed: true,
      version: '11.0.0',
    });
  });
});
