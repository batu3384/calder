import type {
  MobileDependencyReport,
  MobileInspectInteractionResult,
  MobileInspectLaunchResult,
  MobileInspectPlatform,
} from '../../../shared/types/mobile.js';
import { appState } from '../../state.js';
import {
  formatCaptureMeta,
  formatPointLabel,
  getBlockingChecks,
  getInspectInteractionHint,
  getProjectProfileLabel,
  hasBlockingChecks,
} from './dependency-scoping.js';
import {
  buildMobileDependencyCheckRow,
  buildMobileInspectBlockingPanel,
  renderInspectCapabilityPanel,
} from './workbench-sections.js';
import type { MobileSurfacePaneInstance } from './types.js';

type StatusTone = 'default' | 'success' | 'error';

interface MobileInspectWorkbenchHandlers {
  stopInspectLiveMode(instance: MobileSurfacePaneInstance, statusMessage?: string, tone?: StatusTone): void;
  rerenderFromState(instance: MobileSurfacePaneInstance): void;
  setInspectStatus(instance: MobileSurfacePaneInstance, message: string, tone?: StatusTone): void;
  captureInspectFrame(instance: MobileSurfacePaneInstance, source: 'manual' | 'live'): Promise<boolean>;
  startInspectLiveMode(instance: MobileSurfacePaneInstance): Promise<void>;
  sendInspectToSelectedSession(instance: MobileSurfacePaneInstance): Promise<void>;
  isInspectBusy(instance: MobileSurfacePaneInstance): boolean;
  setPaneStatus(instance: MobileSurfacePaneInstance, text: string, tone?: StatusTone): void;
  setActionAvailability(instance: MobileSurfacePaneInstance): void;
  refreshMobileSurfacePane(projectId: string, force?: boolean): Promise<void>;
}

interface RenderMobileInspectWorkbenchOptions {
  instance: MobileSurfacePaneInstance;
  report: MobileDependencyReport;
  platformLabels: Record<MobileInspectPlatform, string>;
  handlers: MobileInspectWorkbenchHandlers;
}

