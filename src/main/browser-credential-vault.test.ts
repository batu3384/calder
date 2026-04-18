import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

const electronMocks = vi.hoisted(() => {
  const mockGetPath = vi.fn<(name: string) => string>();
  const isEncryptionAvailable = vi.fn(() => true);
  const encryptString = vi.fn((value: string) => Buffer.from(`enc:${value}`, 'utf8'));
  const decryptString = vi.fn((payload: Buffer) => {
    const text = payload.toString('utf8');
    return text.startsWith('enc:') ? text.slice(4) : text;
  });
  return {
    mockGetPath,
    isEncryptionAvailable,
    encryptString,
    decryptString,
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: electronMocks.mockGetPath,
  },
  safeStorage: {
    isEncryptionAvailable: electronMocks.isEncryptionAvailable,
    encryptString: electronMocks.encryptString,
    decryptString: electronMocks.decryptString,
  },
}));

describe('browser credential vault', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'calder-browser-credentials-'));
    electronMocks.mockGetPath.mockImplementation((name: string) => {
      if (name === 'userData') return root;
      return root;
    });
    electronMocks.isEncryptionAvailable.mockReturnValue(true);
    electronMocks.encryptString.mockClear();
    electronMocks.decryptString.mockClear();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('saves and lists encrypted credentials for a URL origin', async () => {
    const vault = await import('./browser-credential-vault.js');

    const saved = await vault.saveBrowserCredentialForUrl({
      url: 'http://localhost:3000/login',
      label: 'Local admin',
      username: 'admin@example.com',
      password: 's3cr3t!',
      autoFill: true,
    });

    expect(saved.label).toBe('Local admin');
    expect(saved.username).toBe('admin@example.com');
    expect(saved.autoFill).toBe(true);
    expect(electronMocks.encryptString).toHaveBeenCalled();

    const list = await vault.listBrowserCredentialSummariesForUrl('http://localhost:3000/dashboard');
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(saved.id);
    expect(list[0]?.username).toBe('admin@example.com');
    expect(list[0]?.autoFill).toBe(true);
  });

  it('returns full credential data for fill and tracks last-used timestamp', async () => {
    const vault = await import('./browser-credential-vault.js');
    const saved = await vault.saveBrowserCredentialForUrl({
      url: 'http://localhost:4173',
      label: 'Preview',
      username: 'preview@example.com',
      password: 'pw-123',
      autoFill: false,
    });

    const fillData = await vault.getBrowserCredentialForFill('http://localhost:4173/login', saved.id);
    expect(fillData).not.toBeNull();
    expect(fillData?.username).toBe('preview@example.com');
    expect(fillData?.password).toBe('pw-123');

    const list = await vault.listBrowserCredentialSummariesForUrl('http://localhost:4173');
    expect(list[0]?.lastUsedAt).toBeTruthy();
  });

  it('keeps auto-fill exclusive per origin and resolves the newest auto-fill profile', async () => {
    const vault = await import('./browser-credential-vault.js');
    const first = await vault.saveBrowserCredentialForUrl({
      url: 'https://example.com/login',
      label: 'Primary',
      username: 'first@example.com',
      password: 'first-pass',
      autoFill: true,
    });

    const second = await vault.saveBrowserCredentialForUrl({
      url: 'https://example.com/login',
      label: 'Secondary',
      username: 'second@example.com',
      password: 'second-pass',
      autoFill: true,
    });

    const list = await vault.listBrowserCredentialSummariesForUrl('https://example.com/account');
    const firstSummary = list.find((entry) => entry.id === first.id);
    const secondSummary = list.find((entry) => entry.id === second.id);
    expect(firstSummary?.autoFill).toBe(false);
    expect(secondSummary?.autoFill).toBe(true);

    const autoFill = await vault.getBrowserAutoFillCredentialForUrl('https://example.com/login');
    expect(autoFill?.id).toBe(second.id);
    expect(autoFill?.username).toBe('second@example.com');
  });

  it('deletes saved credentials by id', async () => {
    const vault = await import('./browser-credential-vault.js');
    const saved = await vault.saveBrowserCredentialForUrl({
      url: 'http://localhost:9000',
      label: 'Delete me',
      username: 'deleteme',
      password: 'pw',
      autoFill: false,
    });

    const deleted = await vault.deleteBrowserCredentialById(saved.id);
    expect(deleted.deleted).toBe(true);

    const list = await vault.listBrowserCredentialSummariesForUrl('http://localhost:9000');
    expect(list).toHaveLength(0);
  });

  it('rejects non-http(s) URLs', async () => {
    const vault = await import('./browser-credential-vault.js');
    await expect(vault.saveBrowserCredentialForUrl({
      url: 'file:///Users/me/index.html',
      label: 'Invalid',
      username: 'user',
      password: 'pw',
      autoFill: false,
    })).rejects.toThrow('Credentials are supported only for HTTP(S) pages.');
  });
});
