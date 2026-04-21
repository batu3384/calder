import * as os from 'node:os';
import {
  isInvalidIpv4HostAddress,
  isPrivateIpv4,
} from './network-ipv4';

function isUsableLanIpv4Candidate(entry: os.NetworkInterfaceInfoIPv4): boolean {
  if (entry.internal) return false;
  if (!isPrivateIpv4(entry.address)) return false;
  if (/^169\.254\./.test(entry.address)) return false;
  if (entry.netmask === '255.255.255.255') return false;
  if (isInvalidIpv4HostAddress(entry.address, entry.netmask)) return false;
  return true;
}

export function listLanHosts(nets: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): string[] {
  const preferred: string[] = [];
  const secondary: string[] = [];
  const fallback: string[] = [];
  const seen = new Set<string>();

  const isProbablyLanInterface = (name: string): boolean => (
    /^(en|eth|wlan|wifi|wl|lan)/i.test(name)
    || /wi-?fi/i.test(name)
  );
  const isUsuallyVirtualInterface = (name: string): boolean => (
    /^(lo|loopback|docker|veth|br-|bridge|vmnet|utun|tailscale|wg|awdl)/i.test(name)
  );

  for (const [interfaceName, values] of Object.entries(nets)) {
    if (!values) continue;
    for (const entry of values) {
      if (entry.family !== 'IPv4') continue;
      const ipv4Entry = entry as os.NetworkInterfaceInfoIPv4;
      if (!isUsableLanIpv4Candidate(ipv4Entry)) continue;
      const address = entry.address;
      if (!address || seen.has(address)) continue;
      seen.add(address);

      if (isProbablyLanInterface(interfaceName)) {
        preferred.push(address);
      } else if (isUsuallyVirtualInterface(interfaceName)) {
        fallback.push(address);
      } else {
        secondary.push(address);
      }
    }
  }

  const ordered = [...preferred, ...secondary, ...fallback];
  if (ordered.length === 0) {
    ordered.push('127.0.0.1');
  } else if (!ordered.includes('127.0.0.1')) {
    ordered.push('127.0.0.1');
  }
  return ordered;
}
