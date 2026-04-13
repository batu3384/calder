import * as fs from 'fs/promises';
import * as path from 'path';
import { BROWSER_SESSION_PARTITION } from '../shared/constants';

export { BROWSER_SESSION_PARTITION } from '../shared/constants';

const LEGACY_SERVICE_WORKER_DIR = 'Service Worker';
const LEGACY_BACKUP_DIR = 'Legacy Browser Storage';
const MIGRATION_MARKER = '.browser-session-storage-v1';

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
  } catch {}

  let migratedLegacyServiceWorker = false;
  let legacyStorageExists = false;
  try {
    await fs.access(legacyPath);
    legacyStorageExists = true;
    await fs.mkdir(backupRoot, { recursive: true });

    let destination = path.join(backupRoot, LEGACY_SERVICE_WORKER_DIR);
    try {
      await fs.access(destination);
      destination = path.join(backupRoot, `${LEGACY_SERVICE_WORKER_DIR}-${Date.now()}`);
    } catch {}

    await fs.rename(legacyPath, destination);
    migratedLegacyServiceWorker = true;
  } catch {}

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
