import type {
  MobileDependencyReport,
  MobileInspectPlatform,
  MobileInspectPointInspectionResult,
  MobileInspectScreenshotResult,
} from '../../../shared/types/mobile.js';
import type { MobileProjectProfile } from './dependency-scoping.js';
import type { MobileSurfaceInstallState } from './install-progress.js';

export interface MobileSurfaceInspectPoint {
  x: number;
  y: number;
  normalizedX: number;
  normalizedY: number;
}

export interface MobileSurfaceInspectState {
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

export interface MobileSurfacePaneInstance {
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
