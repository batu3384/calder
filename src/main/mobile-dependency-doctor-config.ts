import type { MobileDependencyId } from '../shared/types/mobile';

export interface DoctorInstallStep {
  command: string;
  args: string[];
  timeoutMs?: number;
}

export interface DoctorInstallSpec {
  macOnly?: boolean;
  steps: DoctorInstallStep[];
}

export const MOBILE_DOCTOR_DOCS = {
  appiumInstall: 'https://appium.io/docs/en/latest/quickstart/install/',
  appiumXcuitest:
    'https://appium.github.io/appium-xcuitest-driver/latest/getting-started/system-requirements/',
  appiumUiauto2: 'https://appium.io/docs/en/3.3/quickstart/uiauto2-driver/',
  androidSdkManager: 'https://developer.android.com/tools/sdkmanager',
  androidAvdManager: 'https://developer.android.com/tools/avdmanager',
  androidEmulator: 'https://developer.android.com/studio/run/emulator-commandline',
  appleXcode:
    'https://developer.apple.com/documentation/safari-developer-tools/installing-xcode-and-simulators',
  maestroInstall: 'https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli',
} as const;

export const MOBILE_DOCTOR_INSTALL_SPECS: Partial<Record<MobileDependencyId, DoctorInstallSpec>> = {
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
