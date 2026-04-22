import { ipcMain } from 'electron';
import type { MobileDependencyId, MobileDependencyInstallProgressEvent, MobileInspectPlatform } from '../shared/types/mobile';
import type { ShareConnectionDescription } from '../shared/types/project';
import { checkMobileDependencies, installMobileDependency } from './mobile-dependency-doctor';
import {
  captureMobileInspectScreenshot,
  interactMobileInspectPoint,
  inspectMobilePoint,
  launchMobileInspectSurface,
} from './mobile-inspector';
import { resolveShareRtcConfigFromEnv } from './share-rtc-config';
import {
  consumeMobileControlPairingAnswer,
  createMobileControlPairing,
  revokeMobileControlPairing,
} from './mobile-control-bridge';

function resolvePlatform(platform: MobileInspectPlatform): MobileInspectPlatform {
  return platform === 'android' ? 'android' : 'ios';
}

function toFiniteCoordinate(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function registerMobileIpcHandlers(): void {
  ipcMain.handle('mobileSetup:checkDependencies', async () => {
    return checkMobileDependencies();
  });

  ipcMain.handle('mobileSetup:installDependency', async (event, dependencyId: string, installId?: string) => {
    const resolvedInstallId = typeof installId === 'string' && installId.trim().length > 0
      ? installId.trim()
      : `mobile-install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return installMobileDependency(dependencyId as MobileDependencyId, {
      installId: resolvedInstallId,
      onProgress: (progressEvent: MobileDependencyInstallProgressEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('mobileSetup:installProgress', progressEvent);
        }
      },
    });
  });

  ipcMain.handle('mobileInspect:launch', async (_event, platform: MobileInspectPlatform) => {
    return launchMobileInspectSurface(resolvePlatform(platform));
  });

  ipcMain.handle('mobileInspect:captureScreenshot', async (_event, platform: MobileInspectPlatform) => {
    return captureMobileInspectScreenshot(resolvePlatform(platform));
  });

  ipcMain.handle('mobileInspect:inspectPoint', async (_event, platform: MobileInspectPlatform, x: number, y: number) => {
    return inspectMobilePoint(resolvePlatform(platform), toFiniteCoordinate(x), toFiniteCoordinate(y));
  });

  ipcMain.handle('mobileInspect:interact', async (_event, platform: MobileInspectPlatform, x: number, y: number) => {
    return interactMobileInspectPoint(resolvePlatform(platform), toFiniteCoordinate(x), toFiniteCoordinate(y));
  });

  ipcMain.handle('sharing:getRtcConfig', () => resolveShareRtcConfigFromEnv());
  ipcMain.handle(
    'mobile:createControlPairing',
    async (
      _event,
      sessionId: string,
      offer: string,
      passphrase: string,
      mode: 'readonly' | 'readwrite',
      language?: 'en' | 'tr',
      offerDescription?: ShareConnectionDescription,
    ) =>
      createMobileControlPairing({ sessionId, offer, passphrase, mode, language, offerDescription }),
  );
  ipcMain.handle('mobile:consumeControlAnswer', (_event, pairingId: string) =>
    consumeMobileControlPairingAnswer(pairingId));
  ipcMain.handle('mobile:revokeControlPairing', (_event, pairingId: string) => {
    revokeMobileControlPairing(pairingId);
    return { ok: true };
  });
}
