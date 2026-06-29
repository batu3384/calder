import type {
  MobileInspectInteractionResult,
  MobileInspectLaunchResult,
} from '../../../shared/types/mobile.js';
import { appState } from '../../state.js';
import {
  formatPointLabel,
  getProjectProfileLabel,
  hasBlockingChecks,
} from './dependency-scoping.js';
import type { RenderMobileInspectWorkbenchOptions } from './inspect-workbench-types.js';

export function appendInspectSendControls(
  options: RenderMobileInspectWorkbenchOptions,
  section: HTMLElement,
): void {
  const { instance, handlers } = options;
  const inspect = instance.inspectState;
  const instruction = document.createElement('textarea');
  instruction.className = 'mobile-surface-inspect-input';
  instruction.rows = 3;
  instruction.placeholder = 'Describe what should change on the selected element…';
  instruction.value = inspect.instruction;
  instruction.addEventListener('input', () => {
    inspect.instruction = instruction.value;
  });
  section.appendChild(instruction);

  const sendRow = document.createElement('div');
  sendRow.className = 'mobile-surface-inspect-send-row';

  const targetSelect = document.createElement('select');
  targetSelect.className = 'mobile-surface-inspect-target';
  const targetSessions = appState.listSurfaceTargetSessions(instance.projectId);
  const currentTarget = appState.resolveSurfaceTargetSession(instance.projectId, {
    requireExplicitTarget: true,
  });

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent =
    targetSessions.length > 0 ? 'Select session target…' : 'Open a CLI session first';
  targetSelect.appendChild(defaultOption);
  for (const session of targetSessions) {
    const option = document.createElement('option');
    option.value = session.id;
    option.textContent = session.name;
    if (currentTarget?.id === session.id) {
      option.selected = true;
    }
    targetSelect.appendChild(option);
  }
  targetSelect.disabled = targetSessions.length === 0;
  targetSelect.addEventListener('change', () => {
    const next = targetSelect.value.trim();
    appState.setSurfaceTargetSession(instance.projectId, next || null);
    handlers.rerenderFromState(instance);
  });

  const sendSelectedBtn = document.createElement('button');
  sendSelectedBtn.type = 'button';
  sendSelectedBtn.className = 'mobile-surface-refresh-btn';
  sendSelectedBtn.textContent = 'Send to selected';
  const canSendPrompt = Boolean(inspect.selectedPoint && inspect.instruction.trim().length > 0);
  sendSelectedBtn.disabled =
    !currentTarget ||
    !canSendPrompt ||
    inspect.launching ||
    inspect.capturing ||
    inspect.inspectingPoint ||
    inspect.interacting;
  sendSelectedBtn.addEventListener('click', () => {
    void handlers.sendInspectToSelectedSession(instance);
  });

  sendRow.append(targetSelect, sendSelectedBtn);
  section.appendChild(sendRow);

  if (inspect.selectedPoint) {
    const point = document.createElement('div');
    point.className = 'mobile-surface-inspect-point';
    point.textContent = `Selected point: ${formatPointLabel(inspect.selectedPoint)}`;
    section.appendChild(point);
  }

  if (inspect.sendError) {
    const error = document.createElement('div');
    error.className = 'mobile-surface-inspect-error';
    error.textContent = inspect.sendError;
    section.appendChild(error);
  }
}

export function renderInspectWorkbenchHeader(
  options: RenderMobileInspectWorkbenchOptions,
): HTMLDivElement {
  const { instance, report, platformLabels, handlers } = options;
  const inspect = instance.inspectState;
  const header = document.createElement('div');
  header.className = 'mobile-surface-inspect-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'mobile-surface-inspect-title-wrap';
  const title = document.createElement('h3');
  title.className = 'mobile-surface-group-title';
  title.textContent = 'Inspect workbench';
  const subtitle = document.createElement('p');
  subtitle.className = 'mobile-surface-inspect-subtitle';
  subtitle.textContent = `${getProjectProfileLabel(instance.projectProfile)} · Launch, capture, select, send.`;
  titleWrap.append(title, subtitle);

  const platformToggle = document.createElement('div');
  platformToggle.className = 'mobile-surface-platform-toggle';
  (['ios', 'android'] as const).forEach((platform) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `mobile-surface-platform-btn${inspect.platform === platform ? ' active' : ''}`;
    btn.textContent = platformLabels[platform];
    const blocked = hasBlockingChecks(report, platform);
    btn.disabled =
      inspect.launching ||
      inspect.capturing ||
      inspect.inspectingPoint ||
      inspect.interacting ||
      blocked;
    if (blocked) {
      btn.title = `${platformLabels[platform]} has missing required dependencies below.`;
    }
    btn.addEventListener('click', () => {
      if (
        inspect.platform === platform ||
        inspect.launching ||
        inspect.capturing ||
        inspect.inspectingPoint ||
        inspect.interacting
      )
        return;
      handlers.stopInspectLiveMode(instance);
      inspect.platform = platform;
      inspect.screenshot = null;
      inspect.selectedPoint = null;
      inspect.selectedElement = null;
      inspect.inspectingPoint = false;
      inspect.interacting = false;
      inspect.pointInspectToken += 1;
      inspect.sendError = '';
      inspect.contextTrace = [];
      handlers.setInspectStatus(
        instance,
        `Platform switched to ${platformLabels[platform]}.`,
        'default',
      );
      handlers.rerenderFromState(instance);
    });
    platformToggle.appendChild(btn);
  });

  header.append(titleWrap, platformToggle);
  return header;
}

