import type { SurfaceSelectionRange } from '../../../shared/types.js';

export interface CalderProtocolMessage {
  type: 'node' | 'focus' | 'state';
  nodeId: string;
  label?: string;
  bounds?: SurfaceSelectionRange;
  sourceFile?: string;
  meta?: Record<string, unknown>;
}

const OSC_PREFIX = '\u001b]8970;calder=';
const OSC_SUFFIX = '\u0007';

function encodeBase64(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8');
  }
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeCalderOsc(message: CalderProtocolMessage): string {
  return `${OSC_PREFIX}${encodeBase64(JSON.stringify(message))}${OSC_SUFFIX}`;
}

export function parseCalderOsc(input: string): CalderProtocolMessage | null {
  if (!input.startsWith(OSC_PREFIX) || !input.endsWith(OSC_SUFFIX)) {
    return null;
  }

  const encoded = input.slice(OSC_PREFIX.length, -OSC_SUFFIX.length);
  return JSON.parse(decodeBase64(encoded)) as CalderProtocolMessage;
}
