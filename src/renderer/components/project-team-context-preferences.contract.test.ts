import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const modalPrimarySource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences/preferences-modal.ts'), 'utf8');
const modalSectionsSource = readFileSync(path.join(process.cwd(), 'src/renderer/components/preferences/preferences-modal-sections.ts'), 'utf8');
const modalSource = [modalPrimarySource, modalSectionsSource].join('\n');
const teamContextSource = readFileSync(
  path.join(process.cwd(), 'src/renderer/components/preferences/preferences-team-context-discovery.ts'),
  'utf8',
);
const styles = readFileSync(path.join(process.cwd(), 'src/renderer/styles/preferences.css'), 'utf8');

describe('project team context preferences contract', () => {
  it('surfaces shared team context inside the safety section', () => {
    expect(modalSource).toContain("import { renderProjectTeamContextSection } from './preferences-team-context-discovery.js';");
    expect(modalSource).toContain('renderProjectTeamContextSection({');
    expect(modalSource).toContain('container: memoryGroup');
    expect(modalSource).toContain('onRefreshProviders: rerenderSafety');
    expect(modalSource).toContain('onCloseModalWide: closeWideModal');

    expect(teamContextSource).toContain('Team context');
    expect(teamContextSource).toContain('Create starter spaces');
    expect(teamContextSource).toContain('New shared space');
    expect(teamContextSource).toContain('teamContext.createStarterFiles');
    expect(teamContextSource).toContain('teamContext.createSpace');
    expect(teamContextSource).toContain('team-context-discovery-shell');
    expect(teamContextSource).toContain('Shared rules');
    expect(teamContextSource).toContain('Workflows');
  });

  it('styles team context discovery cards with dedicated rows and actions', () => {
    expect(styles).toContain('.team-context-discovery-shell');
    expect(styles).toContain('.team-context-discovery-actions');
    expect(styles).toContain('.team-context-discovery-summary');
    expect(styles).toContain('.team-context-discovery-item');
    expect(styles).toContain('.team-context-discovery-action-btn');
  });
});
