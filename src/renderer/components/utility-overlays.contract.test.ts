import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const quickOpenSource = readFileSync(new URL('./quick-open.ts', import.meta.url), 'utf-8');
const searchSource = readFileSync(new URL('./search-bar.ts', import.meta.url), 'utf-8');
const fileReaderSource = readFileSync(new URL('./file-reader.ts', import.meta.url), 'utf-8');
const searchCss = readFileSync(new URL('../styles/search.css', import.meta.url), 'utf-8');
const fileViewerCss = readFileSync(new URL('../styles/file-viewer.css', import.meta.url), 'utf-8');

describe('utility overlays contract', () => {
  it('gives quick open a structured hero shell', () => {
    expect(quickOpenSource).toContain('quick-open-hero');
    expect(quickOpenSource).toContain('quick-open-title');
    expect(quickOpenSource).toContain('quick-open-copy');
    expect(fileViewerCss).toContain('.quick-open-hero');
    expect(fileViewerCss).toContain('.quick-open-title');
    expect(fileViewerCss).toContain('.quick-open-copy');
  });

  it('gives search and go-to-line bars a labeled utility shell', () => {
    expect(searchSource).toContain('search-bar-label');
    expect(fileReaderSource).toContain('goto-line-label');
    expect(searchCss).toContain('.search-bar-label');
    expect(searchCss).toContain('.goto-line-label');
    expect(searchCss).toContain('.search-result-count');
  });
});
