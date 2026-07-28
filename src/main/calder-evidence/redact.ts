import * as os from 'node:os';

export interface RedactionResult {
  value: unknown;
  redactedCount: number;
  redactionTypes: string[];
}

const SECRET_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'api_key', pattern: /\b(?:sk|pk)[-_][A-Za-z0-9]{16,}\b/g },
  { type: 'github_token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { type: 'slack_token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { type: 'npm_token', pattern: /\bnpm_[A-Za-z0-9]{20,}\b/g },
  {
    type: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g,
  },
  { type: 'aws_key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: 'bearer_token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}\b/gi },
  { type: 'authorization_header', pattern: /\bAuthorization:\s*[^\s]+/gi },
  { type: 'password_field', pattern: /\bpassword\s*=\s*[^\s&]+/gi },
  { type: 'token_field', pattern: /\btoken\s*=\s*[^\s&]+/gi },
  { type: 'secret_field', pattern: /\b(?:api[_-]?key|secret)\s*[=:]\s*[^\s&]+/gi },
  {
    type: 'env_assignment',
    pattern:
      /^\s*(?:export\s+)?[A-Z_][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*=\s*\S+/gim,
  },
  {
    type: 'private_key_pem',
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    type: 'base64_secret',
    pattern: /\b[A-Za-z0-9+/]{48,}={0,2}\b/g,
  },
];

function redactString(input: string): RedactionResult {
  let value = input;
  let redactedCount = 0;
  const redactionTypes = new Set<string>();

  for (const { type, pattern } of SECRET_PATTERNS) {
    const matches = value.match(pattern);
    if (!matches) continue;
    redactedCount += matches.length;
    redactionTypes.add(type);
    value = value.replace(pattern, `[REDACTED:${type}]`);
  }

  value = redactHomePaths(value);
  return { value, redactedCount, redactionTypes: [...redactionTypes] };
}

export function redactHomePaths(input: string): string {
  const home = os.homedir();
  if (!home) return input;
  return input.split(home).join('~');
}

export function redactValue(input: unknown): RedactionResult {
  if (input === null || input === undefined) {
    return { value: input, redactedCount: 0, redactionTypes: [] };
  }

  if (typeof input === 'string') {
    return redactString(input);
  }

  if (typeof input === 'number' || typeof input === 'boolean') {
    return { value: input, redactedCount: 0, redactionTypes: [] };
  }

  if (Array.isArray(input)) {
    let redactedCount = 0;
    const redactionTypes = new Set<string>();
    const value = input.map((item) => {
      const result = redactValue(item);
      redactedCount += result.redactedCount;
      for (const type of result.redactionTypes) redactionTypes.add(type);
      return result.value;
    });
    return { value, redactedCount, redactionTypes: [...redactionTypes] };
  }

  if (typeof input === 'object') {
    let redactedCount = 0;
    const redactionTypes = new Set<string>();
    const value: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
      const keyResult = redactString(key);
      redactedCount += keyResult.redactedCount;
      for (const type of keyResult.redactionTypes) redactionTypes.add(type);
      const result = redactValue(raw);
      redactedCount += result.redactedCount;
      for (const type of result.redactionTypes) redactionTypes.add(type);
      value[String(keyResult.value)] = result.value;
    }
    return { value, redactedCount, redactionTypes: [...redactionTypes] };
  }

  return { value: String(input), redactedCount: 0, redactionTypes: [] };
}

export function applyRedactionToMeta(meta: Record<string, unknown> | undefined): {
  meta?: Record<string, unknown>;
  redactedCount: number;
  redactionTypes: string[];
} {
  if (!meta) return { redactedCount: 0, redactionTypes: [] };
  const result = redactValue(meta);
  return {
    meta: result.value as Record<string, unknown>,
    redactedCount: result.redactedCount,
    redactionTypes: result.redactionTypes,
  };
}
