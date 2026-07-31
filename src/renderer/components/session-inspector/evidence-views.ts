import type { EvidenceEvent, EvidenceHealthGap, EvidenceSettings } from '../../../shared/types-evidence.js';
import { t } from '../../i18n.js';
import {
  renderPixelCompactStrip,
  updatePixelCompactStrip,
} from '../pixel-agent/pixel-compact.js';
import { applyTabularNums } from '../surface-services/dom-utils.js';
import {
  beginEvidenceViewGeneration,
  createChangesSearchBar,
  createEvidenceFilterBar,
  disposeEvidenceSubscriptions,
  type EvidenceFilterCategory,
  formatEvidenceTimestamp,
  governanceRecordLabel,
  isEvidenceViewGenerationCurrent,
  isGitChangeEvent,
  matchesEvidenceFilter,
  matchesGitChangeQuery,
  mergeEvidenceEvents,
  readStoredChangesQuery,
  readStoredEvidenceFilter,
  registerEvidenceSubscription,
  renderCoverageBadge,
  renderEvidenceEventDetail,
  renderEvidenceHealthPanel,
  renderEvidenceReviewSummary,
  renderGitChangeRow,
  sliceEventsForDom,
  writeStoredChangesQuery,
  writeStoredEvidenceFilter,
} from './evidence-view-support.js';
import { inspectorState } from './session-inspector-state-ui.js';
import { setInspectorTab } from './session-inspector-tabs.js';
import { emptyMessage, renderInspectorEmpty } from './session-inspector-utils.js';

const EVENT_PAGE_SIZE = 100;

export function disposeEvidenceView(): void {
  disposeEvidenceSubscriptions();
}

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

function createGapsBanner(gaps: EvidenceHealthGap[]): HTMLElement | null {
  if (gaps.length === 0) return null;
  const banner = document.createElement('div');
  banner.className = 'inspector-evidence-gaps-banner';
  banner.textContent = t(`Coverage gaps: ${gaps.map((gap) => gap.code).join(', ')}`);
  return banner;
}

function renderEventRow(
  event: EvidenceEvent,
  onSelect: (event: EvidenceEvent) => void,
  selectedEventId: string | null,
): HTMLElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className =
    'inspector-evidence-row inspector-evidence-row-button' +
    (selectedEventId === event.eventId ? ' is-selected' : '');
  row.addEventListener('click', () => onSelect(event));

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
  meta.textContent = `${confidenceLabel(event.confidence)} · ${sourceAttribution(event.source)} · ${formatEvidenceTimestamp(event.timestamp)}`;
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

    if (event.type === 'policy_decision' || event.source === 'calder_governance') {
      const record = document.createElement('div');
      record.className = 'inspector-evidence-governance-note';
      record.textContent = governanceRecordLabel();
      row.appendChild(record);
    }
  }

  if (event.sanitizedPaths?.length) {
    const paths = document.createElement('div');
    paths.className = 'inspector-evidence-detail';
    paths.textContent = event.sanitizedPaths.join(', ');
    row.appendChild(paths);
  }

  return row;
}

function rebuildEventList(
  list: HTMLElement,
  truncationHost: HTMLElement,
  events: EvidenceEvent[],
  category: EvidenceFilterCategory,
  query: string,
  selectedEventId: string | null,
  onSelect: (event: EvidenceEvent) => void,
): void {
  list.replaceChildren();
  truncationHost.replaceChildren();

  const visible = events.filter((event) => matchesEvidenceFilter(event, category, query));
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    empty.textContent = t('No events match this filter');
    list.appendChild(empty);
    return;
  }

  const { events: domEvents, truncated, hiddenCount } = sliceEventsForDom(visible);
  if (truncated) {
    const banner = document.createElement('div');
    banner.className = 'inspector-evidence-truncation-banner';
    applyTabularNums(banner);
    banner.textContent = `${t('Showing latest matching events')}: ${domEvents.length} (${hiddenCount} ${t('earlier matches hidden — narrow the filter')})`;
    truncationHost.appendChild(banner);
  }

  for (const event of domEvents) {
    list.appendChild(renderEventRow(event, onSelect, selectedEventId));
  }
}

