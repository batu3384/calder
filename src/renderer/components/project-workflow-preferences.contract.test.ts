import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project workflow preferences contract', () => {
  it('surfaces reusable project workflows inside the integrations section', () => {
    expect(source).toContain('Workflow templates');
    expect(source).toContain('reusable workflows');
    expect(source).toContain('Create starter workflows');
    expect(source).toContain('New workflow');
    expect(source).toContain('workflow.createStarterFiles');
    expect(source).toContain('workflow.createFile');
    expect(source).toContain("showModal('New Workflow'");
    expect(source).toContain('workflow-discovery-shell');
    expect(source).toContain('Run');
    expect(source).toContain('workflow.readFile');
    expect(source).toContain('Preview');
    expect(source).toContain('Open');
  });

  it('styles workflow discovery cards with dedicated rows and actions', () => {
    expect(styles).toContain('.workflow-discovery-shell');
    expect(styles).toContain('.workflow-discovery-actions');
    expect(styles).toContain('.workflow-discovery-item');
    expect(styles).toContain('.workflow-discovery-item-actions');
    expect(styles).toContain('.workflow-discovery-action-btn');
  });
});
