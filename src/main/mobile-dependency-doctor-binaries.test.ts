import { describe, expect, it } from 'vitest';
import {
  getAndroidBinaryCandidates,
  resolveBinary,
} from './mobile-dependency-doctor-binaries';

describe('mobile dependency doctor binary helpers', () => {
  it('builds sdkmanager fallback candidates from Android SDK roots', () => {
    const env = {
      ANDROID_HOME: '/opt/android-sdk',
    } as NodeJS.ProcessEnv;

    const candidates = getAndroidBinaryCandidates('sdkmanager', env, 'darwin');
    expect(candidates).toContain('/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager');
    expect(candidates).toContain('/opt/android-sdk/cmdline-tools/bin/sdkmanager');
  });

  it('deduplicates root candidates before expanding binary paths', () => {
    const env = {
      ANDROID_HOME: '/opt/android-sdk/',
      ANDROID_SDK_ROOT: '/opt/android-sdk',
    } as NodeJS.ProcessEnv;

    const candidates = getAndroidBinaryCandidates('adb', env, 'darwin');
    expect(candidates.filter((candidate) => candidate === '/opt/android-sdk/platform-tools/adb')).toHaveLength(1);
  });

  it('resolves fallback binary path when shell lookup misses', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner = {
      run: async (command: string, args: string[]) => {
        calls.push({ command, args });
        if (command === 'which') {
          return { code: 1, stdout: '', stderr: 'not found' };
        }
        if (command === '/fallback/sdkmanager') {
          return { code: 0, stdout: '12.0', stderr: '' };
        }
        return { code: 1, stdout: '', stderr: 'failed' };
      },
    };

    const resolved = await resolveBinary(runner, 'sdkmanager', {
      fallbackPaths: ['/fallback/sdkmanager'],
      probeArgs: ['--version'],
    });

    expect(resolved).toBe('/fallback/sdkmanager');
    expect(calls[0]).toEqual({ command: 'which', args: ['sdkmanager'] });
    expect(calls[1]).toEqual({ command: '/fallback/sdkmanager', args: ['--version'] });
  });
});