export function renderEvidence(container: HTMLElement): void {
  const sessionId = inspectorState.inspectedSessionId;
  if (!sessionId) return;

  disposeEvidenceView();

  const generation = beginEvidenceViewGeneration();
  const loading = document.createElement('div');
  loading.className = 'inspector-empty';
  loading.textContent = t('Loading evidence…');
  container.replaceChildren(loading);

  void (async () => {
    try {
      const [summaryResult, eventsResult, settings, health] = await Promise.all([
        window.calder.evidence.getSummary(sessionId),
        window.calder.evidence.listEvents(sessionId, 0, EVENT_PAGE_SIZE),
        window.calder.evidence.getSettings(),
        window.calder.evidence.getHealth(sessionId),
      ]);
      if (!isEvidenceViewGenerationCurrent(generation)) return;

      if (!settings.enabled) {
        container.replaceChildren();
        renderInspectorEmpty(
          container,
          emptyMessage(
            t('Session evidence capture is disabled. Enable it in Preferences → Safety.'),
          ),
        );
        return;
      }

      container.replaceChildren();

      const header = document.createElement('div');
      header.className = 'inspector-evidence-header';
      const title = document.createElement('div');
      title.className = 'inspector-evidence-title';
      title.textContent = t('Session Evidence');
      header.appendChild(title);

      const headerActions = document.createElement('div');
      headerActions.className = 'inspector-evidence-header-actions';
      headerActions.appendChild(createPixelModeToggle(settings, container));
      if (settings.pixelMode === 'studio') {
        const studioBtn = document.createElement('button');
        studioBtn.type = 'button';
        studioBtn.className = 'inspector-pixel-studio-action-btn';
        studioBtn.textContent = t('Open Pixel Studio');
        studioBtn.addEventListener('click', () => setInspectorTab('studio'));
        headerActions.appendChild(studioBtn);
      }
      header.appendChild(headerActions);
      container.appendChild(header);

      if (!summaryResult) {
        renderInspectorEmpty(container, emptyMessage(t('No evidence run for this session')));
        return;
      }

      const gapsBanner = createGapsBanner(summaryResult.gaps ?? []);
      if (gapsBanner) container.appendChild(gapsBanner);

      if (summaryResult.summaryStale) {
        const banner = document.createElement('div');
        banner.className = 'inspector-evidence-stale-banner';
        banner.textContent = t('Summary may be stale — new events arrived after last rebuild.');
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
        summaryBar.appendChild(renderCoverageBadge(s.coverage));
        const counters = document.createElement('div');
        counters.className = 'inspector-evidence-counters';
        applyTabularNums(counters);
        counters.textContent = t(
          `Events ${s.eventCounts.total} · Tools ${s.eventCounts.toolStarted} · Policy ${s.eventCounts.policyDecisions}`,
        );
        summaryBar.appendChild(counters);
      }
      container.appendChild(summaryBar);

      if (health) {
        container.appendChild(renderEvidenceHealthPanel(health));
      }

      const events = [...eventsResult.events];
      let loadedCount = events.length;
      let totalCount = eventsResult.total;
      let selectedEventId: string | null = null;
      let pixelStrip: HTMLElement | null = null;
      if (settings.pixelMode === 'compact') {
        pixelStrip = renderPixelCompactStrip(container, events, {
          providerId: health?.providerId,
        });
      }

      const detailHost = document.createElement('div');
      detailHost.className = 'inspector-evidence-detail-host';
      container.appendChild(detailHost);

      const truncationHost = document.createElement('div');
      truncationHost.className = 'inspector-evidence-truncation-host';
      container.appendChild(truncationHost);

      const list = document.createElement('div');
      list.className = 'inspector-evidence-list';
      container.appendChild(list);

      const footer = document.createElement('div');
      footer.className = 'inspector-evidence-footer';
      const more = document.createElement('div');
      more.className = 'inspector-evidence-more';
      applyTabularNums(more);
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'inspector-evidence-load-more-btn';
      loadMoreBtn.textContent = t('Load more events');
      footer.append(more, loadMoreBtn);
      container.appendChild(footer);

      const syncFooter = (): void => {
        more.textContent = t(`Showing ${loadedCount} of ${totalCount} events`);
        loadMoreBtn.hidden = loadedCount >= totalCount;
      };

      let filterBar!: ReturnType<typeof createEvidenceFilterBar>;

      const selectEvent = (event: EvidenceEvent): void => {
        selectedEventId = selectedEventId === event.eventId ? null : event.eventId;
        detailHost.replaceChildren(
          selectedEventId ? renderEvidenceEventDetail(event) : document.createDocumentFragment(),
        );
        rebuildEventList(
          list,
          truncationHost,
          events,
          filterBar.getCategory(),
          filterBar.getQuery(),
          selectedEventId,
          selectEvent,
        );
      };

      const storedFilter = readStoredEvidenceFilter(sessionId);
      filterBar = createEvidenceFilterBar((category, query) => {
        writeStoredEvidenceFilter(sessionId, category, query);
        rebuildEventList(list, truncationHost, events, category, query, selectedEventId, selectEvent);
      }, storedFilter ?? undefined);
      container.insertBefore(filterBar.root, detailHost);

      rebuildEventList(
        list,
        truncationHost,
        events,
        filterBar.getCategory(),
        filterBar.getQuery(),
        selectedEventId,
        selectEvent,
      );
      syncFooter();

      loadMoreBtn.addEventListener('click', () => {
        void window.calder.evidence
          .listEvents(sessionId, loadedCount, EVENT_PAGE_SIZE)
          .then((page) => {
            if (!isEvidenceViewGenerationCurrent(generation)) return;
            if (page.events.length === 0) return;
            const merged = mergeEvidenceEvents(events, page.events);
            events.length = 0;
            events.push(...merged.events);
            loadedCount = events.length;
            totalCount = page.total;
            rebuildEventList(
              list,
              truncationHost,
              events,
              filterBar.getCategory(),
              filterBar.getQuery(),
              selectedEventId,
              selectEvent,
            );
            syncFooter();
            if (pixelStrip) {
              updatePixelCompactStrip(pixelStrip, events, { providerId: health?.providerId });
            }
          });
      });

      window.calder.evidence.subscribe(summaryResult.runId);
      const unsubscribeEvents = window.calder.evidence.onEvent((runId, incoming) => {
        if (!isEvidenceViewGenerationCurrent(generation)) return;
        if (runId !== summaryResult.runId || incoming.length === 0) return;
        const merged = mergeEvidenceEvents(events, incoming);
        if (merged.added === 0) return;
        events.length = 0;
        events.push(...merged.events);
        loadedCount = events.length;
        totalCount = Math.max(totalCount, events.length);
        rebuildEventList(
          list,
          truncationHost,
          events,
          filterBar.getCategory(),
          filterBar.getQuery(),
          selectedEventId,
          selectEvent,
        );
        syncFooter();
        if (pixelStrip) {
          updatePixelCompactStrip(pixelStrip, events, { providerId: health?.providerId });
        }
      });

      registerEvidenceSubscription(() => {
        unsubscribeEvents();
        window.calder.evidence.unsubscribe();
      });
    } catch {
      renderInspectorEmpty(container, t('Evidence unavailable'));
    }
  })();
}

