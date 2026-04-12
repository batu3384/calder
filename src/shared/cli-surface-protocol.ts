import type { SurfaceSelectionRange } from './types.js';

export interface CalderProtocolMessage {
  type: 'node' | 'focus' | 'state';
  nodeId: string;
  label?: string;
  bounds?: SurfaceSelectionRange;
  sourceFile?: string;
  meta?: Record<string, unknown>;
}

export type CalderProtocolPayload = Omit<CalderProtocolMessage, 'type'>;
export type CliSurfaceProtocolWriter = ((chunk: string) => void) | { write(chunk: string): unknown };

export const OSC_PREFIX = '\u001b]8970;calder=';
export const OSC_SUFFIX = '\u0007';

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

export function extractCalderOscMessages(input: string): {
  plainText: string;
  messages: CalderProtocolMessage[];
  remainder: string;
};
export function extractCalderOscMessages(input: string, carryover: string): {
  plainText: string;
  messages: CalderProtocolMessage[];
  remainder: string;
};
export function extractCalderOscMessages(input: string, carryover = ''): {
  plainText: string;
  messages: CalderProtocolMessage[];
  remainder: string;
} {
  const messages: CalderProtocolMessage[] = [];
  const combined = `${carryover}${input}`;
  let plainText = '';
  let cursor = 0;

  while (cursor < combined.length) {
    const start = combined.indexOf(OSC_PREFIX, cursor);
    if (start === -1) {
      const trailingPrefixLength = findTrailingPrefixLength(combined.slice(cursor));
      const safeEnd = combined.length - trailingPrefixLength;
      plainText += combined.slice(cursor, safeEnd);
      return {
        plainText,
        messages,
        remainder: combined.slice(safeEnd),
      };
    }

    plainText += combined.slice(cursor, start);

    const end = combined.indexOf(OSC_SUFFIX, start + OSC_PREFIX.length);
    if (end === -1) {
      return {
        plainText,
        messages,
        remainder: combined.slice(start),
      };
    }

    const candidate = combined.slice(start, end + OSC_SUFFIX.length);
    const parsed = parseCalderOsc(candidate);
    if (parsed) {
      messages.push(parsed);
    } else {
      plainText += candidate;
    }

    cursor = end + OSC_SUFFIX.length;
  }

  return { plainText, messages, remainder: '' };
}

function findTrailingPrefixLength(input: string): number {
  const maxLength = Math.min(input.length, OSC_PREFIX.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (OSC_PREFIX.startsWith(input.slice(-length))) {
      return length;
    }
  }
  return 0;
}

function writeProtocolChunk(writer: CliSurfaceProtocolWriter, chunk: string): void {
  if (typeof writer === 'function') {
    writer(chunk);
    return;
  }
  writer.write(chunk);
}

export function emitCalderOsc(writer: CliSurfaceProtocolWriter, message: CalderProtocolMessage): string {
  const encoded = encodeCalderOsc(message);
  writeProtocolChunk(writer, encoded);
  return encoded;
}

export function createCliSurfaceEmitter(writer: CliSurfaceProtocolWriter) {
  return {
    emitMessage(message: CalderProtocolMessage): string {
      return emitCalderOsc(writer, message);
    },
    emitNode(message: CalderProtocolPayload): string {
      return emitCalderOsc(writer, { ...message, type: 'node' });
    },
    emitFocus(message: CalderProtocolPayload): string {
      return emitCalderOsc(writer, { ...message, type: 'focus' });
    },
    emitState(message: CalderProtocolPayload): string {
      return emitCalderOsc(writer, { ...message, type: 'state' });
    },
  };
}
