import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const shareDialogSource = readFileSync(new URL('./share-dialog.ts', import.meta.url), 'utf-8');
const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const tabsCssSource = readFileSync(new URL('../styles/tabs.css', import.meta.url), 'utf-8');

describe('mobile control discoverability contract', () => {
  it('exposes a direct launcher button in the top action rail', () => {
    expect(htmlSource).toContain('id="btn-mobile-control"');
    expect(htmlSource).toContain('id="mobile-control-presence"');
    expect(htmlSource).toContain('tab-action-handoff-icon');
    expect(tabBarSource).toContain('function syncMobileControlButton(): void');
    expect(tabBarSource).toContain('function getPreferredCliSession(project: ProjectRecord): SessionRecord | null {');
    expect(tabBarSource).toContain("btnMobileControl.classList.toggle('is-sharing', sharing);");
    expect(tabBarSource).toContain("btnMobileControl.classList.toggle('is-connected', connected);");
    expect(tabBarSource).toContain("btnMobileControl.dataset.connectionState = connected ? 'connected' : sharing ? 'waiting' : 'idle';");
    expect(tabBarSource).toContain("mobileControlPresenceEl.dataset.connectionState = connected ? 'connected' : 'waiting';");
    expect(tabBarSource).toContain('buildShareDialogMobilePresence');
    expect(tabBarSource).toContain('showShareDialog(targetCliSession.id);');
    expect(tabBarSource).toContain('void promptNewSession((session) => {');
    expect(tabBarSource).toContain('showShareDialog(session.id);');
  });

  it('renders dedicated waiting and connected states for mobile handoff status', () => {
    expect(tabsCssSource).toContain(".tab-action-handoff[data-connection-state='waiting']");
    expect(tabsCssSource).toContain('.tab-action-handoff.is-connected');
    expect(tabsCssSource).toContain(".mobile-control-presence[data-connection-state='waiting']");
    expect(tabsCssSource).toContain(".mobile-control-presence[data-connection-state='connected']");
  });

  it('exposes a dedicated mobile control entry in tab context menu', () => {
    expect(tabBarSource).toContain("mobileShareItem.textContent = 'Mobile Control\\u2026'");
  });

  it('explains when mobile QR handoff becomes available inside share dialog', () => {
    expect(shareDialogSource).toContain('Start Sharing to generate a secure mobile QR and one-time code.');
  });
});
