import type {
  MobileDependencyReport,
  MobileInspectPlatform,
  MobileInspectScreenshotResult,
} from '../../../shared/types/mobile.js';
import { appState } from '../../state.js';
import { appendAppliedContextToPrompt, buildAppliedContextSummary, formatAppliedContextTrace } from '../../project-context-prompt.js';
import { deliverSurfacePrompt } from '../surface-routing.js';
import type { ProviderId } from '../../types.js';
import { isInstallRunning } from './install-progress.js';
import {
  detectProjectProfile,
  getProfileScopedChecks,
  getProjectProfileLabel,
  getProjectProfileStatusPrefix,
  getScopedSummary,
  hasBlockingChecks,
} from './dependency-scoping.js';
import {
  appendMobileDependencyChecklistSection,
  buildMobileDependencyCheckRow,
  renderMobileScopedSummaryPanel,
} from './workbench-sections.js';
import { renderMobileInspectWorkbench } from './inspect-workbench.js';
import { buildMobileInspectPrompt, resolveMobileInspectPromptError } from './inspect-prompt.js';
import type { MobileSurfaceInspectState, MobileSurfacePaneInstance } from './types.js';

const panes = new Map<string, MobileSurfacePaneInstance>();
const MOBILE_PLATFORM_LABEL: Record<MobileInspectPlatform, string> = {
  ios: 'iOS Simulator',
  android: 'Android Emulator',
};

function defaultInspectState(): MobileSurfaceInspectState {
  return {
    platform: 'ios',
    launching: false,
    capturing: false,
    inspectingPoint: false,
    interacting: false,
    pointInspectToken: 0,
    liveMode: false,
    liveIntervalMs: 1200,
    liveLoopToken: 0,
    liveTimer: null,
    liveFrames: 0,
    liveLastFrameAt: null,
    message: 'Open a simulator and capture a frame to start element targeting.',
    tone: 'default',
    screenshot: null,
    selectedPoint: null,
    selectedElement: null,
    instruction: '',
    sendError: '',
    contextTrace: [],
  };
}

function buildMobileAppliedContext(projectId: string, providerId?: ProviderId) {
  return buildAppliedContextSummary(projectId, providerId);
}

function isInspectBusy(instance: MobileSurfacePaneInstance): boolean {
  return instance.inspectState.launching
    || instance.inspectState.capturing
    || instance.inspectState.inspectingPoint
    || instance.inspectState.interacting;
}

function setActionAvailability(instance: MobileSurfacePaneInstance): void {
  instance.refreshBtn.disabled = instance.loading || isInstallRunning(instance.installState) || isInspectBusy(instance);
}

function setPaneStatus(instance: MobileSurfacePaneInstance, text: string, tone: 'default' | 'success' | 'error' = 'default'): void {
  instance.statusEl.textContent = text;
  instance.statusEl.dataset.tone = tone;
}

function rerenderFromState(instance: MobileSurfacePaneInstance): void {
  if (!instance.lastReport) return;
  const inspectSection = renderInspectWorkbench(instance, instance.lastReport);
  const previousInspectSection = instance.bodyEl.querySelector<HTMLElement>('.mobile-surface-inspect-group');
  if (previousInspectSection) {
    previousInspectSection.replaceWith(inspectSection);
  } else {
    instance.bodyEl.prepend(inspectSection);
  }
  setActionAvailability(instance);
}

function setInspectStatus(
  instance: MobileSurfacePaneInstance,
  message: string,
  tone: 'default' | 'success' | 'error' = 'default',
): void {
  instance.inspectState.message = message;
  instance.inspectState.tone = tone;
}

function clearInspectLiveTimer(inspect: MobileSurfaceInspectState): void {
  if (inspect.liveTimer === null) return;
  window.clearTimeout(inspect.liveTimer);
  inspect.liveTimer = null;
}

