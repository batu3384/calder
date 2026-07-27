import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const helpSource = readFileSync(new URL('./help-dialog.ts', import.meta.url), 'utf-8');
const dialogStyles = readFileSync(new URL('../styles/dialogs.css', import.meta.url), 'utf-8');
const primitives = readFileSync(new URL('../styles/primitives.css', import.meta.url), 'utf-8');

describe('micro status surfaces contract', () => {
  it('routes helper badges through the shared status-pill primitive', () => {
    expect(helpSource).toContain('help-badge calder-status-pill');
    expect(primitives).toContain('.calder-status-pill');
    expect(dialogStyles).toContain('.help-badge.calder-status-pill');
  });

  it('keeps the shared inline-notice primitive available for dialogs', () => {
    expect(primitives).toContain('.calder-inline-notice');
  });
});
