import { t } from '../i18n.js';
import { onChange as onInspectorEventsChange } from '../session-inspector-state.js';
import { appState } from '../state.js';
import { isCliSessionRecord } from '../state-project-surface.js';
import { inspectorState } from './session-inspector/session-inspector-state-ui.js';
import { renderTimeline } from './session-inspector/session-inspector-timeline.js';
import {
  canInspectSession,
  renderInspectorEmpty,
} from './session-inspector/session-inspector-utils.js';

let timelineEl: HTMLElement | null = null;
let boundSessionId: string | null = null;

function activeCliSessionId(): string | null {
  const session = appState.activeSession;
  if (!session || !isCliSessionRecord(session)) return null;
  return session.id;
}

function renderActivityTimeline(): void {
  if (!timelineEl) return;
  const sessionId = activeCliSessionId();
  if (!sessionId) {
    timelineEl.replaceChildren();
    timelineEl.toggleAttribute('hidden', true);
    inspectorState.inspectedSessionId = null;
    boundSessionId = null;
    return;
  }

  const session = appState.activeProject?.sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    timelineEl.replaceChildren();
    timelineEl.toggleAttribute('hidden', true);
    return;
  }

  timelineEl.toggleAttribute('hidden', false);
  inspectorState.inspectedSessionId = sessionId;
  boundSessionId = sessionId;

  if (!canInspectSession(session)) {
    renderInspectorEmpty(
      timelineEl,
      t('Hook timeline unavailable'),
      t(
        'This provider does not emit hook events. Use Pixel Office or Session Evidence for activity.',
      ),
    );
    return;
  }

  timelineEl.replaceChildren();
  renderTimeline(timelineEl);
}

export function initSessionActivityTimeline(): void {
  timelineEl = document.getElementById('session-activity-timeline');
  if (!timelineEl) return;

  const scheduleRender = (): void => {
    renderActivityTimeline();
  };

  appState.on('session-changed', scheduleRender);
  appState.on('project-changed', scheduleRender);
  appState.on('state-loaded', scheduleRender);
  onInspectorEventsChange((sessionId) => {
    if (sessionId === boundSessionId) scheduleRender();
  });

  scheduleRender();
}
