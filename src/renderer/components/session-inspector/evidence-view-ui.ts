import type {
  EvidenceEvent,
  EvidenceHealth,
  EvidenceHealthGap,
  EvidenceSummary,
} from '../../../shared/types-evidence.js';
import { t } from '../../i18n.js';
import { applyTabularNums } from '../surface-services/dom-utils.js';
import { type EvidenceFilterCategory, formatEvidenceTimestamp } from './evidence-view-support.js';

export function renderCoverageBadge(coverage: string): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `inspector-badge inspector-badge-${coverage}`;
  badge.textContent = t(`Coverage: ${coverage}`);
  return badge;
}

export function renderEvidenceReviewSummary(
  summary: EvidenceSummary | null,
  health: EvidenceHealth | null,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'inspector-evidence-review-summary';

  const title = document.createElement('div');
  title.className = 'inspector-evidence-title';
  title.textContent = t('Session Review');
  panel.appendChild(title);

  if (!summary) {
    const missing = document.createElement('div');
    missing.className = 'inspector-evidence-meta';
    missing.textContent = t('Summary not available yet.');
    panel.appendChild(missing);
    return panel;
  }

  const summaryBar = document.createElement('div');
  summaryBar.className = 'inspector-summary';
  summaryBar.appendChild(renderCoverageBadge(summary.coverage));
  const counters = document.createElement('div');
  counters.className = 'inspector-evidence-counters';
  applyTabularNums(counters);
  counters.textContent = t(
    `Events ${summary.eventCounts.total} · Tools ${summary.eventCounts.toolStarted} · Policy ${summary.eventCounts.policyDecisions}`,
  );
  summaryBar.appendChild(counters);
  panel.appendChild(summaryBar);

  const stats = document.createElement('div');
  stats.className = 'inspector-evidence-review-stats';
  const statRows: Array<[string, string]> = [
    [t('Completion'), summary.completionState],
    [t('Git observations'), String(summary.gitObservationCount)],
    [t('Late events'), String(summary.lateEventCount)],
    [t('Cost snapshots'), String(summary.eventCounts.costSnapshots)],
  ];
  for (const [key, value] of statRows) {
    const stat = document.createElement('div');
    stat.className = 'inspector-evidence-review-stat';
    const keyEl = document.createElement('span');
    keyEl.className = 'inspector-evidence-review-stat-key';
    keyEl.textContent = key;
    const valueEl = document.createElement('span');
    applyTabularNums(valueEl);
    valueEl.textContent = value;
    stat.append(keyEl, valueEl);
    stats.appendChild(stat);
  }
  panel.appendChild(stats);

  if (health) {
    panel.appendChild(renderReviewHealthIndicators(health));
  }

  if (summary.summaryStale) {
    const stale = document.createElement('div');
    stale.className = 'inspector-evidence-stale-banner';
    stale.textContent = t('Summary may be stale — rebuild from the Evidence tab.');
    panel.appendChild(stale);
  }

  if (summary.gitTruncated) {
    const truncated = document.createElement('div');
    truncated.className = 'inspector-evidence-gaps-banner';
    truncated.textContent = t('Git observations were truncated for this run.');
    panel.appendChild(truncated);
  }

  return panel;
}

export function renderReviewHealthIndicators(health: EvidenceHealth): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'inspector-evidence-review-indicators';

  const items: Array<[string, boolean]> = [
    [t('Git baseline'), health.hasGitBaseline],
    [t('Git final'), health.hasGitFinal],
    [t('Provider session end'), health.hasProviderSessionEnd],
    [t('PTY exit'), health.hasPtyExit],
  ];
  for (const [label, ok] of items) {
    const chip = document.createElement('span');
    chip.className = 'inspector-evidence-review-indicator' + (ok ? ' is-ok' : ' is-missing');
    chip.textContent = ok ? `${label} ✓` : label;
    wrap.appendChild(chip);
  }

  return wrap;
}

export function governanceRecordLabel(): string {
  return t('Governance record — Calder recorded the decision, it does not re-enforce here.');
}

export function renderEvidenceHealthPanel(health: EvidenceHealth): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'inspector-evidence-health-panel';

  const heading = document.createElement('div');
  heading.className = 'inspector-evidence-health-heading';
  heading.textContent = t(`Tracking health · ${health.coverage}`);
  panel.appendChild(heading);

  const meta = document.createElement('div');
  meta.className = 'inspector-evidence-health-meta';
  applyTabularNums(meta);
  meta.textContent = t(
    `Provider ${health.providerId} · ${health.eventCount} events · late ${health.lateEventCount}`,
  );
  panel.appendChild(meta);

  if (health.gaps.length === 0) {
    const ok = document.createElement('div');
    ok.className = 'inspector-evidence-gap inspector-evidence-gap-info';
    ok.textContent = t('No coverage gaps reported for this run.');
    panel.appendChild(ok);
    return panel;
  }

  for (const gap of health.gaps) {
    panel.appendChild(renderHealthGapRow(gap));
  }

  return panel;
}

function renderHealthGapRow(gap: EvidenceHealthGap): HTMLElement {
  const row = document.createElement('div');
  row.className = `inspector-evidence-gap inspector-evidence-gap-${gap.severity}`;
  row.textContent = gap.message;
  return row;
}

