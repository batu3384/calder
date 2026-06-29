import type { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
  CliProviderMeta,
  ProviderConfig,
  SettingsValidationResult,
} from '../../shared/types/provider';
import { getCodexConfig } from '../codex-config';
import {
  cleanupCodexHooks,
  installCodexHooks,
  SESSION_ID_VAR,
  validateCodexHooks,
} from '../codex-hooks';
import { stopCodexSessionWatcher } from '../codex-session-watcher';
import {
  startConfigWatcher as startConfigWatch,
  stopConfigWatcher as stopConfigWatch,
} from '../config-watcher';
import { EXTERNAL_HOOK_INJECTION_ENABLED } from '../external-hook-policy';
import { getFullPath } from '../full-path';
import { sanitizeExtraArgs } from '../security/sanitize';
import { BaseCliProvider } from './base-cli-provider';
import { resolveBinary, validateBinaryExists } from './resolve-binary';

const binaryCache = { path: null as string | null };

export class CodexProvider extends BaseCliProvider {
  readonly meta: CliProviderMeta = {
    id: 'codex',
    displayName: 'Codex CLI',
    binaryName: 'codex',
    capabilities: {
      sessionResume: true,
      costTracking: true,
      contextWindow: true,
      hookStatus: true,
      configReading: true,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
    },
    defaultContextWindowSize: 200_000,
  };

  protected readonly binaryName = 'codex';
  protected readonly installCommand = 'npm install -g @openai/codex';
  protected readonly binaryCache = binaryCache;

  resolveBinaryPath(): string {
    return resolveBinary('codex', binaryCache);
  }

  validatePrerequisites(): { ok: boolean; message: string } {
    return validateBinaryExists('codex', 'Codex CLI', 'npm install -g @openai/codex');
  }

  buildEnv(sessionId: string, baseEnv: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = { ...baseEnv };
    delete env.CLAUDE_CODE;
    env[SESSION_ID_VAR] = sessionId;
    env.PATH = getFullPath();
    env.CALDER_RUNTIME = '1';
    return env;
  }

  buildArgs(opts: {
    cliSessionId: string | null;
    isResume: boolean;
    extraArgs: string;
    initialPrompt?: string;
  }): string[] {
    const args: string[] = [];
    if (opts.isResume && opts.cliSessionId) {
      args.push('resume', opts.cliSessionId);
    } else if (opts.initialPrompt) {
      args.push(opts.initialPrompt);
    }
    if (opts.extraArgs) {
      args.push(...sanitizeExtraArgs(opts.extraArgs));
    }
    return args;
  }

  async installHooks(): Promise<void> {
    installCodexHooks();
  }

  installStatusScripts(): void {}

  cleanup(): void {
    stopConfigWatch();
    stopCodexSessionWatcher();
  }

  startConfigWatcher(win: BrowserWindow, projectPath: string): void {
    startConfigWatch(win, projectPath, 'codex');
  }

  stopConfigWatcher(): void {
    stopConfigWatch();
  }

  async getConfig(projectPath: string): Promise<ProviderConfig> {
    return getCodexConfig(projectPath);
  }

  getShiftEnterSequence(): string | null {
    return null;
  }

  validateSettings(): SettingsValidationResult {
    return validateCodexHooks();
  }

  reinstallSettings(): void {
    if (!EXTERNAL_HOOK_INJECTION_ENABLED) {
      cleanupCodexHooks();
      return;
    }
    installCodexHooks();
  }

  getTranscriptPath(cliSessionId: string, _projectPath: string): string | null {
    try {
      const root = path.join(os.homedir(), '.codex', 'sessions');
      const suffix = `-${cliSessionId}.jsonl`;
      for (const year of descSortedReaddir(root)) {
        const yearDir = path.join(root, year);
        for (const month of descSortedReaddir(yearDir)) {
          const monthDir = path.join(yearDir, month);
          for (const day of descSortedReaddir(monthDir)) {
            const dayDir = path.join(monthDir, day);
            for (const file of descSortedReaddir(dayDir)) {
              if (file.endsWith(suffix)) return path.join(dayDir, file);
            }
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }
}

function descSortedReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir).sort().reverse();
  } catch {
    return [];
  }
}

/** @internal Test-only: reset cached binary path */
export function _resetCachedPath(): void {
  binaryCache.path = null;
}
