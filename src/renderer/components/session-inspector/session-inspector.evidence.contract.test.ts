import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const evidenceViewsSource = readFileSync(
  new URL('./evidence-views.ts', import.meta.url),
  'utf-8',
);
const evidenceSupportSource = readFileSync(
  new URL('./evidence-view-support.ts', import.meta.url),
  'utf-8',
);
const inspectorSource = readFileSync(new URL('./session-inspector.ts', import.meta.url), 'utf-8');

describe('session inspector evidence contract', () => {
  it('disposes evidence subscriptions before tab rerenders', () => {
    expect(inspectorSource).toContain('disposeEvidenceView');
    expect(inspectorSource).toContain("from './evidence-views.js'");
  });

  it('wires live evidence updates and health panel', () => {
    expect(evidenceViewsSource).toContain('window.calder.evidence.onEvent');
    expect(evidenceViewsSource).toContain('renderEvidenceHealthPanel');
    expect(evidenceViewsSource).toContain('readStoredEvidenceFilter');
    expect(evidenceViewsSource).toContain('sliceEventsForDom');
  });

  it('wires changes tab search, pagination, and health', () => {
    expect(evidenceViewsSource).toContain('renderChanges');
    expect(evidenceViewsSource).toContain('createChangesSearchBar');
    expect(evidenceViewsSource).toContain('matchesGitChangeQuery');
    expect(evidenceViewsSource).toContain('Load more changes');
  });

  it('wires review summary panel and native delete confirmation', () => {
    expect(evidenceViewsSource).toContain('renderEvidenceReviewSummary');
    expect(evidenceViewsSource).toContain('deleteRun');
    expect(evidenceSupportSource).toContain('renderReviewHealthIndicators');
    expect(evidenceSupportSource).toContain('beginEvidenceViewGeneration');
    expect(evidenceSupportSource).toContain('mergeEvidenceEvents');
  });

  it('wires bidirectional studio and evidence shortcuts', () => {
    const studioViewsSource = readFileSync(
      new URL('./studio-views.ts', import.meta.url),
      'utf-8',
    );
    const tabsSource = readFileSync(
      new URL('./session-inspector-tabs.ts', import.meta.url),
      'utf-8',
    );
    expect(evidenceViewsSource).toContain('Open Pixel Studio');
    expect(evidenceViewsSource).toContain("setInspectorTab('studio')");
    expect(studioViewsSource).toContain('Open evidence timeline');
    expect(inspectorSource).toContain("id: 'studio'");
    expect(inspectorSource).toContain('renderStudio');
    expect(studioViewsSource).toContain("settings.pixelMode !== 'studio'");
    expect(studioViewsSource).toContain('isInspectedSessionForeground');
    expect(tabsSource).toContain('setInspectorTab');
  });

  it('records governance without re-enforcement copy', () => {
    expect(evidenceSupportSource).toContain('governanceRecordLabel');
    expect(evidenceSupportSource).toContain('does not re-enforce here');
  });
});