export function createChangesSearchBar(
  onChange: (query: string) => void,
  initialQuery = '',
): { root: HTMLElement; getQuery: () => string } {
  const root = document.createElement('div');
  root.className = 'inspector-evidence-filter-bar';

  const queryInput = document.createElement('input');
  queryInput.type = 'search';
  queryInput.className = 'inspector-evidence-filter-input';
  queryInput.placeholder = t('Search changes…');
  queryInput.setAttribute('aria-label', t('Search changes'));
  queryInput.value = initialQuery;
  queryInput.addEventListener('input', () => onChange(queryInput.value));

  root.appendChild(queryInput);
  return {
    root,
    getQuery: () => queryInput.value,
  };
}

export function createEvidenceFilterBar(
  onChange: (category: EvidenceFilterCategory, query: string) => void,
  initial?: { category: EvidenceFilterCategory; query: string },
): {
  root: HTMLElement;
  getCategory: () => EvidenceFilterCategory;
  getQuery: () => string;
} {
  const root = document.createElement('div');
  root.className = 'inspector-evidence-filter-bar';

  const categorySelect = document.createElement('select');
  categorySelect.className = 'inspector-evidence-filter-select';
  categorySelect.setAttribute('aria-label', t('Filter evidence events'));
  for (const [value, label] of [
    ['all', t('All events')],
    ['tools', t('Tools')],
    ['policy', t('Policy')],
    ['git', t('Git')],
    ['lifecycle', t('Lifecycle')],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    categorySelect.appendChild(option);
  }
  if (initial?.category) {
    categorySelect.value = initial.category;
  }

  const queryInput = document.createElement('input');
  queryInput.type = 'search';
  queryInput.className = 'inspector-evidence-filter-input';
  queryInput.placeholder = t('Search evidence…');
  queryInput.setAttribute('aria-label', t('Search evidence'));
  if (initial?.query) {
    queryInput.value = initial.query;
  }

  const notify = (): void => {
    onChange(categorySelect.value as EvidenceFilterCategory, queryInput.value);
  };
  categorySelect.addEventListener('change', notify);
  queryInput.addEventListener('input', notify);

  root.append(categorySelect, queryInput);
  return {
    root,
    getCategory: () => categorySelect.value as EvidenceFilterCategory,
    getQuery: () => queryInput.value,
  };
}

export function renderEvidenceEventDetail(event: EvidenceEvent): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'inspector-evidence-detail-panel';

  const title = document.createElement('div');
  title.className = 'inspector-evidence-detail-title';
  title.textContent = t(`Event detail: ${event.type}`);
  panel.appendChild(title);

  const rows: Array<[string, string]> = [
    [t('Sequence'), `#${event.seq}`],
    [t('Source'), event.source],
    [t('Confidence'), event.confidence],
    [t('Timestamp'), formatEvidenceTimestamp(event.timestamp)],
  ];
  if (event.toolName) rows.push([t('Tool'), event.toolName]);
  if (event.outcome) rows.push([t('Outcome'), event.outcome]);
  if (event.providerEventName) rows.push([t('Provider event'), event.providerEventName]);

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'inspector-evidence-detail-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'inspector-evidence-detail-key';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'inspector-evidence-detail-value';
    applyTabularNums(valueEl);
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    panel.appendChild(row);
  }

  if (event.policyDecision) {
    const policy = document.createElement('pre');
    policy.className = 'inspector-evidence-detail-json';
    policy.textContent = JSON.stringify(event.policyDecision, null, 2);
    panel.appendChild(policy);
  }

  if (event.sanitizedMeta && Object.keys(event.sanitizedMeta).length > 0) {
    const meta = document.createElement('pre');
    meta.className = 'inspector-evidence-detail-json';
    meta.textContent = JSON.stringify(event.sanitizedMeta, null, 2);
    panel.appendChild(meta);
  }

  if (event.sanitizedPaths?.length) {
    const paths = document.createElement('div');
    paths.className = 'inspector-evidence-detail-row';
    paths.textContent = event.sanitizedPaths.join('\n');
    panel.appendChild(paths);
  }

  return panel;
}

export function renderGitChangeRow(event: EvidenceEvent): HTMLElement {
  const row = document.createElement('div');
  row.className = 'inspector-evidence-row';

  const title = document.createElement('div');
  title.className = 'inspector-evidence-type';
  title.textContent = event.type === 'git_change_observed' ? t('Git change') : t('File change');
  row.appendChild(title);

  const category =
    typeof event.sanitizedMeta?.category === 'string' ? event.sanitizedMeta.category : undefined;
  const confidence = document.createElement('div');
  confidence.className = 'inspector-evidence-meta';
  if (event.confidence === 'verified') {
    confidence.textContent = t('Verified');
  } else if (category === 'renamed') {
    confidence.textContent = t('Possible rename observed during the session window.');
  } else {
    confidence.textContent = t('Observed during the session window.');
  }
  row.appendChild(confidence);

  if (event.sanitizedPaths?.length) {
    const paths = document.createElement('div');
    paths.className = 'inspector-evidence-detail';
    paths.textContent = event.sanitizedPaths.join(', ');
    row.appendChild(paths);
  }

  const seq = document.createElement('div');
  seq.className = 'inspector-evidence-seq';
  applyTabularNums(seq);
  seq.textContent = `#${event.seq}`;
  row.appendChild(seq);

  return row;
}
