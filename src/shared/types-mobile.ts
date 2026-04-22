// Shared mobile tooling and inspect type definitions.

// --- Mobile Dependency Doctor ---

export type MobileDependencyId =
  | 'xcode'
  | 'simctl'
  | 'appium'
  | 'appium-xcuitest-driver'
  | 'java-jdk'
  | 'android-sdkmanager'
  | 'android-avdmanager'
  | 'android-adb'
  | 'android-emulator'
  | 'appium-uiautomator2-driver'
  | 'maestro';

export type MobileDependencyStatus = 'ready' | 'missing' | 'warning' | 'unsupported';
export type MobileDependencyScope = 'ios' | 'android' | 'shared';

export interface MobileDependencyCheck {
  id: MobileDependencyId;
  label: string;
  scope: MobileDependencyScope;
  requiredFor: Array<'ios' | 'android'>;
  required: boolean;
  status: MobileDependencyStatus;
  description: string;
  message: string;
  version?: string;
  docsUrl?: string;
  installHint?: string;
  installCommand?: string;
  autoFixAvailable?: boolean;
}

export interface MobileDependencyReportSummary {
  ready: number;
  warnings: number;
  requiredMissing: number;
  optionalMissing: number;
}

export interface MobileDependencyReport {
  generatedAt: string;
  hostPlatform: string;
  checks: MobileDependencyCheck[];
  summary: MobileDependencyReportSummary;
}

export interface MobileDependencyInstallResult {
  dependencyId: MobileDependencyId;
  success: boolean;
  message: string;
  command?: string;
  stdout?: string;
  stderr?: string;
}

export type MobileDependencyInstallProgressPhase =
  | 'started'
  | 'step_started'
  | 'step_progress'
  | 'step_finished'
  | 'finished'
  | 'failed';

export interface MobileDependencyInstallProgressEvent {
  installId: string;
  dependencyId: MobileDependencyId;
  phase: MobileDependencyInstallProgressPhase;
  startedAt: string;
  finishedAt?: string;
  stepIndex?: number;
  totalSteps?: number;
  command?: string;
  message?: string;
  detail?: string;
  source?: 'stdout' | 'stderr';
  percent?: number;
  stepPercent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  remainingBytes?: number;
}

// --- Mobile Inspect Surface ---

export type MobileInspectPlatform = 'ios' | 'android';

export interface MobileInspectLaunchResult {
  platform: MobileInspectPlatform;
  success: boolean;
  message: string;
  deviceId?: string;
  deviceName?: string;
  alreadyRunning?: boolean;
  started?: boolean;
}

export interface MobileInspectScreenshotResult {
  platform: MobileInspectPlatform;
  success: boolean;
  message: string;
  dataUrl?: string;
  width?: number;
  height?: number;
  capturedAt?: string;
  deviceId?: string;
  deviceName?: string;
}

export interface MobileInspectElementMatch {
  className?: string;
  text?: string;
  resourceId?: string;
  contentDesc?: string;
  bounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

export interface MobileInspectPointInspectionResult {
  platform: MobileInspectPlatform;
  success: boolean;
  message: string;
  point: { x: number; y: number };
  element?: MobileInspectElementMatch;
  deviceId?: string;
  deviceName?: string;
}

export interface MobileInspectInteractionResult {
  platform: MobileInspectPlatform;
  success: boolean;
  message: string;
  action: 'tap';
  point: { x: number; y: number };
  deviceId?: string;
  deviceName?: string;
}

export interface MobileControlPairingResult {
  pairingId: string;
  pairingUrl: string;
  localPairingUrl: string;
  localPairingUrls: string[];
  accessMode: 'lan' | 'remote';
  otpCode: string;
  expiresAt: string;
}

export interface MobileControlAnswerResult {
  answer: string | null;
  status: 'pending' | 'ready' | 'expired';
}
