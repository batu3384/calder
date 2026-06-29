import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const shareSource = readFileSync(
  new URL('./share-dialog/share-dialog.ts', import.meta.url),
  'utf-8',
);
const shareShellSource = readFileSync(
  new URL('./share-dialog/share-dialog-shell.ts', import.meta.url),
  'utf-8',
);
const shareDialogSource = [shareSource, shareShellSource].join('\n');
const joinSource = readFileSync(new URL('./join-dialog.ts', import.meta.url), 'utf-8');
const shareStyles = readFileSync(new URL('../styles/p2p-sharing.css', import.meta.url), 'utf-8');

describe('p2p dialog family contract', () => {
  it('uses a structured shell and hero layout for sharing dialogs', () => {
    expect(shareDialogSource).toContain('share-dialog modal-surface share-dialog-shell');
    expect(shareDialogSource).toContain('share-dialog-hero');
    expect(shareDialogSource).toContain('share-actions share-actions-shell');
    expect(joinSource).toContain('share-dialog modal-surface share-dialog-shell');
    expect(joinSource).toContain('share-dialog-hero');
    expect(joinSource).toContain('share-actions share-actions-shell');
  });

  it('styles the shell, hero, and footer actions as a unified product surface', () => {
    expect(shareStyles).toContain('.share-dialog-shell');
    expect(shareStyles).toContain('.share-dialog-hero');
    expect(shareStyles).toContain('.share-actions-shell');
    expect(shareStyles).toContain('.share-btn.calder-button');
  });
});