function stopInspectLiveMode(
  instance: MobileSurfacePaneInstance,
  statusMessage?: string,
  tone: 'default' | 'success' | 'error' = 'default',
): void {
  const inspect = instance.inspectState;
  inspect.liveMode = false;
  inspect.liveLoopToken += 1;
  clearInspectLiveTimer(inspect);
  if (statusMessage) {
    setInspectStatus(instance, statusMessage, tone);
  }
}

async function captureInspectFrame(
  instance: MobileSurfacePaneInstance,
  source: 'manual' | 'live',
): Promise<boolean> {
  const inspect = instance.inspectState;
  const api = window.calder?.mobileInspect;
  if (!api) {
    setInspectStatus(instance, 'Mobile inspect API is unavailable in this build.', 'error');
    rerenderFromState(instance);
    return false;
  }

  if (inspect.capturing) return false;
  inspect.capturing = true;
  inspect.sendError = '';
  if (source === 'manual') {
    inspect.contextTrace = [];
    setInspectStatus(instance, `Capturing ${MOBILE_PLATFORM_LABEL[inspect.platform]} screenshot…`, 'default');
  }
  rerenderFromState(instance);

  try {
    const result: MobileInspectScreenshotResult = await api.captureScreenshot(inspect.platform);
    if (result.success && result.dataUrl) {
      inspect.screenshot = result;
      inspect.liveFrames += 1;
      inspect.liveLastFrameAt = result.capturedAt ?? new Date().toISOString();
      // Keep selected point; clear resolved hierarchy because frame changed.
      inspect.selectedElement = null;
      inspect.pointInspectToken += 1;
      if (source === 'manual') {
        inspect.selectedPoint = null;
      }
    }
    if (!result.success) {
      setInspectStatus(instance, result.message, 'error');
    } else if (source === 'manual') {
      setInspectStatus(instance, result.message, 'success');
    }
    return result.success;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Screenshot capture failed.';
    setInspectStatus(instance, message, 'error');
    return false;
  } finally {
    inspect.capturing = false;
    rerenderFromState(instance);
  }
}

function scheduleInspectLiveLoop(instance: MobileSurfacePaneInstance): void {
  const inspect = instance.inspectState;
  clearInspectLiveTimer(inspect);
  if (!inspect.liveMode) return;
  const token = inspect.liveLoopToken;
  inspect.liveTimer = window.setTimeout(async () => {
    if (!inspect.liveMode || inspect.liveLoopToken !== token) return;
    if (
      instance.loading
      || isInstallRunning(instance.installState)
      || inspect.launching
      || inspect.inspectingPoint
      || inspect.interacting
      || inspect.capturing
    ) {
      scheduleInspectLiveLoop(instance);
      return;
    }

    const ok = await captureInspectFrame(instance, 'live');
    if (!ok && inspect.liveMode && inspect.liveLoopToken === token) {
      // Keep loop alive; transient failures are common during boot transitions.
      setInspectStatus(instance, 'Live frame capture failed. Retrying…', 'error');
      rerenderFromState(instance);
    }
    if (!inspect.liveMode || inspect.liveLoopToken !== token) return;
    scheduleInspectLiveLoop(instance);
  }, Math.max(400, inspect.liveIntervalMs));
}

async function startInspectLiveMode(instance: MobileSurfacePaneInstance): Promise<void> {
  const inspect = instance.inspectState;
  if (inspect.liveMode) return;
  inspect.liveMode = true;
  inspect.liveLoopToken += 1;
  inspect.liveFrames = 0;
  inspect.liveLastFrameAt = null;
  setInspectStatus(instance, 'Embedded live view started.', 'success');
  rerenderFromState(instance);

  await captureInspectFrame(instance, 'live');
  if (!inspect.liveMode) return;
  scheduleInspectLiveLoop(instance);
}

