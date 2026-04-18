import type {
  MobileDependencyCheck,
  MobileDependencyId,
  MobileDependencyInstallProgressEvent,
  MobileDependencyReport,
  MobileInspectInteractionResult,
  MobileInspectLaunchResult,
  MobileInspectPlatform,
  MobileInspectPointInspectionResult,
  MobileInspectScreenshotResult,
} from '../../../shared/types.js';
import { appState } from '../../state.js';
import { appendAppliedContextToPrompt, buildAppliedContextSummary, formatAppliedContextTrace } from '../../project-context-prompt.js';
import { deliverSurfacePrompt } from '../surface-routing.js';
import type { ProviderId } from '../../types.js';

interface MobileSurfaceInstallState {
  installId: string;
  dependencyId: MobileDependencyId;
  dependencyLabel: string;
  phase: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt?: string;
  percent: number;
  stepIndex?: number;
  totalSteps?: number;
  stepPercent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  remainingBytes?: number;
  command?: string;
  message?: string;
  detail?: string;
  logs: string[];
}

interface MobileSurfaceInspectPoint {
  x: number;
  y: number;
  normalizedX: number;
  normalizedY: number;
}

interface MobileSurfaceInspectState {
  platform: MobileInspectPlatform;
  launching: boolean;
  capturing: boolean;
  inspectingPoint: boolean;
  interacting: boolean;
  pointInspectToken: number;
  liveMode: boolean;
  liveIntervalMs: number;
  liveLoopToken: number;
  liveTimer: number | null;
  liveFrames: number;
  liveLastFrameAt: string | null;
  message: string;
  tone: 'default' | 'success' | 'error';
  screenshot: MobileInspectScreenshotResult | null;
  selectedPoint: MobileSurfaceInspectPoint | null;
  selectedElement: MobileInspectPointInspectionResult | null;
  instruction: string;
  sendError: string;
  contextTrace: string[];
}

interface MobileSurfacePaneInstance {
  projectId: string;
  el: HTMLDivElement;
  statusEl: HTMLDivElement;
  summaryEl: HTMLDivElement;
  progressEl: HTMLDivElement;
  bodyEl: HTMLDivElement;
  refreshBtn: HTMLButtonElement;
  loadToken: number;
  loading: boolean;
  installState: MobileSurfaceInstallState | null;
  installProgressCleanup?: () => void;
  lastReport: MobileDependencyReport | null;
  lastRefreshedAtMs: number;
  inspectState: MobileSurfaceInspectState;
  projectProfile: MobileProjectProfile;
  autoDetectedPlatform: MobileInspectPlatform | null;
}

const panes = new Map<string, MobileSurfacePaneInstance>();
const MAX_INSTALL_LOG_LINES = 8;
const MOBILE_PLATFORM_LABEL: Record<MobileInspectPlatform, string> = {
  ios: 'iOS Simulator',
  android: 'Android Emulator',
};
type MobileProjectProfile = 'ios' | 'android' | 'cross' | 'unknown';

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

function normalizePathEntry(entry: string): string {
  return entry.replace(/\\/g, '/').toLowerCase();
}

function includesAnyPath(entries: string[], patterns: string[]): boolean {
  return entries.some((entry) => {
    const normalized = normalizePathEntry(entry);
    return patterns.some((pattern) => normalized.includes(pattern));
  });
}

function deriveProjectProfileFromFileMatches(matches: Record<string, string[]>): MobileProjectProfile {
  const iosEntries = [
    ...matches.xcodeproj,
    ...matches.xcworkspace,
    ...matches.pbxproj,
    ...matches.swiftPackage,
  ];
  const androidEntries = [
    ...matches.androidManifest,
    ...matches.gradleBuild,
    ...matches.gradleSettings,
    ...matches.androidDir,
  ];

  const hasIosSignals = includesAnyPath(iosEntries, [
    '.xcodeproj',
    '.xcworkspace',
    'project.pbxproj',
    'package.swift',
    '/ios/',
  ]);
  const hasAndroidSignals = includesAnyPath(androidEntries, [
    'androidmanifest.xml',
    'build.gradle',
    'build.gradle.kts',
    'settings.gradle',
    'settings.gradle.kts',
    '/android/',
  ]);

  if (hasIosSignals && hasAndroidSignals) return 'cross';
  if (hasIosSignals) return 'ios';
  if (hasAndroidSignals) return 'android';
  return 'unknown';
}

