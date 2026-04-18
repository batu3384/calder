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

    runner.set('which', ['avdmanager'], { code: 0, stdout: '/opt/android/avdmanager\n' });
    runner.set('avdmanager', ['--version'], { code: 0, stdout: '35.0.0\n' });

    runner.set('which', ['adb'], { code: 0, stdout: '/opt/android/adb\n' });
    runner.set('adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });

    runner.set('which', ['emulator'], { code: 0, stdout: '/opt/android/emulator\n' });
    runner.set('emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });

    runner.set('which', ['maestro'], { code: 0, stdout: '/usr/local/bin/maestro\n' });
    runner.set('maestro', ['--version'], { code: 0, stdout: '1.39.13\n' });

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
    runner.set('which', ['avdmanager'], { code: 0, stdout: '/opt/android/avdmanager\n' });
    runner.set('avdmanager', ['--version'], { code: 0, stdout: '35.0.0\n' });
    runner.set('which', ['adb'], { code: 0, stdout: '/opt/android/adb\n' });
    runner.set('adb', ['version'], { code: 0, stdout: 'Android Debug Bridge version 1.0.41\n' });
    runner.set('which', ['emulator'], { code: 0, stdout: '/opt/android/emulator\n' });
    runner.set('emulator', ['-version'], { code: 0, stdout: 'Android emulator version 35.2.10\n' });
    runner.set('which', ['maestro'], { code: 1 });

    const report = await checkMobileDependencies({ runner, hostPlatform: 'darwin' });
    const iosDriver = report.checks.find((entry) => entry.id === 'appium-xcuitest-driver');
    const androidDriver = report.checks.find((entry) => entry.id === 'appium-uiautomator2-driver');

    expect(iosDriver?.status).toBe('warning');
    expect(androidDriver?.status).toBe('warning');
    expect(iosDriver?.autoFixAvailable).toBe(true);
    expect(androidDriver?.autoFixAvailable).toBe(true);
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
});
