import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const shareDialogSource = readFileSync(new URL('./share-dialog.ts', import.meta.url), 'utf-8');
const shareDialogCopySource = readFileSync(
  new URL('./share-dialog-copy.ts', import.meta.url),
  'utf-8',
);
const shareDialogStartHandlerSource = readFileSync(
  new URL('./share-dialog-start-handler.ts', import.meta.url),
  'utf-8',
);
const shareDialogFlowControllerSource = readFileSync(
  new URL('./share-dialog-flow-controller.ts', import.meta.url),
  'utf-8',
);
const shareDialogMobilePairingSource = readFileSync(
  new URL('./share-dialog-mobile-pairing.ts', import.meta.url),
  'utf-8',
);
const source = [
  shareDialogSource,
  shareDialogCopySource,
  shareDialogStartHandlerSource,
  shareDialogFlowControllerSource,
  shareDialogMobilePairingSource,
].join('\n');

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