async function detectProjectProfile(projectId: string): Promise<MobileProjectProfile> {
  const project = appState.projects.find((entry) => entry.id === projectId);
  if (!project) return 'unknown';
  const fsApi = window.calder?.fs;
  if (!fsApi) return 'unknown';

  const safeList = async (query: string): Promise<string[]> => {
    try {
      return await fsApi.listFiles(project.path, query);
    } catch {
      return [];
    }
  };

  const [
    xcodeproj,
    xcworkspace,
    pbxproj,
    swiftPackage,
    androidManifest,
    gradleBuild,
    gradleSettings,
    androidDir,
  ] = await Promise.all([
    safeList('.xcodeproj'),
    safeList('.xcworkspace'),
    safeList('project.pbxproj'),
    safeList('Package.swift'),
    safeList('AndroidManifest.xml'),
    safeList('build.gradle'),
    safeList('settings.gradle'),
    safeList('android'),
  ]);

  return deriveProjectProfileFromFileMatches({
    xcodeproj,
    xcworkspace,
    pbxproj,
    swiftPackage,
    androidManifest,
    gradleBuild,
    gradleSettings,
    androidDir,
  });
}

function getProfileScopedChecks(report: MobileDependencyReport, profile: MobileProjectProfile): MobileDependencyCheck[] {
  if (profile === 'ios') {
    return report.checks.filter((check) => check.requiredFor.includes('ios'));
  }
  if (profile === 'android') {
    return report.checks.filter((check) => check.requiredFor.includes('android'));
  }
  return report.checks;
}

function getScopedSummary(report: MobileDependencyReport, profile: MobileProjectProfile): {
  ready: number;
  warnings: number;
  requiredMissing: number;
} {
  const scopedChecks = getProfileScopedChecks(report, profile);
  return {
    ready: scopedChecks.filter((check) => check.status === 'ready').length,
    warnings: scopedChecks.filter((check) => check.status === 'warning').length,
    requiredMissing: scopedChecks.filter((check) => (
      check.requiredFor.length > 0
      && (check.status === 'missing' || check.status === 'unsupported')
    )).length,
  };
}

function getProjectProfileLabel(profile: MobileProjectProfile): string {
  if (profile === 'ios') return 'Project profile: iOS app';
  if (profile === 'android') return 'Project profile: Android app';
  if (profile === 'cross') return 'Project profile: iOS + Android';
  return 'Project profile: unknown';
}

function getProjectProfileStatusPrefix(profile: MobileProjectProfile): string {
  if (profile === 'ios') return 'iOS mobile surface';
  if (profile === 'android') return 'Android mobile surface';
  if (profile === 'cross') return 'Cross-platform mobile surface';
  return 'Mobile surface';
}

function buildMobileAppliedContext(projectId: string, providerId?: ProviderId) {
  return buildAppliedContextSummary(projectId, providerId);
}

function hasBlockingChecks(report: MobileDependencyReport, platform: MobileInspectPlatform): boolean {
  return report.checks.some((entry) => (
    entry.requiredFor.includes(platform)
    && (entry.status === 'missing' || entry.status === 'unsupported')
  ));
}

function getBlockingChecks(report: MobileDependencyReport, platform: MobileInspectPlatform): MobileDependencyCheck[] {
  return report.checks.filter((entry) => (
    entry.requiredFor.includes(platform)
    && (entry.status === 'missing' || entry.status === 'unsupported')
  ));
}

function formatPointLabel(point: MobileSurfaceInspectPoint): string {
  return `x=${point.x}, y=${point.y} (${Math.round(point.normalizedX * 100)}% × ${Math.round(point.normalizedY * 100)}%)`;
}

function formatCaptureMeta(result: MobileInspectScreenshotResult): string {
  const parts: string[] = [];
  if (typeof result.width === 'number' && typeof result.height === 'number') {
    parts.push(`${result.width}×${result.height}`);
  }
  if (result.deviceName) {
    parts.push(result.deviceName);
  } else if (result.deviceId) {
    parts.push(result.deviceId);
  }
  return parts.join(' · ');
}

function getInspectInteractionHint(): string {
  return appState.preferences.language === 'tr'
    ? 'Bu panel anlık görüntü tabanlıdır: tıklama, simülatörü sürmek yerine eleman tespiti yapar.'
    : 'This panel is snapshot-based: click to inspect elements, not to drive simulator UI.';
}

