import type { MobileInspectPlatform, MobileInspectScreenshotResult } from '../../../shared/types/mobile.js';
import { isInstallRunning } from './install-progress.js';
import type { MobileSurfaceInspectState, MobileSurfacePaneInstance } from './types.js';

type StatusTone = 'default' | 'success' | 'error';
type CaptureSource = 'manual' | 'live';

interface CreateMobileInspectRuntimeOptions {
  platformLabels: Record<MobileInspectPlatform, string>;
  rerenderFromState(instance: MobileSurfacePaneInstance): void;
}

interface MobileInspectRuntimeHandlers {
  defaultInspectState(): MobileSurfaceInspectState;
  isInspectBusy(instance: MobileSurfacePaneInstance): boolean;
  setActionAvailability(instance: MobileSurfacePaneInstance): void;
  setInspectStatus(instance: MobileSurfacePaneInstance, message: string, tone?: StatusTone): void;
  stopInspectLiveMode(instance: MobileSurfacePaneInstance, statusMessage?: string, tone?: StatusTone): void;
  captureInspectFrame(instance: MobileSurfacePaneInstance, source: CaptureSource): Promise<boolean>;
  startInspectLiveMode(instance: MobileSurfacePaneInstance): Promise<void>;
}

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

function clearInspectLiveTimer(inspect: MobileSurfaceInspectState): void {
  if (inspect.liveTimer === null) return;
  window.clearTimeout(inspect.liveTimer);
  inspect.liveTimer = null;
}

export function createMobileInspectRuntime(options: CreateMobileInspectRuntimeOptions): MobileInspectRuntimeHandlers {
  const { platformLabels, rerenderFromState } = options;

  function isInspectBusy(instance: MobileSurfacePaneInstance): boolean {
    return instance.inspectState.launching
      || instance.inspectState.capturing
      || instance.inspectState.inspectingPoint
      || instance.inspectState.interacting;
  }

  function setActionAvailability(instance: MobileSurfacePaneInstance): void {
    instance.refreshBtn.disabled = instance.loading || isInstallRunning(instance.installState) || isInspectBusy(instance);
  }

  function setInspectStatus(
    instance: MobileSurfacePaneInstance,
    message: string,
    tone: StatusTone = 'default',
  ): void {
    instance.inspectState.message = message;
    instance.inspectState.tone = tone;
  }

  function stopInspectLiveMode(
    instance: MobileSurfacePaneInstance,
    statusMessage?: string,
    tone: StatusTone = 'default',
  ): void {
    const inspect = instance.inspectState;
    inspect.liveMode = false;
    inspect.liveLoopToken += 1;
    clearInspectLiveTimer(inspect);
    if (statusMessage) {
      setInspectStatus(instance, statusMessage, tone);
    }
  }

  async function captureInspectFrame(instance: MobileSurfacePaneInstance, source: CaptureSource): Promise<boolean> {
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
      setInspectStatus(instance, `Capturing ${platformLabels[inspect.platform]} screenshot…`, 'default');
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

  return {
    defaultInspectState,
    isInspectBusy,
    setActionAvailability,
    setInspectStatus,
    stopInspectLiveMode,
    captureInspectFrame,
    startInspectLiveMode,
  };
}
