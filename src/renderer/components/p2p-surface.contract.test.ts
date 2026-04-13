import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const remotePaneSource = readFileSync(new URL('./remote-terminal-pane.ts', import.meta.url), 'utf-8');
const tabBarSource = readFileSync(new URL('./tab-bar.ts', import.meta.url), 'utf-8');
const shareStyles = readFileSync(new URL('../styles/p2p-sharing.css', import.meta.url), 'utf-8');

describe('p2p live surface contract', () => {
  it('uses a structured remote status shell instead of loose inline controls', () => {
    expect(remotePaneSource).toContain('session-status-bar remote-status-bar remote-status-shell');
    expect(remotePaneSource).toContain('remote-mode-label calder-status-pill');
    expect(remotePaneSource).toContain('remote-disconnect-btn calder-button');
  });

  it('uses a richer tab share indicator shell instead of a raw dot only', () => {
    expect(tabBarSource).toContain('tab-share-indicator calder-status-pill');
    expect(shareStyles).toContain('.remote-status-shell');
    expect(shareStyles).toContain('.tab-share-indicator.calder-status-pill');
  });
});
