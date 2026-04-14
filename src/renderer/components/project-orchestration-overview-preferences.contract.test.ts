import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project orchestration overview preferences contract', () => {
  it('surfaces a compact phase map inside integrations', () => {
    expect(source).toContain('Calder orchestration map');
    expect(source).toContain('renderOrchestrationOverviewSection(content)');
    expect(source).toContain('buildOrchestrationPhaseStates');
    expect(source).toContain('Phase 0-1');
    expect(source).toContain('Phase 2');
    expect(source).toContain('Phase 3');
    expect(source).toContain('Phase 4');
    expect(source).toContain('Phase 5');
    expect(source).toContain('Phase 6');
    expect(source).toContain('Show phase details');
    expect(source).toContain('Bootstrap phase starters');
    expect(source).toContain('context.createStarterFiles');
    expect(source).toContain('workflow.createStarterFiles');
    expect(source).toContain('teamContext.createStarterFiles');
    expect(source).toContain('governance.createStarterPolicy');
  });

  it('styles the orchestration overview to stay compact and readable', () => {
    expect(styles).toContain('.orchestration-overview-shell');
    expect(styles).toContain('.orchestration-overview-summary');
    expect(styles).toContain('.orchestration-overview-pulse');
    expect(styles).toContain('.orchestration-overview-details');
    expect(styles).toContain('.orchestration-overview-actions');
    expect(styles).toContain('.orchestration-overview-grid');
    expect(styles).toContain('.orchestration-overview-item');
    expect(styles).toContain('.orchestration-overview-item-state');
    expect(styles).toContain('.orchestration-overview-flow');
    expect(styles).toContain('.orchestration-overview-action-btn');
  });
});
