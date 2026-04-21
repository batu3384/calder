import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ExecPlan = {
  command: string;
  args: string[];
  code?: number;
  stdout?: string;
  stderr?: string;
};

type SpawnPlan = {
  command: string;
  args: string[];
  code?: number;
  stdout?: Buffer;
  stderr?: string;
  errorMessage?: string;
};

const mockExecFile = vi.hoisted(() => vi.fn());
const mockSpawn = vi.hoisted(() => vi.fn());
const mockGetFullPath = vi.hoisted(() => vi.fn(() => '/mock/path'));
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  execFile: mockExecFile,
  spawn: mockSpawn,
}));

vi.mock('./pty-manager', () => ({
  getFullPath: mockGetFullPath,
}));

vi.mock('./platform', () => ({
  whichCmd: 'which',
}));

vi.stubGlobal('fetch', mockFetch);

import {
  _internal,
  captureMobileInspectScreenshot,
  inspectMobilePoint,
  interactMobileInspectPoint,
  launchMobileInspectSurface,
} from './mobile-inspector';

function createPngBuffer(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer[4] = 0x0d;
  buffer[5] = 0x0a;
  buffer[6] = 0x1a;
  buffer[7] = 0x0a;
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('mobile-inspector runtime android flows', () => {
  const execPlans: ExecPlan[] = [];
  const spawnPlans: SpawnPlan[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    execPlans.length = 0;
    spawnPlans.length = 0;

    mockExecFile.mockImplementation((
      command: string,
      args: string[],
      _options: Record<string, unknown>,
      callback: (error: (NodeJS.ErrnoException & { code?: number; stdout?: string; stderr?: string }) | null, stdout: string, stderr: string) => void,
    ) => {
      const next = execPlans.shift();
      if (!next) {
        throw new Error(`Unexpected execFile call: ${command} ${args.join(' ')}`);
      }
      expect(command).toBe(next.command);
      expect(args).toEqual(next.args);
      const stdout = next.stdout ?? '';
      const stderr = next.stderr ?? '';
      const code = next.code ?? 0;
      if (code === 0) {
        callback(null, stdout, stderr);
        return;
      }
      callback({
        name: 'Error',
        message: stderr || `Command failed: ${command}`,
        code,
        stdout,
        stderr,
      }, stdout, stderr);
    });

    mockSpawn.mockImplementation((command: string, args: string[]) => {
      const next = spawnPlans.shift();
      if (!next) {
        throw new Error(`Unexpected spawn call: ${command} ${args.join(' ')}`);
      }
      expect(command).toBe(next.command);
      expect(args).toEqual(next.args);

      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
        killed: boolean;
        unref: ReturnType<typeof vi.fn>;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.killed = false;
      child.kill = vi.fn((signal: string) => {
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          child.killed = true;
        }
        return true;
      });
      child.unref = vi.fn();

      setTimeout(() => {
        if (next.stderr) child.stderr.emit('data', Buffer.from(next.stderr, 'utf8'));
        if (next.stdout) child.stdout.emit('data', next.stdout);
        if (next.errorMessage) {
          child.emit('error', new Error(next.errorMessage));
          return;
        }
        child.emit('close', next.code ?? 0);
      }, 0);

      return child;
    });
  });

  it('launches Android inspect surface when emulator is already running', async () => {
    execPlans.push(
      { command: 'which', args: ['adb'], stdout: '/usr/local/bin/adb\n' },
      { command: 'which', args: ['emulator'], stdout: '/usr/local/bin/emulator\n' },
      { command: '/usr/local/bin/adb', args: ['devices'], stdout: 'List of devices attached\nemulator-5554\tdevice\n' },
      { command: '/usr/local/bin/adb', args: ['-s', 'emulator-5554', 'shell', 'getprop', 'sys.boot_completed'], stdout: '1\n' },
    );

    const result = await launchMobileInspectSurface('android');

    expect(result.success).toBe(true);
    expect(result.alreadyRunning).toBe(true);
    expect(result.deviceId).toBe('emulator-5554');
    expect(execPlans).toHaveLength(0);
  });

  it('returns a concise error when Android device query fails', async () => {
    execPlans.push(
      { command: 'which', args: ['adb'], stdout: '/usr/local/bin/adb\n' },
      { command: 'which', args: ['emulator'], stdout: '/usr/local/bin/emulator\n' },
      { command: '/usr/local/bin/adb', args: ['devices'], code: 1, stderr: 'adb server unavailable' },
    );

    const result = await launchMobileInspectSurface('android');

    expect(result.success).toBe(false);
    expect(result.message).toContain('adb server unavailable');
    expect(execPlans).toHaveLength(0);
  });

  it('returns Android setup guidance when no AVD is configured', async () => {
    execPlans.push(
      { command: 'which', args: ['adb'], stdout: '/usr/local/bin/adb\n' },
      { command: 'which', args: ['emulator'], stdout: '/usr/local/bin/emulator\n' },
      { command: '/usr/local/bin/adb', args: ['devices'], stdout: 'List of devices attached\n' },
      { command: '/usr/local/bin/emulator', args: ['-list-avds'], stdout: '\n' },
    );

    const result = await launchMobileInspectSurface('android');

    expect(result.success).toBe(false);
    expect(result.message).toContain('No Android Virtual Device');
    expect(execPlans).toHaveLength(0);
  });

  it('returns Android AVD listing error when emulator listing fails', async () => {
    execPlans.push(
      { command: 'which', args: ['adb'], stdout: '/usr/local/bin/adb\n' },
      { command: 'which', args: ['emulator'], stdout: '/usr/local/bin/emulator\n' },
      { command: '/usr/local/bin/adb', args: ['devices'], stdout: 'List of devices attached\n' },
      { command: '/usr/local/bin/emulator', args: ['-list-avds'], code: 1, stderr: 'emulator list failed' },
    );

    const result = await launchMobileInspectSurface('android');

    expect(result.success).toBe(false);
    expect(result.message).toContain('emulator list failed');
    expect(execPlans).toHaveLength(0);
  });

  it('captures Android screenshot payloads as base64 PNG', async () => {
    const png = createPngBuffer(1170, 2532);
    execPlans.push(
      { command: 'which', args: ['adb'], stdout: '/usr/local/bin/adb\n' },
      { command: 'which', args: ['emulator'], stdout: '/usr/local/bin/emulator\n' },
      { command: '/usr/local/bin/adb', args: ['devices'], stdout: 'List of devices attached\nemulator-5554\tdevice\n' },
      { command: '/usr/local/bin/adb', args: ['-s', 'emulator-5554', 'shell', 'getprop', 'sys.boot_completed'], stdout: '1\n' },
    );
    spawnPlans.push({
      command: '/usr/local/bin/adb',
      args: ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p'],
      stdout: png,
      code: 0,
    });

    const result = await captureMobileInspectScreenshot('android');

    expect(result.success).toBe(true);
    expect(result.width).toBe(1170);
    expect(result.height).toBe(2532);
    expect(result.dataUrl).toContain('data:image/png;base64,');
    expect(execPlans).toHaveLength(0);
    expect(spawnPlans).toHaveLength(0);
  });

  it('rejects Android screenshot payloads when PNG signature is invalid', async () => {
    execPlans.push(
      { command: 'which', args: ['adb'], stdout: '/usr/local/bin/adb\n' },
      { command: 'which', args: ['emulator'], stdout: '/usr/local/bin/emulator\n' },
      { command: '/usr/local/bin/adb', args: ['devices'], stdout: 'List of devices attached\nemulator-5554\tdevice\n' },
      { command: '/usr/local/bin/adb', args: ['-s', 'emulator-5554', 'shell', 'getprop', 'sys.boot_completed'], stdout: '1\n' },
    );
    spawnPlans.push({
      command: '/usr/local/bin/adb',
      args: ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p'],
      stdout: Buffer.from('not-a-png', 'utf8'),
      code: 0,
    });

    const result = await captureMobileInspectScreenshot('android');

    expect(result.success).toBe(false);
    expect(result.message).toContain('valid PNG');
    expect(execPlans).toHaveLength(0);
    expect(spawnPlans).toHaveLength(0);
  });

  it('inspects Android UI hierarchy and returns matched element metadata', async () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<hierarchy rotation="0">',
      '<node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="app" content-desc="" bounds="[0,0][1080,2400]">',
      '<node index="1" text="Login" resource-id="app:id/login" class="android.widget.Button" package="app" content-desc="Login button" bounds="[300,1400][780,1540]"/>',
      '</node>',
      '</hierarchy>',
    ].join('');

    execPlans.push(
      { command: 'which', args: ['adb'], stdout: '/usr/local/bin/adb\n' },
      { command: 'which', args: ['emulator'], stdout: '/usr/local/bin/emulator\n' },
      { command: '/usr/local/bin/adb', args: ['devices'], stdout: 'List of devices attached\nemulator-5554\tdevice\n' },
      { command: '/usr/local/bin/adb', args: ['-s', 'emulator-5554', 'shell', 'getprop', 'sys.boot_completed'], stdout: '1\n' },
      { command: '/usr/local/bin/adb', args: ['-s', 'emulator-5554', 'shell', 'uiautomator', 'dump', '/sdcard/calder-window-dump.xml'], stdout: 'UI hierchary dumped' },
      { command: '/usr/local/bin/adb', args: ['-s', 'emulator-5554', 'shell', 'cat', '/sdcard/calder-window-dump.xml'], stdout: xml },
    );

    const result = await inspectMobilePoint('android', 500, 1450);

    expect(result.success).toBe(true);
    expect(result.element).toEqual(expect.objectContaining({
      className: 'android.widget.Button',
      text: 'Login',
      resourceId: 'app:id/login',
      contentDesc: 'Login button',
    }));
    expect(execPlans).toHaveLength(0);
  });

  it('returns tap command stderr when Android interaction fails', async () => {
    execPlans.push(
      { command: 'which', args: ['adb'], stdout: '/usr/local/bin/adb\n' },
      { command: 'which', args: ['emulator'], stdout: '/usr/local/bin/emulator\n' },
      { command: '/usr/local/bin/adb', args: ['devices'], stdout: 'List of devices attached\nemulator-5554\tdevice\n' },
      { command: '/usr/local/bin/adb', args: ['-s', 'emulator-5554', 'shell', 'getprop', 'sys.boot_completed'], stdout: '1\n' },
      { command: '/usr/local/bin/adb', args: ['-s', 'emulator-5554', 'shell', 'input', 'tap', '32', '64'], code: 1, stderr: 'Permission denied' },
    );

    const result = await interactMobileInspectPoint('android', 32, 64);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Permission denied');
    expect(execPlans).toHaveLength(0);
  });

  it('returns Android toolchain error when emulator binary cannot be resolved', async () => {
    execPlans.push(
      { command: 'which', args: ['adb'], stdout: '/usr/local/bin/adb\n' },
      { command: 'which', args: ['emulator'], code: 1, stderr: 'emulator not found' },
    );
    const emulatorFallbacks = _internal.getAndroidBinaryCandidates('emulator', process.env, process.platform);
    for (const candidate of emulatorFallbacks) {
      execPlans.push({
        command: candidate,
        args: ['-version'],
        code: 1,
        stderr: 'missing emulator binary',
      });
    }

    const result = await interactMobileInspectPoint('android', 1, 2);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Android emulator binary was not found');
    expect(execPlans).toHaveLength(0);
  });

  it('returns Android readiness error when adb device probe fails before interaction', async () => {
    execPlans.push(
      { command: 'which', args: ['adb'], stdout: '/usr/local/bin/adb\n' },
      { command: 'which', args: ['emulator'], stdout: '/usr/local/bin/emulator\n' },
      { command: '/usr/local/bin/adb', args: ['devices'], code: 1, stderr: 'adb daemon is down' },
    );

    const result = await interactMobileInspectPoint('android', 10, 20);

    expect(result.success).toBe(false);
    expect(result.message).toContain('adb daemon is down');
    expect(execPlans).toHaveLength(0);
  });

  it('dispatches tap interaction successfully on Android when emulator is ready', async () => {
    execPlans.push(
      { command: 'which', args: ['adb'], stdout: '/usr/local/bin/adb\n' },
      { command: 'which', args: ['emulator'], stdout: '/usr/local/bin/emulator\n' },
      { command: '/usr/local/bin/adb', args: ['devices'], stdout: 'List of devices attached\nemulator-5554\tdevice\n' },
      { command: '/usr/local/bin/adb', args: ['-s', 'emulator-5554', 'shell', 'getprop', 'sys.boot_completed'], stdout: '1\n' },
      { command: '/usr/local/bin/adb', args: ['-s', 'emulator-5554', 'shell', 'input', 'tap', '48', '72'], stdout: '' },
    );

    const result = await interactMobileInspectPoint('android', 48, 72);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Tap dispatched to Android emulator');
    expect(execPlans).toHaveLength(0);
  });

  it('launches iOS inspect surface when a booted simulator is already ready', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-1',
                name: 'iPhone 16 Pro',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-1', '-b'],
        stdout: 'Booted',
      },
    );

    const result = await launchMobileInspectSurface('ios');

    expect(result.success).toBe(true);
    expect(result.alreadyRunning).toBe(true);
    expect(result.deviceId).toBe('IOS-UDID-1');
    expect(execPlans).toHaveLength(0);
  });

  it('returns Xcode setup guidance when iOS simctl listing command is missing', async () => {
    execPlans.push({
      command: 'xcrun',
      args: ['simctl', 'list', 'devices', '--json'],
      code: 1,
      stderr: 'xcrun: command not found',
    });

    const result = await launchMobileInspectSurface('ios');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Install Xcode command line tools');
    expect(execPlans).toHaveLength(0);
  });

  it('returns iOS point inspection fallback message after simulator readiness', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-2',
                name: 'iPhone 16',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-2', '-b'],
        stdout: 'Booted',
      },
    );

    const result = await inspectMobilePoint('ios', 25, 40);

    expect(result.success).toBe(false);
    expect(result.message).toContain('not available yet');
    expect(result.point).toEqual({ x: 25, y: 40 });
    expect(execPlans).toHaveLength(0);
  });

  it('boots a shutdown iOS simulator when no booted device is running', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-SHUTDOWN',
                name: 'iPhone 16 Pro',
                state: 'Shutdown',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'boot', 'IOS-UDID-SHUTDOWN'],
        stdout: '',
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-SHUTDOWN', '-b'],
        stdout: 'Booted',
      },
    );

    const result = await launchMobileInspectSurface('ios');

    expect(result.success).toBe(true);
    expect(result.started).toBe(true);
    expect(result.deviceId).toBe('IOS-UDID-SHUTDOWN');
    expect(result.message).toContain('booted successfully');
    expect(execPlans).toHaveLength(0);
  });

  it('returns an iOS setup error when no simulator device is available', async () => {
    execPlans.push({
      command: 'xcrun',
      args: ['simctl', 'list', 'devices', '--json'],
      stdout: JSON.stringify({ devices: {} }),
    });

    const result = await launchMobileInspectSurface('ios');

    expect(result.success).toBe(false);
    expect(result.message).toContain('No iOS simulator device is available');
    expect(execPlans).toHaveLength(0);
  });

  it('captures iOS screenshot successfully from a deterministic temp path', async () => {
    const fixedNow = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const screenshotPath = path.join(os.tmpdir(), `calder-ios-inspect-${fixedNow}-i.png`);
    fs.writeFileSync(screenshotPath, createPngBuffer(1179, 2556));
    try {
      execPlans.push(
        {
          command: 'xcrun',
          args: ['simctl', 'list', 'devices', '--json'],
          stdout: JSON.stringify({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
                {
                  udid: 'IOS-UDID-CAPTURE',
                  name: 'iPhone 16 Pro',
                  state: 'Booted',
                  isAvailable: true,
                },
              ],
            },
          }),
        },
        {
          command: 'xcrun',
          args: ['simctl', 'bootstatus', 'IOS-UDID-CAPTURE', '-b'],
          stdout: 'Booted',
        },
        {
          command: 'xcrun',
          args: ['simctl', 'io', 'IOS-UDID-CAPTURE', 'screenshot', screenshotPath],
          stdout: `Wrote screenshot to: ${screenshotPath}`,
        },
      );

      const result = await captureMobileInspectScreenshot('ios');

      expect(result.success).toBe(true);
      expect(result.width).toBe(1179);
      expect(result.height).toBe(2556);
      expect(result.dataUrl).toContain('data:image/png;base64,');
      expect(fs.existsSync(screenshotPath)).toBe(false);
      expect(execPlans).toHaveLength(0);
    } finally {
      nowSpy.mockRestore();
      randomSpy.mockRestore();
      try {
        fs.unlinkSync(screenshotPath);
      } catch {
        // noop
      }
    }
  });

  it('retries iOS screenshot once when simctl reports read-only dash output', async () => {
    const fixedNow = 1_700_000_000_001;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const screenshotPath = path.join(os.tmpdir(), `calder-ios-inspect-${fixedNow}-i.png`);
    fs.writeFileSync(screenshotPath, createPngBuffer(1290, 2796));
    try {
      execPlans.push(
        {
          command: 'xcrun',
          args: ['simctl', 'list', 'devices', '--json'],
          stdout: JSON.stringify({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
                {
                  udid: 'IOS-UDID-CAPTURE-FALLBACK',
                  name: 'iPhone 16',
                  state: 'Booted',
                  isAvailable: true,
                },
              ],
            },
          }),
        },
        {
          command: 'xcrun',
          args: ['simctl', 'bootstatus', 'IOS-UDID-CAPTURE-FALLBACK', '-b'],
          stdout: 'Booted',
        },
        {
          command: 'xcrun',
          args: ['simctl', 'io', 'IOS-UDID-CAPTURE-FALLBACK', 'screenshot', screenshotPath],
          code: 1,
          stderr: 'You can\'t save the file "-" because the volume is read only.',
        },
        {
          command: 'xcrun',
          args: ['simctl', 'io', 'IOS-UDID-CAPTURE-FALLBACK', 'screenshot', screenshotPath],
          stdout: `Wrote screenshot to: ${screenshotPath}`,
        },
      );

      const result = await captureMobileInspectScreenshot('ios');

      expect(result.success).toBe(true);
      expect(result.width).toBe(1290);
      expect(result.height).toBe(2796);
      expect(execPlans).toHaveLength(0);
    } finally {
      nowSpy.mockRestore();
      randomSpy.mockRestore();
      try {
        fs.unlinkSync(screenshotPath);
      } catch {
        // noop
      }
    }
  });

  it('returns iOS Appium readiness failure when local Appium binary cannot be resolved', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-3',
                name: 'iPhone 16 Pro',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-3', '-b'],
        stdout: 'Booted',
      },
      {
        command: 'which',
        args: ['appium'],
        code: 1,
        stderr: 'appium not found',
      },
    );

    mockFetch.mockImplementation(async () => {
      throw new Error('connection refused');
    });

    const result = await interactMobileInspectPoint('ios', 12, 18);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Appium server did not become ready');
    expect(execPlans).toHaveLength(0);
  });

  it('dispatches iOS tap interaction through Appium actions endpoint', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-4',
                name: 'iPhone 16 Pro',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-4', '-b'],
        stdout: 'Booted',
      },
    );

    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.endsWith('/status') && method === 'GET') {
        return {
          ok: true,
          async text() {
            return '{"ready":true}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/session' && method === 'POST') {
        return {
          ok: true,
          async text() {
            return JSON.stringify({ value: { sessionId: 'session-1' } });
          },
        };
      }
      if (url.endsWith('/session/session-1/actions') && method === 'POST') {
        return {
          ok: true,
          async text() {
            return '{}';
          },
        };
      }
      if (url.endsWith('/session/session-1') && method === 'DELETE') {
        return {
          ok: true,
          async text() {
            return '{}';
          },
        };
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = await interactMobileInspectPoint('ios', 48, 72);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Tap dispatched to iOS simulator');
    expect(execPlans).toHaveLength(0);
  });

  it('returns a simulator readiness error when iOS launch precondition fails', async () => {
    execPlans.push({
      command: 'xcrun',
      args: ['simctl', 'list', 'devices', '--json'],
      code: 1,
      stderr: 'simctl list failed',
    });

    const result = await interactMobileInspectPoint('ios', 10, 20);

    expect(result.success).toBe(false);
    expect(result.message).toContain('simctl list failed');
    expect(execPlans).toHaveLength(0);
  });

  it('returns session creation errors when Appium rejects iOS session bootstrap', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-5',
                name: 'iPhone 16 Pro',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-5', '-b'],
        stdout: 'Booted',
      },
    );

    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.endsWith('/status') && method === 'GET') {
        return {
          ok: true,
          async text() {
            return '{"ready":true}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/session' && method === 'POST') {
        return {
          ok: false,
          async text() {
            return JSON.stringify({ value: { message: 'XCUITest driver is missing' } });
          },
        };
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = await interactMobileInspectPoint('ios', 21, 34);

    expect(result.success).toBe(false);
    expect(result.message).toContain('XCUITest driver is missing');
    expect(execPlans).toHaveLength(0);
  });

  it('returns Appium action errors after successful iOS session creation', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-6',
                name: 'iPhone 16',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-6', '-b'],
        stdout: 'Booted',
      },
    );

    const fetchCalls: Array<{ url: string; method: string }> = [];
    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      fetchCalls.push({ url, method });
      if (url.endsWith('/status') && method === 'GET') {
        return {
          ok: true,
          async text() {
            return '{"ready":true}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/session' && method === 'POST') {
        return {
          ok: true,
          async text() {
            return JSON.stringify({ value: { sessionId: 'session-action-fail' } });
          },
        };
      }
      if (url.endsWith('/session/session-action-fail/actions') && method === 'POST') {
        return {
          ok: false,
          async text() {
            return JSON.stringify({ value: { message: 'tap denied by driver' } });
          },
        };
      }
      if (url.endsWith('/session/session-action-fail') && method === 'DELETE') {
        return {
          ok: true,
          async text() {
            return '{}';
          },
        };
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = await interactMobileInspectPoint('ios', 90, 120);

    expect(result.success).toBe(false);
    expect(result.message).toContain('tap denied by driver');
    expect(fetchCalls.some((call) => call.method === 'DELETE')).toBe(true);
    expect(execPlans).toHaveLength(0);
  });

  it('falls back to WDA tap endpoint when actions endpoint fails but fallback succeeds', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-7',
                name: 'iPhone 16',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-7', '-b'],
        stdout: 'Booted',
      },
    );

    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.endsWith('/status') && method === 'GET') {
        return {
          ok: true,
          async text() {
            return '{"ready":true}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/session' && method === 'POST') {
        return {
          ok: true,
          async text() {
            return JSON.stringify({ value: { sessionId: 'session-wda-fallback' } });
          },
        };
      }
      if (url.endsWith('/session/session-wda-fallback/actions') && method === 'POST') {
        return {
          ok: false,
          async text() {
            return '{}';
          },
        };
      }
      if (url.endsWith('/session/session-wda-fallback/wda/tap/0') && method === 'POST') {
        return {
          ok: true,
          async text() {
            return '{}';
          },
        };
      }
      if (url.endsWith('/session/session-wda-fallback') && method === 'DELETE') {
        return {
          ok: true,
          async text() {
            return '{}';
          },
        };
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = await interactMobileInspectPoint('ios', 55, 77);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Tap dispatched to iOS simulator');
    expect(execPlans).toHaveLength(0);
  });

  it('returns a generic Appium rejection when both actions and WDA fallback fail without details', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-8',
                name: 'iPhone 16',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-8', '-b'],
        stdout: 'Booted',
      },
    );

    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.endsWith('/status') && method === 'GET') {
        return {
          ok: true,
          async text() {
            return '{"ready":true}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/session' && method === 'POST') {
        return {
          ok: true,
          async text() {
            return JSON.stringify({ value: { sessionId: 'session-wda-fail' } });
          },
        };
      }
      if (url.endsWith('/session/session-wda-fail/actions') && method === 'POST') {
        return {
          ok: false,
          async text() {
            return '{}';
          },
        };
      }
      if (url.endsWith('/session/session-wda-fail/wda/tap/0') && method === 'POST') {
        return {
          ok: false,
          async text() {
            return '{}';
          },
        };
      }
      if (url.endsWith('/session/session-wda-fail') && method === 'DELETE') {
        return {
          ok: true,
        };
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = await interactMobileInspectPoint('ios', 65, 88);

    expect(result.success).toBe(false);
    expect(result.message).toContain('rejected by Appium');
    expect(execPlans).toHaveLength(0);
  });

  it('creates iOS Appium session via /wd/hub fallback when root session endpoint fails', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-9',
                name: 'iPhone 16 Pro',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-9', '-b'],
        stdout: 'Booted',
      },
    );

    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.endsWith('/status') && method === 'GET') {
        return {
          ok: true,
          async text() {
            return '{"ready":true}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/session' && method === 'POST') {
        throw new Error('root endpoint refused');
      }
      if (url === 'http://127.0.0.1:4723/wd/hub/session' && method === 'POST') {
        return {
          ok: true,
          async text() {
            return JSON.stringify({ value: { sessionId: 'session-wd-hub' } });
          },
        };
      }
      if (url.endsWith('/session/session-wd-hub/actions') && method === 'POST') {
        return {
          ok: true,
          async text() {
            return '{}';
          },
        };
      }
      if (url.endsWith('/session/session-wd-hub') && method === 'DELETE') {
        return {
          ok: true,
        };
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = await interactMobileInspectPoint('ios', 30, 45);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Tap dispatched to iOS simulator');
    expect(execPlans).toHaveLength(0);
  });

  it('returns /wd/hub Appium bootstrap error message when fallback session creation is rejected', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-10',
                name: 'iPhone 16',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-10', '-b'],
        stdout: 'Booted',
      },
    );

    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.endsWith('/status') && method === 'GET') {
        return {
          ok: true,
          async text() {
            return '{"ready":true}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/session' && method === 'POST') {
        return {
          ok: false,
          async text() {
            return '{}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/wd/hub/session' && method === 'POST') {
        return {
          ok: false,
          async text() {
            return JSON.stringify({ value: { message: 'wd/hub session rejected' } });
          },
        };
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = await interactMobileInspectPoint('ios', 40, 60);

    expect(result.success).toBe(false);
    expect(result.message).toContain('wd/hub session rejected');
    expect(execPlans).toHaveLength(0);
  });

  it('returns a session request transport error when both iOS Appium session endpoints fail before response', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-11',
                name: 'iPhone 16',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-11', '-b'],
        stdout: 'Booted',
      },
    );

    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.endsWith('/status') && method === 'GET') {
        return {
          ok: true,
          async text() {
            return '{"ready":true}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/session' && method === 'POST') {
        throw new Error('root session connection dropped');
      }
      if (url === 'http://127.0.0.1:4723/wd/hub/session' && method === 'POST') {
        throw new Error('wd/hub connection dropped');
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = await interactMobileInspectPoint('ios', 40, 61);

    expect(result.success).toBe(false);
    expect(result.message).toContain('failed before server response');
    expect(execPlans).toHaveLength(0);
  });

  it('returns generic iOS Appium session bootstrap guidance when both endpoints return undecodable failures', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-12',
                name: 'iPhone 16',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-12', '-b'],
        stdout: 'Booted',
      },
    );

    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.endsWith('/status') && method === 'GET') {
        return {
          ok: true,
          async text() {
            return '{"ready":true}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/session' && method === 'POST') {
        return {
          ok: false,
          async text() {
            return '{"value":{}}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/wd/hub/session' && method === 'POST') {
        return {
          ok: false,
          async text() {
            return '{"value":{}}';
          },
        };
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = await interactMobileInspectPoint('ios', 44, 67);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to create iOS Appium session');
    expect(execPlans).toHaveLength(0);
  });

  it('returns wda fallback error details when iOS action endpoint has no details but wda does', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-13',
                name: 'iPhone 16',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-13', '-b'],
        stdout: 'Booted',
      },
    );

    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.endsWith('/status') && method === 'GET') {
        return {
          ok: true,
          async text() {
            return '{"ready":true}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/session' && method === 'POST') {
        return {
          ok: true,
          async text() {
            return JSON.stringify({ value: { sessionId: 'session-wda-message' } });
          },
        };
      }
      if (url.endsWith('/session/session-wda-message/actions') && method === 'POST') {
        return {
          ok: false,
          async text() {
            return '{}';
          },
        };
      }
      if (url.endsWith('/session/session-wda-message/wda/tap/0') && method === 'POST') {
        return {
          ok: false,
          async text() {
            return JSON.stringify({ value: { message: 'wda tap rejected' } });
          },
        };
      }
      if (url.endsWith('/session/session-wda-message') && method === 'DELETE') {
        return {
          ok: true,
        };
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = await interactMobileInspectPoint('ios', 45, 70);

    expect(result.success).toBe(false);
    expect(result.message).toContain('wda tap rejected');
    expect(execPlans).toHaveLength(0);
  });

  it('returns transport failure when both iOS action endpoints fail before response', async () => {
    execPlans.push(
      {
        command: 'xcrun',
        args: ['simctl', 'list', 'devices', '--json'],
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
              {
                udid: 'IOS-UDID-14',
                name: 'iPhone 16',
                state: 'Booted',
                isAvailable: true,
              },
            ],
          },
        }),
      },
      {
        command: 'xcrun',
        args: ['simctl', 'bootstatus', 'IOS-UDID-14', '-b'],
        stdout: 'Booted',
      },
    );

    mockFetch.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url.endsWith('/status') && method === 'GET') {
        return {
          ok: true,
          async text() {
            return '{"ready":true}';
          },
        };
      }
      if (url === 'http://127.0.0.1:4723/session' && method === 'POST') {
        return {
          ok: true,
          async text() {
            return JSON.stringify({ value: { sessionId: 'session-wda-transport' } });
          },
        };
      }
      if (url.endsWith('/session/session-wda-transport/actions') && method === 'POST') {
        throw new Error('actions transport failure');
      }
      if (url.endsWith('/session/session-wda-transport/wda/tap/0') && method === 'POST') {
        throw new Error('wda transport failure');
      }
      if (url.endsWith('/session/session-wda-transport') && method === 'DELETE') {
        return {
          ok: true,
        };
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = await interactMobileInspectPoint('ios', 46, 71);

    expect(result.success).toBe(false);
    expect(result.message).toContain('failed before Appium returned');
    expect(execPlans).toHaveLength(0);
  });
});