function createPixelModeToggle(settings: EvidenceSettings, container: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'inspector-evidence-pixel-toggle';
  const label = document.createElement('span');
  label.textContent = t('Pixel:');
  wrap.appendChild(label);

  for (const mode of ['off', 'compact', 'studio'] as const) {
    const btn = document.createElement('button');
    btn.className = 'inspector-evidence-pixel-btn' + (settings.pixelMode === mode ? ' active' : '');
    btn.textContent =
      mode === 'off' ? t('Off') : mode === 'compact' ? t('Compact') : t('Studio');
    btn.addEventListener('click', () => {
      void window.calder.evidence.setSettings({ ...settings, pixelMode: mode }).then(() => {
        if (mode === 'studio') {
          setInspectorTab('studio');
          return;
        }
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

  disposeEvidenceView();
  const generation = beginEvidenceViewGeneration();
  container.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'inspector-empty';
  loading.textContent = t('Loading changes…');
  container.appendChild(loading);

  void (async () => {
    try {
      const [meta, settings, health, eventsResult] = await Promise.all([
        window.calder.evidence.getMeta(sessionId),
        window.calder.evidence.getSettings(),
        window.calder.evidence.getHealth(sessionId),
        window.calder.evidence.listEvents(sessionId, 0, EVENT_PAGE_SIZE),
      ]);
      if (!isEvidenceViewGenerationCurrent(generation)) return;

      if (!settings.enabled) {
        container.replaceChildren();
        renderInspectorEmpty(
          container,
          emptyMessage(
            t('Session evidence capture is disabled. Enable it in Preferences → Safety.'),
          ),
        );
        return;
      }

      if (!meta) {
        container.replaceChildren();
        renderInspectorEmpty(container, emptyMessage(t('No evidence run for this session')));
        return;
      }

      container.replaceChildren();

      const title = document.createElement('div');
      title.className = 'inspector-evidence-title';
      title.textContent = t('Session Changes');
      container.appendChild(title);

      if (health) {
        container.appendChild(renderEvidenceHealthPanel(health));
      }

      const allEvents = [...eventsResult.events];
      let loadedCount = allEvents.length;
      let totalCount = eventsResult.total;

      const truncationHost = document.createElement('div');
      truncationHost.className = 'inspector-evidence-truncation-host';
      container.appendChild(truncationHost);

      const list = document.createElement('div');
      list.className = 'inspector-evidence-list';
      container.appendChild(list);

      const footer = document.createElement('div');
      footer.className = 'inspector-evidence-footer';
      const more = document.createElement('div');
      more.className = 'inspector-evidence-more';
      applyTabularNums(more);
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'inspector-evidence-load-more-btn';
      loadMoreBtn.textContent = t('Load more changes');
      footer.append(more, loadMoreBtn);
      container.appendChild(footer);

      const rebuildList = (query: string): void => {
        list.replaceChildren();
        truncationHost.replaceChildren();

        const gitEvents = allEvents.filter(
          (event) => isGitChangeEvent(event) && matchesGitChangeQuery(event, query),
        );
        if (gitEvents.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'inspector-empty';
          empty.textContent = query.trim()
            ? t('No changes match this search')
            : t('No file or git changes observed');
          list.appendChild(empty);
          return;
        }

        const { events: domEvents, truncated, hiddenCount } = sliceEventsForDom(gitEvents);
        if (truncated) {
          const banner = document.createElement('div');
          banner.className = 'inspector-evidence-truncation-banner';
          applyTabularNums(banner);
          banner.textContent = `${t('Showing latest matching changes')}: ${domEvents.length} (${hiddenCount} ${t('earlier matches hidden — narrow the filter')})`;
          truncationHost.appendChild(banner);
        }

        for (const event of domEvents) {
          list.appendChild(renderGitChangeRow(event));
        }
      };

      const syncFooter = (): void => {
        const gitLoaded = allEvents.filter(isGitChangeEvent).length;
        more.textContent = `${loadedCount} ${t('events loaded')} · ${gitLoaded} ${t('changes observed')}`;
        loadMoreBtn.hidden = loadedCount >= totalCount;
      };

      const searchBar = createChangesSearchBar((query) => {
        writeStoredChangesQuery(sessionId, query);
        rebuildList(query);
      }, readStoredChangesQuery(sessionId));
      container.insertBefore(searchBar.root, truncationHost);

      rebuildList(searchBar.getQuery());
      syncFooter();

      loadMoreBtn.addEventListener('click', () => {
        void window.calder.evidence
          .listEvents(sessionId, loadedCount, EVENT_PAGE_SIZE)
          .then((page) => {
            if (!isEvidenceViewGenerationCurrent(generation)) return;
            if (page.events.length === 0) return;
            const merged = mergeEvidenceEvents(allEvents, page.events);
            allEvents.length = 0;
            allEvents.push(...merged.events);
            loadedCount = allEvents.length;
            totalCount = page.total;
            rebuildList(searchBar.getQuery());
            syncFooter();
          });
      });

      window.calder.evidence.subscribe(meta.runId);
      const unsubscribeEvents = window.calder.evidence.onEvent((runId, incoming) => {
        if (!isEvidenceViewGenerationCurrent(generation)) return;
        if (runId !== meta.runId || incoming.length === 0) return;
        const merged = mergeEvidenceEvents(allEvents, incoming);
        if (merged.added === 0) return;
        allEvents.length = 0;
        allEvents.push(...merged.events);
        loadedCount = allEvents.length;
        totalCount = Math.max(totalCount, allEvents.length);
        rebuildList(searchBar.getQuery());
        syncFooter();
      });

      registerEvidenceSubscription(() => {
        unsubscribeEvents();
        window.calder.evidence.unsubscribe();
      });
    } catch {
      renderInspectorEmpty(container, t('Changes unavailable'));
    }
  })();
}

export function renderReview(container: HTMLElement): void {
  const sessionId = inspectorState.inspectedSessionId;
  if (!sessionId) return;

  const generation = beginEvidenceViewGeneration();
  container.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'inspector-empty';
  loading.textContent = t('Loading review…');
  container.appendChild(loading);

  void (async () => {
    try {
      const [meta, settings, summaryResult, storageBytes, review, health] = await Promise.all([
        window.calder.evidence.getMeta(sessionId),
        window.calder.evidence.getSettings(),
        window.calder.evidence.getSummary(sessionId),
        window.calder.evidence.getStorageUsage(),
        window.calder.evidence.getReview(sessionId),
        window.calder.evidence.getHealth(sessionId),
      ]);
      if (!isEvidenceViewGenerationCurrent(generation)) return;

      if (!settings.enabled) {
        container.replaceChildren();
        renderInspectorEmpty(
          container,
          emptyMessage(
            t('Session evidence capture is disabled. Enable it in Preferences → Safety.'),
          ),
        );
        return;
      }

      if (!meta) {
        container.replaceChildren();
        renderInspectorEmpty(container, emptyMessage(t('No evidence run for review')));
        return;
      }

      container.replaceChildren();
      container.appendChild(
        renderEvidenceReviewSummary(summaryResult?.summary ?? null, health),
      );

      const form = document.createElement('div');
      form.className = 'inspector-evidence-review-form';
      container.appendChild(form);

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
      if (review?.status) statusSelect.value = review.status;
      statusRow.appendChild(statusSelect);
      form.appendChild(statusRow);

      const notesLabel = document.createElement('label');
      notesLabel.textContent = t('Notes');
      notesLabel.className = 'inspector-evidence-review-label';
      form.appendChild(notesLabel);

      const notesArea = document.createElement('textarea');
      notesArea.className = 'inspector-evidence-review-notes';
      notesArea.rows = 4;
      if (review?.notes) notesArea.value = review.notes;
      form.appendChild(notesArea);

      const saveStatus = document.createElement('div');
      saveStatus.className = 'inspector-evidence-review-save-status';
      saveStatus.hidden = true;
      form.appendChild(saveStatus);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'inspector-evidence-save-btn';
      saveBtn.textContent = t('Save review');
      saveBtn.addEventListener('click', () => {
        void window.calder.evidence
          .updateReview(
            meta.runId,
            statusSelect.value as 'pending' | 'approved' | 'rejected' | 'needs_changes',
            notesArea.value || undefined,
          )
          .then(() => {
            saveStatus.textContent = t('Review saved');
            saveStatus.hidden = false;
          });
      });
      form.appendChild(saveBtn);

      const exportNote = document.createElement('div');
      exportNote.className = 'inspector-evidence-export-note';
      exportNote.textContent = t('Exports are sanitized and only run when you click a button below.');
      container.appendChild(exportNote);

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
      storage.textContent = `${t('Evidence storage')}: ${(storageBytes / 1024).toFixed(1)} KB`;
      container.appendChild(storage);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'inspector-evidence-delete-btn';
      deleteBtn.textContent = t('Delete this run');
      deleteBtn.addEventListener('click', () => {
        void window.calder.evidence.deleteRun(meta.runId).then((result) => {
          if (result.ok && !result.canceled) renderReview(container);
        });
      });
      container.appendChild(deleteBtn);

      const deleteAllBtn = document.createElement('button');
      deleteAllBtn.className = 'inspector-evidence-delete-all-btn';
      deleteAllBtn.textContent = t('Delete all evidence');
      deleteAllBtn.addEventListener('click', () => {
        void window.calder.evidence.deleteAll().then((result) => {
          if (!result.canceled) renderReview(container);
        });
      });
      container.appendChild(deleteAllBtn);
    } catch {
      renderInspectorEmpty(container, t('Review unavailable'));
    }
  })();
}
