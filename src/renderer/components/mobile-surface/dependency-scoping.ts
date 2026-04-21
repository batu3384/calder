import type {
  MobileDependencyCheck,
  MobileDependencyReport,
  MobileInspectPlatform,
  MobileInspectScreenshotResult,
} from '../../../shared/types.js';
import { appState } from '../../state.js';

export type MobileProjectProfile = 'ios' | 'android' | 'cross' | 'unknown';

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

export async function detectProjectProfile(projectId: string): Promise<MobileProjectProfile> {
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

export function getProfileScopedChecks(report: MobileDependencyReport, profile: MobileProjectProfile): MobileDependencyCheck[] {
  if (profile === 'ios') {
    return report.checks.filter((check) => check.requiredFor.includes('ios'));
  }
  if (profile === 'android') {
    return report.checks.filter((check) => check.requiredFor.includes('android'));
  }
  return report.checks;
}

export function getScopedSummary(report: MobileDependencyReport, profile: MobileProjectProfile): {
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

export function getProjectProfileLabel(profile: MobileProjectProfile): string {
  if (profile === 'ios') return 'Project profile: iOS app';
  if (profile === 'android') return 'Project profile: Android app';
  if (profile === 'cross') return 'Project profile: iOS + Android';
  return 'Project profile: unknown';
}

export function getProjectProfileStatusPrefix(profile: MobileProjectProfile): string {
  if (profile === 'ios') return 'iOS mobile surface';
  if (profile === 'android') return 'Android mobile surface';
  if (profile === 'cross') return 'Cross-platform mobile surface';
  return 'Mobile surface';
}

export function hasBlockingChecks(report: MobileDependencyReport, platform: MobileInspectPlatform): boolean {
  return report.checks.some((entry) => (
    entry.requiredFor.includes(platform)
    && (entry.status === 'missing' || entry.status === 'unsupported')
  ));
}

export function getBlockingChecks(report: MobileDependencyReport, platform: MobileInspectPlatform): MobileDependencyCheck[] {
  return report.checks.filter((entry) => (
    entry.requiredFor.includes(platform)
    && (entry.status === 'missing' || entry.status === 'unsupported')
  ));
}

export function formatPointLabel(point: {
  x: number;
  y: number;
  normalizedX: number;
  normalizedY: number;
}): string {
  return `x=${point.x}, y=${point.y} (${Math.round(point.normalizedX * 100)}% × ${Math.round(point.normalizedY * 100)}%)`;
}

export function formatCaptureMeta(result: MobileInspectScreenshotResult): string {
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

export function getStatusLabel(check: MobileDependencyCheck): string {
  if (check.status === 'ready') return 'Ready';
  if (check.status === 'warning') return 'Needs attention';
  if (check.status === 'unsupported') return 'Unsupported';
  return 'Not found';
}

export function isInstallable(check: MobileDependencyCheck): boolean {
  return Boolean(check.autoFixAvailable) && check.status !== 'ready' && check.status !== 'unsupported';
}

export function getInspectInteractionHint(): string {
  return appState.preferences.language === 'tr'
    ? 'Bu panel anlık görüntü tabanlıdır: tıklama, simülatörü sürmek yerine eleman tespiti yapar.'
    : 'This panel is snapshot-based: click to inspect elements, not to drive simulator UI.';
}

type MobileInspectCapabilityTone = 'ready' | 'limited' | 'external';

export interface MobileInspectCapability {
  label: string;
  status: string;
  detail: string;
  tone: MobileInspectCapabilityTone;
}

export function getMobileInspectCapabilities(platform: MobileInspectPlatform): MobileInspectCapability[] {
  if (platform === 'android') {
    return [
      {
        label: 'Launch and capture',
        status: 'Ready',
        detail: 'Uses Android Emulator plus adb screencap for still frames and live polling.',
        tone: 'ready',
      },
      {
        label: 'Element match',
        status: 'Ready',
        detail: 'Uses adb uiautomator dump to resolve the selected screenshot point to a native node.',
        tone: 'ready',
      },
      {
        label: 'Tap selected',
        status: 'Ready',
        detail: 'Uses adb input tap against the selected emulator coordinate.',
        tone: 'ready',
      },
    ];
  }

  return [
    {
      label: 'Launch and capture',
      status: 'Ready',
      detail: 'Uses xcrun simctl to boot the simulator and capture PNG screenshots.',
      tone: 'ready',
    },
    {
      label: 'Element match',
      status: 'Limited',
      detail: 'iOS native hierarchy inspection is not wired yet; selected point and screenshot context are still sent.',
      tone: 'limited',
    },
    {
      label: 'Tap selected',
      status: 'Appium',
      detail: 'Requires a local Appium server with the XCUITest driver for coordinate taps.',
      tone: 'external',
    },
  ];
}
