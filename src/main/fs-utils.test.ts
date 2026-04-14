import { vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

import {
  dirExists,
  expandUserPath,
  fileExists,
  readDirSafe,
  readFileSafe,
  readJsonSafe,
} from './fs-utils';

const home = '/mock/home';
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockStatSync = vi.mocked(fs.statSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('expandUserPath', () => {
  it('expands ~ alone to homedir', () => {
    expect(expandUserPath('~')).toBe(path.join(home));
  });

  it('expands ~/subdir to homedir/subdir', () => {
    expect(expandUserPath('~/git/my-project')).toBe(path.join(home, 'git/my-project'));
  });

  it('expands ~/ (trailing slash only) to homedir with trailing slash', () => {
    expect(expandUserPath('~/')).toBe(path.join(home, '/'));
  });

  it('leaves absolute paths unchanged', () => {
    expect(expandUserPath('/absolute/path/to/project')).toBe('/absolute/path/to/project');
  });

  it('leaves relative paths unchanged', () => {
    expect(expandUserPath('relative/path')).toBe('relative/path');
  });

  it('does not expand ~username paths', () => {
    expect(expandUserPath('~otheruser/projects')).toBe('~otheruser/projects');
  });

  it('does not expand empty string', () => {
    expect(expandUserPath('')).toBe('');
  });
});

describe('readFileSafe', () => {
  it('returns file contents when the read succeeds', () => {
    mockReadFileSync.mockReturnValueOnce('hello world' as any);
    expect(readFileSafe('/tmp/demo.txt')).toBe('hello world');
  });

  it('returns null when the read fails', () => {
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    expect(readFileSafe('/tmp/missing.txt')).toBeNull();
  });
});

describe('readJsonSafe', () => {
  it('returns parsed JSON objects', () => {
    mockReadFileSync.mockReturnValueOnce('{"ok":true,"count":2}' as any);
    expect(readJsonSafe('/tmp/config.json')).toEqual({ ok: true, count: 2 });
  });

  it('returns null for malformed JSON', () => {
    mockReadFileSync.mockReturnValueOnce('{not-json' as any);
    expect(readJsonSafe('/tmp/bad.json')).toBeNull();
  });

  it('returns null when reading throws', () => {
    mockReadFileSync.mockImplementationOnce(() => {
      throw new Error('EPERM');
    });
    expect(readJsonSafe('/tmp/blocked.json')).toBeNull();
  });
});

describe('readDirSafe', () => {
  it('returns directory entries when listing succeeds', () => {
    mockReaddirSync.mockReturnValueOnce(['a.txt', 'b.txt'] as any);
    expect(readDirSafe('/tmp')).toEqual(['a.txt', 'b.txt']);
  });

  it('returns an empty array when listing fails', () => {
    mockReaddirSync.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    expect(readDirSafe('/tmp/missing')).toEqual([]);
  });
});

describe('fileExists', () => {
  it('returns true for regular files', () => {
    mockStatSync.mockReturnValueOnce({ isFile: () => true } as any);
    expect(fileExists('/tmp/file.txt')).toBe(true);
  });

  it('returns false for directories and failures', () => {
    mockStatSync.mockReturnValueOnce({ isFile: () => false } as any);
    expect(fileExists('/tmp/folder')).toBe(false);

    mockStatSync.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    expect(fileExists('/tmp/missing')).toBe(false);
  });
});

describe('dirExists', () => {
  it('returns true for directories', () => {
    mockStatSync.mockReturnValueOnce({ isDirectory: () => true } as any);
    expect(dirExists('/tmp/folder')).toBe(true);
  });

  it('returns false for non-directories and failures', () => {
    mockStatSync.mockReturnValueOnce({ isDirectory: () => false } as any);
    expect(dirExists('/tmp/file.txt')).toBe(false);

    mockStatSync.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    expect(dirExists('/tmp/missing')).toBe(false);
  });
});
