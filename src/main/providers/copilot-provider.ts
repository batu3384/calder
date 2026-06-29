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
import { sanitizeExtraArgsQuiet } from '../security/sanitize';
import { BaseCliProvider } from './base-cli-provider';
import { resolveBinary, validateBinaryExists } from './resolve-binary';

const binaryCache = { path: null as string | null };
const INERT_SETTINGS: SettingsValidationResult = {
  statusLine: 'missing',
  hooks: 'missing',
  hookDetails: {},
};

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
    return validateBinaryExists('copilot', 'GitHub Copilot', 'npm install -g @github/copilot');
  }

  buildEnv(_sessionId: string, baseEnv: Record<string, string>): Record<string, string> {
    return { ...baseEnv, PATH: getFullPath() };
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
