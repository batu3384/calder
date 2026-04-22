import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const tabBarSource = readFileSync(new URL('./tab-bar/tab-bar.ts', import.meta.url), 'utf-8');
const mobileControlSource = readFileSync(new URL('./tab-bar/tab-bar-mobile-control.ts', import.meta.url), 'utf-8');
const sessionContextMenuSource = readFileSync(new URL('./tab-bar/tab-bar-session-context-menu.ts', import.meta.url), 'utf-8');
const shareDialogCoreSource = readFileSync(new URL('./share-dialog/share-dialog.ts', import.meta.url), 'utf-8');
const shareDialogCopySource = readFileSync(new URL('./share-dialog/share-dialog-copy.ts', import.meta.url), 'utf-8');
const shareDialogSource = [shareDialogCoreSource, shareDialogCopySource].join('\n');
const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
const tabsCssSource = readFileSync(new URL('../styles/tabs.css', import.meta.url), 'utf-8');

describe('mobile control discoverability contract', () => {
  it('exposes a direct launcher button in the top action rail', () => {
    expect(htmlSource).toContain('id="btn-mobile-control"');
    expect(htmlSource).toContain('id="mobile-control-presence"');
    expect(htmlSource).toContain('tab-action-handoff-icon');
    expect(tabBarSource).toContain("from './tab-bar-mobile-control.js'");
    expect(tabBarSource).toContain('syncMobileControlButton(btnMobileControl, mobileControlPresenceEl);');
    expect(mobileControlSource).toContain('export function syncMobileControlButton(');
    expect(mobileControlSource).toContain('export function getPreferredCliSession(project: ProjectRecord): SessionRecord | null {');
    expect(mobileControlSource).toContain("btnMobileControl.classList.toggle('is-sharing', sharing);");
    expect(mobileControlSource).toContain("btnMobileControl.classList.toggle('is-connected', connected);");
    expect(mobileControlSource).toContain("btnMobileControl.dataset.connectionState = connected ? 'connected' : sharing ? 'waiting' : 'idle';");
    expect(mobileControlSource).toContain("mobileControlPresenceEl.dataset.connectionState = connected ? 'connected' : 'waiting';");
    expect(mobileControlSource).toContain('buildShareDialogMobilePresence');
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
    expect(tabBarSource).toContain("from './tab-bar-session-context-menu.js'");
    expect(sessionContextMenuSource).toContain("mobileShareItem.textContent = 'Mobile Control…'");
  });

  it('explains when mobile QR handoff becomes available inside share dialog', () => {
    expect(shareDialogSource).toContain('Start Sharing to generate a secure mobile QR and one-time code.');
  });
});
