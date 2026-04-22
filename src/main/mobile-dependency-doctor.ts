import { execFile, spawn } from 'child_process';
import { getFullPath } from './pty-manager';
import {
  MOBILE_DOCTOR_DOCS as DOCS,
  MOBILE_DOCTOR_INSTALL_SPECS as INSTALL_SPECS,
  type DoctorInstallSpec as InstallSpec,
  type DoctorInstallStep as InstallStep,
} from './mobile-dependency-doctor-config';
import {
  getAndroidBinaryCandidates,
  resolveBinary,
} from './mobile-dependency-doctor-binaries';
import {
  clampPercent,
  firstNonEmptyLine,
  getAppiumDriverInstallTarget,
  isDriverAlreadyInstalledFailure,
  isMissingJavaRuntimeOutput,
  normalizeInstallFailureMessage,
  normalizeVersionOutput,
  parseBytePairFromLine,
  parseInstalledDriverFromJson,
  parseInstalledDriverVersion,
  parseJavaMajor,
  parsePercentFromLine,
  sanitizeCommandResult,
  stripAnsi,
} from './mobile-dependency-doctor-utils';
import type {
  MobileDependencyCheck,
  MobileDependencyId,
  MobileDependencyInstallProgressEvent,
  MobileDependencyInstallResult,
  MobileDependencyReport,
} from '../shared/types/mobile';

const CHECK_TIMEOUT_MS = 20_000;
const INSTALL_TIMEOUT_MS = 12 * 60_000;

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

