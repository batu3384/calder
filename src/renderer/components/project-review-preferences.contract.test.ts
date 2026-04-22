import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const modalPrimarySource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences/preferences-modal.ts'), 'utf8');
const modalSectionsSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences/preferences-modal-sections.ts'), 'utf8');
const modalSource = [modalPrimarySource, modalSectionsSource].join('\n');
const reviewSource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences/preferences-review-discovery.ts'),
  'utf8',
);
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project review preferences contract', () => {
  it('surfaces saved review findings inside the integrations section', () => {
    expect(modalSource).toContain("import { renderProjectReviewSection } from './preferences-review-discovery.js';");
    expect(modalSource).toContain('renderProjectReviewSection({');
    expect(modalSource).toContain('container: trackingGroup');
    expect(modalSource).toContain('onCloseModalWide: closeWideModal');

    expect(reviewSource).toContain('Review findings');
    expect(reviewSource).toContain('saved PR review notes');
    expect(reviewSource).toContain('New findings file');
    expect(reviewSource).toContain('review.createFile');
    expect(reviewSource).toContain("showModal('New Review Findings'");
    expect(reviewSource).toContain('review-discovery-shell');
    expect(reviewSource).toContain('Fix in selected session');
    expect(reviewSource).toContain('review.readFile');
    expect(reviewSource).toContain('sendProjectReviewToSelectedSession');
    expect(reviewSource).toContain('Preview');
    expect(reviewSource).toContain('Open');
  });

  it('styles review discovery cards with dedicated rows and actions', () => {
    expect(styles).toContain('.review-discovery-shell');
    expect(styles).toContain('.review-discovery-actions');
    expect(styles).toContain('.review-discovery-item');
    expect(styles).toContain('.review-discovery-item-actions');
    expect(styles).toContain('.review-discovery-action-btn');
  });
});
