import { app, safeStorage } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  BrowserCredentialFillData,
  BrowserCredentialSaveInput,
  BrowserCredentialSummary,
} from '../shared/types';

interface BrowserCredentialRecord {
  id: string;
  origin: string;
  label: string;
  usernameEncrypted: string;
  passwordEncrypted: string;
  autoFill: boolean;
  updatedAt: string;
  lastUsedAt?: string;
}

interface BrowserCredentialVaultFile {
  version: 1;
  credentials: BrowserCredentialRecord[];
}

const VAULT_FILE_NAME = 'browser-credentials.v1.json';
const VAULT_FILE_VERSION = 1;
const MAX_LABEL_LENGTH = 80;

function assertSecureStorageAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is unavailable on this device.');
  }
}

function vaultFilePath(): string {
  return path.join(app.getPath('userData'), VAULT_FILE_NAME);
}

function normalizeOriginFromUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('The URL is invalid.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Credentials are supported only for HTTP(S) pages.');
  }
  return parsed.origin;
}

function encryptSecret(raw: string): string {
  assertSecureStorageAvailable();
  return safeStorage.encryptString(raw).toString('base64');
}

function decryptSecret(encrypted: string): string {
  assertSecureStorageAvailable();
  const payload = Buffer.from(encrypted, 'base64');
  return safeStorage.decryptString(payload);
}

function normalizeLabel(label: string | undefined, username: string): string {
  const trimmed = (label ?? '').trim();
  const fallback = username.trim();
  const next = (trimmed || fallback).slice(0, MAX_LABEL_LENGTH);
  return next || 'Saved login';
}

function normalizeUsername(username: string): string {
  return username.trim();
}

function normalizePassword(password: string): string {
  return password;
}

function buildSummary(record: BrowserCredentialRecord): BrowserCredentialSummary | null {
  try {
    return {
      id: record.id,
      origin: record.origin,
      label: record.label,
      username: decryptSecret(record.usernameEncrypted),
      autoFill: record.autoFill,
      updatedAt: record.updatedAt,
      lastUsedAt: record.lastUsedAt,
    };
  } catch (error) {
    console.warn('[browser-credential-vault] Failed to decrypt summary entry; skipping.', error);
    return null;
  }
}

function buildFillData(record: BrowserCredentialRecord): BrowserCredentialFillData | null {
  try {
    return {
      id: record.id,
      origin: record.origin,
      label: record.label,
      username: decryptSecret(record.usernameEncrypted),
      password: decryptSecret(record.passwordEncrypted),
    };
  } catch (error) {
    console.warn('[browser-credential-vault] Failed to decrypt credential; skipping.', error);
    return null;
  }
}

