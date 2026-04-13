import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const helpSource = readFileSync(new URL('./help-dialog.ts', import.meta.url), 'utf-8');
const shareSource = readFileSync(new URL('./share-dialog.ts', import.meta.url), 'utf-8');
const joinSource = readFileSync(new URL('./join-dialog.ts', import.meta.url), 'utf-8');
const dialogStyles = readFileSync(new URL('../styles/dialogs.css', import.meta.url), 'utf-8');
const shareStyles = readFileSync(new URL('../styles/p2p-sharing.css', import.meta.url), 'utf-8');
const primitives = readFileSync(new URL('../styles/primitives.css', import.meta.url), 'utf-8');

describe('micro status surfaces contract', () => {
  it('routes helper badges through the shared status-pill primitive', () => {
    expect(helpSource).toContain('help-badge calder-status-pill');
    expect(primitives).toContain('.calder-status-pill');
    expect(dialogStyles).toContain('.help-badge.calder-status-pill');
  });

  it('routes share hints through the shared inline-notice primitive', () => {
    expect(shareSource).toContain('share-notice calder-inline-notice');
    expect(joinSource).toContain('share-notice calder-inline-notice');
    expect(primitives).toContain('.calder-inline-notice');
    expect(shareStyles).toContain('.share-notice.calder-inline-notice');
  });
});
