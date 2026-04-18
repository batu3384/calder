import { execFile } from 'child_process';
import { getFullPath } from './pty-manager';
import { isMac, whichCmd } from './platform';
import type {
  MobileDependencyCheck,
  MobileDependencyId,
  MobileDependencyInstallResult,
  MobileDependencyReport,
} from '../shared/types';

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
}

interface InstallStep {
  command: string;
  args: string[];
  timeoutMs?: number;
}

interface InstallSpec {
  macOnly?: boolean;
  steps: InstallStep[];
}

const DOCS = {
  appiumInstall: 'https://appium.io/docs/en/latest/quickstart/install/',
  appiumXcuitest: 'https://appium.github.io/appium-xcuitest-driver/latest/getting-started/system-requirements/',
  appiumUiauto2: 'https://appium.io/docs/en/3.3/quickstart/uiauto2-driver/',
  androidSdkManager: 'https://developer.android.com/tools/sdkmanager',
  androidAvdManager: 'https://developer.android.com/tools/avdmanager',
  androidEmulator: 'https://developer.android.com/studio/run/emulator-commandline',
  appleXcode: 'https://developer.apple.com/documentation/safari-developer-tools/installing-xcode-and-simulators',
  maestroInstall: 'https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli',
};

const INSTALL_SPECS: Partial<Record<MobileDependencyId, InstallSpec>> = {
  appium: {
    steps: [{ command: 'npm', args: ['install', '-g', 'appium'] }],
  },
  'appium-xcuitest-driver': {
    steps: [{ command: 'appium', args: ['driver', 'install', 'xcuitest'] }],
  },
  'appium-uiautomator2-driver': {
    steps: [{ command: 'appium', args: ['driver', 'install', 'uiautomator2'] }],
  },
  'java-jdk': {
    macOnly: true,
    steps: [{ command: 'brew', args: ['install', '--cask', 'temurin'] }],
  },
  'android-sdkmanager': {
    macOnly: true,
    steps: [{ command: 'brew', args: ['install', '--cask', 'android-commandlinetools'] }],
  },
  'android-avdmanager': {
    macOnly: true,
    steps: [{ command: 'brew', args: ['install', '--cask', 'android-commandlinetools'] }],
  },
  'android-adb': {
    macOnly: true,
    steps: [{ command: 'brew', args: ['install', '--cask', 'android-platform-tools'] }],
  },
  'android-emulator': {
    steps: [{ command: 'sdkmanager', args: ['--install', 'emulator'] }],
  },
  simctl: {
    macOnly: true,
    steps: [{ command: 'xcodebuild', args: ['-runFirstLaunch'] }],
  },
  maestro: {
    macOnly: true,
    steps: [
      { command: 'brew', args: ['tap', 'mobile-dev-inc/tap'] },
      { command: 'brew', args: ['install', 'mobile-dev-inc/tap/maestro'] },
    ],
  },
};

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

function firstNonEmptyLine(...chunks: Array<string | undefined>): string {
  for (const chunk of chunks) {
    if (!chunk) continue;
    const line = chunk
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean);
    if (line) return line;
  }
  return '';
}

function normalizeVersionOutput(output: string): string | undefined {
  const line = firstNonEmptyLine(output);
  if (!line) return undefined;
  return line.replace(/^version\s+/i, '').trim();
}

function parseJavaMajor(output: string): number | null {
  const line = firstNonEmptyLine(output);
  const match = line.match(/version\s+"([^"]+)"/i);
  if (!match) return null;
  const raw = match[1];
  const parts = raw.split('.');
  if (parts[0] === '1' && parts.length > 1) {
    const legacy = Number(parts[1]);
    return Number.isFinite(legacy) ? legacy : null;
  }
  const major = Number(parts[0]);
  return Number.isFinite(major) ? major : null;
}

function parseInstalledDriverVersion(stdout: string, driverName: 'xcuitest' | 'uiautomator2'): string | undefined {
  const pattern = new RegExp(`\\b${driverName}@([0-9A-Za-z._-]+)\\b`, 'i');
  const match = stdout.match(pattern);
  return match?.[1];
}

