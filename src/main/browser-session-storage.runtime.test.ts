import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BROWSER_SESSION_PARTITION, prepareBrowserSessionStorage } from './browser-session-storage';

const { mockAccess, mockMkdir, mockRename, mockWriteFile } = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockMkdir: vi.fn(),
  mockRename: vi.fn(),
  mockWriteFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  access: mockAccess,
  mkdir: mockMkdir,
  rename: mockRename,
  writeFile: mockWriteFile,
}));

function errno(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined);
  mockRename.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
});

describe('prepareBrowserSessionStorage runtime fallbacks', () => {
  it('warns when marker access fails with non-ENOENT and still continues safely', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockAccess
        .mockRejectedValueOnce(errno('EACCES')) // marker
        .mockRejectedValueOnce(errno('ENOENT')); // legacy

      const result = await prepareBrowserSessionStorage('/tmp/calder');

      expect(result).toEqual({
        partition: BROWSER_SESSION_PARTITION,
        migratedLegacyServiceWorker: false,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        '[browser-session-storage] Failed to read migration marker; continuing with migration checks.',
        expect.objectContaining({ code: 'EACCES' }),
      );
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockRename).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns when legacy storage inspection fails with non-ENOENT and writes migration marker', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockAccess
        .mockRejectedValueOnce(errno('ENOENT')) // marker
        .mockRejectedValueOnce(errno('EACCES')); // legacy

      const result = await prepareBrowserSessionStorage('/tmp/calder');

      expect(result).toEqual({
        partition: BROWSER_SESSION_PARTITION,
        migratedLegacyServiceWorker: false,
      });
      expect(warnSpy).toHaveBeenCalledWith(
        '[browser-session-storage] Failed to inspect legacy service worker storage path.',
        expect.objectContaining({ code: 'EACCES' }),
      );
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      expect(mockRename).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('warns on backup destination probe failure and still archives to default destination', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockAccess
        .mockRejectedValueOnce(errno('ENOENT')) // marker
        .mockResolvedValueOnce(undefined) // legacy exists
        .mockRejectedValueOnce(errno('EACCES')); // destination probe failed

      const result = await prepareBrowserSessionStorage('/tmp/calder');

      expect(result).toEqual({
        partition: BROWSER_SESSION_PARTITION,
        migratedLegacyServiceWorker: true,
      });
      expect(mockMkdir).toHaveBeenCalledWith('/tmp/calder/Legacy Browser Storage', { recursive: true });
      expect(mockRename).toHaveBeenCalledWith(
        '/tmp/calder/Service Worker',
        '/tmp/calder/Legacy Browser Storage/Service Worker',
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[browser-session-storage] Failed while probing backup destination; using default destination.',
        expect.objectContaining({ code: 'EACCES' }),
      );
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
