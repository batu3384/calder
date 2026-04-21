import type { IpcRenderer } from 'electron';
import type {
  MobileControlAnswerResult,
  MobileControlPairingResult,
  MobileDependencyId,
  MobileDependencyInstallProgressEvent,
  MobileDependencyInstallResult,
  MobileDependencyReport,
  MobileInspectInteractionResult,
  MobileInspectLaunchResult,
  MobileInspectPlatform,
  MobileInspectPointInspectionResult,
  MobileInspectScreenshotResult,
  ShareConnectionDescription,
  UiLanguage,
} from '../shared/types';

type OnChannel = (channel: string, callback: (...args: unknown[]) => void) => () => void;

export interface PreloadMobileApi {
  createControlPairing(
    sessionId: string,
    offer: string,
    passphrase: string,
    mode: 'readonly' | 'readwrite',
    language?: UiLanguage,
    offerDescription?: ShareConnectionDescription,
  ): Promise<MobileControlPairingResult>;
  consumeControlAnswer(pairingId: string): Promise<MobileControlAnswerResult>;
  revokeControlPairing(pairingId: string): Promise<{ ok: boolean }>;
}

export interface PreloadMobileSetupApi {
  checkDependencies(): Promise<MobileDependencyReport>;
  installDependency(dependencyId: MobileDependencyId, installId?: string): Promise<MobileDependencyInstallResult>;
  onInstallProgress(callback: (event: MobileDependencyInstallProgressEvent) => void): () => void;
}

export interface PreloadMobileInspectApi {
  launch(platform: MobileInspectPlatform): Promise<MobileInspectLaunchResult>;
  captureScreenshot(platform: MobileInspectPlatform): Promise<MobileInspectScreenshotResult>;
  inspectPoint(platform: MobileInspectPlatform, x: number, y: number): Promise<MobileInspectPointInspectionResult>;
  interact(platform: MobileInspectPlatform, x: number, y: number): Promise<MobileInspectInteractionResult>;
}

export function createPreloadMobileApi(ipcRenderer: IpcRenderer): PreloadMobileApi {
  return {
    createControlPairing: (
      sessionId: string,
      offer: string,
      passphrase: string,
      mode: 'readonly' | 'readwrite',
      language?: UiLanguage,
      offerDescription?: ShareConnectionDescription,
    ) => ipcRenderer.invoke('mobile:createControlPairing', sessionId, offer, passphrase, mode, language, offerDescription),
    consumeControlAnswer: (pairingId: string) => ipcRenderer.invoke('mobile:consumeControlAnswer', pairingId),
    revokeControlPairing: (pairingId: string) => ipcRenderer.invoke('mobile:revokeControlPairing', pairingId),
  };
}

export function createPreloadMobileSetupApi(
  ipcRenderer: IpcRenderer,
  onChannel: OnChannel,
): PreloadMobileSetupApi {
  return {
    checkDependencies: () => ipcRenderer.invoke('mobileSetup:checkDependencies'),
    installDependency: (dependencyId: MobileDependencyId, installId?: string) =>
      ipcRenderer.invoke('mobileSetup:installDependency', dependencyId, installId),
    onInstallProgress: (callback) =>
      onChannel('mobileSetup:installProgress', (event) =>
        callback(event as MobileDependencyInstallProgressEvent)),
  };
}

export function createPreloadMobileInspectApi(ipcRenderer: IpcRenderer): PreloadMobileInspectApi {
  return {
    launch: (platform: MobileInspectPlatform) =>
      ipcRenderer.invoke('mobileInspect:launch', platform),
    captureScreenshot: (platform: MobileInspectPlatform) =>
      ipcRenderer.invoke('mobileInspect:captureScreenshot', platform),
    inspectPoint: (platform: MobileInspectPlatform, x: number, y: number) =>
      ipcRenderer.invoke('mobileInspect:inspectPoint', platform, x, y),
    interact: (platform: MobileInspectPlatform, x: number, y: number) =>
      ipcRenderer.invoke('mobileInspect:interact', platform, x, y),
  };
}
