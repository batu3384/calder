import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  const vaultFilePath = () => path.join(root, 'browser-credentials.v1.json');

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'calder-browser-credentials-'));
    electronMocks.mockGetPath.mockImplementation((name: string) => {
      if (name === 'userData') return root;
      return root;
    });
    electronMocks.isEncryptionAvailable.mockReturnValue(true);
    electronMocks.encryptString.mockImplementation((value: string) => Buffer.from(`enc:${value}`, 'utf8'));
    electronMocks.decryptString.mockImplementation((payload: Buffer) => {
      const text = payload.toString('utf8');
      return text.startsWith('enc:') ? text.slice(4) : text;
    });
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

  it('rejects invalid URL syntax before origin normalization', async () => {
    const vault = await import('./browser-credential-vault.js');
    await expect(vault.saveBrowserCredentialForUrl({
      url: 'not a valid url',
      label: 'Invalid URL',
      username: 'user',
      password: 'pw',
      autoFill: false,
    })).rejects.toThrow('The URL is invalid.');
  });

  it('rejects saves when secure storage is unavailable', async () => {
    const vault = await import('./browser-credential-vault.js');
    electronMocks.isEncryptionAvailable.mockReturnValue(false);

    await expect(vault.saveBrowserCredentialForUrl({
      url: 'https://example.com/login',
      label: 'No Secure Storage',
      username: 'user',
      password: 'pw',
      autoFill: false,
    })).rejects.toThrow('Secure credential storage is unavailable on this device.');
  });

  it('handles malformed vault files and decrypt failures gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const vault = await import('./browser-credential-vault.js');

    writeFileSync(vaultFilePath(), '{ not-json', 'utf8');
    expect(await vault.listBrowserCredentialSummariesForUrl('https://example.com')).toEqual([]);

    writeFileSync(vaultFilePath(), JSON.stringify({ version: 2, credentials: [] }, null, 2), 'utf8');
    expect(await vault.listBrowserCredentialSummariesForUrl('https://example.com')).toEqual([]);

    writeFileSync(vaultFilePath(), JSON.stringify({
      version: 1,
      credentials: [
        { bad: true },
        {
          id: 'valid-1',
          origin: 'https://example.com',
          label: 'Valid shape',
          usernameEncrypted: Buffer.from('enc:user', 'utf8').toString('base64'),
          passwordEncrypted: Buffer.from('enc:pass', 'utf8').toString('base64'),
          autoFill: false,
          updatedAt: new Date().toISOString(),
        },
      ],
    }, null, 2), 'utf8');

    electronMocks.decryptString.mockImplementationOnce(() => {
      throw new Error('cannot decrypt');
    });
    expect(await vault.listBrowserCredentialSummariesForUrl('https://example.com')).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('validates required username/password and origin constraints for id updates', async () => {
    const vault = await import('./browser-credential-vault.js');
    await expect(vault.saveBrowserCredentialForUrl({
      url: 'https://example.com',
      label: 'Missing username',
      username: '   ',
      password: 'pw',
      autoFill: false,
    })).rejects.toThrow('Username is required.');

    await expect(vault.saveBrowserCredentialForUrl({
      url: 'https://example.com',
      label: 'Missing password',
      username: 'user',
      password: '',
      autoFill: false,
    })).rejects.toThrow('Password is required.');

    const saved = await vault.saveBrowserCredentialForUrl({
      url: 'https://example.com/login',
      label: 'Original',
      username: 'first@example.com',
      password: 'first',
      autoFill: false,
    });

    const updated = await vault.saveBrowserCredentialForUrl({
      id: saved.id,
      url: 'https://example.com/account',
      label: 'Updated',
      username: 'updated@example.com',
      password: 'updated-pass',
      autoFill: false,
    });
    expect(updated.id).toBe(saved.id);
    expect(updated.label).toBe('Updated');
    expect(updated.username).toBe('updated@example.com');

    await expect(vault.saveBrowserCredentialForUrl({
      id: saved.id,
      url: 'https://other.example.com/login',
      label: 'Wrong origin',
      username: 'x',
      password: 'x',
      autoFill: false,
    })).rejects.toThrow('Selected credential does not belong to this site.');
  });

  it('throws when saved credentials cannot be decrypted into summaries', async () => {
    const vault = await import('./browser-credential-vault.js');
    electronMocks.decryptString.mockImplementation(() => {
      throw new Error('decrypt failed');
    });

    await expect(vault.saveBrowserCredentialForUrl({
      url: 'https://example.com/login',
      label: 'Decrypt fail',
      username: 'user',
      password: 'pw',
      autoFill: false,
    })).rejects.toThrow('Credential was saved but could not be decrypted.');
  });

  it('returns null when decrypting fill payload fails and when ids are blank/missing', async () => {
    const vault = await import('./browser-credential-vault.js');
    const saved = await vault.saveBrowserCredentialForUrl({
      url: 'https://fill.example.com/login',
      label: 'Fill',
      username: 'fill@example.com',
      password: 'fill-pass',
      autoFill: false,
    });

    electronMocks.decryptString.mockImplementation(() => {
      throw new Error('decrypt failed');
    });
    await expect(vault.getBrowserCredentialForFill('https://fill.example.com/login', saved.id)).resolves.toBeNull();
    await expect(vault.getBrowserCredentialForFill('https://fill.example.com/login', '   ')).resolves.toBeNull();
    await expect(vault.getBrowserCredentialForFill('https://fill.example.com/login', 'missing-id')).resolves.toBeNull();
  });

  it('sorts auto-fill candidates by lastUsedAt then updatedAt', async () => {
    const vault = await import('./browser-credential-vault.js');
    writeFileSync(vaultFilePath(), JSON.stringify({
      version: 1,
      credentials: [
        {
          id: 'auto-old',
          origin: 'https://sort.example.com',
          label: 'Old',
          usernameEncrypted: Buffer.from('enc:old@example.com', 'utf8').toString('base64'),
          passwordEncrypted: Buffer.from('enc:old-pass', 'utf8').toString('base64'),
          autoFill: true,
          updatedAt: '2026-01-01T00:00:00.000Z',
          lastUsedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'auto-new',
          origin: 'https://sort.example.com',
          label: 'New',
          usernameEncrypted: Buffer.from('enc:new@example.com', 'utf8').toString('base64'),
          passwordEncrypted: Buffer.from('enc:new-pass', 'utf8').toString('base64'),
          autoFill: true,
          updatedAt: '2026-01-02T00:00:00.000Z',
          lastUsedAt: '2026-01-03T00:00:00.000Z',
        },
      ],
    }, null, 2), 'utf8');

    const fill = await vault.getBrowserAutoFillCredentialForUrl('https://sort.example.com/login');
    expect(fill?.id).toBe('auto-new');
    expect(fill?.username).toBe('new@example.com');
    expect(fill?.password).toBe('new-pass');
  });

  it('returns deleted false for blank and unknown ids', async () => {
    const vault = await import('./browser-credential-vault.js');
    await expect(vault.deleteBrowserCredentialById('   ')).resolves.toEqual({ deleted: false });
    await expect(vault.deleteBrowserCredentialById('missing-id')).resolves.toEqual({ deleted: false });
  });
});
