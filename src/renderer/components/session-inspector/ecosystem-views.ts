import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { t } from '../../i18n.js';
import { appState } from '../../state.js';
import { isCliSessionRecord } from '../../state-project-surface.js';
import {
  buildEcosystemCardElement,
  ECOSYSTEM_EVENT_WINDOW,
  type EcosystemCardModel,
  formatEcosystemStatusText,
} from './ecosystem-roster.js';
import {
  beginEvidenceViewGeneration,
  disposeEvidenceSubscriptions,
  isEvidenceViewGenerationCurrent,
  mergeEvidenceEvents,
  registerEvidenceSubscription,
} from './evidence-view-support.js';
import { inspectorState } from './session-inspector-state-ui.js';
import { setInspectorTab } from './session-inspector-tabs.js';
import { renderInspectorEmpty } from './session-inspector-utils.js';

interface SessionTail {
  sessionId: string;
  runId: string | null;
  events: EvidenceEvent[];
}

export function listOpenCliSessions() {
  const project = appState.activeProject;
  if (!project) return [];
  return project.sessions.filter(isCliSessionRecord);
}

async function loadSessionTail(sessionId: string): Promise<SessionTail> {
  const meta = await window.calder.evidence.getMeta(sessionId);
  if (!meta) return { sessionId, runId: null, events: [] };
  const total = meta.eventCount ?? 0;
  const offset = Math.max(0, total - ECOSYSTEM_EVENT_WINDOW);
  const page = await window.calder.evidence.listEvents(sessionId, offset, ECOSYSTEM_EVENT_WINDOW);
  return { sessionId, runId: meta.runId, events: [...page.events] };
}

function focusSession(sessionId: string, tab: 'evidence' | 'studio'): void {
  void import('./session-inspector.js').then(({ focusInspectorSession }) => {
    focusInspectorSession(sessionId);
    setInspectorTab(tab);
  });
}

function syncEvidenceSubscribe(runIds: string[]): void {
  if (runIds.length === 0) {
    window.calder.evidence.unsubscribe();
    return;
  }
  window.calder.evidence.subscribe(runIds);
}

function isEcosystemHostActive(container: HTMLElement): boolean {
  return container.isConnected;
}

/** Keep watching until CLI sessions appear (Pixel can mount before state-loaded). */
function watchUntilCliSessions(container: HTMLElement, generation: number): () => void {
  const refresh = (): void => {
    if (!isEvidenceViewGenerationCurrent(generation)) return;
    if (!isEcosystemHostActive(container)) return;
    if (listOpenCliSessions().length === 0) return;
    renderEcosystem(container);
  };
  const unsubs = [
    appState.on('state-loaded', refresh),
    appState.on('project-changed', refresh),
    appState.on('session-added', refresh),
    appState.on('session-changed', refresh),
  ];
  return () => {
    for (const unsub of unsubs) unsub();
  };
}

