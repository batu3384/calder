import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('playwright mirror delegation contract', () => {
  const ipcHandlersSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
  const inspectorSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-inspector-orchestration.ts'), 'utf8');
  const mirrorSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-playwright-mirror.ts'), 'utf8');

  it('uses dedicated mirror module from ipc-handlers', () => {
    expect(ipcHandlersSource).toContain("from './ipc-inspector-orchestration'");
    expect(inspectorSource).toContain("from './ipc-playwright-mirror'");
    expect(mirrorSource).toContain('export function appendAutoApprovalAudit');
    expect(mirrorSource).toContain('export function shouldMirrorPlaywrightNavigate');
    expect(mirrorSource).toContain('export function extractPlaywrightNavigateUrlsFromTerminalChunk');
  });
});
