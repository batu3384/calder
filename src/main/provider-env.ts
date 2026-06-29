import { execFileSync } from 'child_process';
import { homedir } from 'os';

import type { ProviderId } from '../shared/types/provider';
import { isWin } from './platform';

const PROVIDER_LOGIN_ENV_KEYS: Record<ProviderId, string[]> = {
  claude: [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_CUSTOM_HEADERS',
  ],
  codex: ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_ORG_ID', 'OPENAI_PROJECT_ID'],
  copilot: ['GH_TOKEN', 'GITHUB_TOKEN'],
  antigravity: [
    'ANTIGRAVITY_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
  ],
  qwen: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
};

const COPILOT_LOGIN_ENV_PREFIX = 'COPILOT_';

function mergeLoginShellKeys(
  mergedEnv: Record<string, string>,
  loginShellEnv: Record<string, string>,
  keys: string[],
): void {
  for (const key of keys) {
    const existingValue = mergedEnv[key]?.trim();
    if (existingValue) continue;
    const loginValue = loginShellEnv[key]?.trim();
    if (loginValue) {
      mergedEnv[key] = loginShellEnv[key];
    }
  }
}

function mergeLoginShellPrefix(
  mergedEnv: Record<string, string>,
  loginShellEnv: Record<string, string>,
  prefix: string,
): void {
  for (const [key, value] of Object.entries(loginShellEnv)) {
    if (!key.startsWith(prefix)) continue;
    if (mergedEnv[key]?.trim()) continue;
    if (value?.trim()) mergedEnv[key] = value;
  }
}

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
  baseEnv: Record<string, string>,
): Record<string, string> {
  const keys = PROVIDER_LOGIN_ENV_KEYS[providerId] ?? [];
  const needsLoginShell = keys.length > 0 || providerId === 'copilot';
  if (!needsLoginShell) return { ...baseEnv };

  const loginShellEnv = getLoginShellEnv();
  const mergedEnv = { ...baseEnv };
  mergeLoginShellKeys(mergedEnv, loginShellEnv, keys);
  if (providerId === 'copilot') {
    mergeLoginShellPrefix(mergedEnv, loginShellEnv, COPILOT_LOGIN_ENV_PREFIX);
  }
  return mergedEnv;
}

/** @internal Test-only: reset cached login shell env */
export function _resetLoginShellEnvCache(): void {
  cachedLoginShellEnv = null;
}
