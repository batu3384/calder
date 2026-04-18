import { describe, expect, it } from 'vitest';
import { checkMobileDependencies, installMobileDependency, _internal } from './mobile-dependency-doctor';

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

class StubRunner {
  private readonly responses = new Map<string, CommandResult>();
  readonly calls: Array<{ command: string; args: string[] }> = [];

  set(command: string, args: string[], result: Partial<CommandResult>): void {
    this.responses.set(this.key(command, args), {
      code: result.code ?? 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    });
  }

  async run(command: string, args: string[]): Promise<CommandResult> {
    this.calls.push({ command, args });
    const direct = this.responses.get(this.key(command, args));
    if (direct) return direct;

    if (command === 'which' || command === 'where') {
      return { code: 1, stdout: '', stderr: `${args[0] ?? command} not found` };
    }
    return { code: 1, stdout: '', stderr: `${command} failed` };
  }

  private key(command: string, args: string[]): string {
    return `${command}::${args.join('\u0000')}`;
  }
}

describe('mobile-dependency-doctor helpers', () => {
  it('parses java major versions from classic and modern outputs', () => {
    expect(_internal.parseJavaMajor('openjdk version "17.0.12" 2024-07-16')).toBe(17);
    expect(_internal.parseJavaMajor('java version "1.8.0_412"')).toBe(8);
    expect(_internal.parseJavaMajor('not-a-version')).toBeNull();
  });

  it('parses installed appium driver versions', () => {
    const output = [
      ' - xcuitest@7.26.0 [installed]',
      ' - uiautomator2@3.2.1 [installed]',
    ].join('\n');
    expect(_internal.parseInstalledDriverVersion(output, 'xcuitest')).toBe('7.26.0');
    expect(_internal.parseInstalledDriverVersion(output, 'uiautomator2')).toBe('3.2.1');
    expect(_internal.parseInstalledDriverVersion(output, 'xcuitest')).not.toBeUndefined();

    const ansiOutput = '- \u001b[33mxcuitest\u001b[39m@\u001b[33m11.0.0\u001b[39m \u001b[32m[installed]\u001b[39m';
    expect(_internal.parseInstalledDriverVersion(ansiOutput, 'xcuitest')).toBe('11.0.0');
  });

  it('parses installed appium drivers from JSON output', () => {
    const jsonOutput = JSON.stringify({
      xcuitest: {
        pkgName: 'appium-xcuitest-driver',
        version: '11.0.0',
        installed: true,
      },
      uiautomator2: {
        pkgName: 'appium-uiautomator2-driver',
        version: '4.1.0',
        installed: true,
      },
    });

    expect(_internal.parseInstalledDriverFromJson(jsonOutput, 'xcuitest')).toEqual({
      installed: true,
      version: '11.0.0',
    });
    expect(_internal.parseInstalledDriverFromJson(jsonOutput, 'uiautomator2')).toEqual({
      installed: true,
      version: '4.1.0',
    });
  });
});

