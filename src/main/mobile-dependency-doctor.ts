import { execFile } from 'child_process';
import { getFullPath } from './pty-manager';
import {
  MOBILE_DOCTOR_DOCS as DOCS,
} from './mobile-dependency-doctor-config';
import {
  getAndroidBinaryCandidates,
  resolveBinary,
} from './mobile-dependency-doctor-binaries';
import {
  firstNonEmptyLine,
  isMissingJavaRuntimeOutput,
  normalizeVersionOutput,
  parseInstalledDriverFromJson,
  parseInstalledDriverVersion,
  parseJavaMajor,
} from './mobile-dependency-doctor-utils';
import {
  installMobileDependency as installMobileDependencyInternal,
  type InstallDependencyOptions,
} from './mobile-dependency-doctor-install';
import type {
  MobileDependencyCheck,
  MobileDependencyId,
  MobileDependencyReport,
} from '../shared/types/mobile';

const CHECK_TIMEOUT_MS = 20_000;

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface CommandRunner {
  run(
    command: string,
    args: string[],
    options?: { timeoutMs?: number },
  ): Promise<CommandResult>;
}

interface DoctorOptions {
  runner?: CommandRunner;
  hostPlatform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

const defaultRunner: CommandRunner = {
  run(command, args, options) {
    const timeoutMs = options?.timeoutMs ?? CHECK_TIMEOUT_MS;
    return new Promise((resolve) => {
      execFile(
        command,
        args,
        {
          env: { ...process.env, PATH: getFullPath() },
          encoding: 'utf-8',
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ code: 0, stdout, stderr });
            return;
          }

          const err = error as NodeJS.ErrnoException & {
            code?: number | string;
            stdout?: string;
            stderr?: string;
          };
          resolve({
            code: typeof err.code === 'number' ? err.code : 1,
            stdout: err.stdout ?? stdout ?? '',
            stderr: err.stderr ?? stderr ?? err.message ?? '',
          });
        },
      );
    });
  },
};

function buildCheck(input: Omit<MobileDependencyCheck, 'required'>): MobileDependencyCheck {
  return {
    ...input,
    required: input.requiredFor.length > 0,
  };
}

async function checkXcode(runner: CommandRunner, hostPlatform: NodeJS.Platform): Promise<MobileDependencyCheck> {
  if (hostPlatform !== 'darwin') {
    return buildCheck({
      id: 'xcode',
      label: 'Xcode',
      scope: 'ios',
      requiredFor: ['ios'],
      status: 'unsupported',
      description: 'Needed for iOS Simulator automation via Appium XCUITest.',
      message: 'Xcode checks run on macOS hosts only.',
      docsUrl: DOCS.appleXcode,
    });
  }

  const binaryPath = await resolveBinary(runner, 'xcodebuild');
  if (!binaryPath) {
    return buildCheck({
      id: 'xcode',
      label: 'Xcode',
      scope: 'ios',
      requiredFor: ['ios'],
      status: 'missing',
      description: 'Needed for iOS Simulator automation via Appium XCUITest.',
      message: 'xcodebuild was not found on PATH.',
      installHint: 'Install Xcode from the Mac App Store, then open it once.',
      docsUrl: DOCS.appleXcode,
    });
  }

  const result = await runner.run('xcodebuild', ['-version'], { timeoutMs: 8_000 });
  if (result.code !== 0) {
    return buildCheck({
      id: 'xcode',
      label: 'Xcode',
      scope: 'ios',
      requiredFor: ['ios'],
      status: 'warning',
      description: 'Needed for iOS Simulator automation via Appium XCUITest.',
      message: firstNonEmptyLine(result.stderr, result.stdout) || 'xcodebuild exists but version check failed.',
      installHint: 'Open Xcode once and complete first-run setup.',
      docsUrl: DOCS.appleXcode,
    });
  }

  return buildCheck({
    id: 'xcode',
    label: 'Xcode',
    scope: 'ios',
    requiredFor: ['ios'],
    status: 'ready',
    description: 'Needed for iOS Simulator automation via Appium XCUITest.',
    message: 'Xcode command line tools are available.',
    version: normalizeVersionOutput(result.stdout),
    docsUrl: DOCS.appleXcode,
  });
}

