import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const ipcMobileSource = readFileSync(new URL('./ipc-mobile.ts', import.meta.url), 'utf8');

describe('mobile control IPC contract', () => {
  it('registers RTC config and mobile control pairing channels', () => {
    expect(ipcMobileSource).toContain("ipcMain.handle('sharing:getRtcConfig'");
    expect(ipcMobileSource).toContain("'mobile:createControlPairing'");
    expect(ipcMobileSource).toContain("'mobile:consumeControlAnswer'");
    expect(ipcMobileSource).toContain("'mobile:revokeControlPairing'");
  });
});
