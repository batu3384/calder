import { EventEmitter } from 'node:events';
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

import {
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
});
