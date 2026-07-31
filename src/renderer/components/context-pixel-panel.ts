import type { EvidenceEvent } from '../../shared/types-evidence.js';
import { t } from '../i18n.js';
import { appState } from '../state.js';
import { isCliSessionRecord } from '../state-project-surface.js';
import { renderPixelCompactStrip, updatePixelCompactStrip } from './pixel-agent/pixel-compact.js';
import { renderPixelStudio, updatePixelStudio } from './pixel-agent/pixel-studio.js';
import { STUDIO_EVENT_WINDOW } from './pixel-agent/studio-resolver.js';
import { isActiveCliSessionForeground } from './pixel-agent/studio-session.js';
import {
  buildEcosystemCardElement,
  ECOSYSTEM_EVENT_WINDOW,
  type EcosystemCardModel,
  formatEcosystemStatusText,
} from './session-inspector/ecosystem-roster.js';
import {
  beginEvidenceViewGeneration,
  disposeEvidenceSubscriptions,
  isEvidenceViewGenerationCurrent,
  mergeEvidenceEvents,
  registerEvidenceSubscription,
} from './session-inspector/evidence-view-support.js';
import { renderInspectorEmpty } from './session-inspector/session-inspector-utils.js';

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

async function loadSessionTail(sessionId: string, windowSize: number): Promise<SessionTail> {
  const meta = await window.calder.evidence.getMeta(sessionId);
  if (!meta) return { sessionId, runId: null, events: [] };
  const total = meta.eventCount ?? 0;
  const offset = Math.max(0, total - windowSize);
  const page = await window.calder.evidence.listEvents(sessionId, offset, windowSize);
  return { sessionId, runId: meta.runId, events: [...page.events] };
}

function syncEvidenceSubscribe(runIds: string[]): void {
  if (runIds.length === 0) {
    window.calder.evidence.unsubscribe();
    return;
  }
  window.calder.evidence.subscribe(runIds);
}

function focusCliSession(sessionId: string): void {
  const project = appState.activeProject;
  if (!project) return;
  appState.setActiveSession(project.id, sessionId);
}