interface InstallDependencyOptions extends DoctorOptions {
  installId?: string;
  onProgress?: (event: MobileDependencyInstallProgressEvent) => void;
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

async function runDefaultCommandStreaming(
  command: string,
  args: string[],
  timeoutMs: number,
  onChunk: (source: 'stdout' | 'stderr', chunk: string) => void,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env, PATH: getFullPath() },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 1500).unref();
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      stdout += text;
      onChunk('stdout', text);
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      stderr += text;
      onChunk('stderr', text);
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const message = error.message || `${command} failed`;
      if (stderr.trim().length === 0) {
        stderr = message;
      } else {
        stderr = `${stderr}\n${message}`;
      }
      resolve({ code: 1, stdout, stderr });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (timedOut) {
        const timeoutMessage = `Command timed out after ${Math.round(timeoutMs / 1000)}s.`;
        stderr = stderr.trim().length > 0 ? `${stderr}\n${timeoutMessage}` : timeoutMessage;
        resolve({ code: 124, stdout, stderr });
        return;
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

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

function createInstallId(): string {
  return `mobile-install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function computeOverallPercent(
  totalSteps: number,
  stepIndex: number,
  stepPercent?: number,
  downloadedBytes?: number,
  totalBytes?: number,
): number {
  if (totalSteps <= 0) return 0;
  const completedBeforeStep = Math.max(0, stepIndex - 1);
  let stepFraction = 0;
  if (typeof stepPercent === 'number' && Number.isFinite(stepPercent)) {
    stepFraction = clampPercent(stepPercent) / 100;
  } else if (
    typeof downloadedBytes === 'number' &&
    typeof totalBytes === 'number' &&
    Number.isFinite(downloadedBytes) &&
    Number.isFinite(totalBytes) &&
    totalBytes > 0
  ) {
    stepFraction = Math.max(0, Math.min(1, downloadedBytes / totalBytes));
  }
  return clampPercent(((completedBeforeStep + stepFraction) / totalSteps) * 100);
}

function buildProgressEvent(input: {
  installId: string;
  dependencyId: MobileDependencyId;
  phase: MobileDependencyInstallProgressEvent['phase'];
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
}): MobileDependencyInstallProgressEvent {
  const event: MobileDependencyInstallProgressEvent = {
    installId: input.installId,
    dependencyId: input.dependencyId,
    phase: input.phase,
    startedAt: input.startedAt,
  };
  if (input.finishedAt) event.finishedAt = input.finishedAt;
  if (typeof input.stepIndex === 'number') event.stepIndex = input.stepIndex;
  if (typeof input.totalSteps === 'number') event.totalSteps = input.totalSteps;
  if (input.command) event.command = input.command;
  if (input.message) event.message = input.message;
  if (input.detail) event.detail = input.detail;
  if (input.source) event.source = input.source;
  if (typeof input.percent === 'number' && Number.isFinite(input.percent)) event.percent = clampPercent(input.percent);
  if (typeof input.stepPercent === 'number' && Number.isFinite(input.stepPercent)) event.stepPercent = clampPercent(input.stepPercent);
  if (typeof input.downloadedBytes === 'number' && Number.isFinite(input.downloadedBytes)) event.downloadedBytes = Math.max(0, input.downloadedBytes);
  if (typeof input.totalBytes === 'number' && Number.isFinite(input.totalBytes)) event.totalBytes = Math.max(0, input.totalBytes);
  if (typeof input.remainingBytes === 'number' && Number.isFinite(input.remainingBytes)) event.remainingBytes = Math.max(0, input.remainingBytes);
  return event;
}

function pushChunkLines(
  chunk: string,
  remainderRef: { value: string },
  handleLine: (line: string) => void,
): void {
  const normalized = chunk.replace(/\r/g, '\n');
  const text = remainderRef.value + normalized;
  const parts = text.split('\n');
  remainderRef.value = parts.pop() ?? '';
  for (const raw of parts) {
    const line = raw.trim();
    if (!line) continue;
    handleLine(line);
  }
}

async function runInstallStep(
  runner: CommandRunner,
  step: InstallStep,
  timeoutMs: number,
  onChunk?: (source: 'stdout' | 'stderr', chunk: string) => void,
): Promise<CommandResult> {
  if (onChunk && runner === defaultRunner) {
    return runDefaultCommandStreaming(step.command, step.args, timeoutMs, onChunk);
  }

  const result = await runner.run(step.command, step.args, { timeoutMs });
  if (onChunk) {
    if (result.stdout) onChunk('stdout', result.stdout);
    if (result.stderr) onChunk('stderr', result.stderr);
  }
  return result;
}

interface InstallExecutionContext {
  dependencyId: MobileDependencyId;
  installId: string;
  startedAt: string;
  onProgress?: (event: MobileDependencyInstallProgressEvent) => void;
}

interface InstallExecutionState {
  commandParts: string[];
  combinedStdout: string;
  combinedStderr: string;
  alreadyInstalledNote: string | null;
}

interface InstallStepTelemetry {
  latestStepPercent?: number;
  latestDownloadedBytes?: number;
  latestTotalBytes?: number;
  latestRemainingBytes?: number;
}

type InstallProgressInput = Omit<
  Parameters<typeof buildProgressEvent>[0],
  'installId' | 'dependencyId' | 'startedAt'
>;

function emitInstallProgress(context: InstallExecutionContext, input: InstallProgressInput): void {
  context.onProgress?.(buildProgressEvent({
    ...input,
    installId: context.installId,
    dependencyId: context.dependencyId,
    startedAt: context.startedAt,
  }));
}

function createInstallExecutionState(): InstallExecutionState {
  return {
    commandParts: [],
    combinedStdout: '',
    combinedStderr: '',
    alreadyInstalledNote: null,
  };
}

function buildInstallResult(
  context: InstallExecutionContext,
  state: InstallExecutionState,
  success: boolean,
  message: string,
): MobileDependencyInstallResult {
  return {
    dependencyId: context.dependencyId,
    success,
    message,
    command: state.commandParts.join(' && '),
    stdout: state.combinedStdout.trim(),
    stderr: state.combinedStderr.trim(),
  };
}

function buildEarlyInstallFailure(
  context: InstallExecutionContext,
  message: string,
): MobileDependencyInstallResult {
  emitInstallProgress(context, {
    phase: 'failed',
    finishedAt: new Date().toISOString(),
    message,
    percent: 0,
  });
  return {
    dependencyId: context.dependencyId,
    success: false,
    message,
  };
}

async function resolveInstallSteps(
  dependencyId: MobileDependencyId,
  spec: InstallSpec,
  runner: CommandRunner,
  env: NodeJS.ProcessEnv,
  hostPlatform: NodeJS.Platform,
): Promise<InstallStep[]> {
  if (dependencyId !== 'android-emulator') {
    return spec.steps;
  }

  const resolvedSdkManager = await resolveBinary(runner, 'sdkmanager', {
    fallbackPaths: getAndroidBinaryCandidates('sdkmanager', env, hostPlatform),
    probeArgs: ['--version'],
  });
  if (!resolvedSdkManager) {
    return spec.steps;
  }

  return spec.steps.map((step) =>
    step.command === 'sdkmanager'
      ? { ...step, command: resolvedSdkManager }
      : step,
  );
}

function processInstallLine(input: {
  context: InstallExecutionContext;
  source: 'stdout' | 'stderr';
  line: string;
  stepIndex: number;
  totalSteps: number;
  commandText: string;
  stepDriverTarget: string | null;
  telemetry: InstallStepTelemetry;
}): void {
  const cleanedLine = stripAnsi(input.line).trim();
  if (!cleanedLine) return;
  if (input.stepDriverTarget && /already installed/i.test(cleanedLine)) return;

  const parsedPercent = parsePercentFromLine(cleanedLine);
  if (parsedPercent !== null) {
    input.telemetry.latestStepPercent = parsedPercent;
  }

  const parsedBytes = parseBytePairFromLine(cleanedLine);
  if (parsedBytes) {
    input.telemetry.latestDownloadedBytes = parsedBytes.downloadedBytes;
    input.telemetry.latestTotalBytes = parsedBytes.totalBytes;
    input.telemetry.latestRemainingBytes = parsedBytes.remainingBytes;
  }

  emitInstallProgress(input.context, {
    phase: 'step_progress',
    stepIndex: input.stepIndex,
    totalSteps: input.totalSteps,
    command: input.commandText,
    source: input.source,
    detail: cleanedLine,
    stepPercent: input.telemetry.latestStepPercent,
    downloadedBytes: input.telemetry.latestDownloadedBytes,
    totalBytes: input.telemetry.latestTotalBytes,
    remainingBytes: input.telemetry.latestRemainingBytes,
    percent: computeOverallPercent(
      input.totalSteps,
      input.stepIndex,
      input.telemetry.latestStepPercent,
      input.telemetry.latestDownloadedBytes,
      input.telemetry.latestTotalBytes,
    ),
  });
}

function flushInstallRemainder(
  source: 'stdout' | 'stderr',
  remainderRef: { value: string },
  handleLine: (source: 'stdout' | 'stderr', line: string) => void,
): void {
  const remainder = remainderRef.value.trim();
  if (!remainder) return;
  handleLine(source, remainder);
}

async function executeInstallSteps(input: {
  context: InstallExecutionContext;
  state: InstallExecutionState;
  runner: CommandRunner;
  installSteps: InstallStep[];
}): Promise<MobileDependencyInstallResult | null> {
  const { context, state, runner, installSteps } = input;
  const totalSteps = installSteps.length;

  for (let index = 0; index < installSteps.length; index += 1) {
    const step = installSteps[index]!;
    const stepIndex = index + 1;
    const commandText = [step.command, ...step.args].join(' ');
    const stepDriverTarget = getAppiumDriverInstallTarget(step);
    const telemetry: InstallStepTelemetry = {};
    const stdoutRemainder = { value: '' };
    const stderrRemainder = { value: '' };

    state.commandParts.push(commandText);
    emitInstallProgress(context, {
      phase: 'step_started',
      stepIndex,
      totalSteps,
      command: commandText,
      percent: computeOverallPercent(totalSteps, stepIndex, 0),
      stepPercent: 0,
      message: `Running step ${stepIndex}/${totalSteps}`,
    });

    const handleLine = (source: 'stdout' | 'stderr', line: string): void => {
      processInstallLine({
        context,
        source,
        line,
        stepIndex,
        totalSteps,
        commandText,
        stepDriverTarget,
        telemetry,
      });
    };

    const rawResult = await runInstallStep(
      runner,
      step,
      step.timeoutMs ?? INSTALL_TIMEOUT_MS,
      (source, chunk) => {
        const remainderRef = source === 'stdout' ? stdoutRemainder : stderrRemainder;
        pushChunkLines(chunk, remainderRef, (line) => handleLine(source, line));
      },
    );
    const result = sanitizeCommandResult(rawResult);

    flushInstallRemainder('stdout', stdoutRemainder, handleLine);
    flushInstallRemainder('stderr', stderrRemainder, handleLine);

    state.combinedStdout += `${result.stdout}\n`;
    state.combinedStderr += `${result.stderr}\n`;

    if (result.code !== 0) {
      if (isDriverAlreadyInstalledFailure(step, result)) {
        const driverName = getAppiumDriverInstallTarget(step) ?? 'driver';
        const note = `Driver ${driverName} is already installed.`;
        state.alreadyInstalledNote = note;
        emitInstallProgress(context, {
          phase: 'step_finished',
          stepIndex,
          totalSteps,
          command: commandText,
          message: note,
          detail: note,
          percent: computeOverallPercent(totalSteps, stepIndex + 1, 0),
          stepPercent: 100,
        });
        continue;
      }

      const failureMessage = normalizeInstallFailureMessage(
        firstNonEmptyLine(result.stderr, result.stdout),
        step.command,
      );
      emitInstallProgress(context, {
        phase: 'failed',
        finishedAt: new Date().toISOString(),
        stepIndex,
        totalSteps,
        command: commandText,
        message: failureMessage,
        detail: result.stderr || result.stdout,
        percent: computeOverallPercent(
          totalSteps,
          stepIndex,
          telemetry.latestStepPercent,
          telemetry.latestDownloadedBytes,
          telemetry.latestTotalBytes,
        ),
        stepPercent: telemetry.latestStepPercent,
        downloadedBytes: telemetry.latestDownloadedBytes,
        totalBytes: telemetry.latestTotalBytes,
        remainingBytes: telemetry.latestRemainingBytes,
      });
      return buildInstallResult(context, state, false, failureMessage);
    }

    emitInstallProgress(context, {
      phase: 'step_finished',
      stepIndex,
      totalSteps,
      command: commandText,
      message: `Step ${stepIndex}/${totalSteps} completed.`,
      percent: computeOverallPercent(totalSteps, stepIndex + 1, 0),
      stepPercent: 100,
      downloadedBytes: telemetry.latestDownloadedBytes,
      totalBytes: telemetry.latestTotalBytes,
      remainingBytes: telemetry.latestRemainingBytes,
    });
  }

  return null;
}

export async function installMobileDependency(
  dependencyId: MobileDependencyId,
  options?: InstallDependencyOptions,
): Promise<MobileDependencyInstallResult> {
  const runner = options?.runner ?? defaultRunner;
  const hostPlatform = options?.hostPlatform ?? process.platform;
  const env = options?.env ?? process.env;
  const context: InstallExecutionContext = {
    dependencyId,
    installId: options?.installId || createInstallId(),
    onProgress: options?.onProgress,
    startedAt: new Date().toISOString(),
  };
  const spec = INSTALL_SPECS[dependencyId];

  if (!spec) {
    return buildEarlyInstallFailure(
      context,
      'No automatic install command is configured for this dependency.',
    );
  }

  if (spec.macOnly && hostPlatform !== 'darwin') {
    return buildEarlyInstallFailure(
      context,
      'Automatic install for this dependency is only available on macOS.',
    );
  }

  const state = createInstallExecutionState();
  const installSteps = await resolveInstallSteps(dependencyId, spec, runner, env, hostPlatform);
  const totalSteps = installSteps.length;
  emitInstallProgress(context, {
    phase: 'started',
    totalSteps,
    percent: 0,
    message: 'Starting installation...',
  });

  const failure = await executeInstallSteps({
    context,
    state,
    runner,
    installSteps,
  });
  if (failure) {
    return failure;
  }

  const successMessage = state.alreadyInstalledNote || 'Install command finished successfully.';
  emitInstallProgress(context, {
    phase: 'finished',
    finishedAt: new Date().toISOString(),
    totalSteps,
    percent: 100,
    message: successMessage,
  });
  return buildInstallResult(context, state, true, successMessage);
}

export const _internal = {
  parseInstalledDriverVersion,
  parseInstalledDriverFromJson,
  parseJavaMajor,
};
