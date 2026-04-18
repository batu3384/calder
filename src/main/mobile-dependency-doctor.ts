import { execFile, spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { getFullPath } from './pty-manager';
import { whichCmd } from './platform';
import type {
  MobileDependencyCheck,
  MobileDependencyId,
  MobileDependencyInstallProgressEvent,
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
  env?: NodeJS.ProcessEnv;
}

interface InstallDependencyOptions extends DoctorOptions {
  installId?: string;
  onProgress?: (event: MobileDependencyInstallProgressEvent) => void;
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
    steps: [
      { command: 'brew', args: ['install', 'openjdk'] },
      { command: 'brew', args: ['link', '--overwrite', '--force', 'openjdk'] },
    ],
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

const BYTE_UNITS = new Map<string, number>([
  ['B', 1],
  ['BYTE', 1],
  ['BYTES', 1],
  ['KB', 1024],
  ['KIB', 1024],
  ['MB', 1024 * 1024],
  ['MIB', 1024 * 1024],
  ['GB', 1024 * 1024 * 1024],
  ['GIB', 1024 * 1024 * 1024],
  ['TB', 1024 * 1024 * 1024 * 1024],
  ['TIB', 1024 * 1024 * 1024 * 1024],
]);

const ANSI_ESCAPE_RE = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const ANSI_CSI_RE = /\u009B[0-?]*[ -/]*[@-~]/g;

function toBytes(value: number, unitRaw: string): number {
  const unit = unitRaw.toUpperCase();
  const multiplier = BYTE_UNITS.get(unit);
  if (!multiplier) return Math.round(value);
  return Math.round(value * multiplier);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function parsePercentFromLine(line: string): number | null {
  const matches = [...line.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)];
  if (matches.length === 0) return null;
  const raw = Number(matches[matches.length - 1]?.[1] ?? '');
  if (!Number.isFinite(raw)) return null;
  return clampPercent(raw);
}

function parseBytePairFromLine(line: string): { downloadedBytes: number; totalBytes: number; remainingBytes: number } | null {
  const match = line.match(
    /(\d+(?:\.\d+)?)\s*(B|bytes?|KiB|KB|MiB|MB|GiB|GB|TiB|TB)\s*\/\s*(\d+(?:\.\d+)?)\s*(B|bytes?|KiB|KB|MiB|MB|GiB|GB|TiB|TB)/i,
  );
  if (!match) return null;
  const downloadedRaw = Number(match[1]);
  const totalRaw = Number(match[3]);
  if (!Number.isFinite(downloadedRaw) || !Number.isFinite(totalRaw) || totalRaw <= 0) return null;
  const downloadedBytes = toBytes(downloadedRaw, match[2]);
  const totalBytes = toBytes(totalRaw, match[4]);
  if (!Number.isFinite(downloadedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return null;
  const remainingBytes = Math.max(0, totalBytes - downloadedBytes);
  return { downloadedBytes, totalBytes, remainingBytes };
}

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

function firstNonEmptyLine(...chunks: Array<string | undefined>): string {
  for (const chunk of chunks) {
    if (!chunk) continue;
    const line = chunk
      .split(/\r?\n/)
      .map((entry) => stripAnsi(entry).trim())
      .find(Boolean);
    if (line) return line;
  }
  return '';
}

function stripAnsi(input: string): string {
  if (!input) return input;
  return input.replace(ANSI_ESCAPE_RE, '').replace(ANSI_CSI_RE, '');
}

function normalizeInstallFailureMessage(raw: string, command: string): string {
  const message = stripAnsi(raw).trim();
  if (!message) {
    return 'Install command failed.';
  }
  if (/ENOENT/i.test(message) || /command not found/i.test(message) || /not recognized as an internal or external command/i.test(message)) {
    return `Command not found: ${command}. Install it and ensure PATH is configured.`;
  }
  return message;
}

function sanitizeCommandResult(result: CommandResult): CommandResult {
  return {
    code: result.code,
    stdout: stripAnsi(result.stdout),
    stderr: stripAnsi(result.stderr),
  };
}

function getAppiumDriverInstallTarget(step: InstallStep): string | null {
  if (step.args.length < 3) return null;
  if (step.args[0] !== 'driver' || step.args[1] !== 'install') return null;
  return step.args[2] || null;
}

function isDriverAlreadyInstalledFailure(step: InstallStep, result: CommandResult): boolean {
  const target = getAppiumDriverInstallTarget(step);
  if (!target) return false;
  const message = `${result.stderr}\n${result.stdout}`.toLowerCase();
  return message.includes('already installed');
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

function isMissingJavaRuntimeOutput(output: string): boolean {
  const lowered = output.toLowerCase();
  return lowered.includes('unable to locate a java runtime')
    || lowered.includes('no java runtime present')
    || lowered.includes('could not find java');
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveDriverAliases(driverName: 'xcuitest' | 'uiautomator2'): string[] {
  if (driverName === 'xcuitest') {
    return ['xcuitest', 'appium-xcuitest-driver'];
  }
  return ['uiautomator2', 'appium-uiautomator2-driver'];
}

function parseInstalledDriverVersion(stdout: string, driverName: 'xcuitest' | 'uiautomator2'): string | undefined {
  const cleaned = stripAnsi(stdout);
  const aliases = resolveDriverAliases(driverName).map((alias) => escapeRegExp(alias)).join('|');
  const pattern = new RegExp(`\\b(?:${aliases})\\b\\s*(?:@|\\s)\\s*([0-9A-Za-z._-]+)\\b`, 'i');
  const match = cleaned.match(pattern);
  return match?.[1];
}

function parseInstalledDriverFromJson(
  output: string,
  driverName: 'xcuitest' | 'uiautomator2',
): { installed: boolean; version?: string } | undefined {
  const cleaned = stripAnsi(output).trim();
  if (!cleaned) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return undefined;
  }

  const aliases = new Set(resolveDriverAliases(driverName).map((alias) => alias.toLowerCase()));
  const normalizeVersion = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  };
  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

  const evaluateMatch = (entryName: string, meta: unknown): { installed: boolean; version?: string } | null => {
    const metaRecord = asRecord(meta);
    const normalizedName = entryName.toLowerCase();
    const pkgName = typeof metaRecord?.pkgName === 'string' ? metaRecord.pkgName.toLowerCase() : '';
    const installSpec = typeof metaRecord?.installSpec === 'string' ? metaRecord.installSpec.toLowerCase() : '';
    if (!aliases.has(normalizedName) && !aliases.has(pkgName) && !aliases.has(installSpec)) {
      return null;
    }

    const installed = typeof metaRecord?.installed === 'boolean' ? metaRecord.installed : true;
    const version = normalizeVersion(metaRecord?.version ?? meta);
    return { installed, version };
  };

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const record = asRecord(entry);
      if (!record) continue;
      const nameCandidate =
        typeof record.name === 'string'
          ? record.name
          : typeof record.driver === 'string'
            ? record.driver
            : '';
      const matched = evaluateMatch(nameCandidate, record);
      if (matched) return matched;
    }
    return { installed: false };
  }

  const root = asRecord(parsed);
  if (!root) return undefined;
  for (const [entryName, meta] of Object.entries(root)) {
    const matched = evaluateMatch(entryName, meta);
    if (matched) return matched;
  }

  return { installed: false };
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of paths) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const normalized = trimmed.replace(/[\\/]+$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function getAndroidSdkRoots(env: NodeJS.ProcessEnv): string[] {
  const roots: string[] = [];
  if (env.ANDROID_HOME) roots.push(env.ANDROID_HOME);
  if (env.ANDROID_SDK_ROOT) roots.push(env.ANDROID_SDK_ROOT);

  const home = env.HOME || os.homedir();
  if (home) {
    roots.push(path.join(home, 'Library', 'Android', 'sdk'));
    roots.push(path.join(home, 'Android', 'Sdk'));
    roots.push(path.join(home, 'AppData', 'Local', 'Android', 'Sdk'));
  }

  if (env.LOCALAPPDATA) {
    roots.push(path.join(env.LOCALAPPDATA, 'Android', 'Sdk'));
  }

  return uniquePaths(roots);
}

function getAndroidBinaryCandidates(
  binary: 'sdkmanager' | 'avdmanager' | 'adb' | 'emulator',
  env: NodeJS.ProcessEnv,
  hostPlatform: NodeJS.Platform,
): string[] {
  const sdkRoots = getAndroidSdkRoots(env);
  const isWindowsHost = hostPlatform === 'win32';
  const commandName = isWindowsHost
    ? binary === 'adb' || binary === 'emulator'
      ? `${binary}.exe`
      : `${binary}.bat`
    : binary;

  if (binary === 'sdkmanager' || binary === 'avdmanager') {
    const suffixes = [
      path.join('cmdline-tools', 'latest', 'bin', commandName),
      path.join('cmdline-tools', 'bin', commandName),
      path.join('tools', 'bin', commandName),
    ];
    return uniquePaths(
      sdkRoots.flatMap((sdkRoot) => suffixes.map((suffix) => path.join(sdkRoot, suffix))),
    );
  }

  if (binary === 'adb') {
    return uniquePaths(sdkRoots.map((sdkRoot) => path.join(sdkRoot, 'platform-tools', commandName)));
  }

  return uniquePaths(sdkRoots.map((sdkRoot) => path.join(sdkRoot, 'emulator', commandName)));
}

async function resolveBinary(
  runner: CommandRunner,
  binary: string,
  options?: { fallbackPaths?: string[]; probeArgs?: string[] },
): Promise<string | null> {
  const check = await runner.run(whichCmd, [binary], { timeoutMs: 4_000 });
  if (check.code === 0) {
    const first = firstNonEmptyLine(check.stdout, check.stderr);
    if (first) return first;
  }

  const fallbackPaths = options?.fallbackPaths ?? [];
  if (fallbackPaths.length === 0) return null;

  const probeArgs = options?.probeArgs ?? ['--version'];
  for (const fallbackPath of fallbackPaths) {
    const probe = await runner.run(fallbackPath, probeArgs, { timeoutMs: 8_000 });
    if (probe.code === 0) {
      return fallbackPath;
    }
  }

  return null;
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

export async function installMobileDependency(
  dependencyId: MobileDependencyId,
  options?: InstallDependencyOptions,
): Promise<MobileDependencyInstallResult> {
  const runner = options?.runner ?? defaultRunner;
  const hostPlatform = options?.hostPlatform ?? process.platform;
  const env = options?.env ?? process.env;
  const installId = options?.installId || createInstallId();
  const onProgress = options?.onProgress;
  const startedAt = new Date().toISOString();
  const spec = INSTALL_SPECS[dependencyId];

  if (!spec) {
    onProgress?.(buildProgressEvent({
      installId,
      dependencyId,
      phase: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      message: 'No automatic install command is configured for this dependency.',
      percent: 0,
    }));
    return {
      dependencyId,
      success: false,
      message: 'No automatic install command is configured for this dependency.',
    };
  }

  if (spec.macOnly && hostPlatform !== 'darwin') {
    onProgress?.(buildProgressEvent({
      installId,
      dependencyId,
      phase: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      message: 'Automatic install for this dependency is only available on macOS.',
      percent: 0,
    }));
    return {
      dependencyId,
      success: false,
      message: 'Automatic install for this dependency is only available on macOS.',
    };
  }

  const commandParts: string[] = [];
  let combinedStdout = '';
  let combinedStderr = '';
  let installSteps = spec.steps;
  let alreadyInstalledNote: string | null = null;

  if (dependencyId === 'android-emulator') {
    const resolvedSdkManager = await resolveBinary(runner, 'sdkmanager', {
      fallbackPaths: getAndroidBinaryCandidates('sdkmanager', env, hostPlatform),
      probeArgs: ['--version'],
    });
    if (resolvedSdkManager) {
      installSteps = spec.steps.map((step) =>
        step.command === 'sdkmanager'
          ? { ...step, command: resolvedSdkManager }
          : step,
      );
    }
  }

  const totalSteps = installSteps.length;
  onProgress?.(buildProgressEvent({
    installId,
    dependencyId,
    phase: 'started',
    startedAt,
    totalSteps,
    percent: 0,
    message: 'Starting installation...',
  }));

  for (let index = 0; index < installSteps.length; index += 1) {
    const step = installSteps[index]!;
    const stepIndex = index + 1;
    const commandText = [step.command, ...step.args].join(' ');
    const stepDriverTarget = getAppiumDriverInstallTarget(step);
    commandParts.push(commandText);

    onProgress?.(buildProgressEvent({
      installId,
      dependencyId,
      phase: 'step_started',
      startedAt,
      stepIndex,
      totalSteps,
      command: commandText,
      percent: computeOverallPercent(totalSteps, stepIndex, 0),
      stepPercent: 0,
      message: `Running step ${stepIndex}/${totalSteps}`,
    }));

    const stdoutRemainder = { value: '' };
    const stderrRemainder = { value: '' };
    let latestStepPercent: number | undefined;
    let latestDownloadedBytes: number | undefined;
    let latestTotalBytes: number | undefined;
    let latestRemainingBytes: number | undefined;

    const processInstallLine = (source: 'stdout' | 'stderr', line: string): void => {
      const cleanedLine = stripAnsi(line).trim();
      if (!cleanedLine) return;
      if (stepDriverTarget && /already installed/i.test(cleanedLine)) {
        return;
      }
      const parsedPercent = parsePercentFromLine(cleanedLine);
      if (parsedPercent !== null) {
        latestStepPercent = parsedPercent;
      }
      const parsedBytes = parseBytePairFromLine(cleanedLine);
      if (parsedBytes) {
        latestDownloadedBytes = parsedBytes.downloadedBytes;
        latestTotalBytes = parsedBytes.totalBytes;
        latestRemainingBytes = parsedBytes.remainingBytes;
      }

      onProgress?.(buildProgressEvent({
        installId,
        dependencyId,
        phase: 'step_progress',
        startedAt,
        stepIndex,
        totalSteps,
        command: commandText,
        source,
        detail: cleanedLine,
        stepPercent: latestStepPercent,
        downloadedBytes: latestDownloadedBytes,
        totalBytes: latestTotalBytes,
        remainingBytes: latestRemainingBytes,
        percent: computeOverallPercent(
          totalSteps,
          stepIndex,
          latestStepPercent,
          latestDownloadedBytes,
          latestTotalBytes,
        ),
      }));
    };

    const rawResult = await runInstallStep(
      runner,
      step,
      step.timeoutMs ?? INSTALL_TIMEOUT_MS,
      (source, chunk) => {
        const remainderRef = source === 'stdout' ? stdoutRemainder : stderrRemainder;
        pushChunkLines(chunk, remainderRef, (line) => processInstallLine(source, line));
      },
    );
    const result = sanitizeCommandResult(rawResult);

    if (stdoutRemainder.value.trim()) {
      processInstallLine('stdout', stdoutRemainder.value.trim());
    }
    if (stderrRemainder.value.trim()) {
      processInstallLine('stderr', stderrRemainder.value.trim());
    }

    combinedStdout += `${result.stdout}\n`;
    combinedStderr += `${result.stderr}\n`;

    if (result.code !== 0) {
      if (isDriverAlreadyInstalledFailure(step, result)) {
        const driverName = getAppiumDriverInstallTarget(step) ?? 'driver';
        const note = `Driver ${driverName} is already installed.`;
        alreadyInstalledNote = note;
        onProgress?.(buildProgressEvent({
          installId,
          dependencyId,
          phase: 'step_finished',
          startedAt,
          stepIndex,
          totalSteps,
          command: commandText,
          message: note,
          detail: note,
          percent: computeOverallPercent(totalSteps, stepIndex + 1, 0),
          stepPercent: 100,
        }));
        continue;
      }
      const failureMessage = normalizeInstallFailureMessage(
        firstNonEmptyLine(result.stderr, result.stdout),
        step.command,
      );
      onProgress?.(buildProgressEvent({
        installId,
        dependencyId,
        phase: 'failed',
        startedAt,
        finishedAt: new Date().toISOString(),
        stepIndex,
        totalSteps,
        command: commandText,
        message: failureMessage,
        detail: result.stderr || result.stdout,
        percent: computeOverallPercent(totalSteps, stepIndex, latestStepPercent, latestDownloadedBytes, latestTotalBytes),
        stepPercent: latestStepPercent,
        downloadedBytes: latestDownloadedBytes,
        totalBytes: latestTotalBytes,
        remainingBytes: latestRemainingBytes,
      }));
      return {
        dependencyId,
        success: false,
        message: failureMessage,
        command: commandParts.join(' && '),
        stdout: combinedStdout.trim(),
        stderr: combinedStderr.trim(),
      };
    }

    onProgress?.(buildProgressEvent({
      installId,
      dependencyId,
      phase: 'step_finished',
      startedAt,
      stepIndex,
      totalSteps,
      command: commandText,
      message: `Step ${stepIndex}/${totalSteps} completed.`,
      percent: computeOverallPercent(totalSteps, stepIndex + 1, 0),
      stepPercent: 100,
      downloadedBytes: latestDownloadedBytes,
      totalBytes: latestTotalBytes,
      remainingBytes: latestRemainingBytes,
    }));
  }

  onProgress?.(buildProgressEvent({
    installId,
    dependencyId,
    phase: 'finished',
    startedAt,
    finishedAt: new Date().toISOString(),
    totalSteps,
    percent: 100,
    message: alreadyInstalledNote || 'Install command finished successfully.',
  }));

  const successMessage = alreadyInstalledNote || 'Install command finished successfully.';
  return {
    dependencyId,
    success: true,
    message: successMessage,
    command: commandParts.join(' && '),
    stdout: combinedStdout.trim(),
    stderr: combinedStderr.trim(),
  };
}

export const _internal = {
  parseInstalledDriverVersion,
  parseInstalledDriverFromJson,
  parseJavaMajor,
};
