import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const fileReaderSource = readFileSync(new URL('./file-reader.ts', import.meta.url), 'utf-8');
const fileViewerSource = readFileSync(new URL('./file-viewer.ts', import.meta.url), 'utf-8');
const browserSource = readFileSync(new URL('./browser-tab/pane.ts', import.meta.url), 'utf-8');
const inspectorSource = readFileSync(new URL('./mcp-inspector.ts', import.meta.url), 'utf-8');

function attachBody(source: string, functionName: string): string {
  const start = source.indexOf(`export function ${functionName}`);
  if (start === -1) return '';
  const nextExport = source.indexOf('\nexport function ', start + 1);
  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

describe('pane attach order contract', () => {
  it('re-appends non-terminal panes even when already attached so swarm reorder changes DOM order', () => {
    for (const [source, functionName] of [
      [fileReaderSource, 'attachFileReaderToContainer'],
      [fileViewerSource, 'attachFileViewerToContainer'],
      [browserSource, 'attachBrowserTabToContainer'],
      [inspectorSource, 'attachInspectorToContainer'],
    ] as const) {
      const body = attachBody(source, functionName);
      expect(body).toContain('container.appendChild(instance.element);');
      expect(body).not.toContain('parentElement !== container');
    }
  });
});
