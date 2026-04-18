import { describe, expect, it } from 'vitest';
import { _internal } from './mobile-inspector';

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
  // The first chunk starts at byte 8; width/height are part of IHDR.
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('mobile-inspector internals', () => {
  it('parses simctl devices payload safely', () => {
    const payload = JSON.stringify({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
          {
            udid: 'AA-BB',
            name: 'iPhone 16 Pro',
            state: 'Shutdown',
            isAvailable: true,
          },
        ],
      },
    });
    const devices = _internal.parseSimctlDevices(payload);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual(expect.objectContaining({
      udid: 'AA-BB',
      name: 'iPhone 16 Pro',
      state: 'Shutdown',
      isAvailable: true,
    }));
  });

  it('chooses booted iPhone first and otherwise prefers latest available iPhone runtime', () => {
    const withBooted = _internal.choosePreferredIosDevice([
      { udid: '1', name: 'iPhone 15', state: 'Shutdown', isAvailable: true, runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5' },
      { udid: '2', name: 'iPhone 16 Pro', state: 'Booted', isAvailable: true, runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-18-2' },
    ]);
    expect(withBooted?.udid).toBe('2');

    const latestAvailable = _internal.choosePreferredIosDevice([
      { udid: '1', name: 'iPhone 15', state: 'Shutdown', isAvailable: true, runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5' },
      { udid: '2', name: 'iPhone 16 Pro', state: 'Shutdown', isAvailable: true, runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-18-2' },
      { udid: '3', name: 'Apple TV', state: 'Shutdown', isAvailable: true, runtimeId: 'com.apple.CoreSimulator.SimRuntime.tvOS-18-0' },
    ]);
    expect(latestAvailable?.udid).toBe('2');

    const prefersStableShutdown = _internal.choosePreferredIosDevice([
      { udid: 'a', name: 'iPhone 17 Pro', state: 'Shutting Down', isAvailable: true, runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-26-4' },
      { udid: 'b', name: 'iPhone 17', state: 'Shutdown', isAvailable: true, runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-26-4' },
    ]);
    expect(prefersStableShutdown?.udid).toBe('b');
  });

  it('parses adb devices output', () => {
    const parsed = _internal.parseAdbDevices([
      'List of devices attached',
      'emulator-5554\tdevice',
      'emulator-5556\toffline',
      '',
    ].join('\n'));
    expect(parsed).toEqual([
      { id: 'emulator-5554', state: 'device' },
      { id: 'emulator-5556', state: 'offline' },
    ]);
  });

  it('builds Android binary fallback paths from SDK roots', () => {
    const env = {
      ANDROID_HOME: '/opt/android-sdk',
      HOME: '/Users/tester',
    } as NodeJS.ProcessEnv;

    const adbCandidates = _internal.getAndroidBinaryCandidates('adb', env, 'darwin');
    const emulatorCandidates = _internal.getAndroidBinaryCandidates('emulator', env, 'darwin');

    expect(adbCandidates).toContain('/opt/android-sdk/platform-tools/adb');
    expect(emulatorCandidates).toContain('/opt/android-sdk/emulator/emulator');
  });

  it('parses Android hierarchy nodes and resolves the smallest matching node at point', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<hierarchy rotation="0">',
      '<node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="app" content-desc="" bounds="[0,0][1080,2400]">',
      '<node index="1" text="Login" resource-id="app:id/login" class="android.widget.Button" package="app" content-desc="Login button" bounds="[300,1400][780,1540]"/>',
      '</node>',
      '</hierarchy>',
    ].join('');

    const nodes = _internal.parseAndroidHierarchyNodes(xml);
    expect(nodes.length).toBeGreaterThan(0);

    const match = _internal.resolveAndroidNodeAtPoint(nodes, 500, 1450);
    expect(match).toEqual(expect.objectContaining({
      className: 'android.widget.Button',
      text: 'Login',
      resourceId: 'app:id/login',
      contentDesc: 'Login button',
    }));
  });

  it('reads png dimensions and normalizes android screencap line endings', () => {
    const png = createPngBuffer(1170, 2532);
    const size = _internal.readPngSize(png);
    expect(size).toEqual({ width: 1170, height: 2532 });

    const textWrapped = Buffer.from(png.toString('binary').replace(/\n/g, '\r\n'), 'binary');
    const normalized = _internal.normalizeAndroidScreencap(textWrapped);
    expect(_internal.readPngSize(normalized)).toEqual({ width: 1170, height: 2532 });
  });

  it('normalizes noisy iOS simulator command failures into concise guidance', () => {
    const noBooted = _internal.summarizeIosFailure(
      { stderr: 'simctl: No devices are booted.' },
      'fallback',
    );
    expect(noBooted).toContain('No booted iOS simulator detected');

    const dyld = _internal.summarizeIosFailure(
      { stderr: 'dyld_shared_cache is out of date for this runtime' },
      'fallback',
      { includeRecoveryHint: true },
    );
    expect(dyld).toContain('xcrun simctl runtime dyld_shared_cache update --all');

    const noteOnly = _internal.summarizeIosFailure(
      {
        stderr: [
          'Note: No display specified. Defaulting to display: ABC',
          'simctl screenshot failed: operation timed out',
        ].join('\n'),
      },
      'fallback',
      { includeRecoveryHint: true },
    );
    expect(noteOnly).not.toContain('No display specified');
    expect(noteOnly).toContain('did not become ready in time');
  });
});
