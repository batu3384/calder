import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const modalSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const workflowSource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences-workflow-discovery.ts'),
  'utf8',
);
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project workflow preferences contract', () => {
  it('surfaces reusable project workflows inside the integrations section', () => {
    expect(modalSource).toContain("import { renderProjectWorkflowSection } from './preferences-workflow-discovery.js';");
    expect(modalSource).toContain('renderProjectWorkflowSection({');
    expect(modalSource).toContain('container: orchestrationGroup');
    expect(modalSource).toContain('onRefreshProviders: () => renderSection(\'providers\')');
    expect(modalSource).toContain('onCloseModalWide: () => {');

    expect(workflowSource).toContain('Workflow templates');
    expect(workflowSource).toContain('reusable workflows');
    expect(workflowSource).toContain('Create starter workflows');
    expect(workflowSource).toContain('New workflow');
    expect(workflowSource).toContain('workflow.createStarterFiles');
    expect(workflowSource).toContain('workflow.createFile');
    expect(workflowSource).toContain("showModal('New Workflow'");
    expect(workflowSource).toContain('workflow-discovery-shell');
    expect(workflowSource).toContain('Run');
    expect(workflowSource).toContain('workflow.readFile');
    expect(workflowSource).toContain('Preview');
    expect(workflowSource).toContain('Open');
  });

  it('styles workflow discovery cards with dedicated rows and actions', () => {
    expect(styles).toContain('.workflow-discovery-shell');
    expect(styles).toContain('.workflow-discovery-actions');
    expect(styles).toContain('.workflow-discovery-item');
    expect(styles).toContain('.workflow-discovery-item-actions');
    expect(styles).toContain('.workflow-discovery-action-btn');
  });
});