async function checkSimctl(runner: CommandRunner, hostPlatform: NodeJS.Platform): Promise<MobileDependencyCheck> {
  if (hostPlatform !== 'darwin') {
    return buildCheck({
      id: 'simctl',
      label: 'simctl',
      scope: 'ios',
      requiredFor: ['ios'],
      status: 'unsupported',
      description: 'Needed to control the iOS Simulator lifecycle and screenshots.',
      message: 'simctl checks run on macOS hosts only.',
      docsUrl: DOCS.appleXcode,
    });
  }

  const result = await runner.run('xcrun', ['simctl', 'help'], { timeoutMs: 8_000 });
  if (result.code !== 0) {
    return buildCheck({
      id: 'simctl',
      label: 'simctl',
      scope: 'ios',
      requiredFor: ['ios'],
      status: 'missing',
      description: 'Needed to control the iOS Simulator lifecycle and screenshots.',
      message: firstNonEmptyLine(result.stderr, result.stdout) || 'xcrun simctl help failed.',
      installHint: 'Run `xcodebuild -runFirstLaunch` after installing Xcode.',
      installCommand: 'xcodebuild -runFirstLaunch',
      autoFixAvailable: true,
      docsUrl: DOCS.appleXcode,
    });
  }

  return buildCheck({
    id: 'simctl',
    label: 'simctl',
    scope: 'ios',
    requiredFor: ['ios'],
    status: 'ready',
    description: 'Needed to control the iOS Simulator lifecycle and screenshots.',
    message: 'Simulator command line tools are available.',
    docsUrl: DOCS.appleXcode,
  });
}

async function checkAppium(runner: CommandRunner): Promise<MobileDependencyCheck> {
  const binaryPath = await resolveBinary(runner, 'appium');
  if (!binaryPath) {
    return buildCheck({
      id: 'appium',
      label: 'Appium',
      scope: 'shared',
      requiredFor: ['ios', 'android'],
      status: 'missing',
      description: 'Core mobile automation server used by Calder mobile inspect.',
      message: 'appium was not found on PATH.',
      installHint: 'Install Appium globally with npm.',
      installCommand: 'npm install -g appium',
      autoFixAvailable: true,
      docsUrl: DOCS.appiumInstall,
    });
  }

  const result = await runner.run('appium', ['--version'], { timeoutMs: 8_000 });
  if (result.code !== 0) {
    return buildCheck({
      id: 'appium',
      label: 'Appium',
      scope: 'shared',
      requiredFor: ['ios', 'android'],
      status: 'warning',
      description: 'Core mobile automation server used by Calder mobile inspect.',
      message: firstNonEmptyLine(result.stderr, result.stdout) || 'Appium was found but version check failed.',
      installHint: 'Reinstall Appium globally.',
      installCommand: 'npm install -g appium',
      autoFixAvailable: true,
      docsUrl: DOCS.appiumInstall,
    });
  }

  return buildCheck({
    id: 'appium',
    label: 'Appium',
    scope: 'shared',
    requiredFor: ['ios', 'android'],
    status: 'ready',
    description: 'Core mobile automation server used by Calder mobile inspect.',
    message: 'Appium server is installed.',
    version: normalizeVersionOutput(result.stdout),
    docsUrl: DOCS.appiumInstall,
  });
}

async function checkAppiumDriver(
  runner: CommandRunner,
  driver: 'xcuitest' | 'uiautomator2',
): Promise<MobileDependencyCheck> {
  const appiumPath = await resolveBinary(runner, 'appium');
  const id = driver === 'xcuitest' ? 'appium-xcuitest-driver' : 'appium-uiautomator2-driver';
  const label = driver === 'xcuitest' ? 'Appium XCUITest driver' : 'Appium UiAutomator2 driver';
  const scope = driver === 'xcuitest' ? 'ios' : 'android';
  const docsUrl = driver === 'xcuitest' ? DOCS.appiumXcuitest : DOCS.appiumUiauto2;
  const installHint = `Install driver with \`appium driver install ${driver}\`.`;

  if (!appiumPath) {
    return buildCheck({
      id,
      label,
      scope,
      requiredFor: [scope],
      status: 'missing',
      description: `Required by Appium for ${scope === 'ios' ? 'iOS Simulator' : 'Android'} automation sessions.`,
      message: 'Appium is missing, so driver availability cannot be verified.',
      installHint: 'Install Appium first, then install this driver.',
      docsUrl,
    });
  }

  const jsonList = await runner.run('appium', ['driver', 'list', '--installed', '--json'], { timeoutMs: 10_000 });
  if (jsonList.code === 0) {
    const parsed = parseInstalledDriverFromJson(`${jsonList.stdout}\n${jsonList.stderr}`, driver);
    if (parsed) {
      if (!parsed.installed) {
        return buildCheck({
          id,
          label,
          scope,
          requiredFor: [scope],
          status: 'missing',
          description: `Required by Appium for ${scope === 'ios' ? 'iOS Simulator' : 'Android'} automation sessions.`,
          message: `${label} is not installed.`,
          installHint,
          installCommand: `appium driver install ${driver}`,
          autoFixAvailable: true,
          docsUrl,
        });
      }

      return buildCheck({
        id,
        label,
        scope,
        requiredFor: [scope],
        status: 'ready',
        description: `Required by Appium for ${scope === 'ios' ? 'iOS Simulator' : 'Android'} automation sessions.`,
        message: `${label} is installed.`,
        version: parsed.version,
        docsUrl,
      });
    }
  }

  const list = await runner.run('appium', ['driver', 'list', '--installed'], { timeoutMs: 10_000 });
  if (list.code !== 0) {
    return buildCheck({
      id,
      label,
      scope,
      requiredFor: [scope],
      status: 'warning',
      description: `Required by Appium for ${scope === 'ios' ? 'iOS Simulator' : 'Android'} automation sessions.`,
      message: firstNonEmptyLine(list.stderr, list.stdout, jsonList.stderr, jsonList.stdout) || 'Unable to read installed Appium drivers.',
      installHint,
      installCommand: `appium driver install ${driver}`,
      autoFixAvailable: true,
      docsUrl,
    });
  }

  const version = parseInstalledDriverVersion(`${list.stdout}\n${list.stderr}`, driver);
  if (!version) {
    return buildCheck({
      id,
      label,
      scope,
      requiredFor: [scope],
      status: 'missing',
      description: `Required by Appium for ${scope === 'ios' ? 'iOS Simulator' : 'Android'} automation sessions.`,
      message: `${label} is not installed.`,
      installHint,
      installCommand: `appium driver install ${driver}`,
      autoFixAvailable: true,
      docsUrl,
    });
  }

  return buildCheck({
    id,
    label,
    scope,
    requiredFor: [scope],
    status: 'ready',
    description: `Required by Appium for ${scope === 'ios' ? 'iOS Simulator' : 'Android'} automation sessions.`,
    message: `${label} is installed.`,
    version,
    docsUrl,
  });
}

