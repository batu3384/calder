import * as fs from 'fs/promises';
import * as path from 'path';
import { BROWSER_SESSION_PARTITION } from '../shared/constants';

export { BROWSER_SESSION_PARTITION } from '../shared/constants';

const LEGACY_SERVICE_WORKER_DIR = 'Service Worker';
const LEGACY_BACKUP_DIR = 'Legacy Browser Storage';
const MIGRATION_MARKER = '.browser-session-storage-v1';

function isErrnoCode(error: unknown, code: string): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === code,
  );
}

function logStoragePrepWarning(context: string, error: unknown): void {
  console.warn(`[browser-session-storage] ${context}`, error);
}

export interface BrowserSessionStoragePrepResult {
  partition: string;
  migratedLegacyServiceWorker: boolean;
}

export async function prepareBrowserSessionStorage(userDataPath: string): Promise<BrowserSessionStoragePrepResult> {
  const markerPath = path.join(userDataPath, MIGRATION_MARKER);
  const legacyPath = path.join(userDataPath, LEGACY_SERVICE_WORKER_DIR);
  const backupRoot = path.join(userDataPath, LEGACY_BACKUP_DIR);

  try {
    await fs.access(markerPath);
    return {
      partition: BROWSER_SESSION_PARTITION,
      migratedLegacyServiceWorker: false,
    };
  } catch (error) {
    if (!isErrnoCode(error, 'ENOENT')) {
      logStoragePrepWarning('Failed to read migration marker; continuing with migration checks.', error);
    }
  }

  let migratedLegacyServiceWorker = false;
  let legacyStorageExists = false;
  try {
    await fs.access(legacyPath);
    legacyStorageExists = true;
  } catch (error) {
    if (!isErrnoCode(error, 'ENOENT')) {
      logStoragePrepWarning('Failed to inspect legacy service worker storage path.', error);
    }
  }

  if (legacyStorageExists) {
    try {
      await fs.mkdir(backupRoot, { recursive: true });

      let destination = path.join(backupRoot, LEGACY_SERVICE_WORKER_DIR);
      try {
        await fs.access(destination);
        destination = path.join(backupRoot, `${LEGACY_SERVICE_WORKER_DIR}-${Date.now()}`);
      } catch (error) {
        if (!isErrnoCode(error, 'ENOENT')) {
          logStoragePrepWarning('Failed while probing backup destination; using default destination.', error);
        }
      }

      await fs.rename(legacyPath, destination);
      migratedLegacyServiceWorker = true;
    } catch (error) {
      logStoragePrepWarning('Failed to archive legacy service worker storage.', error);
    }
  }

  if (legacyStorageExists && !migratedLegacyServiceWorker) {
    return {
      partition: BROWSER_SESSION_PARTITION,
      migratedLegacyServiceWorker: false,
    };
  }

  await fs.writeFile(
    markerPath,
    JSON.stringify({
      version: 1,
      migratedLegacyServiceWorker,
      createdAt: new Date().toISOString(),
      partition: BROWSER_SESSION_PARTITION,
    }, null, 2),
    'utf-8',
  );

  return {
    partition: BROWSER_SESSION_PARTITION,
    migratedLegacyServiceWorker,
  };
}
