import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const mainSource = readFileSync(
  new URL('./main.ts', import.meta.url),
  'utf8',
);

const ipcHandlersSource = readFileSync(
  new URL('./ipc-handlers.ts', import.meta.url),
  'utf8',
);

describe('Calder browser routing contracts', () => {
  it('marks top-level Calder window browser opens as embedded-preferred', () => {
    expect(mainSource).toContain("openUrlWithBrowserPolicy({ url, preferEmbedded: true }, mainWindow");
  });

  it('marks renderer-driven openExternal calls as embedded-preferred', () => {
    expect(ipcHandlersSource).toContain("openUrlWithBrowserPolicy({ url, cwd, preferEmbedded: true }, win");
  });
});