async function checkJava(
  runner: CommandRunner,
  hostPlatform: NodeJS.Platform,
): Promise<MobileDependencyCheck> {
  const hostIsMac = hostPlatform === 'darwin';
  const binaryPath = await resolveBinary(runner, 'java');
  if (!binaryPath) {
    return buildCheck({
      id: 'java-jdk',
      label: 'Java JDK (17+)',
      scope: 'android',
      requiredFor: ['android'],
      status: 'missing',
      description: 'Required for Android SDK command line tools and UiAutomator2 setup.',
      message: 'java was not found on PATH.',
      installHint: hostIsMac
        ? 'Install Java 17+ (for example `brew install openjdk && brew link --overwrite --force openjdk`).'
        : 'Install Java 17+ and ensure JAVA_HOME is configured.',
      installCommand: hostIsMac ? 'brew install openjdk && brew link --overwrite --force openjdk' : undefined,
      autoFixAvailable: hostIsMac,
      docsUrl: DOCS.androidSdkManager,
    });
  }

  const versionResult = await runner.run('java', ['-version'], { timeoutMs: 8_000 });
  const mergedOutput = `${versionResult.stdout}\n${versionResult.stderr}`;
  if (versionResult.code !== 0 && isMissingJavaRuntimeOutput(mergedOutput)) {
    return buildCheck({
      id: 'java-jdk',
      label: 'Java JDK (17+)',
      scope: 'android',
      requiredFor: ['android'],
      status: 'missing',
      description: 'Required for Android SDK command line tools and UiAutomator2 setup.',
      message: 'Java command exists but no Java runtime is installed.',
      installHint: hostIsMac
        ? 'Install Java 17+ (for example `brew install openjdk && brew link --overwrite --force openjdk`).'
        : 'Install Java 17+ and ensure JAVA_HOME is configured.',
      installCommand: hostIsMac ? 'brew install openjdk && brew link --overwrite --force openjdk' : undefined,
      autoFixAvailable: hostIsMac,
      docsUrl: DOCS.androidSdkManager,
    });
  }
  const major = parseJavaMajor(mergedOutput);
  if (major === null) {
    return buildCheck({
      id: 'java-jdk',
      label: 'Java JDK (17+)',
      scope: 'android',
      requiredFor: ['android'],
      status: 'warning',
      description: 'Required for Android SDK command line tools and UiAutomator2 setup.',
      message: 'Java exists but version could not be parsed.',
      docsUrl: DOCS.androidSdkManager,
    });
  }

  if (major < 17) {
    return buildCheck({
      id: 'java-jdk',
      label: 'Java JDK (17+)',
      scope: 'android',
      requiredFor: ['android'],
      status: 'warning',
      description: 'Required for Android SDK command line tools and UiAutomator2 setup.',
      message: `Detected Java ${major}; Java 17 or newer is required.`,
      installHint: hostIsMac
        ? 'Upgrade Java with `brew install openjdk && brew link --overwrite --force openjdk`.'
        : 'Upgrade Java to 17+.',
      installCommand: hostIsMac ? 'brew install openjdk && brew link --overwrite --force openjdk' : undefined,
      autoFixAvailable: hostIsMac,
      docsUrl: DOCS.androidSdkManager,
    });
  }

  return buildCheck({
    id: 'java-jdk',
    label: 'Java JDK (17+)',
    scope: 'android',
    requiredFor: ['android'],
    status: 'ready',
    description: 'Required for Android SDK command line tools and UiAutomator2 setup.',
    message: 'Java runtime is compatible.',
    version: `Java ${major}`,
    docsUrl: DOCS.androidSdkManager,
  });
}