async function resolveBinary(runner: CommandRunner, binary: string): Promise<string | null> {
  const check = await runner.run(whichCmd, [binary], { timeoutMs: 4_000 });
  if (check.code !== 0) return null;
  const first = firstNonEmptyLine(check.stdout, check.stderr);
  return first || null;
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

  const list = await runner.run('appium', ['driver', 'list', '--installed'], { timeoutMs: 10_000 });
  if (list.code !== 0) {
    return buildCheck({
      id,
      label,
      scope,
      requiredFor: [scope],
      status: 'warning',
      description: `Required by Appium for ${scope === 'ios' ? 'iOS Simulator' : 'Android'} automation sessions.`,
      message: firstNonEmptyLine(list.stderr, list.stdout) || 'Unable to read installed Appium drivers.',
      installHint,
      installCommand: `appium driver install ${driver}`,
      autoFixAvailable: true,
      docsUrl,
    });
  }

  const version = parseInstalledDriverVersion(list.stdout, driver);
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

async function checkJava(runner: CommandRunner): Promise<MobileDependencyCheck> {
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
      installHint: isMac
        ? 'Install Java 17+ (for example `brew install --cask temurin`).'
        : 'Install Java 17+ and ensure JAVA_HOME is configured.',
      installCommand: isMac ? 'brew install --cask temurin' : undefined,
      autoFixAvailable: isMac,
      docsUrl: DOCS.androidSdkManager,
    });
  }

  const versionResult = await runner.run('java', ['-version'], { timeoutMs: 8_000 });
  const mergedOutput = `${versionResult.stdout}\n${versionResult.stderr}`;
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
      installHint: isMac ? 'Upgrade Java with `brew install --cask temurin`.' : 'Upgrade Java to 17+.',
      installCommand: isMac ? 'brew install --cask temurin' : undefined,
      autoFixAvailable: isMac,
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
}): Promise<MobileDependencyCheck> {
  const binaryPath = await resolveBinary(input.runner, input.binary);
  if (!binaryPath) {
    return buildCheck({
      id: input.id,
      label: input.label,
      scope: input.scope,
      requiredFor: input.requiredFor,
      status: 'missing',
      description: input.description,
      message: `${input.binary} was not found on PATH.`,
      docsUrl: input.docsUrl,
      installHint: input.installHint,
      installCommand: input.installCommand,
      autoFixAvailable: input.autoFixAvailable,
    });
  }

  const args = input.versionArgs ?? ['--version'];
  const result = await input.runner.run(input.binary, args, { timeoutMs: 10_000 });
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
  const checks: MobileDependencyCheck[] = [];

  checks.push(await checkXcode(runner, hostPlatform));
  checks.push(await checkSimctl(runner, hostPlatform));
  checks.push(await checkAppium(runner));
  checks.push(await checkAppiumDriver(runner, 'xcuitest'));
  checks.push(await checkJava(runner));
  checks.push(await checkBinaryWithVersion({
    runner,
    id: 'android-sdkmanager',
    label: 'Android sdkmanager',
    scope: 'android',
    requiredFor: ['android'],
    description: 'Installs and updates Android SDK packages needed for emulator automation.',
    binary: 'sdkmanager',
    versionArgs: ['--version'],
    docsUrl: DOCS.androidSdkManager,
    installHint: isMac
      ? 'Install Android command line tools with Homebrew.'
      : 'Install Android command line tools and ensure sdkmanager is on PATH.',
    installCommand: isMac ? 'brew install --cask android-commandlinetools' : undefined,
    autoFixAvailable: isMac,
  }));
  checks.push(await checkBinaryWithVersion({
    runner,
    id: 'android-avdmanager',
    label: 'Android avdmanager',
    scope: 'android',
    requiredFor: ['android'],
    description: 'Creates and manages Android Virtual Devices used by local simulator runs.',
    binary: 'avdmanager',
    versionArgs: ['--version'],
    docsUrl: DOCS.androidAvdManager,
    installHint: isMac
      ? 'Install Android command line tools with Homebrew.'
      : 'Install Android command line tools and ensure avdmanager is on PATH.',
    installCommand: isMac ? 'brew install --cask android-commandlinetools' : undefined,
    autoFixAvailable: isMac,
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
    docsUrl: DOCS.androidSdkManager,
    installHint: isMac
      ? 'Install Android platform tools with Homebrew.'
      : 'Install Android platform-tools and ensure adb is on PATH.',
    installCommand: isMac ? 'brew install --cask android-platform-tools' : undefined,
    autoFixAvailable: isMac,
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
    installHint: isMac
      ? 'Install with `brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro`.'
      : 'Install Maestro CLI from official docs.',
    installCommand: isMac ? 'brew install mobile-dev-inc/tap/maestro' : undefined,
    autoFixAvailable: isMac,
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
  dependencyId: MobileDependencyId,
  options?: DoctorOptions,
): Promise<MobileDependencyInstallResult> {
  const runner = options?.runner ?? defaultRunner;
  const hostPlatform = options?.hostPlatform ?? process.platform;
  const spec = INSTALL_SPECS[dependencyId];

  if (!spec) {
    return {
      dependencyId,
      success: false,
      message: 'No automatic install command is configured for this dependency.',
    };
  }

  if (spec.macOnly && hostPlatform !== 'darwin') {
    return {
      dependencyId,
      success: false,
      message: 'Automatic install for this dependency is only available on macOS.',
    };
  }

  const commandParts: string[] = [];
  let combinedStdout = '';
  let combinedStderr = '';

  for (const step of spec.steps) {
    commandParts.push([step.command, ...step.args].join(' '));
    const result = await runner.run(step.command, step.args, {
      timeoutMs: step.timeoutMs ?? INSTALL_TIMEOUT_MS,
    });
    combinedStdout += `${result.stdout}\n`;
    combinedStderr += `${result.stderr}\n`;

    if (result.code !== 0) {
      return {
        dependencyId,
        success: false,
        message: firstNonEmptyLine(result.stderr, result.stdout) || 'Install command failed.',
        command: commandParts.join(' && '),
        stdout: combinedStdout.trim(),
        stderr: combinedStderr.trim(),
      };
    }
  }

  return {
    dependencyId,
    success: true,
    message: 'Install command finished successfully.',
    command: commandParts.join(' && '),
    stdout: combinedStdout.trim(),
    stderr: combinedStderr.trim(),
  };
}

export const _internal = {
  parseInstalledDriverVersion,
  parseJavaMajor,
};

