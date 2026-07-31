import { t } from '../../i18n.js';
import { applyTabularNums } from '../surface-services/dom-utils.js';
import {
  beginEvidenceViewGeneration,
  disposeEvidenceSubscriptions,
  isEvidenceViewGenerationCurrent,
  isGitChangeEvent,
  matchesGitChangeQuery,
  mergeEvidenceEvents,
  readStoredChangesQuery,
  registerEvidenceSubscription,
  sliceEventsForDom,
  writeStoredChangesQuery,
} from './evidence-view-support.js';
import {
  createChangesSearchBar,
  renderEvidenceHealthPanel,
  renderGitChangeRow,
} from './evidence-view-ui.js';
import { inspectorState } from './session-inspector-state-ui.js';
import { emptyMessage, renderInspectorEmpty } from './session-inspector-utils.js';

const EVENT_PAGE_SIZE = 100;

export function renderChanges(container: HTMLElement): void {
  const sessionId = inspectorState.inspectedSessionId;
  if (!sessionId) return;

  disposeEvidenceSubscriptions();
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