export async function sendInspectToSelectedSession(instance: MobileSurfacePaneInstance): Promise<void> {
  const prompt = buildMobileInspectPrompt({
    inspectState: instance.inspectState,
    platformLabel: MOBILE_PLATFORM_LABEL[instance.inspectState.platform],
  });
  if (!prompt) {
    instance.inspectState.sendError = resolveMobileInspectPromptError(instance.inspectState);
    rerenderFromState(instance);
    return;
  }

  const target = appState.resolveSurfaceTargetSession(instance.projectId, { requireExplicitTarget: true });
  if (!target) {
    instance.inspectState.sendError = 'Select an open session target first.';
    rerenderFromState(instance);
    return;
  }

  const appliedContext = buildMobileAppliedContext(instance.projectId, target.providerId ?? 'claude');
  instance.inspectState.contextTrace = formatAppliedContextTrace(appliedContext);
  const routedPrompt = appendAppliedContextToPrompt(prompt, appliedContext);

  const result = await deliverSurfacePrompt(instance.projectId, routedPrompt);
  if (!result.ok) {
    instance.inspectState.sendError = result.error ?? 'Failed to deliver prompt.';
    rerenderFromState(instance);
    return;
  }

  instance.inspectState.sendError = '';
  setInspectStatus(instance, `Prompt sent to ${target.name}.`, 'success');
  rerenderFromState(instance);
}

export function renderInspectWorkbench(instance: MobileSurfacePaneInstance, report: MobileDependencyReport): HTMLElement {
  return renderMobileInspectWorkbench({
    instance,
    report,
    platformLabels: MOBILE_PLATFORM_LABEL,
    handlers: {
      stopInspectLiveMode,
      rerenderFromState,
      setInspectStatus,
      captureInspectFrame,
      startInspectLiveMode,
      sendInspectToSelectedSession,
      isInspectBusy,
      setPaneStatus,
      setActionAvailability,
      refreshMobileSurfacePane,
    },
  });
}

function renderReport(instance: MobileSurfacePaneInstance, report: MobileDependencyReport): void {
  instance.lastReport = report;
  if (instance.inspectState.liveMode && hasBlockingChecks(report, instance.inspectState.platform)) {
    stopInspectLiveMode(instance, 'Live view paused until required dependencies are ready.', 'error');
  }
  instance.summaryEl.innerHTML = '';
  instance.bodyEl.innerHTML = '';
  const scopedSummary = getScopedSummary(report, instance.projectProfile);
  instance.summaryEl.appendChild(renderMobileScopedSummaryPanel({
    scopeLabel: getProjectProfileLabel(instance.projectProfile).replace('Project profile: ', ''),
    summary: scopedSummary,
  }));

  instance.bodyEl.appendChild(renderInspectWorkbench(instance, report));
  appendMobileDependencyChecklistSection({
    container: instance.bodyEl,
    checks: getProfileScopedChecks(report, instance.projectProfile),
    renderCheckRow: (check) => buildMobileDependencyCheckRow({
      instance,
      check,
      isInspectBusy,
      setPaneStatus,
      setActionAvailability,
      refreshMobileSurfacePane,
    }),
  });
  setActionAvailability(instance);
}

function ensureMobileSurfacePane(projectId: string): MobileSurfacePaneInstance {
  const existing = panes.get(projectId);
  if (existing) return existing;

  const el = document.createElement('div');
  el.className = 'mobile-surface-pane hidden';
  el.dataset.projectId = projectId;

  const header = document.createElement('header');
  header.className = 'mobile-surface-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'mobile-surface-title-wrap';

  const title = document.createElement('h2');
  title.className = 'mobile-surface-title';
  title.textContent = 'Mobile Surface';

  const subtitle = document.createElement('p');
  subtitle.className = 'mobile-surface-subtitle';
  subtitle.textContent = 'iOS + Android simulator readiness and install actions.';

  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  const actions = document.createElement('div');
  actions.className = 'mobile-surface-actions';

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'mobile-surface-refresh-btn';
  refreshBtn.textContent = 'Refresh checks';
  actions.appendChild(refreshBtn);

  header.appendChild(titleWrap);
  header.appendChild(actions);

  const statusEl = document.createElement('div');
  statusEl.className = 'mobile-surface-status';
  statusEl.textContent = 'Checking mobile automation requirements…';

  const summaryEl = document.createElement('div');
  summaryEl.className = 'mobile-surface-summary-wrap';

  const progressEl = document.createElement('div');
  progressEl.className = 'mobile-surface-progress-wrap hidden';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'mobile-surface-body';

  el.appendChild(header);
  el.appendChild(statusEl);
  el.appendChild(summaryEl);
  el.appendChild(progressEl);
  el.appendChild(bodyEl);

  const instance: MobileSurfacePaneInstance = {
    projectId,
    el,
    statusEl,
    summaryEl,
    progressEl,
    bodyEl,
    refreshBtn,
    loadToken: 0,
    loading: false,
    installState: null,
    lastReport: null,
    lastRefreshedAtMs: 0,
    inspectState: defaultInspectState(),
    projectProfile: 'unknown',
    autoDetectedPlatform: null,
  };

  refreshBtn.addEventListener('click', () => {
    void refreshMobileSurfacePane(projectId, true);
  });

  panes.set(projectId, instance);
  return instance;
}

