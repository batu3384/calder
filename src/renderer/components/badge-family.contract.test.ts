import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const fileViewerSource = readFileSync(new URL('./file-viewer.ts', import.meta.url), 'utf-8');
const fileReaderSource = readFileSync(new URL('./file-reader.ts', import.meta.url), 'utf-8');
const gitPanelSource = readFileSync(new URL('./git-panel.ts', import.meta.url), 'utf-8');
const fileViewerCss = readFileSync(new URL('../styles/file-viewer.css', import.meta.url), 'utf-8');
const gitPanelCss = readFileSync(new URL('../styles/git-panel.css', import.meta.url), 'utf-8');

describe('badge family contract', () => {
  it('routes file and git badges through the shared status-pill primitive', () => {
    expect(fileViewerSource).toContain('file-viewer-area-badge calder-status-pill');
    expect(fileReaderSource).toContain('file-reader-badge calder-status-pill');
    expect(gitPanelSource).toContain('git-file-badge calder-status-pill');
  });

  it('styles file and git badges as primitive-backed shells', () => {
    expect(fileViewerCss).toContain('.file-viewer-area-badge.calder-status-pill');
    expect(fileViewerCss).toContain('.file-reader-badge.calder-status-pill');
    expect(gitPanelCss).toContain('.git-file-badge.calder-status-pill');
  });
});
