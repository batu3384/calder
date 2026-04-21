import type { MobileUiLanguage } from './copy';

function createLocalPairingUrl(
  host: string,
  port: number,
  pairingId: string,
  token: string,
  language: MobileUiLanguage,
): string {
  const local = new URL(`http://${host}:${port}/m/${pairingId}`);
  local.searchParams.set('t', token);
  if (language === 'tr') {
    local.searchParams.set('lang', 'tr');
  }
  return local.toString();
}

export function createLocalPairingUrls(
  hosts: string[],
  port: number,
  pairingId: string,
  token: string,
  language: MobileUiLanguage,
): {
  localPairingUrl: string;
  localPairingUrls: string[];
} {
  const primaryHost = hosts[0] ?? '127.0.0.1';
  const localPairingUrl = createLocalPairingUrl(primaryHost, port, pairingId, token, language);
  const localPairingUrls = Array.from(new Set(
    hosts.map((host) => createLocalPairingUrl(host, port, pairingId, token, language)),
  ));
  if (!localPairingUrls.includes(localPairingUrl)) {
    localPairingUrls.unshift(localPairingUrl);
  }
  return { localPairingUrl, localPairingUrls };
}