function renderInspectPreviewPanel(options: RenderMobileInspectWorkbenchOptions): HTMLDivElement {
  const { instance, platformLabels, handlers } = options;
  const inspect = instance.inspectState;
  const preview = document.createElement('div');
  preview.className = 'mobile-surface-inspect-preview';
  if (inspect.screenshot?.dataUrl) {
    const frame = document.createElement('div');
    frame.className = 'mobile-surface-inspect-frame';

    const image = document.createElement('img');
    image.className = 'mobile-surface-inspect-image';
    image.src = inspect.screenshot.dataUrl;
    image.alt = `${platformLabels[inspect.platform]} screenshot`;
    image.addEventListener('click', (event) => {
      if (inspect.interacting) return;
      if (inspect.liveMode) {
        handlers.stopInspectLiveMode(instance, 'Live paused for precise point inspection.', 'default');
      }
      const rect = image.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const rawX = event.clientX - rect.left;
      const rawY = event.clientY - rect.top;
      const normalizedX = Math.min(1, Math.max(0, rawX / rect.width));
      const normalizedY = Math.min(1, Math.max(0, rawY / rect.height));
      const screenshotWidth = inspect.screenshot?.width ?? Math.round(rect.width);
      const screenshotHeight = inspect.screenshot?.height ?? Math.round(rect.height);
      inspect.selectedPoint = {
        x: Math.round(normalizedX * screenshotWidth),
        y: Math.round(normalizedY * screenshotHeight),
        normalizedX,
        normalizedY,
      };
      inspect.selectedElement = null;
      inspect.inspectingPoint = true;
      const inspectToken = inspect.pointInspectToken + 1;
      inspect.pointInspectToken = inspectToken;
      inspect.sendError = '';
      handlers.setInspectStatus(instance, 'Inspecting selected point…', 'default');
      handlers.rerenderFromState(instance);

      const api = window.calder?.mobileInspect;
      if (!api) {
        inspect.inspectingPoint = false;
        handlers.setInspectStatus(instance, 'Mobile inspect API is unavailable in this build.', 'error');
        handlers.rerenderFromState(instance);
        return;
      }

      const selectedPoint = inspect.selectedPoint;
      void (async () => {
        try {
          const result = await api.inspectPoint(inspect.platform, selectedPoint.x, selectedPoint.y);
          if (inspect.pointInspectToken !== inspectToken) return;
          inspect.selectedElement = result;
          if (result.success) {
            handlers.setInspectStatus(instance, result.message, 'success');
          } else {
            handlers.setInspectStatus(instance, result.message, 'default');
          }
        } catch (error) {
          if (inspect.pointInspectToken !== inspectToken) return;
          const message = error instanceof Error ? error.message : 'Point inspection failed.';
          inspect.selectedElement = null;
          handlers.setInspectStatus(instance, message, 'error');
        } finally {
          if (inspect.pointInspectToken !== inspectToken) return;
          inspect.inspectingPoint = false;
          handlers.rerenderFromState(instance);
        }
      })();
    });

    frame.appendChild(image);

    const bounds = inspect.selectedElement?.success ? inspect.selectedElement.element?.bounds : undefined;
    const screenshotWidth = inspect.screenshot?.width;
    const screenshotHeight = inspect.screenshot?.height;
    if (
      bounds
      && typeof screenshotWidth === 'number'
      && screenshotWidth > 0
      && typeof screenshotHeight === 'number'
      && screenshotHeight > 0
    ) {
      const overlay = document.createElement('span');
      overlay.className = 'mobile-surface-inspect-bounds-overlay';
      overlay.style.left = `${(bounds.left / screenshotWidth) * 100}%`;
      overlay.style.top = `${(bounds.top / screenshotHeight) * 100}%`;
      overlay.style.width = `${((bounds.right - bounds.left) / screenshotWidth) * 100}%`;
      overlay.style.height = `${((bounds.bottom - bounds.top) / screenshotHeight) * 100}%`;
      frame.appendChild(overlay);
    }

    if (inspect.selectedPoint) {
      const marker = document.createElement('span');
      marker.className = 'mobile-surface-inspect-marker';
      marker.style.left = `${inspect.selectedPoint.normalizedX * 100}%`;
      marker.style.top = `${inspect.selectedPoint.normalizedY * 100}%`;
      frame.appendChild(marker);
    }

    preview.appendChild(frame);

    const meta = document.createElement('div');
    meta.className = 'mobile-surface-inspect-meta';
    const liveParts: string[] = [formatCaptureMeta(inspect.screenshot) || 'Frame captured'];
    if (inspect.liveMode) {
      liveParts.push(`Live: on (${inspect.liveIntervalMs}ms)`);
      liveParts.push(`Frames: ${inspect.liveFrames}`);
    }
    if (inspect.liveLastFrameAt) {
      liveParts.push(`Last: ${inspect.liveLastFrameAt}`);
    }
    meta.textContent = liveParts.join(' · ');
    preview.appendChild(meta);

    if (inspect.inspectingPoint) {
      const pointLoading = document.createElement('div');
      pointLoading.className = 'mobile-surface-inspect-point-loading';
      pointLoading.textContent = 'Inspecting selected point…';
      preview.appendChild(pointLoading);
    }

    if (inspect.selectedElement) {
      const elementInfo = document.createElement('div');
      elementInfo.className = 'mobile-surface-inspect-element';
      if (inspect.selectedElement.success && inspect.selectedElement.element) {
        const element = inspect.selectedElement.element;
        const lines = [
          element.className ? `Class: ${element.className}` : null,
          element.resourceId ? `Resource ID: ${element.resourceId}` : null,
          element.contentDesc ? `Content description: ${element.contentDesc}` : null,
          element.text ? `Text: ${element.text}` : null,
          element.bounds
            ? `Bounds: [${element.bounds.left},${element.bounds.top}]–[${element.bounds.right},${element.bounds.bottom}]`
            : null,
        ].filter((entry): entry is string => Boolean(entry));
        elementInfo.textContent = lines.length > 0
          ? lines.join('\n')
          : inspect.selectedElement.message;
      } else {
        elementInfo.textContent = inspect.selectedElement.message;
      }
      preview.appendChild(elementInfo);
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'mobile-surface-inspect-empty';
    empty.textContent = 'No capture yet. Launch simulator and capture a frame.';
    preview.appendChild(empty);
  }
  return preview;
}

function appendInspectSendControls(options: RenderMobileInspectWorkbenchOptions, section: HTMLElement): void {
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
  const currentTarget = appState.resolveSurfaceTargetSession(instance.projectId, { requireExplicitTarget: true });

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = targetSessions.length > 0 ? 'Select session target…' : 'Open a CLI session first';
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
  sendSelectedBtn.disabled = !currentTarget || !canSendPrompt || inspect.launching || inspect.capturing || inspect.inspectingPoint || inspect.interacting;
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

function renderInspectWorkbenchHeader(options: RenderMobileInspectWorkbenchOptions): HTMLDivElement {
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
    btn.disabled = inspect.launching || inspect.capturing || inspect.inspectingPoint || inspect.interacting || blocked;
    if (blocked) {
      btn.title = `${platformLabels[platform]} has missing required dependencies below.`;
    }
    btn.addEventListener('click', () => {
      if (inspect.platform === platform || inspect.launching || inspect.capturing || inspect.inspectingPoint || inspect.interacting) return;
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
      handlers.setInspectStatus(instance, `Platform switched to ${platformLabels[platform]}.`, 'default');
      handlers.rerenderFromState(instance);
    });
    platformToggle.appendChild(btn);
  });

  header.append(titleWrap, platformToggle);
  return header;
}

