export function isPrivateIpv4(address: string): boolean {
  return (
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
}

export function parseIpv4ToInt(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return (
    (((octets[0] << 24) >>> 0) |
      ((octets[1] << 16) >>> 0) |
      ((octets[2] << 8) >>> 0) |
      (octets[3] >>> 0)) >>>
    0
  );
}

export function isInvalidIpv4HostAddress(address: string, netmask: string | undefined): boolean {
  if (!netmask) return false;
  const addressInt = parseIpv4ToInt(address);
  const netmaskInt = parseIpv4ToInt(netmask);
  if (addressInt === null || netmaskInt === null) return false;

  const hostMask = ~netmaskInt >>> 0;
  if (hostMask === 0 || hostMask === 1) return false;
  const hostBits = addressInt & hostMask;
  return hostBits === 0 || hostBits === hostMask;
}