export function renderEcosystem(container: HTMLElement): void {
  disposeEvidenceSubscriptions();
  const generation = beginEvidenceViewGeneration();
  container.replaceChildren();

  const loading = document.createElement('div');
  loading.className = 'inspector-empty';
  loading.textContent = t('Loading ecosystem…');
  container.appendChild(loading);

  void (async () => {
    try {
      const settings = await window.calder.evidence.getSettings();
      if (!isEvidenceViewGenerationCurrent(generation)) return;

      if (!settings.enabled) {
        container.replaceChildren();
        renderInspectorEmpty(
          container,
          t('Session evidence capture is disabled. Enable it in Preferences → Safety.'),
        );
        return;
      }

      const sessions = listOpenCliSessions();
      if (sessions.length === 0) {
        container.replaceChildren();
        renderInspectorEmpty(
          container,
          t('No open CLI sessions'),
          t('Open a CLI session in this project to see live Pixel agents.'),
        );
        registerEvidenceSubscription(watchUntilCliSessions(container, generation));
        return;
      }

      const tails = await Promise.all(sessions.map((session) => loadSessionTail(session.id)));
      if (!isEvidenceViewGenerationCurrent(generation)) return;

      const bySession = new Map(tails.map((tail) => [tail.sessionId, tail]));

      container.replaceChildren();

      const header = document.createElement('div');
      header.className = 'inspector-evidence-title';
      header.textContent = t('Pixel Ecosystem');
      container.appendChild(header);

      const hint = document.createElement('div');
      hint.className = 'inspector-ecosystem-hint';
      hint.textContent = t('One pixel per open CLI — live activity from evidence.');
      container.appendChild(hint);

      const live = document.createElement('div');
      live.className = 'inspector-ecosystem-live';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      container.appendChild(live);

      const list = document.createElement('div');
      list.className = 'inspector-ecosystem-list';
      list.setAttribute('role', 'list');
      container.appendChild(list);

      const rebuild = (): void => {
        list.replaceChildren();
        const project = appState.activeProject;
        const activeId = project?.activeSessionId ?? null;
        const inspectedId = inspectorState.inspectedSessionId;
        const models: EcosystemCardModel[] = [];

        for (const session of listOpenCliSessions()) {
          const tail = bySession.get(session.id) ?? {
            sessionId: session.id,
            runId: null,
            events: [],
          };
          const model: EcosystemCardModel = {
            session,
            events: tail.events,
            runId: tail.runId,
            isActive: session.id === activeId,
            isInspected: session.id === inspectedId,
          };
          models.push(model);
          list.appendChild(
            buildEcosystemCardElement(
              model,
              (sessionId) => focusSession(sessionId, 'evidence'),
              (sessionId) => focusSession(sessionId, 'studio'),
            ),
          );
        }

        const focusModel =
          models.find((model) => model.isActive) ??
          models.find((model) => model.isInspected) ??
          models[0];
        live.textContent = focusModel ? formatEcosystemStatusText(focusModel) : '';
      };

      rebuild();

      const runIds = [...bySession.values()]
        .map((tail) => tail.runId)
        .filter((id): id is string => Boolean(id));
      syncEvidenceSubscribe(runIds);

      const unsubscribeEvents = window.calder.evidence.onEvent((runId, incoming) => {
        if (!isEvidenceViewGenerationCurrent(generation)) return;
        if (incoming.length === 0) return;
        for (const [sessionId, tail] of bySession) {
          if (tail.runId !== runId) continue;
          const merged = mergeEvidenceEvents(tail.events, incoming);
          if (merged.added === 0) return;
          tail.events = merged.events.slice(-ECOSYSTEM_EVENT_WINDOW);
          bySession.set(sessionId, tail);
          rebuild();
          return;
        }
      });

      const syncSessions = (): void => {
        if (!isEvidenceViewGenerationCurrent(generation)) return;
        if (!isEcosystemHostActive(container)) return;
        void (async () => {
          const nextSessions = listOpenCliSessions();
          if (nextSessions.length === 0) {
            renderEcosystem(container);
            return;
          }
          for (const session of nextSessions) {
            if (bySession.has(session.id)) continue;
            const tail = await loadSessionTail(session.id);
            if (!isEvidenceViewGenerationCurrent(generation)) return;
            bySession.set(session.id, tail);
          }
          for (const sessionId of [...bySession.keys()]) {
            if (!nextSessions.some((session) => session.id === sessionId)) {
              bySession.delete(sessionId);
            }
          }
          const nextRunIds = [...bySession.values()]
            .map((tail) => tail.runId)
            .filter((id): id is string => Boolean(id));
          syncEvidenceSubscribe(nextRunIds);
          rebuild();
        })();
      };

      const unsubscribeSessionChanged = appState.on('session-changed', syncSessions);
      const unsubscribeSessionAdded = appState.on('session-added', syncSessions);
      const unsubscribeSessionRemoved = appState.on('session-removed', syncSessions);

      registerEvidenceSubscription(() => {
        unsubscribeEvents();
        unsubscribeSessionChanged();
        unsubscribeSessionAdded();
        unsubscribeSessionRemoved();
        window.calder.evidence.unsubscribe();
      });
    } catch {
      if (!isEvidenceViewGenerationCurrent(generation)) return;
      renderInspectorEmpty(container, t('Ecosystem unavailable'));
    }
  })();
}
