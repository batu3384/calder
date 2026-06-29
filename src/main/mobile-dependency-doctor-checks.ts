import type { MobileDependencyCheck, MobileDependencyReport } from '../shared/types/mobile';
import { getAndroidBinaryCandidates } from './mobile-dependency-doctor-binaries';
import {
  checkAppium,
  checkAppiumDriver,
  checkBinaryWithVersion,
  checkJava,
  checkSimctl,
  checkXcode,
} from './mobile-dependency-doctor-check-items';
import type { MobileDoctorCheckContext } from './mobile-dependency-doctor-check-types';
import { MOBILE_DOCTOR_DOCS as DOCS } from './mobile-dependency-doctor-config';

export type {
  MobileDoctorCheckContext,
  MobileDoctorCommandResult,
  MobileDoctorCommandRunner,
} from './mobile-dependency-doctor-check-types';

export async function runMobileDependencyChecks(
  context: MobileDoctorCheckContext,
): Promise<MobileDependencyCheck[]> {
  const { runner, hostPlatform, env } = context;
  const hostIsMac = hostPlatform === 'darwin';
  const checks: MobileDependencyCheck[] = [];
  const sdkManagerFallbacks = getAndroidBinaryCandidates('sdkmanager', env, hostPlatform);
  const avdManagerFallbacks = getAndroidBinaryCandidates('avdmanager', env, hostPlatform);
  const adbFallbacks = getAndroidBinaryCandidates('adb', env, hostPlatform);
  const emulatorFallbacks = getAndroidBinaryCandidates('emulator', env, hostPlatform);

  checks.push(await checkXcode(runner, hostPlatform));
  checks.push(await checkSimctl(runner, hostPlatform));
  checks.push(await checkAppium(runner));
  checks.push(await checkAppiumDriver(runner, 'xcuitest'));
  checks.push(await checkJava(runner, hostPlatform));
  checks.push(
    await checkBinaryWithVersion({
      runner,
      id: 'android-sdkmanager',
      label: 'Android sdkmanager',
      scope: 'android',
      requiredFor: ['android'],
      description: 'Installs and updates Android SDK packages needed for emulator automation.',
      binary: 'sdkmanager',
      versionArgs: ['--version'],
      fallbackPaths: sdkManagerFallbacks,
      docsUrl: DOCS.androidSdkManager,
      installHint: hostIsMac
        ? 'Install Android command line tools with Homebrew.'
        : 'Install Android command line tools and ensure sdkmanager is on PATH.',
      installCommand: hostIsMac ? 'brew install --cask android-commandlinetools' : undefined,
      autoFixAvailable: hostIsMac,
    }),
  );
  checks.push(
    await checkBinaryWithVersion({
      runner,
      id: 'android-avdmanager',
      label: 'Android avdmanager',
      scope: 'android',
      requiredFor: ['android'],
      description: 'Creates and manages Android Virtual Devices used by local simulator runs.',
      binary: 'avdmanager',
      versionArgs: ['list', 'target'],
      fallbackPaths: avdManagerFallbacks,
      docsUrl: DOCS.androidAvdManager,
      installHint: hostIsMac
        ? 'Install Android command line tools with Homebrew.'
        : 'Install Android command line tools and ensure avdmanager is on PATH.',
      installCommand: hostIsMac ? 'brew install --cask android-commandlinetools' : undefined,
      autoFixAvailable: hostIsMac,
    }),
  );
  checks.push(
    await checkBinaryWithVersion({
      runner,
      id: 'android-adb',
      label: 'Android adb',
      scope: 'android',
      requiredFor: ['android'],
      description: 'Required for device and emulator connectivity checks.',
      binary: 'adb',
      versionArgs: ['version'],
      fallbackPaths: adbFallbacks,
      docsUrl: DOCS.androidSdkManager,
      installHint: hostIsMac
        ? 'Install Android platform tools with Homebrew.'
        : 'Install Android platform-tools and ensure adb is on PATH.',
      installCommand: hostIsMac ? 'brew install --cask android-platform-tools' : undefined,
      autoFixAvailable: hostIsMac,
    }),
  );
  checks.push(
    await checkBinaryWithVersion({
      runner,
      id: 'android-emulator',
      label: 'Android emulator',
      scope: 'android',
      requiredFor: ['android'],
      description: 'Required to boot Android virtual devices for inspect flows.',
      binary: 'emulator',
      versionArgs: ['-version'],
      fallbackPaths: emulatorFallbacks,
      docsUrl: DOCS.androidEmulator,
      installHint: 'Install the Android emulator package via sdkmanager.',
      installCommand: 'sdkmanager --install emulator',
      autoFixAvailable: true,
    }),
  );
  checks.push(await checkAppiumDriver(runner, 'uiautomator2'));
  checks.push(
    await checkBinaryWithVersion({
      runner,
      id: 'maestro',
      label: 'Maestro CLI (optional)',
      scope: 'shared',
      requiredFor: [],
      description: 'Optional visual fallback tool for quick element inspection and flow authoring.',
      binary: 'maestro',
      versionArgs: ['--version'],
      docsUrl: DOCS.maestroInstall,
      installHint: hostIsMac
        ? 'Install with `brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro`.'
        : 'Install Maestro CLI from official docs.',
      installCommand: hostIsMac ? 'brew install mobile-dev-inc/tap/maestro' : undefined,
      autoFixAvailable: hostIsMac,
    }),
  );

  return checks;
}

export function summarizeMobileDependencyChecks(
  checks: MobileDependencyCheck[],
): MobileDependencyReport['summary'] {
  return {
    ready: checks.filter((entry) => entry.status === 'ready').length,
    warnings: checks.filter((entry) => entry.status === 'warning').length,
    requiredMissing: checks.filter(
      (entry) => entry.required && (entry.status === 'missing' || entry.status === 'warning'),
    ).length,
    optionalMissing: checks.filter((entry) => !entry.required && entry.status === 'missing').length,
  };
}
