import type { BrowserWindow } from 'electron';

import type { CliProviderMeta, ProviderConfig, SettingsValidationResult } from '../../shared/types/provider';
import { startConfigWatcher as startConfigWatch, stopConfigWatcher as stopConfigWatch } from '../config-watcher';
import { EXTERNAL_HOOK_INJECTION_ENABLED } from '../external-hook-policy';
import { getFullPath } from '../full-path';
import { installStatusLineScript } from '../hooks/hook-status';
import { findQwenTranscriptPath,getQwenConfig } from '../qwen-config';
import { cleanupQwenHooks, installQwenHooks, SESSION_ID_VAR,validateQwenHooks } from '../qwen-hooks';
import { sanitizeExtraArgs } from '../security/sanitize';
import { BaseCliProvider } from './base-cli-provider';
import { resolveBinary, validateBinaryExists } from './resolve-binary';

const binaryCache = { path: null as string | null };

export class QwenProvider extends BaseCliProvider {
  readonly meta: CliProviderMeta = {
    id: 'qwen',
    displayName: 'Qwen Code',
    binaryName: 'qwen',
    capabilities: {
      sessionResume: true,
      costTracking: true,
      contextWindow: true,
      hookStatus: true,
      configReading: true,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
      planModeArg: '--approval-mode=plan',
    },
    defaultContextWindowSize: 1_000_000,
  };

  protected readonly binaryName = 'qwen';
  protected readonly installCommand = 'npm install -g @qwen-code/qwen-code';
  protected readonly binaryCache = binaryCache;

  resolveBinaryPath(): string {
    return resolveBinary('qwen', binaryCache);
  }

  validatePrerequisites(): { ok: boolean; message: string } {
    return validateBinaryExists('qwen', 'Qwen Code', 'npm install -g @qwen-code/qwen-code');
  }

  buildEnv(_sessionId: string, baseEnv: Record<string, string>): Record<string, string> {
    return {
      ...baseEnv,
      [SESSION_ID_VAR]: _sessionId,
      CLAUDE_IDE_SESSION_ID: _sessionId,
      CALDER_RUNTIME: '1',
      PATH: getFullPath(),
    };
  }

  buildArgs(opts: { cliSessionId: string | null; isResume: boolean; extraArgs: string; initialPrompt?: string }): string[] {
    const args: string[] = [];
    if (opts.isResume && opts.cliSessionId) {
      args.push('-r', opts.cliSessionId);
    }
    if (opts.extraArgs) {
      args.push(...sanitizeExtraArgs(opts.extraArgs));
    }
    if (!opts.isResume && opts.initialPrompt) {
      args.push('-i', opts.initialPrompt);
    }
    return args;
  }

  async installHooks(): Promise<void> {
    installQwenHooks();
  }

  installStatusScripts(): void {
    installStatusLineScript();
  }

  cleanup(): void {
    stopConfigWatch();
  }

  startConfigWatcher(win: BrowserWindow, projectPath: string): void {
    startConfigWatch(win, projectPath, 'qwen');
  }

  stopConfigWatcher(): void {
    stopConfigWatch();
  }

  async getConfig(projectPath: string): Promise<ProviderConfig> {
    return getQwenConfig(projectPath);
  }

  getShiftEnterSequence(): string | null {
    return null;
  }

  validateSettings(): SettingsValidationResult {
    return validateQwenHooks();
  }

  reinstallSettings(): void {
    if (!EXTERNAL_HOOK_INJECTION_ENABLED) {
      cleanupQwenHooks();
      return;
    }
    installQwenHooks();
    installStatusLineScript();
  }

  getTranscriptPath(cliSessionId: string, projectPath: string): string | null {
    return findQwenTranscriptPath(cliSessionId, projectPath);
  }
}

/** @internal Test-only: reset cached binary path */
export function _resetCachedPath(): void {
  binaryCache.path = null;
}
