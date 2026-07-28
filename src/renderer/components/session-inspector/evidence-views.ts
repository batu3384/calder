import type { EvidenceEvent, EvidenceSettings } from '../../../shared/types-evidence.js';
import { t } from '../../i18n.js';
import { renderPixelCompactStrip } from '../pixel-agent/pixel-compact.js';
import { applyTabularNums } from '../surface-services/dom-utils.js';
import { inspectorState } from './session-inspector-state-ui.js';
import { emptyMessage, renderInspectorEmpty } from './session-inspector-utils.js';

const EVENT_PAGE_SIZE = 200;

function sourceAttribution(source: EvidenceEvent['source']): string {
  switch (source) {
    case 'provider_hook':
    case 'provider_session_log':
      return t('Provider reported this activity.');
    case 'calder_governance':
      return t('Calder recorded an allow/ask/block governance decision.');
    case 'calder_git':
      return t('Observed during the session window.');
    case 'calder_pty':
      return t('Observed from the Calder terminal session.');
    case 'derived_summary':
      return t('Derived from evidence summary rebuild.');
    default:
      return t('Recorded by Calder runtime.');
  }
}

function confidenceLabel(confidence: EvidenceEvent['confidence']): string {
  switch (confidence) {
    case 'verified':
      return t('Verified');
    case 'provider_reported':
      return t('Provider reported');
    case 'inferred':
      return t('Inferred');
    default:
      return t('Unavailable');
  }
}

function gitConfidenceCopy(confidence: EvidenceEvent['confidence'], category?: string): string {
  if (confidence === 'verified') return t('Verified');
  if (category === 'renamed') {
    return t('Possible rename observed during the session window.');
  }
  return t('Observed during the session window.');
}

function createCoverageBadge(coverage: string): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `inspector-badge inspector-badge-${coverage}`;
  badge.textContent = t(`Coverage: ${coverage}`);
  return badge;
}

function renderEventRow(event: EvidenceEvent): HTMLElement {
  const row = document.createElement('div');
  row.className = 'inspector-evidence-row';

  const header = document.createElement('div');
  header.className = 'inspector-evidence-row-header';

  const type = document.createElement('span');
  type.className = 'inspector-evidence-type';
  type.textContent = event.type;
  header.appendChild(type);

  const seq = document.createElement('span');
  seq.className = 'inspector-evidence-seq';
  applyTabularNums(seq);
  seq.textContent = `#${event.seq}`;
  header.appendChild(seq);

  row.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'inspector-evidence-meta';
  meta.textContent = `${confidenceLabel(event.confidence)} · ${sourceAttribution(event.source)}`;
  row.appendChild(meta);

  if (event.toolName) {
    const tool = document.createElement('div');
    tool.className = 'inspector-evidence-detail';
    tool.textContent = t(`Tool: ${event.toolName}`);
    row.appendChild(tool);
  }

  if (event.policyDecision) {
    const policy = document.createElement('div');
    policy.className = 'inspector-evidence-detail';
    policy.textContent = t(
      `Policy ${event.policyDecision.decision} (${event.policyDecision.operationClass})`,
    );
    row.appendChild(policy);
  }

  if (event.sanitizedPaths?.length) {
    const paths = document.createElement('div');
    paths.className = 'inspector-evidence-detail';
    paths.textContent = event.sanitizedPaths.join(', ');
    row.appendChild(paths);
  }

  return row;
}

