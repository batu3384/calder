import { execFileSync } from 'child_process';
import { homedir } from 'os';
import type { ProviderId } from '../shared/types';
import { isWin } from './platform';

const PROVIDER_LOGIN_ENV_KEYS: Record<ProviderId, string[]> = {
  claude: [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_CUSTOM_HEADERS',
  ],
  codex: [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_ORG_ID',
    'OPENAI_PROJECT_ID',
  ],
  copilot: [],
  gemini: [
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
  ],
  qwen: [
    'DASHSCOPE_API_KEY',
    'QWEN_API_KEY',
  ],
  minimax: [
    'MINIMAX_API_KEY',
    'MINIMAX_REGION',
    'MINIMAX_BASE_URL',
    'MINIMAX_OUTPUT',
    'MINIMAX_TIMEOUT',
    'MINIMAX_VERBOSE',
  ],
  blackbox: [
    'BLACKBOX_API_KEY',
  ],
};

let cachedLoginShellEnv: Record<string, string> | null = null;

function parseEnvOutput(raw: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const sep = line.indexOf('=');
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1);
    if (!key) continue;
    env[key] = value;
  }
  return env;
}

function getLoginShellEnv(): Record<string, string> {
  if (cachedLoginShellEnv) return cachedLoginShellEnv;
  if (isWin) {
    cachedLoginShellEnv = {};
    return cachedLoginShellEnv;
  }

  const shell = process.env.SHELL || '/bin/zsh';
  try {
    const raw = execFileSync(shell, ['-ilc', 'env'], {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env, HOME: homedir() },
    });
    cachedLoginShellEnv = parseEnvOutput(raw);
  } catch {
    cachedLoginShellEnv = {};
  }
  return cachedLoginShellEnv;
}

export function buildProviderBaseEnv(
  providerId: ProviderId,
  baseEnv: Record<string, string>
): Record<string, string> {
  const keys = PROVIDER_LOGIN_ENV_KEYS[providerId] ?? [];
  if (keys.length === 0) return { ...baseEnv };

  const loginShellEnv = getLoginShellEnv();
  const mergedEnv = { ...baseEnv };
  for (const key of keys) {
    const existingValue = mergedEnv[key]?.trim();
    if (existingValue) continue;
    const loginValue = loginShellEnv[key]?.trim();
    if (loginValue) {
      mergedEnv[key] = loginShellEnv[key];
    }
  }
  return mergedEnv;
}

/** @internal Test-only: reset cached login shell env */
export function _resetLoginShellEnvCache(): void {
  cachedLoginShellEnv = null;
}
