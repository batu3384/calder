import * as http from 'node:http';
import type { ShareMode, ShareRtcConfig } from '../../shared/sharing-types';
import type { ShareConnectionDescription } from '../../shared/types';
import type { MobileUiLanguage } from './copy';

export type PairingStatus = 'pending' | 'ready' | 'expired';

export interface PairingRecord {
  id: string;
  sessionId: string;
  offer: string;
  offerDescription: ShareConnectionDescription | null;
  passphrase: string;
  mode: ShareMode;
  accessMode: 'lan' | 'remote';
  token: string;
  otpCode: string;
  attempts: number;
  otpVerified: boolean;
  submitToken: string | null;
  answer: string | null;
  answerConsumed: boolean;
  language: MobileUiLanguage;
  rtcConfig: Pick<ShareRtcConfig, 'iceServers' | 'iceTransportPolicy'>;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface MobileBridgeState {
  server: http.Server;
  port: number;
  host: string;
  hosts: string[];
  cleanupTimer: NodeJS.Timeout;
}

export interface MobileControlPairingOptions {
  sessionId: string;
  offer: string;
  offerDescription?: ShareConnectionDescription;
  passphrase: string;
  mode: ShareMode;
  language?: MobileUiLanguage;
  ttlMs?: number;
}

export interface MobileControlPairingResult {
  pairingId: string;
  pairingUrl: string;
  localPairingUrl: string;
  localPairingUrls: string[];
  accessMode: 'lan' | 'remote';
  otpCode: string;
  expiresAt: string;
}

export interface MobileControlAnswerResult {
  answer: string | null;
  status: PairingStatus;
}
