import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const modalCss = readFileSync(new URL('./modals.css', import.meta.url), 'utf-8');
const sessionHistoryCss = readFileSync(new URL('./session-history.css', import.meta.url), 'utf-8');
const gitCss = readFileSync(new URL('./git-panel.css', import.meta.url), 'utf-8');
const inspectorCss = readFileSync(new URL('./context-inspector.css', import.meta.url), 'utf-8');

describe('utility control language contract', () => {
  it('keeps modal config controls in the same compact glass family', () => {
    expect(modalCss).toContain('.config-section-add-btn');
    expect(modalCss).toContain('width: 24px;');
    expect(modalCss).toContain('.config-item-remove-btn');
    expect(modalCss).toContain('color: var(--danger);');
  });

  it('styles session history utility controls as desktop chips and icon buttons', () => {
    expect(sessionHistoryCss).toContain('.history-clear-btn');
    expect(sessionHistoryCss).toContain('min-height: 30px;');
    expect(sessionHistoryCss).toContain('.history-bookmark-filter.active');
    expect(sessionHistoryCss).toContain('.history-remove-btn');
    expect(sessionHistoryCss).toContain('border-radius: 10px;');
  });

  it('keeps git and inspector utility controls aligned with the same button geometry', () => {
    expect(gitCss).toContain('.git-action-btn');
    expect(gitCss).toContain('width: 22px;');
    expect(inspectorCss).toContain('#context-inspector .git-action-btn');
    expect(inspectorCss).toContain('border-radius: 10px;');
  });
});
