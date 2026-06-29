import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ipcSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
const ipcFsStoreSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-fs-store.ts'), 'utf8');
const ipcAppBrowserSource = readFileSync(
  path.join(process.cwd(), 'src/main/ipc-app-browser.ts'),
  'utf8',
);
const ipcPtySource = readFileSync(path.join(process.cwd(), 'src/main/ipc-pty.ts'), 'utf8');
const ipcStateSanitizerSource = readFileSync(
  path.join(process.cwd(), 'src/main/ipc-state-sanitizer.ts'),
  'utf8',
);
const ipcPathPolicySource = readFileSync(
  path.join(process.cwd(), 'src/main/ipc-path-policy.ts'),
  'utf8',
);

describe('ipc filesystem contract', () => {
  it('restricts directory metadata lookups to allowed locations', () => {
    expect(ipcSource).toContain("from './ipc-path-policy'");
    expect(ipcSource).toContain('registerFsStoreIpcHandlers({');
    expect(ipcPathPolicySource).toContain('export function isAllowedDirectoryLookupPath');
    expect(ipcPathPolicySource).toContain('export function isAllowedReadPath');
    expect(ipcFsStoreSource).toContain('fs:isDirectory blocked');
    expect(ipcFsStoreSource).toContain('fs:listDirs blocked');
  });

  it('requires prefix-based listing outside known projects to reduce enumeration', () => {
    expect(ipcFsStoreSource).toContain(
      'if (!policy.isWithinKnownProject(resolved) && !lowerPrefix)',
    );
    expect(ipcFsStoreSource).toContain(
      'Avoid broad directory enumeration outside known project roots.',
    );
  });

  it('requires known project cwd for PTY creation entry points', () => {
    expect(ipcSource).toContain('registerPtyIpcHandlers({');
    expect(ipcPtySource).toContain('PTY create requires a known project path');
    expect(ipcPtySource).toContain('PTY shell requires a known project path');
  });

  it('sanitizes persisted state payloads before saving', () => {
    expect(ipcSource).toContain("from './ipc-state-sanitizer'");
    expect(ipcSource).toContain('sanitizePersistedStateForSave,');
    expect(ipcStateSanitizerSource).toContain('function validatePersistedStateReferences');
    expect(ipcStateSanitizerSource).toContain('duplicate project.id detected');
    expect(ipcStateSanitizerSource).toContain('browserTargetSessionId is missing in project');
    expect(ipcStateSanitizerSource).toContain('Invalid state payload');
    expect(ipcStateSanitizerSource).toContain('MAX_PERSISTED_STATE_BYTES');
  });

  it('allows only explicit guest message channels from renderer to webview', () => {
    expect(ipcSource).toContain('registerAppBrowserIpcHandlers({');
    expect(ipcAppBrowserSource).toContain('ALLOWED_GUEST_MESSAGE_CHANNELS');
    expect(ipcAppBrowserSource).toContain('isAllowedGuestMessagePayload(channel, args)');
    expect(ipcAppBrowserSource).toContain('blocked invalid payload for channel');
    expect(ipcAppBrowserSource).toContain('app:sendToGuestWebContents blocked unknown channel');
    expect(ipcAppBrowserSource).toContain("guest.getType() !== 'webview'");
    expect(ipcAppBrowserSource).toContain('app:sendToGuestWebContents blocked non-webview target');
    expect(ipcAppBrowserSource).toContain("'auth-fill-credentials'");
    expect(ipcAppBrowserSource).toContain("'flow-do-click'");
  });
});