export function appendInspectActionControls(
  options: RenderMobileInspectWorkbenchOptions,
  section: HTMLElement,
): void {
  const { instance, report, platformLabels, handlers } = options;
  const inspect = instance.inspectState;
  const actionRow = document.createElement('div');
  actionRow.className = 'mobile-surface-inspect-actions';

  const launchBtn = document.createElement('button');
  launchBtn.type = 'button';
  launchBtn.className = 'mobile-surface-refresh-btn';
  launchBtn.textContent = inspect.launching
    ? 'Launching…'
    : `Launch ${platformLabels[inspect.platform]}`;
  launchBtn.disabled =
    inspect.launching ||
    inspect.capturing ||
    inspect.inspectingPoint ||
    inspect.interacting ||
    hasBlockingChecks(report, inspect.platform);
  launchBtn.addEventListener('click', async () => {
    const api = window.calder?.mobileInspect;
    if (!api) {
      handlers.setInspectStatus(
        instance,
        'Mobile inspect API is unavailable in this build.',
        'error',
      );
      handlers.rerenderFromState(instance);
      return;
    }

    handlers.stopInspectLiveMode(instance);
    inspect.launching = true;
    inspect.sendError = '';
    handlers.setInspectStatus(
      instance,
      `Launching ${platformLabels[inspect.platform]}…`,
      'default',
    );
    handlers.rerenderFromState(instance);
    try {
      const result: MobileInspectLaunchResult = await api.launch(inspect.platform);
      handlers.setInspectStatus(instance, result.message, result.success ? 'success' : 'error');
      if (result.success) {
        await handlers.captureInspectFrame(instance, 'manual');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Launch command failed.';
      handlers.setInspectStatus(instance, message, 'error');
    } finally {
      inspect.launching = false;
      handlers.rerenderFromState(instance);
    }
  });

  const captureBtn = document.createElement('button');
  captureBtn.type = 'button';
  captureBtn.className = 'mobile-surface-refresh-btn';
  captureBtn.textContent = inspect.capturing ? 'Capturing…' : 'Capture frame';
  captureBtn.disabled =
    inspect.launching ||
    inspect.capturing ||
    inspect.inspectingPoint ||
    inspect.interacting ||
    hasBlockingChecks(report, inspect.platform);
  captureBtn.addEventListener('click', () => {
    void handlers.captureInspectFrame(instance, 'manual');
  });

  const liveBtn = document.createElement('button');
  liveBtn.type = 'button';
  liveBtn.className = 'mobile-surface-refresh-btn';
  liveBtn.textContent = inspect.liveMode ? 'Stop live' : 'Start live';
  liveBtn.disabled =
    inspect.launching ||
    inspect.inspectingPoint ||
    inspect.interacting ||
    hasBlockingChecks(report, inspect.platform);
  liveBtn.addEventListener('click', () => {
    if (inspect.liveMode) {
      handlers.stopInspectLiveMode(instance, 'Embedded live view stopped.', 'default');
      handlers.rerenderFromState(instance);
      return;
    }
    void handlers.startInspectLiveMode(instance);
  });

  const tapSelectedBtn = document.createElement('button');
  tapSelectedBtn.type = 'button';
  tapSelectedBtn.className = 'mobile-surface-refresh-btn';
  tapSelectedBtn.textContent = inspect.interacting ? 'Tapping…' : 'Tap selected';
  tapSelectedBtn.disabled =
    !inspect.selectedPoint ||
    inspect.launching ||
    inspect.capturing ||
    inspect.inspectingPoint ||
    inspect.interacting ||
    hasBlockingChecks(report, inspect.platform);
  tapSelectedBtn.addEventListener('click', async () => {
    const selectedPoint = inspect.selectedPoint;
    if (!selectedPoint) {
      handlers.setInspectStatus(instance, 'Pick a point on the screenshot first.', 'default');
      handlers.rerenderFromState(instance);
      return;
    }

    const api = window.calder?.mobileInspect;
    if (!api) {
      handlers.setInspectStatus(
        instance,
        'Mobile inspect API is unavailable in this build.',
        'error',
      );
      handlers.rerenderFromState(instance);
      return;
    }

    if (inspect.liveMode) {
      handlers.stopInspectLiveMode(instance, 'Live paused before interaction.', 'default');
    }

    inspect.interacting = true;
    inspect.sendError = '';
    handlers.setInspectStatus(instance, 'Dispatching tap to selected point…', 'default');
    handlers.rerenderFromState(instance);
    try {
      const result: MobileInspectInteractionResult = await api.interact(
        inspect.platform,
        selectedPoint.x,
        selectedPoint.y,
      );
      handlers.setInspectStatus(instance, result.message, result.success ? 'success' : 'error');
      if (result.success) {
        await handlers.captureInspectFrame(instance, 'live');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tap request failed.';
      handlers.setInspectStatus(instance, message, 'error');
    } finally {
      inspect.interacting = false;
      handlers.rerenderFromState(instance);
    }
  });

  actionRow.append(launchBtn, captureBtn, liveBtn, tapSelectedBtn);
  section.appendChild(actionRow);
}