function sortSummaries(entries: BrowserCredentialSummary[]): BrowserCredentialSummary[] {
  return [...entries].sort((a, b) => {
    const lastA = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0;
    const lastB = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0;
    if (lastA !== lastB) return lastB - lastA;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

function normalizeVault(data: unknown): BrowserCredentialVaultFile {
  if (!data || typeof data !== 'object') {
    return { version: VAULT_FILE_VERSION, credentials: [] };
  }

  const file = data as { version?: unknown; credentials?: unknown };
  if (file.version !== VAULT_FILE_VERSION || !Array.isArray(file.credentials)) {
    return { version: VAULT_FILE_VERSION, credentials: [] };
  }

  const credentials: BrowserCredentialRecord[] = [];
  for (const item of file.credentials) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Partial<BrowserCredentialRecord>;
    if (
      typeof record.id !== 'string'
      || typeof record.origin !== 'string'
      || typeof record.label !== 'string'
      || typeof record.usernameEncrypted !== 'string'
      || typeof record.passwordEncrypted !== 'string'
      || typeof record.autoFill !== 'boolean'
      || typeof record.updatedAt !== 'string'
    ) {
      continue;
    }
    credentials.push({
      id: record.id,
      origin: record.origin,
      label: record.label,
      usernameEncrypted: record.usernameEncrypted,
      passwordEncrypted: record.passwordEncrypted,
      autoFill: record.autoFill,
      updatedAt: record.updatedAt,
      lastUsedAt: typeof record.lastUsedAt === 'string' ? record.lastUsedAt : undefined,
    });
  }

  return { version: VAULT_FILE_VERSION, credentials };
}

async function readVault(): Promise<BrowserCredentialVaultFile> {
  try {
    const raw = await fs.readFile(vaultFilePath(), 'utf-8');
    return normalizeVault(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: VAULT_FILE_VERSION, credentials: [] };
    }
    console.warn('[browser-credential-vault] Failed to read vault; using empty state.', error);
    return { version: VAULT_FILE_VERSION, credentials: [] };
  }
}

async function writeVault(vault: BrowserCredentialVaultFile): Promise<void> {
  const filePath = vaultFilePath();
  const dirPath = path.dirname(filePath);
  const tmpFilePath = `${filePath}.tmp`;
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(tmpFilePath, JSON.stringify(vault, null, 2), 'utf-8');
  await fs.rename(tmpFilePath, filePath);
}

export async function listBrowserCredentialSummariesForUrl(url: string): Promise<BrowserCredentialSummary[]> {
  const origin = normalizeOriginFromUrl(url);
  const vault = await readVault();
  const summaries = vault.credentials
    .filter((entry) => entry.origin === origin)
    .map(buildSummary)
    .filter((entry): entry is BrowserCredentialSummary => Boolean(entry));
  return sortSummaries(summaries);
}

function applyAutoFillExclusivity(records: BrowserCredentialRecord[], origin: string, selectedId: string): void {
  for (const entry of records) {
    if (entry.origin === origin && entry.id !== selectedId) {
      entry.autoFill = false;
    }
  }
}

export async function saveBrowserCredentialForUrl(input: BrowserCredentialSaveInput): Promise<BrowserCredentialSummary> {
  const origin = normalizeOriginFromUrl(input.url);
  const username = normalizeUsername(input.username);
  const password = normalizePassword(input.password);
  if (!username) {
    throw new Error('Username is required.');
  }
  if (!password) {
    throw new Error('Password is required.');
  }

  const now = new Date().toISOString();
  const vault = await readVault();
  let record: BrowserCredentialRecord | undefined;

  if (input.id) {
    record = vault.credentials.find((entry) => entry.id === input.id);
    if (record && record.origin !== origin) {
      throw new Error('Selected credential does not belong to this site.');
    }
  }

  if (!record) {
    record = {
      id: randomUUID(),
      origin,
      label: normalizeLabel(input.label, username),
      usernameEncrypted: encryptSecret(username),
      passwordEncrypted: encryptSecret(password),
      autoFill: Boolean(input.autoFill),
      updatedAt: now,
    };
    vault.credentials.push(record);
  } else {
    record.label = normalizeLabel(input.label, username);
    record.usernameEncrypted = encryptSecret(username);
    record.passwordEncrypted = encryptSecret(password);
    record.autoFill = Boolean(input.autoFill);
    record.updatedAt = now;
  }

  if (record.autoFill) {
    applyAutoFillExclusivity(vault.credentials, origin, record.id);
  }

  await writeVault(vault);

  const summary = buildSummary(record);
  if (!summary) {
    throw new Error('Credential was saved but could not be decrypted.');
  }
  return summary;
}

export async function deleteBrowserCredentialById(id: string): Promise<{ deleted: boolean }> {
  const trimmedId = id.trim();
  if (!trimmedId) return { deleted: false };
  const vault = await readVault();
  const next = vault.credentials.filter((entry) => entry.id !== trimmedId);
  if (next.length === vault.credentials.length) {
    return { deleted: false };
  }
  vault.credentials = next;
  await writeVault(vault);
  return { deleted: true };
}

async function selectCredentialForFill(
  url: string,
  resolveRecord: (entries: BrowserCredentialRecord[], origin: string) => BrowserCredentialRecord | undefined,
): Promise<BrowserCredentialFillData | null> {
  const origin = normalizeOriginFromUrl(url);
  const vault = await readVault();
  const selected = resolveRecord(vault.credentials, origin);
  if (!selected) return null;

  selected.lastUsedAt = new Date().toISOString();
  await writeVault(vault);
  return buildFillData(selected);
}

export async function getBrowserCredentialForFill(url: string, id: string): Promise<BrowserCredentialFillData | null> {
  const trimmedId = id.trim();
  if (!trimmedId) return null;
  return selectCredentialForFill(url, (entries, origin) =>
    entries.find((entry) => entry.origin === origin && entry.id === trimmedId),
  );
}

export async function getBrowserAutoFillCredentialForUrl(url: string): Promise<BrowserCredentialFillData | null> {
  return selectCredentialForFill(url, (entries, origin) => {
    const candidates = entries
      .filter((entry) => entry.origin === origin && entry.autoFill)
      .sort((a, b) => {
        const lastA = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0;
        const lastB = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0;
        if (lastA !== lastB) return lastB - lastA;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
    return candidates[0];
  });
}
