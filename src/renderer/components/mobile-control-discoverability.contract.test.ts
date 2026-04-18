import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const shareDialogSource = readFileSync(new URL('./share-dialog.ts', import.meta.url), 'utf-8');
const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');

describe('mobile control discoverability contract', () => {
  it('exposes a direct launcher button in the top action rail', () => {
    expect(htmlSource).toContain('id="btn-mobile-control"');
    expect(htmlSource).toContain('>Handoff<');
    expect(tabBarSource).toContain('function syncMobileControlButton(): void');
    expect(tabBarSource).toContain("btnMobileControl.textContent = sharing ? 'Handoff On' : 'Handoff';");
  });

  it('exposes a dedicated mobile control entry in tab context menu', () => {
    expect(tabBarSource).toContain("mobileShareItem.textContent = 'Mobile Control\\u2026'");
  });

  it('explains when mobile QR handoff becomes available inside share dialog', () => {
    expect(shareDialogSource).toContain('Start Sharing to generate a secure mobile QR and one-time code.');
  });
});