describe('checkMobileDependencies', () => {
  it('marks iOS checks as unsupported on non-mac hosts and surfaces required missing Android deps', async () => {
    const runner = new StubRunner();
    const report = await checkMobileDependencies({ runner, hostPlatform: 'linux' });

    const xcode = report.checks.find((entry) => entry.id === 'xcode');
    const simctl = report.checks.find((entry) => entry.id === 'simctl');

    expect(xcode?.status).toBe('unsupported');
    expect(simctl?.status).toBe('unsupported');
    expect(report.summary.requiredMissing).toBe(8);
    expect(report.summary.optionalMissing).toBe(1);
    expect(report.summary.ready).toBe(0);
  });

  it('returns a fully ready report when required binaries and drivers exist', async () => {
    const runner = new StubRunner();

    runner.set('which', ['xcodebuild'], { code: 0, stdout: '/usr/bin/xcodebuild\n' });
    runner.set('xcodebuild', ['-version'], { code: 0, stdout: 'Xcode 16.0\nBuild version 16A123\n' });
    runner.set('xcrun', ['simctl', 'help'], { code: 0, stdout: 'usage: simctl ...\n' });

    runner.set('which', ['appium'], { code: 0, stdout: '/usr/local/bin/appium\n' });
    runner.set('appium', ['--version'], { code: 0, stdout: '3.0.0\n' });
    runner.set('appium', ['driver', 'list', '--installed'], {
      code: 0,
      stdout: ' - xcuitest@7.26.0 [installed]\n - uiautomator2@3.2.1 [installed]\n',
    });

    runner.set('which', ['java'], { code: 0, stdout: '/usr/bin/java\n' });
    runner.set('java', ['-version'], { code: 0, stderr: 'openjdk version "17.0.12"\n' });

    runner.set('which', ['sdkmanager'], { code: 0, stdout: '/opt/android/sdkmanager\n' });
    runner.set('sdkmanager', ['--version'], { code: 0, stdout: '12.0\n' });
    runner.set('/opt/android/sdkmanager', ['--version'], { code: 0, stdout: '12.0\n' });

    runner.set('which', ['avdmanager'], { code: 0, stdout: '/opt/android/avdmanager\n' });
    runner.set('avdmanager', ['list', 'target'], { code: 0, stdout: 'Available Android targets:\n' });
    runner.set('/opt/android/avdmanager', ['list', 'target'], { code: 0, stdout: 'Available Android targets:\n' });

    runner.set('which', ['adb'], { code: 0, stdout: '/opt/android/adb\n' });
    runner.set('adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });
    runner.set('/opt/android/adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });

    runner.set('which', ['emulator'], { code: 0, stdout: '/opt/android/emulator\n' });
    runner.set('emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });
    runner.set('/opt/android/emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });

    runner.set('which', ['maestro'], { code: 0, stdout: '/usr/local/bin/maestro\n' });
    runner.set('maestro', ['--version'], { code: 0, stdout: '1.39.13\n' });
    runner.set('/usr/local/bin/maestro', ['--version'], { code: 0, stdout: '1.39.13\n' });

    const report = await checkMobileDependencies({ runner, hostPlatform: 'darwin' });

    expect(report.summary.requiredMissing).toBe(0);
    expect(report.summary.warnings).toBe(0);
    expect(report.summary.ready).toBe(11);
    expect(report.checks.every((entry) => entry.status === 'ready')).toBe(true);
  });

  it('marks drivers as warning when appium driver list command fails', async () => {
    const runner = new StubRunner();

    runner.set('which', ['xcodebuild'], { code: 0, stdout: '/usr/bin/xcodebuild\n' });
    runner.set('xcodebuild', ['-version'], { code: 0, stdout: 'Xcode 16.0\nBuild version 16A123\n' });
    runner.set('xcrun', ['simctl', 'help'], { code: 0, stdout: 'usage: simctl ...\n' });

    runner.set('which', ['appium'], { code: 0, stdout: '/usr/local/bin/appium\n' });
    runner.set('appium', ['--version'], { code: 0, stdout: '3.0.0\n' });
    runner.set('appium', ['driver', 'list', '--installed'], {
      code: 1,
      stderr: 'driver list failed',
    });

    runner.set('which', ['java'], { code: 0, stdout: '/usr/bin/java\n' });
    runner.set('java', ['-version'], { code: 0, stderr: 'openjdk version "17.0.12"\n' });
    runner.set('which', ['sdkmanager'], { code: 0, stdout: '/opt/android/sdkmanager\n' });
    runner.set('sdkmanager', ['--version'], { code: 0, stdout: '12.0\n' });
    runner.set('/opt/android/sdkmanager', ['--version'], { code: 0, stdout: '12.0\n' });
    runner.set('which', ['avdmanager'], { code: 0, stdout: '/opt/android/avdmanager\n' });
    runner.set('avdmanager', ['list', 'target'], { code: 0, stdout: 'Available Android targets:\n' });
    runner.set('/opt/android/avdmanager', ['list', 'target'], { code: 0, stdout: 'Available Android targets:\n' });
    runner.set('which', ['adb'], { code: 0, stdout: '/opt/android/adb\n' });
    runner.set('adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });
    runner.set('/opt/android/adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });
    runner.set('which', ['emulator'], { code: 0, stdout: '/opt/android/emulator\n' });
    runner.set('emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });
    runner.set('/opt/android/emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });
    runner.set('which', ['maestro'], { code: 1 });

    const report = await checkMobileDependencies({ runner, hostPlatform: 'darwin' });
    const iosDriver = report.checks.find((entry) => entry.id === 'appium-xcuitest-driver');
    const androidDriver = report.checks.find((entry) => entry.id === 'appium-uiautomator2-driver');

    expect(iosDriver?.status).toBe('warning');
    expect(androidDriver?.status).toBe('warning');
    expect(iosDriver?.autoFixAvailable).toBe(true);
    expect(androidDriver?.autoFixAvailable).toBe(true);
  });

  it('marks java as missing when command exists but runtime is not installed', async () => {
    const runner = new StubRunner();

    runner.set('which', ['xcodebuild'], { code: 0, stdout: '/usr/bin/xcodebuild\n' });
    runner.set('xcodebuild', ['-version'], { code: 0, stdout: 'Xcode 16.0\nBuild version 16A123\n' });
    runner.set('xcrun', ['simctl', 'help'], { code: 0, stdout: 'usage: simctl ...\n' });

    runner.set('which', ['appium'], { code: 0, stdout: '/usr/local/bin/appium\n' });
    runner.set('appium', ['--version'], { code: 0, stdout: '3.0.0\n' });
    runner.set('appium', ['driver', 'list', '--installed'], {
      code: 0,
      stdout: ' - xcuitest@7.26.0 [installed]\n - uiautomator2@3.2.1 [installed]\n',
    });

    runner.set('which', ['java'], { code: 0, stdout: '/usr/bin/java\n' });
    runner.set('java', ['-version'], {
      code: 1,
      stderr: 'Unable to locate a Java Runtime.',
    });

    runner.set('which', ['sdkmanager'], { code: 0, stdout: '/opt/android/sdkmanager\n' });
    runner.set('sdkmanager', ['--version'], { code: 0, stdout: '12.0\n' });
    runner.set('/opt/android/sdkmanager', ['--version'], { code: 0, stdout: '12.0\n' });
    runner.set('which', ['avdmanager'], { code: 0, stdout: '/opt/android/avdmanager\n' });
    runner.set('avdmanager', ['list', 'target'], { code: 0, stdout: 'Available Android targets:\n' });
    runner.set('/opt/android/avdmanager', ['list', 'target'], { code: 0, stdout: 'Available Android targets:\n' });
    runner.set('which', ['adb'], { code: 0, stdout: '/opt/android/adb\n' });
    runner.set('adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });
    runner.set('/opt/android/adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });
    runner.set('which', ['emulator'], { code: 0, stdout: '/opt/android/emulator\n' });
    runner.set('emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });
    runner.set('/opt/android/emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });
    runner.set('which', ['maestro'], { code: 1 });

    const report = await checkMobileDependencies({ runner, hostPlatform: 'darwin' });
    const java = report.checks.find((entry) => entry.id === 'java-jdk');

    expect(java?.status).toBe('missing');
    expect(java?.message).toContain('no Java runtime is installed');
  });

  it('detects installed Appium driver versions from ansi-colored list output', async () => {
    const runner = new StubRunner();

    runner.set('which', ['xcodebuild'], { code: 0, stdout: '/usr/bin/xcodebuild\n' });
    runner.set('xcodebuild', ['-version'], { code: 0, stdout: 'Xcode 16.0\nBuild version 16A123\n' });
    runner.set('xcrun', ['simctl', 'help'], { code: 0, stdout: 'usage: simctl ...\n' });

    runner.set('which', ['appium'], { code: 0, stdout: '/usr/local/bin/appium\n' });
    runner.set('appium', ['--version'], { code: 0, stdout: '3.0.0\n' });
    runner.set('appium', ['driver', 'list', '--installed'], {
      code: 0,
      stdout: '- \u001b[33mxcuitest\u001b[39m@\u001b[33m11.0.0\u001b[39m \u001b[32m[installed]\u001b[39m\n- \u001b[33muiautomator2\u001b[39m@\u001b[33m4.1.0\u001b[39m \u001b[32m[installed]\u001b[39m\n',
    });

    runner.set('which', ['java'], { code: 0, stdout: '/usr/bin/java\n' });
    runner.set('java', ['-version'], { code: 0, stderr: 'openjdk version "17.0.12"\n' });
    runner.set('which', ['sdkmanager'], { code: 0, stdout: '/opt/android/sdkmanager\n' });
    runner.set('sdkmanager', ['--version'], { code: 0, stdout: '12.0\n' });
    runner.set('/opt/android/sdkmanager', ['--version'], { code: 0, stdout: '12.0\n' });
    runner.set('which', ['avdmanager'], { code: 0, stdout: '/opt/android/avdmanager\n' });
    runner.set('avdmanager', ['list', 'target'], { code: 0, stdout: 'Available Android targets:\n' });
    runner.set('/opt/android/avdmanager', ['list', 'target'], { code: 0, stdout: 'Available Android targets:\n' });
    runner.set('which', ['adb'], { code: 0, stdout: '/opt/android/adb\n' });
    runner.set('adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });
    runner.set('/opt/android/adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });
    runner.set('which', ['emulator'], { code: 0, stdout: '/opt/android/emulator\n' });
    runner.set('emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });
    runner.set('/opt/android/emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });
    runner.set('which', ['maestro'], { code: 1 });

    const report = await checkMobileDependencies({ runner, hostPlatform: 'darwin' });
    expect(report.checks.find((entry) => entry.id === 'appium-xcuitest-driver')?.status).toBe('ready');
    expect(report.checks.find((entry) => entry.id === 'appium-uiautomator2-driver')?.status).toBe('ready');
  });

  it('prefers JSON driver list output when available even if plain list command fails', async () => {
    const runner = new StubRunner();

    runner.set('which', ['xcodebuild'], { code: 0, stdout: '/usr/bin/xcodebuild\n' });
    runner.set('xcodebuild', ['-version'], { code: 0, stdout: 'Xcode 16.0\nBuild version 16A123\n' });
    runner.set('xcrun', ['simctl', 'help'], { code: 0, stdout: 'usage: simctl ...\n' });

    runner.set('which', ['appium'], { code: 0, stdout: '/usr/local/bin/appium\n' });
    runner.set('appium', ['--version'], { code: 0, stdout: '3.0.0\n' });
    runner.set('appium', ['driver', 'list', '--installed', '--json'], {
      code: 0,
      stdout: JSON.stringify({
        xcuitest: {
          pkgName: 'appium-xcuitest-driver',
          version: '11.0.0',
          installed: true,
        },
        uiautomator2: {
          pkgName: 'appium-uiautomator2-driver',
          version: '4.1.0',
          installed: true,
        },
      }),
    });
    runner.set('appium', ['driver', 'list', '--installed'], {
      code: 1,
      stderr: 'plain list failed',
    });

    runner.set('which', ['java'], { code: 0, stdout: '/usr/bin/java\n' });
    runner.set('java', ['-version'], { code: 0, stderr: 'openjdk version "17.0.12"\n' });
    runner.set('which', ['sdkmanager'], { code: 0, stdout: '/opt/android/sdkmanager\n' });
    runner.set('sdkmanager', ['--version'], { code: 0, stdout: '12.0\n' });
    runner.set('/opt/android/sdkmanager', ['--version'], { code: 0, stdout: '12.0\n' });
    runner.set('which', ['avdmanager'], { code: 0, stdout: '/opt/android/avdmanager\n' });
    runner.set('avdmanager', ['list', 'target'], { code: 0, stdout: 'Available Android targets:\n' });
    runner.set('/opt/android/avdmanager', ['list', 'target'], { code: 0, stdout: 'Available Android targets:\n' });
    runner.set('which', ['adb'], { code: 0, stdout: '/opt/android/adb\n' });
    runner.set('adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });
    runner.set('/opt/android/adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });
    runner.set('which', ['emulator'], { code: 0, stdout: '/opt/android/emulator\n' });
    runner.set('emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });
    runner.set('/opt/android/emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });
    runner.set('which', ['maestro'], { code: 1 });

    const report = await checkMobileDependencies({ runner, hostPlatform: 'darwin' });
    expect(report.checks.find((entry) => entry.id === 'appium-xcuitest-driver')?.status).toBe('ready');
    expect(report.checks.find((entry) => entry.id === 'appium-uiautomator2-driver')?.status).toBe('ready');
  });

  it('detects Android SDK tools from ANDROID_HOME even when binaries are not on PATH', async () => {
    const runner = new StubRunner();
    const prevAndroidHome = process.env.ANDROID_HOME;
    const prevAndroidSdkRoot = process.env.ANDROID_SDK_ROOT;
    process.env.ANDROID_HOME = '/opt/android-sdk';
    delete process.env.ANDROID_SDK_ROOT;

    runner.set('/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager', ['--version'], {
      code: 0,
      stdout: '12.0\n',
    });
    runner.set('/opt/android-sdk/cmdline-tools/latest/bin/avdmanager', ['list', 'target'], {
      code: 0,
      stdout: 'Available Android targets:\n',
    });
    runner.set('/opt/android-sdk/platform-tools/adb', ['version'], {
      code: 0,
      stdout: 'Android Debug Bridge version 1.0.41\n',
    });
    runner.set('/opt/android-sdk/emulator/emulator', ['-version'], {
      code: 0,
      stdout: 'Android emulator version 35.2.10\n',
    });

    try {
      const report = await checkMobileDependencies({ runner, hostPlatform: 'darwin' });
      const sdkManager = report.checks.find((entry) => entry.id === 'android-sdkmanager');
      const avdManager = report.checks.find((entry) => entry.id === 'android-avdmanager');
      const adb = report.checks.find((entry) => entry.id === 'android-adb');
      const emulator = report.checks.find((entry) => entry.id === 'android-emulator');

      expect(sdkManager?.status).toBe('ready');
      expect(avdManager?.status).toBe('ready');
      expect(adb?.status).toBe('ready');
      expect(emulator?.status).toBe('ready');
    } finally {
      if (prevAndroidHome === undefined) {
        delete process.env.ANDROID_HOME;
      } else {
        process.env.ANDROID_HOME = prevAndroidHome;
      }
      if (prevAndroidSdkRoot === undefined) {
        delete process.env.ANDROID_SDK_ROOT;
      } else {
        process.env.ANDROID_SDK_ROOT = prevAndroidSdkRoot;
      }
    }
  });

  it('uses hostPlatform rather than runtime platform when exposing auto-fix actions', async () => {
    const runner = new StubRunner();
    const report = await checkMobileDependencies({ runner, hostPlatform: 'linux' });

    const java = report.checks.find((entry) => entry.id === 'java-jdk');
    const sdkManager = report.checks.find((entry) => entry.id === 'android-sdkmanager');

    expect(java?.autoFixAvailable).toBe(false);
    expect(java?.installCommand).toBeUndefined();
    expect(sdkManager?.autoFixAvailable).toBe(false);
    expect(sdkManager?.installCommand).toBeUndefined();
  });
});

describe('installMobileDependency', () => {
  it('fails gracefully when no auto-fix command exists', async () => {
    const runner = new StubRunner();
    const result = await installMobileDependency('xcode', { runner, hostPlatform: 'darwin' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('No automatic install command');
  });

  it('rejects mac-only installs on non-mac hosts', async () => {
    const runner = new StubRunner();
    const result = await installMobileDependency('java-jdk', { runner, hostPlatform: 'linux' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('only available on macOS');
  });

  it('runs every install step and returns combined command text on success', async () => {
    const runner = new StubRunner();
    runner.set('brew', ['tap', 'mobile-dev-inc/tap'], { code: 0 });
    runner.set('brew', ['install', 'mobile-dev-inc/tap/maestro'], { code: 0 });

    const result = await installMobileDependency('maestro', { runner, hostPlatform: 'darwin' });

    expect(result.success).toBe(true);
    expect(result.command).toBe(
      'brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro',
    );
    expect(runner.calls).toEqual([
      { command: 'brew', args: ['tap', 'mobile-dev-inc/tap'] },
      { command: 'brew', args: ['install', 'mobile-dev-inc/tap/maestro'] },
    ]);
  });

  it('returns failing command details when an install step errors', async () => {
    const runner = new StubRunner();
    runner.set('brew', ['tap', 'mobile-dev-inc/tap'], { code: 0, stdout: 'tapped\n' });
    runner.set('brew', ['install', 'mobile-dev-inc/tap/maestro'], {
      code: 1,
      stderr: 'install failed',
    });

    const result = await installMobileDependency('maestro', { runner, hostPlatform: 'darwin' });

    expect(result.success).toBe(false);
    expect(result.command).toBe(
      'brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro',
    );
    expect(result.message).toContain('install failed');
    expect(result.stderr).toContain('install failed');
  });

  it('uses sdkmanager from ANDROID_HOME when installing emulator and PATH is missing', async () => {
    const runner = new StubRunner();
    const prevAndroidHome = process.env.ANDROID_HOME;
    const prevAndroidSdkRoot = process.env.ANDROID_SDK_ROOT;
    process.env.ANDROID_HOME = '/opt/android-sdk';
    delete process.env.ANDROID_SDK_ROOT;

    runner.set('/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager', ['--install', 'emulator'], {
      code: 0,
      stdout: 'done\n',
    });
    runner.set('/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager', ['--version'], {
      code: 0,
      stdout: '12.0\n',
    });

    try {
      const result = await installMobileDependency('android-emulator', { runner, hostPlatform: 'darwin' });

      expect(result.success).toBe(true);
      expect(result.command).toBe('/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager --install emulator');
      expect(runner.calls.at(-1)).toEqual({
        command: '/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager',
        args: ['--install', 'emulator'],
      });
    } finally {
      if (prevAndroidHome === undefined) {
        delete process.env.ANDROID_HOME;
      } else {
        process.env.ANDROID_HOME = prevAndroidHome;
      }
      if (prevAndroidSdkRoot === undefined) {
        delete process.env.ANDROID_SDK_ROOT;
      } else {
        process.env.ANDROID_SDK_ROOT = prevAndroidSdkRoot;
      }
    }
  });

  it('emits install progress events with per-step lifecycle and final completion', async () => {
    const runner = new StubRunner();
    runner.set('brew', ['tap', 'mobile-dev-inc/tap'], { code: 0, stdout: 'tapped\n' });
    runner.set('brew', ['install', 'mobile-dev-inc/tap/maestro'], { code: 0, stdout: 'installed\n' });

    const events: Array<Record<string, unknown>> = [];

    const result = await installMobileDependency('maestro', {
      runner,
      hostPlatform: 'darwin',
      installId: 'install-123',
      onProgress: (event: Record<string, unknown>) => events.push(event),
    } as never);

    expect(result.success).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    const phases = events.map((event) => event.phase);
    expect(phases[0]).toBe('started');
    expect(phases.filter((phase) => phase === 'step_started')).toHaveLength(2);
    expect(phases.filter((phase) => phase === 'step_finished')).toHaveLength(2);
    expect(phases.at(-1)).toBe('finished');
    expect(events.at(0)?.installId).toBe('install-123');
    expect(events.at(-1)?.percent).toBe(100);
  });

  it('parses percentage and MB download telemetry from install output', async () => {
    const runner = new StubRunner();
    runner.set('npm', ['install', '-g', 'appium'], {
      code: 0,
      stdout: 'Downloading package: 42% (84 MB/200 MB)\n',
    });

    const events: Array<Record<string, unknown>> = [];
    const result = await installMobileDependency('appium', {
      runner,
      hostPlatform: 'darwin',
      installId: 'install-metrics',
      onProgress: (event: Record<string, unknown>) => events.push(event),
    } as never);

    expect(result.success).toBe(true);
    const progressEvent = events.find((event) => event.phase === 'step_progress');
    expect(progressEvent).toBeDefined();
    expect(progressEvent?.stepPercent).toBe(42);
    expect(progressEvent?.downloadedBytes).toBe(84 * 1024 * 1024);
    expect(progressEvent?.totalBytes).toBe(200 * 1024 * 1024);
    expect(progressEvent?.remainingBytes).toBe(116 * 1024 * 1024);
  });

  it('emits a failed progress event with command and reason when a step fails', async () => {
    const runner = new StubRunner();
    runner.set('brew', ['tap', 'mobile-dev-inc/tap'], { code: 0, stdout: 'tapped\n' });
    runner.set('brew', ['install', 'mobile-dev-inc/tap/maestro'], {
      code: 1,
      stderr: 'network error',
    });

    const events: Array<Record<string, unknown>> = [];
    const result = await installMobileDependency('maestro', {
      runner,
      hostPlatform: 'darwin',
      installId: 'install-fail',
      onProgress: (event: Record<string, unknown>) => events.push(event),
    } as never);

    expect(result.success).toBe(false);
    const failed = events.find((event) => event.phase === 'failed');
    expect(failed).toBeDefined();
    expect(failed?.command).toBe('brew install mobile-dev-inc/tap/maestro');
    expect(String(failed?.message)).toContain('network error');
  });

  it('treats "driver already installed" as a successful no-op install', async () => {
    const runner = new StubRunner();
    runner.set('appium', ['driver', 'install', 'xcuitest'], {
      code: 1,
      stderr: '\u001b[31mError: \u001b[39mA driver named "xcuitest" is already installed.',
    });

    const events: Array<Record<string, unknown>> = [];
    const result = await installMobileDependency('appium-xcuitest-driver', {
      runner,
      hostPlatform: 'darwin',
      installId: 'install-xcuitest',
      onProgress: (event: Record<string, unknown>) => events.push(event),
    } as never);

    expect(result.success).toBe(true);
    expect(result.message).toContain('already installed');
    expect(result.stderr).not.toContain('\u001b[31m');
    expect(events.at(-1)?.phase).toBe('finished');
    expect(events.some((event) => event.phase === 'failed')).toBe(false);
  });

  it('strips ansi escape sequences from failed install messages', async () => {
    const runner = new StubRunner();
    runner.set('npm', ['install', '-g', 'appium'], {
      code: 1,
      stderr: '\u001b[31mError:\u001b[39m failed to download package',
    });

    const result = await installMobileDependency('appium', { runner, hostPlatform: 'darwin' });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Error: failed to download package');
    expect(result.stderr).not.toContain('\u001b[31m');
  });
});