export function renderEvidence(container: HTMLElement): void {
  const sessionId = inspectorState.inspectedSessionId;
  if (!sessionId) return;

  const loading = document.createElement('div');
  loading.className = 'inspector-empty';
  loading.textContent = t('Loading evidence…');
  container.replaceChildren(loading);

  void (async () => {
    try {
      const [summaryResult, eventsResult, settings] = await Promise.all([
        window.calder.evidence.getSummary(sessionId),
        window.calder.evidence.listEvents(sessionId, 0, EVENT_PAGE_SIZE),
        window.calder.evidence.getSettings(),
      ]);

      container.replaceChildren();

      const header = document.createElement('div');
      header.className = 'inspector-evidence-header';

      const title = document.createElement('div');
      title.className = 'inspector-evidence-title';
      title.textContent = t('Session Evidence');
      header.appendChild(title);

      const pixelToggle = createPixelModeToggle(settings, sessionId, container);
      header.appendChild(pixelToggle);
      container.appendChild(header);

      if (!summaryResult) {
        renderInspectorEmpty(container, emptyMessage(t('No evidence run for this session')));
        return;
      }

      if (summaryResult.summaryStale) {
        const banner = document.createElement('div');
        banner.className = 'inspector-evidence-stale-banner';
        banner.textContent = t(
          'Summary may be stale — new events arrived after last rebuild.',
        );

        const rebuildBtn = document.createElement('button');
        rebuildBtn.className = 'inspector-evidence-rebuild-btn';
        rebuildBtn.textContent = t('Rebuild summary');
        rebuildBtn.addEventListener('click', () => {
          void window.calder.evidence.rebuildSummary(summaryResult.runId).then(() => {
            renderEvidence(container);
          });
        });
        banner.appendChild(rebuildBtn);
        container.appendChild(banner);
      }

      const summaryBar = document.createElement('div');
      summaryBar.className = 'inspector-summary';
      if (summaryResult.summary) {
        const s = summaryResult.summary;
        summaryBar.appendChild(createCoverageBadge(s.coverage));
        const counters = document.createElement('div');
        counters.className = 'inspector-evidence-counters';
        applyTabularNums(counters);
        counters.textContent = t(
          `Events ${s.eventCounts.total} · Tools ${s.eventCounts.toolStarted} · Policy ${s.eventCounts.policyDecisions}`,
        );
        summaryBar.appendChild(counters);
      }
      container.appendChild(summaryBar);

      if (settings.pixelMode === 'compact') {
        renderPixelCompactStrip(container, eventsResult.events);
      }

      if (eventsResult.events.length === 0) {
        renderInspectorEmpty(container, t('No evidence events yet'));
        return;
      }

      const list = document.createElement('div');
      list.className = 'inspector-evidence-list';
      for (const event of eventsResult.events) {
        list.appendChild(renderEventRow(event));
      }
      container.appendChild(list);

      if (eventsResult.total > eventsResult.events.length) {
        const more = document.createElement('div');
        more.className = 'inspector-evidence-more';
        applyTabularNums(more);
        more.textContent = t(
          `Showing ${eventsResult.events.length} of ${eventsResult.total} events`,
        );
        container.appendChild(more);
      }

      window.calder.evidence.subscribe(summaryResult.runId);
    } catch {
      renderInspectorEmpty(container, t('Evidence unavailable'));
    }
  })();
}

function createPixelModeToggle(
  settings: EvidenceSettings,
  sessionId: string,
  container: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'inspector-evidence-pixel-toggle';

  const label = document.createElement('span');
  label.textContent = t('Pixel:');
  wrap.appendChild(label);

  for (const mode of ['off', 'compact'] as const) {
    const btn = document.createElement('button');
    btn.className = 'inspector-evidence-pixel-btn' + (settings.pixelMode === mode ? ' active' : '');
    btn.textContent = mode === 'off' ? t('Off') : t('Compact');
    btn.addEventListener('click', () => {
      void window.calder.evidence.setSettings({ ...settings, pixelMode: mode }).then(() => {
        renderEvidence(container);
      });
    });
    wrap.appendChild(btn);
  }

  return wrap;
}

export function renderChanges(container: HTMLElement): void {
  const sessionId = inspectorState.inspectedSessionId;
  if (!sessionId) return;

  container.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'inspector-empty';
  loading.textContent = t('Loading changes…');
  container.appendChild(loading);

  void (async () => {
    try {
      const eventsResult = await window.calder.evidence.listEvents(sessionId, 0, EVENT_PAGE_SIZE);
      container.replaceChildren();

      const gitEvents = eventsResult.events.filter(
        (event: EvidenceEvent) =>
          event.type === 'git_change_observed' || event.type === 'file_change_reported',
      );

      if (gitEvents.length === 0) {
        renderInspectorEmpty(container, emptyMessage(t('No file or git changes observed')));
        return;
      }

      const list = document.createElement('div');
      list.className = 'inspector-evidence-list';
      for (const event of gitEvents) {
        const row = document.createElement('div');
        row.className = 'inspector-evidence-row';

        const title = document.createElement('div');
        title.className = 'inspector-evidence-type';
        title.textContent =
          event.type === 'git_change_observed' ? t('Git change') : t('File change');
        row.appendChild(title);

        const category =
          typeof event.sanitizedMeta?.category === 'string'
            ? event.sanitizedMeta.category
            : undefined;
        const confidence = document.createElement('div');
        confidence.className = 'inspector-evidence-meta';
        confidence.textContent = gitConfidenceCopy(event.confidence, category);
        row.appendChild(confidence);

        if (event.sanitizedPaths?.length) {
          const paths = document.createElement('div');
          paths.className = 'inspector-evidence-detail';
          paths.textContent = event.sanitizedPaths.join(', ');
          row.appendChild(paths);
        }

        list.appendChild(row);
      }
      container.appendChild(list);
    } catch {
      renderInspectorEmpty(container, t('Changes unavailable'));
    }
  })();
}

