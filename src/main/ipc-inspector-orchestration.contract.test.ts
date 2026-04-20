import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('inspector orchestration delegation contract', () => {
  const ipcHandlersSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-handlers.ts'), 'utf8');
  const orchestrationSource = readFileSync(path.join(process.cwd(), 'src/main/ipc-inspector-orchestration.ts'), 'utf8');

  it('delegates inspector middleware/orchestrator setup from ipc-handlers', () => {
    expect(ipcHandlersSource).toContain("from './ipc-inspector-orchestration'");
    expect(ipcHandlersSource).toContain('createInspectorOrchestration()');
    expect(orchestrationSource).toContain('setInspectorEventsMiddleware');
    expect(orchestrationSource).toContain('createAutoApprovalOrchestrator');
    expect(orchestrationSource).toContain('mirrorPlaywrightFromPtyData');
  });
});