function appendInspectActionControls(options: RenderMobileInspectWorkbenchOptions, section: HTMLElement): void {
  const { instance, report, platformLabels, handlers } = options;
  const inspect = instance.inspectState;
  const actionRow = document.createElement('div');
  actionRow.className = 'mobile-surface-inspect-actions';

  const launchBtn = document.createElement('button');
  launchBtn.type = 'button';
  launchBtn.className = 'mobile-surface-refresh-btn';
  launchBtn.textContent = inspect.launching ? 'Launching…' : `Launch ${platformLabels[inspect.platform]}`;
  launchBtn.disabled = inspect.launching || inspect.capturing || inspect.inspectingPoint || inspect.interacting || hasBlockingChecks(report, inspect.platform);
  launchBtn.addEventListener('click', async () => {
    const api = window.calder?.mobileInspect;
    if (!api) {
      handlers.setInspectStatus(instance, 'Mobile inspect API is unavailable in this build.', 'error');
      handlers.rerenderFromState(instance);
      return;
    }

    handlers.stopInspectLiveMode(instance);
    inspect.launching = true;
    inspect.sendError = '';
    handlers.setInspectStatus(instance, `Launching ${platformLabels[inspect.platform]}…`, 'default');
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
  captureBtn.disabled = inspect.launching || inspect.capturing || inspect.inspectingPoint || inspect.interacting || hasBlockingChecks(report, inspect.platform);
  captureBtn.addEventListener('click', () => {
    void handlers.captureInspectFrame(instance, 'manual');
  });

  const liveBtn = document.createElement('button');
  liveBtn.type = 'button';
  liveBtn.className = 'mobile-surface-refresh-btn';
  liveBtn.textContent = inspect.liveMode ? 'Stop live' : 'Start live';
  liveBtn.disabled = inspect.launching || inspect.inspectingPoint || inspect.interacting || hasBlockingChecks(report, inspect.platform);
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
  tapSelectedBtn.disabled = !inspect.selectedPoint
    || inspect.launching
    || inspect.capturing
    || inspect.inspectingPoint
    || inspect.interacting
    || hasBlockingChecks(report, inspect.platform);
  tapSelectedBtn.addEventListener('click', async () => {
    const selectedPoint = inspect.selectedPoint;
    if (!selectedPoint) {
      handlers.setInspectStatus(instance, 'Pick a point on the screenshot first.', 'default');
      handlers.rerenderFromState(instance);
      return;
    }

    const api = window.calder?.mobileInspect;
    if (!api) {
      handlers.setInspectStatus(instance, 'Mobile inspect API is unavailable in this build.', 'error');
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
      const result: MobileInspectInteractionResult = await api.interact(inspect.platform, selectedPoint.x, selectedPoint.y);
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

export function renderMobileInspectWorkbench(options: RenderMobileInspectWorkbenchOptions): HTMLElement {
  const { instance, report, platformLabels, handlers } = options;
  const inspect = instance.inspectState;
  const blockingChecks = getBlockingChecks(report, inspect.platform);
  const section = document.createElement('section');
  section.className = 'mobile-surface-group mobile-surface-inspect-group';
  section.appendChild(renderInspectWorkbenchHeader(options));
  appendInspectActionControls(options, section);

  const status = document.createElement('div');
  status.className = 'mobile-surface-inspect-status';
  status.dataset.tone = inspect.tone;
  status.textContent = inspect.message;
  section.appendChild(status);

  const interactionHint = document.createElement('div');
  interactionHint.className = 'mobile-surface-inspect-hint';
  interactionHint.textContent = getInspectInteractionHint();
  section.appendChild(interactionHint);

  section.appendChild(renderInspectCapabilityPanel(inspect.platform, platformLabels));
  const blockerPanel = buildMobileInspectBlockingPanel({
    checks: blockingChecks,
    renderCheckRow: (check) => buildMobileDependencyCheckRow({
      instance,
      check,
      isInspectBusy: handlers.isInspectBusy,
      setPaneStatus: handlers.setPaneStatus,
      setActionAvailability: handlers.setActionAvailability,
      refreshMobileSurfacePane: handlers.refreshMobileSurfacePane,
    }),
  });
  if (blockerPanel) section.appendChild(blockerPanel);

  section.appendChild(renderInspectPreviewPanel(options));
  appendInspectSendControls(options, section);
  return section;
}
