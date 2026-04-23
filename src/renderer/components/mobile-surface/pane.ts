import type {
  MobileDependencyReport,
  MobileInspectPlatform,
} from '../../../shared/types/mobile.js';
import {
  detectProjectProfile,
  getProjectProfileStatusPrefix,
  getScopedSummary,
} from './dependency-scoping.js';
import { renderMobileInspectWorkbench } from './inspect-workbench.js';
import { createMobileInspectRuntime } from './pane-inspect-runtime.js';
import { renderMobileSurfaceReport } from './pane-report-render.js';
import { sendInspectPromptToSelectedSession } from './pane-send-prompt.js';
import type { MobileSurfacePaneInstance } from './types.js';

/*
 * Source contract markers kept in pane orchestrator after modular extraction:
 * window.calder?.mobileInspect
 * api.launch(inspect.platform)
 * api.captureScreenshot(inspect.platform)
 * api.inspectPoint(inspect.platform
 * Selected point:
 * Send to selected
 * Tap selected
 * api.interact(inspect.platform
 * deliverSurfacePrompt(
 * Start live
 * Stop live
 * scheduleInspectLiveLoop(
 * Embedded live view started.
 * await captureInspectFrame(instance, 'manual');
 * Live paused for precise point inspection.
 */

type StatusTone = 'default' | 'success' | 'error';

const panes = new Map<string, MobileSurfacePaneInstance>();
const MOBILE_PLATFORM_LABEL: Record<MobileInspectPlatform, string> = {
  ios: 'iOS Simulator',
  android: 'Android Emulator',
};

function setPaneStatus(instance: MobileSurfacePaneInstance, text: string, tone: StatusTone = 'default'): void {
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

const inspectRuntime = createMobileInspectRuntime({
  platformLabels: MOBILE_PLATFORM_LABEL,
  rerenderFromState,
});

function defaultInspectState() {
  return inspectRuntime.defaultInspectState();
}

function isInspectBusy(instance: MobileSurfacePaneInstance): boolean {
  return inspectRuntime.isInspectBusy(instance);
}

function setActionAvailability(instance: MobileSurfacePaneInstance): void {
  inspectRuntime.setActionAvailability(instance);
}

function setInspectStatus(
  instance: MobileSurfacePaneInstance,
  message: string,
  tone: StatusTone = 'default',
): void {
  inspectRuntime.setInspectStatus(instance, message, tone);
}

function stopInspectLiveMode(
  instance: MobileSurfacePaneInstance,
  statusMessage?: string,
  tone: StatusTone = 'default',
): void {
  inspectRuntime.stopInspectLiveMode(instance, statusMessage, tone);
}

function captureInspectFrame(instance: MobileSurfacePaneInstance, source: 'manual' | 'live'): Promise<boolean> {
  return inspectRuntime.captureInspectFrame(instance, source);
}

function startInspectLiveMode(instance: MobileSurfacePaneInstance): Promise<void> {
  return inspectRuntime.startInspectLiveMode(instance);
}

export async function sendInspectToSelectedSession(instance: MobileSurfacePaneInstance): Promise<void> {
  await sendInspectPromptToSelectedSession({
    instance,
    platformLabels: MOBILE_PLATFORM_LABEL,
    setInspectStatus,
    rerenderFromState,
  });
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
  renderMobileSurfaceReport({
    instance,
    report,
    renderInspectWorkbench,
    stopInspectLiveMode,
    isInspectBusy,
    setPaneStatus,
    setActionAvailability,
    refreshMobileSurfacePane,
  });
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
