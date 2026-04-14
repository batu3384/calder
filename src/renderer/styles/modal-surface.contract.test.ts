import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const modalCss = readFileSync(new URL('./modals.css', import.meta.url), 'utf-8');
const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf-8');

describe('modal surface stylesheet contract', () => {
  it('renders modals as compact control sheets instead of glossy popups', () => {
    expect(modalCss).toContain('#modal-overlay, .modal-overlay');
    expect(modalCss).toContain('backdrop-filter: blur(14px);');
    expect(modalCss).toContain('#modal, .modal-box');
    expect(modalCss).toContain('border-radius: 16px;');
    expect(modalCss).toContain('padding: 20px;');
  });

  it('keeps modal actions and fields in the same tighter rhythm', () => {
    expect(modalCss).toContain('#modal-actions, .modal-actions');
    expect(modalCss).toContain('justify-content: flex-end;');
    expect(modalCss).toContain('.modal-btn');
    expect(modalCss).toContain('min-width: 112px;');
    expect(modalCss).toContain('border-radius: 14px;');
    expect(modalCss).toContain('.modal-field input');
    expect(modalCss).toContain('border-radius: 10px;');
  });

  it('uses the display typography system on shell and modal titles', () => {
    expect(baseCss).toContain('--font-display:');
    expect(modalCss).toContain('font-family: var(--font-display);');
  });
});
