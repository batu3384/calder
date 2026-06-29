import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const modalPrimarySource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences/preferences-modal.ts'),
  'utf8',
);
const modalSectionsSource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences/preferences-modal-sections.ts'),
  'utf8',
);
const modalSource = [modalPrimarySource, modalSectionsSource].join('\n');
const workflowSource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences/preferences-workflow-discovery.ts'),
  'utf8',
);
const styles = readFileSync(
  path.join(process.cwd(), 'src/renderer/styles/preferences.css'),
  'utf8',
);

describe('project workflow preferences contract', () => {
  it('surfaces reusable project workflows inside the automation section', () => {
    expect(modalSource).toContain(
      "import { renderProjectWorkflowSection } from './preferences-workflow-discovery.js';",
    );
    expect(modalSource).toContain('renderProjectWorkflowSection({');
    expect(modalSource).toContain('container: orchestrationGroup');
    expect(modalSource).toContain('onRefreshProviders: rerenderAutomation');
    expect(modalSource).toContain('onCloseModalWide: closeWideModal');

    expect(workflowSource).toContain('Workflow templates');
    expect(workflowSource).toContain('reusable workflows');
    expect(workflowSource).toContain('Create starter workflows');
    expect(workflowSource).toContain('New workflow');
    expect(workflowSource).toContain('workflow.createStarterFiles');
    expect(workflowSource).toContain('workflow.createFile');
    expect(workflowSource).toContain("'New Workflow'");
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
