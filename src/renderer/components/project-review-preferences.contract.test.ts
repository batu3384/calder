import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project review preferences contract', () => {
  it('surfaces saved review findings inside the integrations section', () => {
    expect(source).toContain('Review findings');
    expect(source).toContain('saved PR review notes');
    expect(source).toContain('New findings file');
    expect(source).toContain('review.createFile');
    expect(source).toContain("showModal('New Review Findings'");
    expect(source).toContain('review-discovery-shell');
    expect(source).toContain('Fix in selected session');
    expect(source).toContain('review.readFile');
    expect(source).toContain('sendProjectReviewToSelectedSession');
    expect(source).toContain('Preview');
    expect(source).toContain('Open');
  });

  it('styles review discovery cards with dedicated rows and actions', () => {
    expect(styles).toContain('.review-discovery-shell');
    expect(styles).toContain('.review-discovery-actions');
    expect(styles).toContain('.review-discovery-item');
    expect(styles).toContain('.review-discovery-item-actions');
    expect(styles).toContain('.review-discovery-action-btn');
  });
});