export function renderReview(container: HTMLElement): void {
  const sessionId = inspectorState.inspectedSessionId;
  if (!sessionId) return;

  container.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'inspector-empty';
  loading.textContent = t('Loading review…');
  container.appendChild(loading);

  void (async () => {
    try {
      const meta = await window.calder.evidence.getMeta(sessionId);
      if (!meta) {
        container.replaceChildren();
        renderInspectorEmpty(container, emptyMessage(t('No evidence run for review')));
        return;
      }

      const [summaryResult, storageBytes] = await Promise.all([
        window.calder.evidence.getSummary(sessionId),
        window.calder.evidence.getStorageUsage(),
      ]);

      container.replaceChildren();

      const statusRow = document.createElement('div');
      statusRow.className = 'inspector-evidence-review-row';
      const statusLabel = document.createElement('label');
      statusLabel.textContent = t('Review status');
      statusRow.appendChild(statusLabel);

      const statusSelect = document.createElement('select');
      statusSelect.className = 'inspector-evidence-review-select';
      for (const status of ['pending', 'approved', 'rejected', 'needs_changes'] as const) {
        const opt = document.createElement('option');
        opt.value = status;
        opt.textContent = t(status.replace(/_/g, ' '));
        statusSelect.appendChild(opt);
      }
      statusRow.appendChild(statusSelect);
      container.appendChild(statusRow);

      const notesLabel = document.createElement('label');
      notesLabel.textContent = t('Notes');
      notesLabel.className = 'inspector-evidence-review-label';
      container.appendChild(notesLabel);

      const notesArea = document.createElement('textarea');
      notesArea.className = 'inspector-evidence-review-notes';
      notesArea.rows = 4;
      container.appendChild(notesArea);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'inspector-evidence-save-btn';
      saveBtn.textContent = t('Save review');
      saveBtn.addEventListener('click', () => {
        void window.calder.evidence.updateReview(
          meta.runId,
          statusSelect.value as 'pending' | 'approved' | 'rejected' | 'needs_changes',
          notesArea.value || undefined,
        );
      });
      container.appendChild(saveBtn);

      const exportRow = document.createElement('div');
      exportRow.className = 'inspector-evidence-export-row';
      const exportJson = document.createElement('button');
      exportJson.textContent = t('Export JSON');
      exportJson.addEventListener('click', () => {
        void window.calder.evidence.export(meta.runId, 'json');
      });
      const exportMd = document.createElement('button');
      exportMd.textContent = t('Export Markdown');
      exportMd.addEventListener('click', () => {
        void window.calder.evidence.export(meta.runId, 'markdown');
      });
      exportRow.append(exportJson, exportMd);
      container.appendChild(exportRow);

      const storage = document.createElement('div');
      storage.className = 'inspector-evidence-storage';
      applyTabularNums(storage);
      storage.textContent = t(`Evidence storage: ${(storageBytes / 1024).toFixed(1)} KB`);
      container.appendChild(storage);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'inspector-evidence-delete-btn';
      deleteBtn.textContent = t('Delete this run');
      deleteBtn.addEventListener('click', () => {
        void window.calder.evidence.deleteRun(meta.runId).then(() => {
          renderReview(container);
        });
      });
      container.appendChild(deleteBtn);

      if (summaryResult?.summary) {
        const completion = document.createElement('div');
        completion.className = 'inspector-evidence-detail';
        completion.textContent = t(`Completion: ${summaryResult.summary.completionState}`);
        container.appendChild(completion);
      }
    } catch {
      renderInspectorEmpty(container, t('Review unavailable'));
    }
  })();
}
