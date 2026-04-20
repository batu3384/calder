import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');

describe('ipc filesystem contract', () => {
  it('restricts directory metadata lookups to allowed locations', () => {
    expect(ipcSource).toContain('function isAllowedDirectoryLookupPath');
    expect(ipcSource).toContain('fs:isDirectory blocked');
    expect(ipcSource).toContain('fs:listDirs blocked');
  });

  it('requires prefix-based listing outside known projects to reduce enumeration', () => {
    expect(ipcSource).toContain('if (!isWithinKnownProject(resolved) && !lowerPrefix)');
    expect(ipcSource).toContain('Avoid broad directory enumeration outside known project roots.');
  });

  it('requires known project cwd for PTY creation entry points', () => {
    expect(ipcSource).toContain('PTY create requires a known project path');
    expect(ipcSource).toContain('PTY shell requires a known project path');
  });

  it('sanitizes persisted state payloads before saving', () => {
    expect(ipcSource).toContain('function sanitizePersistedStateForSave');
    expect(ipcSource).toContain('function validatePersistedStateReferences');
    expect(ipcSource).toContain('duplicate project.id detected');
    expect(ipcSource).toContain('browserTargetSessionId is missing in project');
    expect(ipcSource).toContain('Invalid state payload');
    expect(ipcSource).toContain('MAX_PERSISTED_STATE_BYTES');
  });

  it('allows only explicit guest message channels from renderer to webview', () => {
    expect(ipcSource).toContain('ALLOWED_GUEST_MESSAGE_CHANNELS');
    expect(ipcSource).toContain('isAllowedGuestMessagePayload(channel, args)');
    expect(ipcSource).toContain('blocked invalid payload for channel');
    expect(ipcSource).toContain('app:sendToGuestWebContents blocked unknown channel');
    expect(ipcSource).toContain("guest.getType() !== 'webview'");
    expect(ipcSource).toContain('app:sendToGuestWebContents blocked non-webview target');
    expect(ipcSource).toContain("'auth-fill-credentials'");
    expect(ipcSource).toContain("'flow-do-click'");
  });
});
