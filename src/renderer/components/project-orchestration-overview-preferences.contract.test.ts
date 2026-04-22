import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const modalPrimarySource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const modalSectionsSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal-sections.ts'), 'utf8');
const modalSource = [modalPrimarySource, modalSectionsSource].join('\n');
const orchestrationSource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences-orchestration-overview.ts'),
  'utf8',
);
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project orchestration overview preferences contract', () => {
  it('surfaces a compact phase map inside integrations', () => {
    expect(modalSource).toContain("import { renderOrchestrationOverviewSection } from './preferences-orchestration-overview.js';");
    expect(modalSource).toContain('renderOrchestrationOverviewSection({');
    expect(modalSource).toContain('container: orchestrationGroup');
    expect(modalSource).toContain('context.createStarterFiles');
    expect(modalSource).toContain('workflow.createStarterFiles');
    expect(modalSource).toContain('teamContext.createStarterFiles');
    expect(modalSource).toContain('governance.createStarterPolicy');

    expect(orchestrationSource).toContain('Calder orchestration map');
    expect(orchestrationSource).toContain('buildOrchestrationPhaseStates');
    expect(orchestrationSource).toContain('Phase 0-1');
    expect(orchestrationSource).toContain('Phase 2');
    expect(orchestrationSource).toContain('Phase 3');
    expect(orchestrationSource).toContain('Phase 4');
    expect(orchestrationSource).toContain('Phase 5');
    expect(orchestrationSource).toContain('Phase 6');
    expect(orchestrationSource).toContain('Show phase details');
    expect(orchestrationSource).toContain('Bootstrap phase starters');
  });

  it('styles the orchestration overview to stay compact and readable', () => {
    expect(styles).toContain('.orchestration-overview-shell');
    expect(styles).toContain('.orchestration-overview-summary');
    expect(styles).toContain('.orchestration-overview-health');
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
