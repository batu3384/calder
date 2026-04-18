import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./share-dialog.ts', import.meta.url), 'utf-8');

describe('share dialog mobile control contract', () => {
  it('wires mobile pairing flow into the share dialog', () => {
    expect(source).toContain('Mobile handoff (QR + one-time code)');
    expect(source).toContain('createControlPairing');
    expect(source).toContain('consumeControlAnswer');
    expect(source).toContain('revokeControlPairing');
    expect(source).toContain('decodeConnectionEnvelope');
    expect(source).toContain('offerDescription');
    expect(source).toContain("appState.preferences.language ?? 'en'");
    expect(source).toContain('const sharingConfigApi = getSharingConfigApi();');
    expect(source).toContain('sharingConfigApi.getRtcConfig()');
  });
});