function createInstallId(projectId: string, dependencyId: MobileDependencyId): string {
  return `mobile-surface-${projectId}-${dependencyId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number): string {
  return `${Math.round(clampPercent(value))}%`;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusLabel(check: MobileDependencyCheck): string {
  if (check.status === 'ready') return 'Ready';
  if (check.status === 'warning') return 'Needs attention';
  if (check.status === 'unsupported') return 'Unsupported';
  return 'Not found';
}

function isInstallable(check: MobileDependencyCheck): boolean {
  return check.autoFixAvailable && check.status !== 'ready' && check.status !== 'unsupported';
}

function isInstallRunning(instance: MobileSurfacePaneInstance): boolean {
  return instance.installState?.phase === 'running';
}

function isInspectBusy(instance: MobileSurfacePaneInstance): boolean {
  return instance.inspectState.launching
    || instance.inspectState.capturing
    || instance.inspectState.inspectingPoint
    || instance.inspectState.interacting;
}

function setActionAvailability(instance: MobileSurfacePaneInstance): void {
  instance.refreshBtn.disabled = instance.loading || isInstallRunning(instance) || isInspectBusy(instance);
}

function setPaneStatus(instance: MobileSurfacePaneInstance, text: string, tone: 'default' | 'success' | 'error' = 'default'): void {
  instance.statusEl.textContent = text;
  instance.statusEl.dataset.tone = tone;
}

function pushInstallLog(state: MobileSurfaceInstallState, line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (state.logs[state.logs.length - 1] === trimmed) return;
  state.logs.push(trimmed);
  while (state.logs.length > MAX_INSTALL_LOG_LINES) {
    state.logs.shift();
  }
}

function renderInstallProgress(instance: MobileSurfacePaneInstance): void {
  const state = instance.installState;
  instance.progressEl.innerHTML = '';
  if (!state) {
    instance.progressEl.classList.add('hidden');
    return;
  }
  instance.progressEl.classList.remove('hidden');

  const panel = document.createElement('section');
  panel.className = `mobile-surface-install-panel phase-${state.phase}`;

  const header = document.createElement('div');
  header.className = 'mobile-surface-install-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'mobile-surface-install-title-wrap';
  const title = document.createElement('div');
  title.className = 'mobile-surface-install-title';
  title.textContent = `${state.dependencyLabel} · Install progress`;
  const subtitle = document.createElement('div');
  subtitle.className = 'mobile-surface-install-subtitle';
  subtitle.textContent = state.phase === 'running'
    ? 'Installing dependency and collecting diagnostics…'
    : state.phase === 'success'
      ? 'Install completed.'
      : 'Install failed.';
  titleWrap.append(title, subtitle);

  const phasePill = document.createElement('span');
  phasePill.className = `mobile-surface-install-phase is-${state.phase}`;
  phasePill.textContent = state.phase === 'running' ? 'RUNNING' : state.phase === 'success' ? 'DONE' : 'FAILED';

  header.append(titleWrap, phasePill);
  panel.appendChild(header);

  const barWrap = document.createElement('div');
  barWrap.className = 'mobile-surface-install-bar';
  const barFill = document.createElement('span');
  barFill.className = 'mobile-surface-install-bar-fill';
  barFill.style.width = `${clampPercent(state.percent)}%`;
  barWrap.appendChild(barFill);
  panel.appendChild(barWrap);

  const metrics = document.createElement('div');
  metrics.className = 'mobile-surface-install-metrics';

  const progressPill = document.createElement('span');
  progressPill.className = 'mobile-surface-install-metric';
  progressPill.textContent = `Progress: ${formatPercent(state.percent)}`;
  metrics.appendChild(progressPill);

  if (typeof state.stepIndex === 'number' && typeof state.totalSteps === 'number') {
    const stepPill = document.createElement('span');
    stepPill.className = 'mobile-surface-install-metric';
    stepPill.textContent = `Step: ${state.stepIndex}/${state.totalSteps}`;
    metrics.appendChild(stepPill);
  }

  if (typeof state.downloadedBytes === 'number') {
    const downloaded = document.createElement('span');
    downloaded.className = 'mobile-surface-install-metric';
    downloaded.textContent = `Downloaded: ${formatMegabytes(state.downloadedBytes)}`;
    metrics.appendChild(downloaded);
  }

  if (typeof state.remainingBytes === 'number') {
    const remaining = document.createElement('span');
    remaining.className = 'mobile-surface-install-metric';
    remaining.textContent = `Remaining: ${formatMegabytes(state.remainingBytes)}`;
    metrics.appendChild(remaining);
  }

  if (typeof state.stepPercent === 'number') {
    const stepPercent = document.createElement('span');
    stepPercent.className = 'mobile-surface-install-metric';
    stepPercent.textContent = `Step progress: ${formatPercent(state.stepPercent)}`;
    metrics.appendChild(stepPercent);
  }

  panel.appendChild(metrics);

  if (state.command) {
    const command = document.createElement('div');
    command.className = 'mobile-surface-install-command';
    command.textContent = `Command: ${state.command}`;
    panel.appendChild(command);
  }

  if (state.message) {
    const message = document.createElement('div');
    message.className = 'mobile-surface-install-message';
    message.textContent = state.message;
    panel.appendChild(message);
  }

  if (state.detail && state.detail.trim().length > 0) {
    const detail = document.createElement('div');
    detail.className = 'mobile-surface-install-detail';
    detail.textContent = state.detail;
    panel.appendChild(detail);
  }

  if (state.logs.length > 0) {
    const logList = document.createElement('ul');
    logList.className = 'mobile-surface-install-log-list';
    for (const logLine of state.logs) {
      const item = document.createElement('li');
      item.className = 'mobile-surface-install-log-item';
      item.textContent = logLine;
      logList.appendChild(item);
    }
    panel.appendChild(logList);
  }

  instance.progressEl.appendChild(panel);
}

function applyInstallProgressEvent(instance: MobileSurfacePaneInstance, event: MobileDependencyInstallProgressEvent): void {
  const state = instance.installState;
  if (!state || state.installId !== event.installId) return;

  if (typeof event.percent === 'number') state.percent = clampPercent(event.percent);
  if (typeof event.stepIndex === 'number') state.stepIndex = event.stepIndex;
  if (typeof event.totalSteps === 'number') state.totalSteps = event.totalSteps;
  if (typeof event.stepPercent === 'number') state.stepPercent = clampPercent(event.stepPercent);
  if (typeof event.downloadedBytes === 'number') state.downloadedBytes = Math.max(0, event.downloadedBytes);
  if (typeof event.totalBytes === 'number') state.totalBytes = Math.max(0, event.totalBytes);
  if (typeof event.remainingBytes === 'number') state.remainingBytes = Math.max(0, event.remainingBytes);
  if (event.command) state.command = event.command;
  if (event.message) state.message = event.message;
  if (event.detail) {
    state.detail = event.detail;
    pushInstallLog(state, event.detail);
  }

  if (event.phase === 'finished') {
    state.phase = 'success';
    state.percent = 100;
    state.finishedAt = event.finishedAt || new Date().toISOString();
  } else if (event.phase === 'failed') {
    state.phase = 'failed';
    state.finishedAt = event.finishedAt || new Date().toISOString();
  } else if (event.phase === 'started' || event.phase === 'step_started' || event.phase === 'step_progress' || event.phase === 'step_finished') {
    state.phase = 'running';
  }

  renderInstallProgress(instance);
  setActionAvailability(instance);
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
      || isInstallRunning(instance)
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

function buildInspectPrompt(instance: MobileSurfacePaneInstance): string | null {
  const inspect = instance.inspectState;
  if (!inspect.screenshot || !inspect.screenshot.success || !inspect.screenshot.dataUrl) return null;
  if (!inspect.selectedPoint) return null;
  const instruction = inspect.instruction.trim();
  if (!instruction) return null;

  const lines = [
    `Mobile inspect task (${MOBILE_PLATFORM_LABEL[inspect.platform]}).`,
    `Selected point: ${formatPointLabel(inspect.selectedPoint)}.`,
  ];
  if (typeof inspect.screenshot.width === 'number' && typeof inspect.screenshot.height === 'number') {
    lines.push(`Screenshot size: ${inspect.screenshot.width}x${inspect.screenshot.height}.`);
  }
  if (inspect.screenshot.deviceName) {
    lines.push(`Device: ${inspect.screenshot.deviceName}.`);
  } else if (inspect.screenshot.deviceId) {
    lines.push(`Device id: ${inspect.screenshot.deviceId}.`);
  }
  if (inspect.screenshot.capturedAt) {
    lines.push(`Capture timestamp: ${inspect.screenshot.capturedAt}.`);
  }
  if (inspect.selectedElement?.success && inspect.selectedElement.element) {
    const element = inspect.selectedElement.element;
    const elementParts: string[] = [];
    if (element.className) elementParts.push(`class=${element.className}`);
    if (element.resourceId) elementParts.push(`resourceId=${element.resourceId}`);
    if (element.contentDesc) elementParts.push(`contentDesc=${element.contentDesc}`);
    if (element.text) elementParts.push(`text=${element.text}`);
    if (element.bounds) {
      const { left, top, right, bottom } = element.bounds;
      elementParts.push(`bounds=[${left},${top}]-[${right},${bottom}]`);
    }
    if (elementParts.length > 0) {
      lines.push(`Matched element: ${elementParts.join(', ')}.`);
    }
  }
  lines.push(`Instruction: ${instruction}`);
  return lines.join('\n');
}

function requireInspectPrompt(instance: MobileSurfacePaneInstance): string | null {
  const prompt = buildInspectPrompt(instance);
  if (prompt) return prompt;

  if (!instance.inspectState.screenshot?.dataUrl) {
    instance.inspectState.sendError = 'Capture a simulator frame first.';
  } else if (!instance.inspectState.selectedPoint) {
    instance.inspectState.sendError = 'Pick a point on the captured frame first.';
  } else if (!instance.inspectState.instruction.trim()) {
    instance.inspectState.sendError = 'Write an instruction before sending.';
  } else {
    instance.inspectState.sendError = 'Inspect prompt is incomplete.';
  }
  rerenderFromState(instance);
  return null;
}

async function sendInspectToSelectedSession(instance: MobileSurfacePaneInstance): Promise<void> {
  const prompt = requireInspectPrompt(instance);
  if (!prompt) return;

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

function renderInspectWorkbench(instance: MobileSurfacePaneInstance, report: MobileDependencyReport): HTMLElement {
  const inspect = instance.inspectState;
  const blockingChecks = getBlockingChecks(report, inspect.platform);
  const section = document.createElement('section');
  section.className = 'mobile-surface-group mobile-surface-inspect-group';

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
    btn.textContent = MOBILE_PLATFORM_LABEL[platform];
    const blocked = hasBlockingChecks(report, platform);
    btn.disabled = inspect.launching || inspect.capturing || inspect.inspectingPoint || inspect.interacting || blocked;
    if (blocked) {
      btn.title = `${MOBILE_PLATFORM_LABEL[platform]} has missing required dependencies below.`;
    }
    btn.addEventListener('click', () => {
      if (inspect.platform === platform || inspect.launching || inspect.capturing || inspect.inspectingPoint || inspect.interacting) return;
      stopInspectLiveMode(instance);
      inspect.platform = platform;
      inspect.screenshot = null;
      inspect.selectedPoint = null;
      inspect.selectedElement = null;
      inspect.inspectingPoint = false;
      inspect.interacting = false;
      inspect.pointInspectToken += 1;
      inspect.sendError = '';
      inspect.contextTrace = [];
      setInspectStatus(instance, `Platform switched to ${MOBILE_PLATFORM_LABEL[platform]}.`, 'default');
      rerenderFromState(instance);
    });
    platformToggle.appendChild(btn);
  });

  header.append(titleWrap, platformToggle);
  section.appendChild(header);

  const actionRow = document.createElement('div');
  actionRow.className = 'mobile-surface-inspect-actions';

  const launchBtn = document.createElement('button');
  launchBtn.type = 'button';
  launchBtn.className = 'mobile-surface-refresh-btn';
  launchBtn.textContent = inspect.launching ? 'Launching…' : `Launch ${MOBILE_PLATFORM_LABEL[inspect.platform]}`;
  launchBtn.disabled = inspect.launching || inspect.capturing || inspect.inspectingPoint || inspect.interacting || hasBlockingChecks(report, inspect.platform);
  launchBtn.addEventListener('click', async () => {
    const api = window.calder?.mobileInspect;
    if (!api) {
      setInspectStatus(instance, 'Mobile inspect API is unavailable in this build.', 'error');
      rerenderFromState(instance);
      return;
    }

    stopInspectLiveMode(instance);
    inspect.launching = true;
    inspect.sendError = '';
    setInspectStatus(instance, `Launching ${MOBILE_PLATFORM_LABEL[inspect.platform]}…`, 'default');
    rerenderFromState(instance);
    try {
      const result: MobileInspectLaunchResult = await api.launch(inspect.platform);
      setInspectStatus(instance, result.message, result.success ? 'success' : 'error');
      if (result.success) {
        await captureInspectFrame(instance, 'manual');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Launch command failed.';
      setInspectStatus(instance, message, 'error');
    } finally {
      inspect.launching = false;
      rerenderFromState(instance);
    }
  });

  const captureBtn = document.createElement('button');
  captureBtn.type = 'button';
  captureBtn.className = 'mobile-surface-refresh-btn';
  captureBtn.textContent = inspect.capturing ? 'Capturing…' : 'Capture frame';
  captureBtn.disabled = inspect.launching || inspect.capturing || inspect.inspectingPoint || inspect.interacting || hasBlockingChecks(report, inspect.platform);
  captureBtn.addEventListener('click', () => {
    void captureInspectFrame(instance, 'manual');
  });

  const liveBtn = document.createElement('button');
  liveBtn.type = 'button';
  liveBtn.className = 'mobile-surface-refresh-btn';
  liveBtn.textContent = inspect.liveMode ? 'Stop live' : 'Start live';
  liveBtn.disabled = inspect.launching || inspect.inspectingPoint || inspect.interacting || hasBlockingChecks(report, inspect.platform);
  liveBtn.addEventListener('click', () => {
    if (inspect.liveMode) {
      stopInspectLiveMode(instance, 'Embedded live view stopped.', 'default');
      rerenderFromState(instance);
      return;
    }
    void startInspectLiveMode(instance);
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
      setInspectStatus(instance, 'Pick a point on the screenshot first.', 'default');
      rerenderFromState(instance);
      return;
    }

    const api = window.calder?.mobileInspect;
    if (!api) {
      setInspectStatus(instance, 'Mobile inspect API is unavailable in this build.', 'error');
      rerenderFromState(instance);
      return;
    }

    if (inspect.liveMode) {
      stopInspectLiveMode(instance, 'Live paused before interaction.', 'default');
    }

    inspect.interacting = true;
    inspect.sendError = '';
    setInspectStatus(instance, 'Dispatching tap to selected point…', 'default');
    rerenderFromState(instance);
    try {
      const result: MobileInspectInteractionResult = await api.interact(inspect.platform, selectedPoint.x, selectedPoint.y);
      setInspectStatus(instance, result.message, result.success ? 'success' : 'error');
      if (result.success) {
        await captureInspectFrame(instance, 'live');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tap request failed.';
      setInspectStatus(instance, message, 'error');
    } finally {
      inspect.interacting = false;
      rerenderFromState(instance);
    }
  });

  actionRow.append(launchBtn, captureBtn, liveBtn, tapSelectedBtn);
  section.appendChild(actionRow);

  const status = document.createElement('div');
  status.className = 'mobile-surface-inspect-status';
  status.dataset.tone = inspect.tone;
  status.textContent = inspect.message;
  section.appendChild(status);

  const interactionHint = document.createElement('div');
  interactionHint.className = 'mobile-surface-inspect-hint';
  interactionHint.textContent = getInspectInteractionHint();
  section.appendChild(interactionHint);

  if (blockingChecks.length > 0) {
    const blockerPanel = document.createElement('div');
    blockerPanel.className = 'mobile-surface-inspect-blockers';

    const blockerTitle = document.createElement('div');
    blockerTitle.className = 'mobile-surface-inspect-blockers-title';
    blockerTitle.textContent = 'Blocking requirements';

    const blockerDesc = document.createElement('div');
    blockerDesc.className = 'mobile-surface-inspect-blockers-desc';
    blockerDesc.textContent = 'Install required dependencies below before launching this platform.';

    blockerPanel.append(blockerTitle, blockerDesc);
    for (const check of blockingChecks) {
      blockerPanel.appendChild(buildCheckRow(instance, check));
    }
    section.appendChild(blockerPanel);
  }

  const preview = document.createElement('div');
  preview.className = 'mobile-surface-inspect-preview';
  if (inspect.screenshot?.dataUrl) {
    const frame = document.createElement('div');
    frame.className = 'mobile-surface-inspect-frame';

    const image = document.createElement('img');
    image.className = 'mobile-surface-inspect-image';
    image.src = inspect.screenshot.dataUrl;
    image.alt = `${MOBILE_PLATFORM_LABEL[inspect.platform]} screenshot`;
    image.addEventListener('click', (event) => {
      if (inspect.interacting) return;
      if (inspect.liveMode) {
        stopInspectLiveMode(instance, 'Live paused for precise point inspection.', 'default');
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
      setInspectStatus(instance, 'Inspecting selected point…', 'default');
      rerenderFromState(instance);

      const api = window.calder?.mobileInspect;
      if (!api) {
        inspect.inspectingPoint = false;
        setInspectStatus(instance, 'Mobile inspect API is unavailable in this build.', 'error');
        rerenderFromState(instance);
        return;
      }

      const selectedPoint = inspect.selectedPoint;
      void (async () => {
        try {
          const result = await api.inspectPoint(inspect.platform, selectedPoint.x, selectedPoint.y);
          if (inspect.pointInspectToken !== inspectToken) return;
          inspect.selectedElement = result;
          if (result.success) {
            setInspectStatus(instance, result.message, 'success');
          } else {
            setInspectStatus(instance, result.message, 'default');
          }
        } catch (error) {
          if (inspect.pointInspectToken !== inspectToken) return;
          const message = error instanceof Error ? error.message : 'Point inspection failed.';
          inspect.selectedElement = null;
          setInspectStatus(instance, message, 'error');
        } finally {
          if (inspect.pointInspectToken !== inspectToken) return;
          inspect.inspectingPoint = false;
          rerenderFromState(instance);
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
  section.appendChild(preview);

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
    rerenderFromState(instance);
  });

  const sendSelectedBtn = document.createElement('button');
  sendSelectedBtn.type = 'button';
  sendSelectedBtn.className = 'mobile-surface-refresh-btn';
  sendSelectedBtn.textContent = 'Send to selected';
  const canSendPrompt = Boolean(inspect.selectedPoint && inspect.instruction.trim().length > 0);
  sendSelectedBtn.disabled = !currentTarget || !canSendPrompt || inspect.launching || inspect.capturing || inspect.inspectingPoint || inspect.interacting;
  sendSelectedBtn.addEventListener('click', () => {
    void sendInspectToSelectedSession(instance);
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

  return section;
}

function buildCheckRow(instance: MobileSurfacePaneInstance, check: MobileDependencyCheck): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'mobile-surface-check-row';

  const left = document.createElement('div');
  left.className = 'mobile-surface-check-main';

  const title = document.createElement('div');
  title.className = 'mobile-surface-check-title';
  title.textContent = check.label;

  const desc = document.createElement('div');
  desc.className = 'mobile-surface-check-desc';
  desc.textContent = check.description;

  left.appendChild(title);
  left.appendChild(desc);

  if (check.message || check.installHint) {
    const detail = document.createElement('div');
    detail.className = 'mobile-surface-check-detail';
    detail.textContent = [check.message, check.installHint].filter(Boolean).join(' ');
    left.appendChild(detail);
  }

  const right = document.createElement('div');
  right.className = 'mobile-surface-check-side';

  const status = document.createElement('span');
  status.className = `mobile-surface-check-status is-${check.status}`;
  status.textContent = getStatusLabel(check);
  right.appendChild(status);

  if (isInstallable(check)) {
    const installBtn = document.createElement('button');
    installBtn.type = 'button';
    installBtn.className = 'mobile-surface-install-btn';
    const runningState = instance.installState;
    const isActive = runningState?.phase === 'running' && runningState.dependencyId === check.id;
    installBtn.textContent = isActive ? 'Installing…' : 'Install';
    installBtn.disabled = isInstallRunning(instance) || isInspectBusy(instance);
    installBtn.addEventListener('click', async () => {
      if (isInstallRunning(instance) || isInspectBusy(instance)) return;
      const api = window.calder?.mobileSetup;
      if (!api) {
        setPaneStatus(instance, 'Mobile setup API is unavailable in this build.', 'error');
        return;
      }

      const installId = createInstallId(instance.projectId, check.id);
      instance.installProgressCleanup?.();
      instance.installState = {
        installId,
        dependencyId: check.id,
        dependencyLabel: check.label,
        phase: 'running',
        startedAt: new Date().toISOString(),
        percent: 0,
        stepPercent: 0,
        logs: [],
      };
      renderInstallProgress(instance);
      setActionAvailability(instance);
      setPaneStatus(instance, `${check.label} installation started…`);

      instance.installProgressCleanup = api.onInstallProgress((event) => {
        if (event.installId !== installId) return;
        applyInstallProgressEvent(instance, event);
      });

      try {
        const result = await api.installDependency(check.id as MobileDependencyId, installId);
        const installState = instance.installState;
        if (!result.success) {
          if (installState && installState.installId === installId) {
            installState.phase = 'failed';
            installState.finishedAt = new Date().toISOString();
            installState.message = result.message || 'Install command failed.';
            installState.detail = result.stderr || result.stdout || result.message;
            if (result.command) installState.command = result.command;
            if (result.stderr) pushInstallLog(installState, result.stderr);
            if (result.stdout) pushInstallLog(installState, result.stdout);
            installState.percent = Math.min(99, installState.percent);
            renderInstallProgress(instance);
          }
          setPaneStatus(instance, result.message || 'Install command failed.', 'error');
        } else {
          if (installState && installState.installId === installId) {
            installState.phase = 'success';
            installState.finishedAt = new Date().toISOString();
            installState.percent = 100;
            installState.message = result.message || `${check.label} installed successfully.`;
            if (result.command) installState.command = result.command;
            renderInstallProgress(instance);
          }
          setPaneStatus(instance, result.message || `${check.label} installed successfully.`, 'success');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Install command failed.';
        const installState = instance.installState;
        if (installState && installState.installId === installId) {
          installState.phase = 'failed';
          installState.finishedAt = new Date().toISOString();
          installState.message = message;
          installState.detail = message;
          pushInstallLog(installState, message);
          installState.percent = Math.min(99, installState.percent);
          renderInstallProgress(instance);
        }
        setPaneStatus(instance, message, 'error');
      } finally {
        instance.installProgressCleanup?.();
        instance.installProgressCleanup = undefined;
        setActionAvailability(instance);
        await refreshMobileSurfacePane(instance.projectId, true);
      }
    });
    right.appendChild(installBtn);
  }

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

function renderGroup(
  instance: MobileSurfacePaneInstance,
  title: string,
  checks: MobileDependencyCheck[],
  options?: {
    collapsible?: boolean;
    open?: boolean;
    description?: string;
  },
): void {
  if (checks.length === 0) return;

  const section = options?.collapsible
    ? document.createElement('details')
    : document.createElement('section');
  section.className = 'mobile-surface-group';

  if (options?.collapsible) {
    section.classList.add('mobile-surface-group-collapsible');
    (section as HTMLDetailsElement).open = Boolean(options.open);
    const summary = document.createElement('summary');
    summary.className = 'mobile-surface-group-summary';
    summary.textContent = title;
    section.appendChild(summary);
    if (options.description) {
      const desc = document.createElement('div');
      desc.className = 'mobile-surface-group-summary-desc';
      desc.textContent = options.description;
      section.appendChild(desc);
    }
  } else {
    const heading = document.createElement('h3');
    heading.className = 'mobile-surface-group-title';
    heading.textContent = title;
    section.appendChild(heading);
  }

  for (const check of checks) {
    section.appendChild(buildCheckRow(instance, check));
  }

  instance.bodyEl.appendChild(section);
}

function renderReport(instance: MobileSurfacePaneInstance, report: MobileDependencyReport): void {
  instance.lastReport = report;
  if (instance.inspectState.liveMode && hasBlockingChecks(report, instance.inspectState.platform)) {
    stopInspectLiveMode(instance, 'Live view paused until required dependencies are ready.', 'error');
  }
  instance.summaryEl.innerHTML = '';
  instance.bodyEl.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'mobile-surface-summary';
  const scopedSummary = getScopedSummary(report, instance.projectProfile);
  summary.innerHTML = `
    <span class="mobile-surface-summary-pill">Scope: ${getProjectProfileLabel(instance.projectProfile).replace('Project profile: ', '')}</span>
    <span class="mobile-surface-summary-pill">Ready: ${scopedSummary.ready}</span>
    <span class="mobile-surface-summary-pill">Warnings: ${scopedSummary.warnings}</span>
    <span class="mobile-surface-summary-pill">Required missing: ${scopedSummary.requiredMissing}</span>
  `;
  instance.summaryEl.appendChild(summary);

  instance.bodyEl.appendChild(renderInspectWorkbench(instance, report));

  const checklist = getProfileScopedChecks(report, instance.projectProfile);
  renderGroup(instance, 'Dependency checklist', checklist, {
    collapsible: true,
    open: false,
    description: 'Install and verify prerequisites relevant to the current project profile.',
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