function watchUntilCliSessions(container: HTMLElement, generation: number): () => void {
  const refresh = (): void => {
    if (!isEvidenceViewGenerationCurrent(generation)) return;
    if (!container.isConnected) return;
    if (listOpenCliSessions().length === 0) return;
    mountContextPixel(container);
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

/** Pixel Ecosystem + Studio in the Context Inspector rail (no Session Inspector shell). */
export function mountContextPixel(container: HTMLElement): void {
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

      const project = appState.activeProject;
      const activeId =
        project?.activeSessionId &&
        sessions.some((session) => session.id === project.activeSessionId)
          ? project.activeSessionId
          : sessions[0]!.id;

      const studioWindow =
        settings.pixelMode === 'studio' ? STUDIO_EVENT_WINDOW : ECOSYSTEM_EVENT_WINDOW;
      const tails = await Promise.all(
        sessions.map((session) =>
          loadSessionTail(
            session.id,
            session.id === activeId ? studioWindow : ECOSYSTEM_EVENT_WINDOW,
          ),
        ),
      );
      if (!isEvidenceViewGenerationCurrent(generation)) return;

      const bySession = new Map(tails.map((tail) => [tail.sessionId, tail]));
      let studioFocusId = activeId;

      container.replaceChildren();

      const title = document.createElement('div');
      title.className = 'inspector-evidence-title';
      title.textContent = t('Pixel Ecosystem');
      container.appendChild(title);

      const hint = document.createElement('div');
      hint.className = 'inspector-ecosystem-hint';
      hint.textContent = t('One pixel per open CLI — live activity from evidence.');
      container.appendChild(hint);

      const studioSection = document.createElement('div');
      studioSection.className = 'context-pixel-studio-section';
      container.appendChild(studioSection);

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

      let studioEl: HTMLElement | null = null;
      let compactEl: HTMLElement | null = null;

      const renderStudioHost = (): void => {
        studioSection.replaceChildren();
        studioSection.classList.remove('context-pixel-studio-section--map');
        studioEl = null;
        compactEl = null;
        if (settings.pixelMode === 'off') return;

        const focusTail = bySession.get(studioFocusId) ?? {
          sessionId: studioFocusId,
          runId: null,
          events: [],
        };
        const focusSession = sessions.find((session) => session.id === studioFocusId);
        const paused = !isActiveCliSessionForeground(studioFocusId);

        if (settings.pixelMode === 'compact') {
          compactEl = renderPixelCompactStrip(studioSection, focusTail.events, {
            providerId: focusSession?.providerId,
          });
          return;
        }

        studioSection.classList.add('context-pixel-studio-section--map');
        studioEl = renderPixelStudio(studioSection, focusTail.events, {
          variant: 'tab',
          paused,
          providerId: focusSession?.providerId,
        });
      };

      const rebuildRoster = (): void => {
        list.replaceChildren();
        const nextProject = appState.activeProject;
        const nextActiveId = nextProject?.activeSessionId ?? null;
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
            isActive: session.id === nextActiveId,
            isInspected: session.id === studioFocusId,
          };
          models.push(model);
          list.appendChild(
            buildEcosystemCardElement(
              model,
              (sessionId) => {
                focusCliSession(sessionId);
                studioFocusId = sessionId;
                renderStudioHost();
                rebuildRoster();
              },
              (sessionId) => {
                focusCliSession(sessionId);
                studioFocusId = sessionId;
                renderStudioHost();
                rebuildRoster();
                studioSection.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              },
            ),
          );
        }

        const focusModel =
          models.find((model) => model.session.id === studioFocusId) ??
          models.find((model) => model.isActive) ??
          models[0];
        live.textContent = focusModel ? formatEcosystemStatusText(focusModel) : '';
      };

      const refreshFocusVisual = (): void => {
        const focusTail = bySession.get(studioFocusId);
        if (!focusTail) return;
        const focusSession = listOpenCliSessions().find((session) => session.id === studioFocusId);
        const paused = !isActiveCliSessionForeground(studioFocusId);
        if (studioEl) {
          updatePixelStudio(studioEl, focusTail.events, {
            paused,
            providerId: focusSession?.providerId,
          });
        }
        if (compactEl) {
          updatePixelCompactStrip(compactEl, focusTail.events, {
            providerId: focusSession?.providerId,
          });
        }
      };

      renderStudioHost();
      rebuildRoster();

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
          const cap =
            sessionId === studioFocusId && settings.pixelMode === 'studio'
              ? STUDIO_EVENT_WINDOW
              : ECOSYSTEM_EVENT_WINDOW;
          tail.events = merged.events.slice(-cap);
          bySession.set(sessionId, tail);
          if (sessionId === studioFocusId) refreshFocusVisual();
          rebuildRoster();
          return;
        }
      });

      const syncSessions = (): void => {
        if (!isEvidenceViewGenerationCurrent(generation)) return;
        if (!container.isConnected) return;
        void (async () => {
          const nextSessions = listOpenCliSessions();
          if (nextSessions.length === 0) {
            mountContextPixel(container);
            return;
          }
          for (const session of nextSessions) {
            if (bySession.has(session.id)) continue;
            const tail = await loadSessionTail(session.id, ECOSYSTEM_EVENT_WINDOW);
            if (!isEvidenceViewGenerationCurrent(generation)) return;
            bySession.set(session.id, tail);
          }
          for (const sessionId of [...bySession.keys()]) {
            if (!nextSessions.some((session) => session.id === sessionId)) {
              bySession.delete(sessionId);
            }
          }
          if (!bySession.has(studioFocusId)) {
            studioFocusId =
              appState.activeProject?.activeSessionId &&
              bySession.has(appState.activeProject.activeSessionId)
                ? appState.activeProject.activeSessionId
                : nextSessions[0]!.id;
            renderStudioHost();
          } else {
            refreshFocusVisual();
          }
          const nextRunIds = [...bySession.values()]
            .map((tail) => tail.runId)
            .filter((id): id is string => Boolean(id));
          syncEvidenceSubscribe(nextRunIds);
          rebuildRoster();
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
