import { t } from '../../i18n.js';
import { appState } from '../../state.js';
import { renderPixelStudio, updatePixelStudio } from '../pixel-agent/pixel-studio.js';
import { STUDIO_EVENT_WINDOW } from '../pixel-agent/studio-resolver.js';
import { isInspectedSessionForeground } from '../pixel-agent/studio-session.js';
import {
  beginEvidenceViewGeneration,
  disposeEvidenceSubscriptions,
  isEvidenceViewGenerationCurrent,
  mergeEvidenceEvents,
  registerEvidenceSubscription,
  renderEvidenceHealthPanel,
} from './evidence-view-support.js';
import { inspectorState } from './session-inspector-state-ui.js';
import { setInspectorTab } from './session-inspector-tabs.js';
import { emptyMessage, renderInspectorEmpty } from './session-inspector-utils.js';

export function renderStudio(container: HTMLElement): void {
  const sessionId = inspectorState.inspectedSessionId;
  if (!sessionId) return;

  disposeEvidenceSubscriptions();
  const generation = beginEvidenceViewGeneration();
  container.replaceChildren();

  const loading = document.createElement('div');
  loading.className = 'inspector-empty';
  loading.textContent = t('Loading studio…');
  container.appendChild(loading);

  void (async () => {
    try {
      const [settings, meta, health, probe] = await Promise.all([
        window.calder.evidence.getSettings(),
        window.calder.evidence.getMeta(sessionId),
        window.calder.evidence.getHealth(sessionId),
        window.calder.evidence.listEvents(sessionId, 0, 1),
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

      if (settings.pixelMode !== 'studio') {
        container.replaceChildren();
        const empty = emptyMessage(
          t('Pixel Studio is off. Choose Studio under Preferences → Safety → Pixel Agent display.'),
        );
        renderInspectorEmpty(container, empty);
        const enable = document.createElement('button');
        enable.type = 'button';
        enable.className = 'inspector-pixel-studio-action-btn';
        enable.textContent = t('Enable Pixel Studio');
        enable.addEventListener('click', () => {
          void window.calder.evidence
            .setSettings({ ...settings, pixelMode: 'studio' })
            .then(() => renderStudio(container));
        });
        container.appendChild(enable);
        return;
      }

      if (!meta) {
        container.replaceChildren();
        renderInspectorEmpty(container, emptyMessage(t('No evidence run for this session')));
        return;
      }

      const totalCount = probe.total;
      const offset = Math.max(0, totalCount - STUDIO_EVENT_WINDOW);
      const eventsResult = await window.calder.evidence.listEvents(
        sessionId,
        offset,
        STUDIO_EVENT_WINDOW,
      );
      if (!isEvidenceViewGenerationCurrent(generation)) return;

      container.replaceChildren();

      const headerRow = document.createElement('div');
      headerRow.className = 'inspector-pixel-studio-header-row';

      const header = document.createElement('div');
      header.className = 'inspector-evidence-title';
      header.textContent = t('Pixel Agent Studio');
      headerRow.appendChild(header);

      const actions = document.createElement('div');
      actions.className = 'inspector-pixel-studio-actions';

      const evidenceBtn = document.createElement('button');
      evidenceBtn.type = 'button';
      evidenceBtn.className = 'inspector-pixel-studio-action-btn';
      evidenceBtn.textContent = t('Open evidence timeline');
      evidenceBtn.addEventListener('click', () => setInspectorTab('evidence'));
      actions.appendChild(evidenceBtn);

      const studioHost = document.createElement('div');
      studioHost.className = 'inspector-pixel-studio-host';

      let expanded = false;
      const expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'inspector-pixel-studio-action-btn';
      expandBtn.textContent = t('Expand studio');
      expandBtn.addEventListener('click', () => {
        expanded = !expanded;
        studioHost.classList.toggle('inspector-pixel-studio-host--expanded', expanded);
        expandBtn.textContent = expanded ? t('Collapse studio') : t('Expand studio');
      });
      actions.appendChild(expandBtn);

      headerRow.appendChild(actions);
      container.appendChild(headerRow);

      if (health) {
        container.appendChild(renderEvidenceHealthPanel(health));
      }

      const pausedNote = document.createElement('div');
      pausedNote.className = 'inspector-pixel-studio-paused-note';
      pausedNote.hidden = true;
      container.appendChild(pausedNote);

      const events = [...eventsResult.events];
      let loadedCount = events.length;

      container.appendChild(studioHost);

      const studio = renderPixelStudio(studioHost, events, {
        variant: 'tab',
        paused: !isInspectedSessionForeground(),
        providerId: meta.providerId,
      });

      const footer = document.createElement('div');
      footer.className = 'inspector-evidence-footer';
      const more = document.createElement('div');
      more.className = 'inspector-evidence-more';
      footer.appendChild(more);
      container.appendChild(footer);

      const syncPausedNote = (): void => {
        const paused = !isInspectedSessionForeground();
        pausedNote.hidden = !paused;
        if (paused) {
          pausedNote.textContent = t(
            'Animations paused — this is not the active terminal session.',
          );
        }
      };

      const syncFooter = (): void => {
        more.textContent = `${loadedCount} / ${totalCount} ${t('events loaded')} · ${t('latest window')}`;
      };

      const refreshStudio = (): void => {
        updatePixelStudio(studio, events, {
          paused: !isInspectedSessionForeground(),
          providerId: meta.providerId,
        });
        syncPausedNote();
        syncFooter();
      };

      syncPausedNote();
      syncFooter();

      window.calder.evidence.subscribe(meta.runId);
      const unsubscribeEvents = window.calder.evidence.onEvent((runId, incoming) => {
        if (!isEvidenceViewGenerationCurrent(generation)) return;
        if (runId !== meta.runId || incoming.length === 0) return;
        const merged = mergeEvidenceEvents(events, incoming);
        if (merged.added === 0) return;
        events.length = 0;
        events.push(...merged.events.slice(-STUDIO_EVENT_WINDOW));
        loadedCount = events.length;
        refreshStudio();
      });

      const unsubscribeSession = appState.on('session-changed', () => {
        if (!isEvidenceViewGenerationCurrent(generation)) return;
        if (inspectorState.activeTab !== 'studio') return;
        refreshStudio();
      });

      registerEvidenceSubscription(() => {
        unsubscribeEvents();
        unsubscribeSession();
        window.calder.evidence.unsubscribe();
      });
    } catch {
      if (!isEvidenceViewGenerationCurrent(generation)) return;
      renderInspectorEmpty(container, t('Studio unavailable'));
    }
  })();
}
