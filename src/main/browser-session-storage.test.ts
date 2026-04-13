import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

describe('browser session storage prep', () => {
  it('moves legacy default-session service worker data out of the main Calder profile', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'calder-browser-storage-'));
    try {
      const legacyDir = path.join(root, 'Service Worker', 'Database');
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(path.join(legacyDir, 'CURRENT'), 'legacy');

      const storage = await import('./browser-session-storage.js');
      const result = await storage.prepareBrowserSessionStorage(root);

      expect(result.partition).toBe(storage.BROWSER_SESSION_PARTITION);
      expect(result.migratedLegacyServiceWorker).toBe(true);
      expect(existsSync(path.join(root, 'Service Worker'))).toBe(false);
      expect(existsSync(path.join(root, 'Legacy Browser Storage'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not write a migration marker when legacy storage still exists after a failed move', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'calder-browser-storage-'));
    try {
      const legacyDir = path.join(root, 'Service Worker', 'Database');
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(path.join(legacyDir, 'CURRENT'), 'legacy');
      writeFileSync(path.join(root, 'Legacy Browser Storage'), 'busy');

      const storage = await import('./browser-session-storage.js');
      const result = await storage.prepareBrowserSessionStorage(root);

      expect(result.partition).toBe(storage.BROWSER_SESSION_PARTITION);
      expect(result.migratedLegacyServiceWorker).toBe(false);
      expect(existsSync(path.join(root, 'Service Worker'))).toBe(true);
      expect(existsSync(path.join(root, '.browser-session-storage-v1'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
