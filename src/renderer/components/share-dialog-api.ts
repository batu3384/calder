import type { ShareMode } from '../../shared/sharing-types.js';
import type { UiLanguage } from '../../shared/types/provider.js';
import type { MobileControlPairingResult } from '../../shared/types/mobile.js';
import type { ShareConnectionDescription, ShareRtcConfig } from '../../shared/types/project.js';

export interface MobileControlAnswerResult {
  answer: string | null;
  status: 'pending' | 'ready' | 'expired';
}

export interface MobileControlApi {
  createControlPairing(
    sessionId: string,
    offer: string,
    passphrase: string,
    mode: ShareMode,
    language?: UiLanguage,
    offerDescription?: ShareConnectionDescription,
  ): Promise<MobileControlPairingResult>;
  consumeControlAnswer(pairingId: string): Promise<MobileControlAnswerResult>;
  revokeControlPairing(pairingId: string): Promise<{ ok: boolean }>;
}

export interface SharingConfigApi {
  getRtcConfig(): Promise<ShareRtcConfig>;
}
