import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./share-dialog.ts', import.meta.url), 'utf-8');

describe('share dialog mobile UX contract', () => {
  it('surfaces a quick handoff lane and keeps manual codes as explicit fallback', () => {
    expect(source).toContain('Quick handoff (Recommended)');
    expect(source).toContain('Quick pairing steps');
    expect(source).toContain('Show Manual Codes');
    expect(source).toContain('Hide Manual Codes');
    expect(source).toContain('Use Manual Codes only if quick handoff fails.');
  });

  it('offers a local retry action when mobile pairing creation fails', () => {
    expect(source).toContain('Retry QR');
  });

  it('surfaces LAN fallback links when quick handoff link is unavailable on some networks', () => {
    expect(source).toContain('LAN fallback link');
    expect(source).toContain('Use fallback');
    expect(source).toContain('localPairingUrls');
  });

  it('shows current mobile connection presence in the share hero area', () => {
    expect(source).toContain('mobileConnectionSummary');
    expect(source).toContain('share-connection-presence');
    expect(source).toContain('mobileConnectionStateConnected');
  });
});
