import type {
  MobileDependencyReport,
  MobileInspectPlatform,
} from '../../../shared/types/mobile.js';
import type { MobileSurfacePaneInstance } from './types.js';

export type StatusTone = 'default' | 'success' | 'error';

export interface MobileInspectWorkbenchHandlers {
  stopInspectLiveMode(
    instance: MobileSurfacePaneInstance,
    statusMessage?: string,
    tone?: StatusTone,
  ): void;
  rerenderFromState(instance: MobileSurfacePaneInstance): void;
  setInspectStatus(instance: MobileSurfacePaneInstance, message: string, tone?: StatusTone): void;
  captureInspectFrame(
    instance: MobileSurfacePaneInstance,
    source: 'manual' | 'live',
  ): Promise<boolean>;
  startInspectLiveMode(instance: MobileSurfacePaneInstance): Promise<void>;
  sendInspectToSelectedSession(instance: MobileSurfacePaneInstance): Promise<void>;
  isInspectBusy(instance: MobileSurfacePaneInstance): boolean;
  setPaneStatus(instance: MobileSurfacePaneInstance, text: string, tone?: StatusTone): void;
  setActionAvailability(instance: MobileSurfacePaneInstance): void;
  refreshMobileSurfacePane(projectId: string, force?: boolean): Promise<void>;
}

export interface RenderMobileInspectWorkbenchOptions {
  instance: MobileSurfacePaneInstance;
  report: MobileDependencyReport;
  platformLabels: Record<MobileInspectPlatform, string>;
  handlers: MobileInspectWorkbenchHandlers;
}
