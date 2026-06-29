import type { BrowserWindow } from 'electron';

import type {
  CliProviderMeta,
  ProviderConfig,
  SettingsValidationResult,
} from '../../shared/types/provider';
import {
  startConfigWatcher as startConfigWatch,
  stopConfigWatcher as stopConfigWatch,
} from '../config-watcher';
import { getCopilotConfig } from '../copilot-config';
import { stopCopilotSessionWatcher } from '../copilot-session-watcher';
import { getFullPath } from '../full-path';
import { buildProviderBaseEnv } from '../provider-env';
import { sanitizeExtraArgsQuiet } from '../security/sanitize';
import { BaseCliProvider } from './base-cli-provider';
import { resolveBinary, validateBinaryExists } from './resolve-binary';

const binaryCache = { path: null as string | null };
const INERT_SETTINGS: SettingsValidationResult = {
  statusLine: 'missing',
  hooks: 'missing',
  hookDetails: {},
};

const HEADROOM_PROXY_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'OPENAI_BASE_URL',
  'COPILOT_PROVIDER_BASE_URL',
  'COPILOT_PROVIDER_TYPE',
  'COPILOT_PROVIDER_API_KEY',
  'COPILOT_PROVIDER_BEARER_TOKEN',
  'COPILOT_PROVIDER_MODEL_ID',
  'COPILOT_PROVIDER_WIRE_MODEL',
  'COPILOT_MODEL',
] as const;

function withoutHeadroomProxyEnv(env: Record<string, string>): Record<string, string> {
  const next = { ...env };
  for (const key of HEADROOM_PROXY_ENV_KEYS) {
    delete next[key];
  }
  return next;
}

export class CopilotProvider extends BaseCliProvider {
  readonly meta: CliProviderMeta = {
    id: 'copilot',
    displayName: 'GitHub Copilot',
    binaryName: 'copilot',
    capabilities: {
      sessionResume: true,
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
      configReading: true,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
    },
    defaultContextWindowSize: 200_000,
  };

  protected readonly binaryName = 'copilot';
  protected readonly installCommand = 'npm install -g @github/copilot';
  protected readonly binaryCache = binaryCache;

  resolveBinaryPath(): string {
    return resolveBinary('copilot', binaryCache);
  }

  validatePrerequisites(): { ok: boolean; message: string } {
    const binaryCheck = validateBinaryExists(
      'copilot',
      'GitHub Copilot',
      'npm install -g @github/copilot',
    );
    if (!binaryCheck.ok) return binaryCheck;

    const env = withoutHeadroomProxyEnv(
      buildProviderBaseEnv('copilot', { ...process.env } as Record<string, string>),
    );
    const byokActive = Boolean(env.COPILOT_PROVIDER_BASE_URL?.trim());
    const hasModel = Boolean(env.COPILOT_MODEL?.trim() || env.COPILOT_PROVIDER_MODEL_ID?.trim());
    if (byokActive && !hasModel) {
      return {
        ok: false,
        message:
          'GitHub Copilot BYOK is configured but no model is set.\n\n' +
          'Add a model to your shell profile, for example:\n' +
          '  export COPILOT_MODEL=claude-sonnet-4\n\n' +
          'Then restart Calder.',
      };
    }

    return { ok: true, message: '' };
  }

  buildEnv(_sessionId: string, baseEnv: Record<string, string>): Record<string, string> {
    return { ...withoutHeadroomProxyEnv(baseEnv), PATH: getFullPath() };
  }

  buildArgs(opts: {
    cliSessionId: string | null;
    isResume: boolean;
    extraArgs: string;
    initialPrompt?: string;
  }): string[] {
    const args: string[] = [];
    if (opts.isResume && opts.cliSessionId) {
      args.push('--resume', opts.cliSessionId);
    }
    if (opts.extraArgs) {
      args.push(...sanitizeExtraArgsQuiet(opts.extraArgs));
    }
    if (!opts.isResume && opts.initialPrompt) {
      args.push('-i', opts.initialPrompt);
    }
    return args;
  }

  async installHooks(): Promise<void> {}

  installStatusScripts(): void {}

  cleanup(): void {
    stopConfigWatch();
    stopCopilotSessionWatcher();
  }

  startConfigWatcher(win: BrowserWindow, projectPath: string): void {
    startConfigWatch(win, projectPath, 'copilot');
  }

  stopConfigWatcher(): void {
    stopConfigWatch();
  }

  async getConfig(projectPath: string): Promise<ProviderConfig> {
    return getCopilotConfig(projectPath);
  }

  getShiftEnterSequence(): string | null {
    return null;
  }

  validateSettings(): SettingsValidationResult {
    return INERT_SETTINGS;
  }

  reinstallSettings(): void {}
}

export function _resetCachedPath(): void {
  binaryCache.path = null;
}
