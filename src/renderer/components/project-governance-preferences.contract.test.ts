import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences-modal.ts'), 'utf8');
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project governance preferences contract', () => {
  it('surfaces governance policies inside the integrations section', () => {
    expect(source).toContain('Governance policies');
    expect(source).toContain('Create starter policy');
    expect(source).toContain('governance.createStarterPolicy');
    expect(source).toContain('governance-discovery-shell');
    expect(source).toContain('Tool policy');
    expect(source).toContain('Write policy');
    expect(source).toContain('Network policy');
    expect(source).toContain('MCP allowlist');
    expect(source).toContain('Provider profiles');
    expect(source).toContain('Preview');
    expect(source).toContain('Open');
  });

  it('styles governance discovery cards with dedicated rows and actions', () => {
    expect(styles).toContain('.governance-discovery-shell');
    expect(styles).toContain('.governance-discovery-actions');
    expect(styles).toContain('.governance-discovery-summary');
    expect(styles).toContain('.governance-discovery-item');
    expect(styles).toContain('.governance-discovery-action-btn');
  });
});
