import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const helpSource = readFileSync(new URL('./help-dialog.ts', import.meta.url), 'utf-8');
const whatsNewSource = readFileSync(new URL('./whats-new-dialog.ts', import.meta.url), 'utf-8');
const usageSource = readFileSync(new URL('./usage-modal.ts', import.meta.url), 'utf-8');
const dialogStyles = readFileSync(new URL('../styles/dialogs.css', import.meta.url), 'utf-8');
const usageStyles = readFileSync(new URL('../styles/usage.css', import.meta.url), 'utf-8');

describe('dialog family contract', () => {
  it('uses product shells for help and release dialogs', () => {
    expect(helpSource).toContain('help-hero');
    expect(helpSource).toContain('help-section-shell');
    expect(whatsNewSource).toContain('whats-new-hero');
    expect(whatsNewSource).toContain('whats-new-section-shell');
    expect(dialogStyles).toContain('.help-hero');
    expect(dialogStyles).toContain('.help-section-shell');
    expect(dialogStyles).toContain('.whats-new-hero');
    expect(dialogStyles).toContain('.whats-new-section-shell');
  });

  it('uses richer usage stat shells instead of flat rows', () => {
    expect(usageSource).toContain('usage-hero');
    expect(usageSource).toContain('usage-section-shell');
    expect(usageStyles).toContain('.usage-hero');
    expect(usageStyles).toContain('.usage-section-shell');
    expect(usageStyles).toContain('.usage-model-list');
  });
});
