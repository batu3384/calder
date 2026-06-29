import { describe, expect, it } from 'vitest';

import { getAndroidBinaryCandidates as getDoctorCandidates } from './mobile-dependency-doctor-binaries';
import { getAndroidBinaryCandidates as getInspectorCandidates } from './mobile-inspector-helpers';

describe('mobile-inspector Android binary candidate wiring', () => {
  it('reuses dependency doctor candidate expansion for adb', () => {
    const env = {
      ANDROID_HOME: '/opt/android-sdk',
      ANDROID_SDK_ROOT: '/opt/android-sdk/',
    } as NodeJS.ProcessEnv;

    const inspector = getInspectorCandidates('adb', env, 'darwin');
    const doctor = getDoctorCandidates('adb', env, 'darwin');

    expect(inspector).toEqual(doctor);
    expect(inspector).toContain('/opt/android-sdk/platform-tools/adb');
  });

  it('keeps platform-specific executable suffixes for emulator on Windows', () => {
    const env = {
      ANDROID_HOME: 'C:\\Android\\Sdk',
    } as NodeJS.ProcessEnv;

    const inspector = getInspectorCandidates('emulator', env, 'win32');

    expect(inspector.some((candidate) => /emulator[\\/]emulator\.exe$/.test(candidate))).toBe(true);
  });
});