async function checkBinaryWithVersion(input: {
  runner: CommandRunner;
  id: MobileDependencyId;
  label: string;
  scope: 'android' | 'ios' | 'shared';
  requiredFor: Array<'ios' | 'android'>;
  description: string;
  binary: string;
  versionArgs?: string[];
  docsUrl?: string;
  installHint?: string;
  installCommand?: string;
  autoFixAvailable?: boolean;
  fallbackPaths?: string[];
}): Promise<MobileDependencyCheck> {
  const binaryPath = await resolveBinary(input.runner, input.binary, {
    fallbackPaths: input.fallbackPaths,
    probeArgs: input.versionArgs ?? ['--version'],
  });
  if (!binaryPath) {
    const missingMessage = input.fallbackPaths && input.fallbackPaths.length > 0
      ? `${input.binary} was not found on PATH or known Android SDK locations.`
      : `${input.binary} was not found on PATH.`;
    return buildCheck({
      id: input.id,
      label: input.label,
      scope: input.scope,
      requiredFor: input.requiredFor,
      status: 'missing',
      description: input.description,
      message: missingMessage,
      docsUrl: input.docsUrl,
      installHint: input.installHint,
      installCommand: input.installCommand,
      autoFixAvailable: input.autoFixAvailable,
    });
  }

  const args = input.versionArgs ?? ['--version'];
  const result = await input.runner.run(binaryPath, args, { timeoutMs: 10_000 });
  if (result.code !== 0) {
    return buildCheck({
      id: input.id,
      label: input.label,
      scope: input.scope,
      requiredFor: input.requiredFor,
      status: 'warning',
      description: input.description,
      message: firstNonEmptyLine(result.stderr, result.stdout) || `${input.binary} exists but version check failed.`,
      docsUrl: input.docsUrl,
      installHint: input.installHint,
      installCommand: input.installCommand,
      autoFixAvailable: input.autoFixAvailable,
    });
  }

  return buildCheck({
    id: input.id,
    label: input.label,
    scope: input.scope,
    requiredFor: input.requiredFor,
    status: 'ready',
    description: input.description,
    message: `${input.label} is available.`,
    version: normalizeVersionOutput(result.stdout || result.stderr),
    docsUrl: input.docsUrl,
  });
}

export async function checkMobileDependencies(options?: DoctorOptions): Promise<MobileDependencyReport> {
  const runner = options?.runner ?? defaultRunner;
  const hostPlatform = options?.hostPlatform ?? process.platform;
  const hostIsMac = hostPlatform === 'darwin';
  const env = options?.env ?? process.env;
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
  checks.push(await checkBinaryWithVersion({
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
  }));
  checks.push(await checkBinaryWithVersion({
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
  }));
  checks.push(await checkBinaryWithVersion({
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
  }));
  checks.push(await checkBinaryWithVersion({
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
  }));
  checks.push(await checkAppiumDriver(runner, 'uiautomator2'));
  checks.push(await checkBinaryWithVersion({
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
  }));

  const summary = {
    ready: checks.filter((entry) => entry.status === 'ready').length,
    warnings: checks.filter((entry) => entry.status === 'warning').length,
    requiredMissing: checks.filter((entry) =>
      entry.required && (entry.status === 'missing' || entry.status === 'warning')).length,
    optionalMissing: checks.filter((entry) => !entry.required && entry.status === 'missing').length,
  };

  return {
    generatedAt: new Date().toISOString(),
    hostPlatform,
    checks,
    summary,
  };
}

export async function installMobileDependency(
  dependencyId: Parameters<typeof installMobileDependencyInternal>[0],
  options?: InstallDependencyOptions,
): ReturnType<typeof installMobileDependencyInternal> {
  return installMobileDependencyInternal(dependencyId, options);
}

export const _internal = {
  parseInstalledDriverVersion,
  parseInstalledDriverFromJson,
  parseJavaMajor,
};
