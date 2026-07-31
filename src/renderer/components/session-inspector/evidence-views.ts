import type {
  EvidenceEvent,
  EvidenceHealthGap,
  EvidenceSettings,
} from '../../../shared/types-evidence.js';
import { t } from '../../i18n.js';
import { renderPixelCompactStrip, updatePixelCompactStrip } from '../pixel-agent/pixel-compact.js';
import { applyTabularNums } from '../surface-services/dom-utils.js';
import {
  beginEvidenceViewGeneration,
  disposeEvidenceSubscriptions,
  type EvidenceFilterCategory,
  formatEvidenceTimestamp,
  isEvidenceViewGenerationCurrent,
  matchesEvidenceFilter,
  mergeEvidenceEvents,
  readStoredEvidenceFilter,
  registerEvidenceSubscription,
  sliceEventsForDom,
  writeStoredEvidenceFilter,
} from './evidence-view-support.js';
import {
  createEvidenceFilterBar,
  governanceRecordLabel,
  renderCoverageBadge,
  renderEvidenceEventDetail,
  renderEvidenceHealthPanel,
} from './evidence-view-ui.js';
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
        rebuildEventList(
          list,
          truncationHost,
          events,
          category,
          query,
          selectedEventId,
          selectEvent,
        );
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
    btn.textContent = mode === 'off' ? t('Off') : mode === 'compact' ? t('Compact') : t('Studio');
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

export { renderChanges } from './changes-views.js';
export { renderReview } from './review-views.js';
