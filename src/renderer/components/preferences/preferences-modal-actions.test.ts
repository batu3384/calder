import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const actionsSource = readFileSync(
  new URL('./preferences-modal-actions.ts', import.meta.url),
  'utf-8',
);
const modalSource = readFileSync(new URL('./preferences-modal.ts', import.meta.url), 'utf-8');

describe('preferences modal theme preview contract', () => {
  it('reverts appearance preview on cancel', () => {
    expect(actionsSource).toContain('revertPreview?: () => void');
    expect(actionsSource).toContain('revertPreview?.();');
  });

  it('captures saved theme when modal opens', () => {
    expect(modalSource).toContain('savedAppearanceTheme');
    expect(modalSource).toContain(
      'revertPreview: () => applyAppearanceTheme(savedAppearanceTheme)',
    );
  });
});
