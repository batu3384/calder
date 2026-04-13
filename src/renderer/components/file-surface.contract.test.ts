import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const fileViewerSource = readFileSync(new URL('./file-viewer.ts', import.meta.url), 'utf-8');
const fileReaderSource = readFileSync(new URL('./file-reader.ts', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../styles/file-viewer.css', import.meta.url), 'utf-8');

describe('file surface chrome contract', () => {
  it('uses a structured header copy for file viewer and file reader panes', () => {
    expect(fileViewerSource).toContain('file-viewer-header-copy');
    expect(fileViewerSource).toContain('file-viewer-title');
    expect(fileViewerSource).toContain('file-viewer-meta');
    expect(fileReaderSource).toContain('file-viewer-header-copy');
    expect(fileReaderSource).toContain('file-viewer-title');
    expect(fileReaderSource).toContain('file-viewer-meta');
  });

  it('styles the shared file surface header shell', () => {
    expect(css).toContain('.file-viewer-header-copy');
    expect(css).toContain('.file-viewer-title');
    expect(css).toContain('.file-viewer-meta');
    expect(css).toContain('.file-viewer-toolbar');
  });
});
