import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const modalPrimarySource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences/preferences-modal.ts'), 'utf8');
const modalSectionsSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences/preferences-modal-sections.ts'), 'utf8');
const modalSource = [modalPrimarySource, modalSectionsSource].join('\n');
const governanceSource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences/preferences-governance-discovery.ts'),
  'utf8',
);
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project governance preferences contract', () => {
  it('surfaces governance policies inside the safety section', () => {
    expect(modalSource).toContain("import { renderProjectGovernanceSection } from './preferences-governance-discovery.js';");
    expect(modalSource).toContain('renderProjectGovernanceSection({');
    expect(modalSource).toContain('container: policyGroup');
    expect(modalSource).toContain('onRefreshProviders: rerenderSafety');

    expect(governanceSource).toContain('Governance policies');
    expect(governanceSource).toContain('Create starter policy');
    expect(governanceSource).toContain('governance.createStarterPolicy');
    expect(governanceSource).toContain('governance-discovery-shell');
    expect(governanceSource).toContain('Tool policy');
    expect(governanceSource).toContain('Write policy');
    expect(governanceSource).toContain('Network policy');
    expect(governanceSource).toContain('MCP allowlist');
    expect(governanceSource).toContain('Provider profiles');
    expect(governanceSource).toContain('Preview');
    expect(governanceSource).toContain('Open');
  });

  it('styles governance discovery cards with dedicated rows and actions', () => {
    expect(styles).toContain('.governance-discovery-shell');
    expect(styles).toContain('.governance-discovery-actions');
    expect(styles).toContain('.governance-discovery-summary');
    expect(styles).toContain('.governance-discovery-item');
    expect(styles).toContain('.governance-discovery-action-btn');
  });
});
