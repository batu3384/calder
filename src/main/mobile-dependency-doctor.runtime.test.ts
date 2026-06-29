import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ExecPlan = {
  command: string;
  args: string[];
  code?: number;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
};

type SpawnPlan = {
  command: string;
  args: string[];
  code?: number;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  errorMessage?: string;
  deferClose?: boolean;
  closeOnSigterm?: boolean;
  closeOnSigkill?: boolean;
};

const mockExecFile = vi.hoisted(() => vi.fn());
const mockSpawn = vi.hoisted(() => vi.fn());
const mockGetFullPath = vi.hoisted(() => vi.fn(() => '/mock/path'));

vi.mock('child_process', () => ({
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

vi.mock('./pty-manager', () => ({
  getFullPath: mockGetFullPath,
}));

import { installMobileDependency } from './mobile-dependency-doctor';
import { whichCmd } from './platform';

const execPlans: ExecPlan[] = [];
const spawnPlans: SpawnPlan[] = [];

function queueExec(...plans: ExecPlan[]): void {
  execPlans.push(...plans);
}

function queueSpawn(...plans: SpawnPlan[]): void {
  spawnPlans.push(...plans);
}

describe('mobile-dependency-doctor runtime default runner paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execPlans.length = 0;
    spawnPlans.length = 0;

    mockExecFile.mockImplementation(
      (
        command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (
          error: (Error & { code?: number | string; stdout?: string; stderr?: string }) | null,
          stdout: string,
          stderr: string,
        ) => void,
      ) => {
        const index = execPlans.findIndex(
          (plan) => plan.command === command && JSON.stringify(plan.args) === JSON.stringify(args),
        );
        const plan = index >= 0 ? execPlans.splice(index, 1)[0] : undefined;
        const code = plan?.code ?? 1;
        const stdout = plan?.stdout ?? '';
        const stderr = plan?.stderr ?? `${command} failed`;
        if (code === 0) {
          callback(null, stdout, stderr);
          return;
        }

        const error = Object.assign(new Error(plan?.errorMessage ?? stderr), {
          code,
          stdout,
          stderr,
        });
        callback(error, stdout, stderr);
      },
    );

    mockSpawn.mockImplementation((command: string, args: string[]) => {
      const plan = spawnPlans.shift();
      if (!plan) {
        throw new Error(`Unexpected spawn call: ${command} ${args.join(' ')}`);
      }
      expect(command).toBe(plan.command);
      expect(args).toEqual(plan.args);

      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        killed: boolean;
        kill: ReturnType<typeof vi.fn>;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.killed = false;
      child.kill = vi.fn((signal: string) => {
        if (signal === 'SIGTERM' && plan.closeOnSigterm) {
          setTimeout(() => child.emit('close', plan.code ?? 0), 0);
        }
        if (signal === 'SIGKILL') {
          child.killed = true;
          if (plan.closeOnSigkill) {
            setTimeout(() => child.emit('close', plan.code ?? 0), 0);
          }
        }
        return true;
      });

      setTimeout(() => {
        if (plan.stdout) child.stdout.emit('data', plan.stdout);
        if (plan.stderr) child.stderr.emit('data', plan.stderr);
        if (plan.errorMessage) {
          child.emit('error', new Error(plan.errorMessage));
          return;
        }
        if (!plan.deferClose) {
          child.emit('close', plan.code ?? 0);
        }
      }, 0);

      return child;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('streams install output and progress telemetry with default runner', async () => {
    queueSpawn({
      command: 'npm',
      args: ['install', '-g', 'appium'],
      stdout: 'Downloading package: 50% (1 MB/2 MB)\nInstall complete\n',
      stderr: 'npm warning line\n',
      code: 0,
    });

    const events: Array<Record<string, unknown>> = [];
    const result = await installMobileDependency('appium', {
      hostPlatform: 'darwin',
      installId: 'runtime-stream',
      onProgress: (event: Record<string, unknown>) => events.push(event),
    } as never);

    expect(result.success).toBe(true);
    const progress = events.find(
      (event) => event.phase === 'step_progress' && event.source === 'stdout',
    );
    expect(progress).toBeDefined();
    expect(progress?.stepPercent).toBe(50);
    expect(progress?.downloadedBytes).toBe(1 * 1024 * 1024);
    expect(progress?.totalBytes).toBe(2 * 1024 * 1024);
    expect(events.at(-1)?.phase).toBe('finished');
    expect(spawnPlans).toHaveLength(0);
  });

  it('normalizes command-not-found failures from default streaming runner', async () => {
    queueSpawn({
      command: 'npm',
      args: ['install', '-g', 'appium'],
      errorMessage: 'spawn ENOENT npm',
    });

    const result = await installMobileDependency('appium', {
      hostPlatform: 'darwin',
      installId: 'runtime-enoent',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Command not found: npm');
    expect(spawnPlans).toHaveLength(0);
  });

  it('returns timeout failures from default streaming runner', async () => {
    vi.useFakeTimers();
    queueSpawn({
      command: 'npm',
      args: ['install', '-g', 'appium'],
      deferClose: true,
      closeOnSigkill: true,
      code: 0,
    });

    const promise = installMobileDependency('appium', {
      hostPlatform: 'darwin',
      installId: 'runtime-timeout',
    });

    await vi.advanceTimersByTimeAsync(12 * 60_000 + 2_000);
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.message).toContain('timed out');
    expect(spawnPlans).toHaveLength(0);
  });

  it('resolves sdkmanager fallback paths with default exec runner during install', async () => {
    const env = {
      ANDROID_HOME: '/opt/android-sdk',
    } as NodeJS.ProcessEnv;
    const fallbackSdkManager = '/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager';

    queueExec(
      {
        command: whichCmd,
        args: ['sdkmanager'],
        code: 1,
        stderr: 'sdkmanager not found',
      },
      {
        command: fallbackSdkManager,
        args: ['--version'],
        code: 0,
        stdout: '12.0\n',
      },
    );
    queueSpawn({
      command: fallbackSdkManager,
      args: ['--install', 'emulator'],
      stdout: 'install complete\n',
      code: 0,
    });

    const result = await installMobileDependency('android-emulator', {
      hostPlatform: 'darwin',
      env,
      installId: 'runtime-fallback',
    });

    expect(result.success).toBe(true);
    expect(result.command).toContain(`${fallbackSdkManager} --install emulator`);
    expect(execPlans).toHaveLength(0);
    expect(spawnPlans).toHaveLength(0);
  });
});