export async function refreshMobileSurfacePane(projectId: string, force = false): Promise<void> {
  const instance = ensureMobileSurfacePane(projectId);
  if (instance.loading && !force) return;
  const api = window.calder?.mobileSetup;
  if (!api) {
    setPaneStatus(instance, 'Mobile setup API is unavailable in this build.', 'error');
    return;
  }

  instance.loading = true;
  const token = ++instance.loadToken;
  setActionAvailability(instance);
  setPaneStatus(instance, 'Checking mobile automation requirements…');

  try {
    const detectedProfile = await detectProjectProfile(projectId);
    if (token !== instance.loadToken) return;
    instance.projectProfile = detectedProfile;

    if (
      (detectedProfile === 'ios' || detectedProfile === 'android')
      && instance.autoDetectedPlatform === null
      && !instance.inspectState.screenshot
      && !instance.inspectState.liveMode
      && !instance.inspectState.launching
      && !instance.inspectState.capturing
      && !instance.inspectState.inspectingPoint
      && !instance.inspectState.interacting
    ) {
      instance.inspectState.platform = detectedProfile;
      instance.autoDetectedPlatform = detectedProfile;
      setInspectStatus(instance, `Platform auto-selected from project profile: ${MOBILE_PLATFORM_LABEL[detectedProfile]}.`, 'default');
    }

    const report = await api.checkDependencies();
    if (token !== instance.loadToken) return;
    renderReport(instance, report);
    instance.lastRefreshedAtMs = Date.now();
    const scopedSummary = getScopedSummary(report, instance.projectProfile);
    const scopePrefix = getProjectProfileStatusPrefix(instance.projectProfile);
    if (scopedSummary.requiredMissing === 0 && scopedSummary.warnings === 0) {
      setPaneStatus(instance, `${scopePrefix} is ready.`, 'success');
    } else {
      setPaneStatus(instance, `${scopePrefix} needs attention before inspect flows.`, 'error');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mobile checks failed.';
    setPaneStatus(instance, message, 'error');
  } finally {
    if (token === instance.loadToken) {
      instance.loading = false;
      setActionAvailability(instance);
    }
  }
}

export function attachMobileSurfacePane(projectId: string, container: HTMLElement): void {
  const instance = ensureMobileSurfacePane(projectId);
  if (instance.el.parentElement !== container) {
    container.appendChild(instance.el);
  }
}

export function hideAllMobileSurfacePanes(): void {
  for (const instance of panes.values()) {
    stopInspectLiveMode(instance);
    instance.el.classList.add('hidden');
    instance.el.classList.remove('split');
  }
}

export function showMobileSurfacePane(projectId: string): void {
  const instance = ensureMobileSurfacePane(projectId);
  instance.el.classList.remove('hidden');
  instance.el.classList.add('split');
  const needsRefresh = !instance.lastReport || (Date.now() - instance.lastRefreshedAtMs) > 60_000;
  if (needsRefresh) {
    void refreshMobileSurfacePane(projectId);
  }
}
