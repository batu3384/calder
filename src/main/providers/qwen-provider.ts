import type { BrowserWindow } from 'electron';
import type { CliProvider } from './provider';
import type { CliProviderMeta, ProviderConfig, SettingsValidationResult } from '../../shared/types';
import { getFullPath } from '../pty-manager';
import { resolveBinary, validateBinaryExists } from './resolve-binary';
import { getQwenConfig, findQwenTranscriptPath } from '../qwen-config';
import { installQwenHooks, validateQwenHooks, cleanupQwenHooks, SESSION_ID_VAR } from '../qwen-hooks';
import { installStatusLineScript } from '../hook-status';
import { startConfigWatcher as startConfigWatch, stopConfigWatcher as stopConfigWatch } from '../config-watcher';

const binaryCache = { path: null as string | null };

export class QwenProvider implements CliProvider {
  readonly meta: CliProviderMeta = {
    id: 'qwen',
    displayName: 'Qwen Code',
    binaryName: 'qwen',
    capabilities: {
      sessionResume: true,
      costTracking: false,
      contextWindow: false,
      hookStatus: true,
      configReading: true,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
      planModeArg: '--approval-mode=plan',
    },
    defaultContextWindowSize: 1_000_000,
  };

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
      PATH: getFullPath(),
    };
  }

  buildArgs(opts: { cliSessionId: string | null; isResume: boolean; extraArgs: string; initialPrompt?: string }): string[] {
    const args: string[] = [];
    if (opts.isResume && opts.cliSessionId) {
      args.push('-r', opts.cliSessionId);
    }
    if (opts.extraArgs) {
      args.push(...opts.extraArgs.split(/\s+/).filter(Boolean));
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
    cleanupQwenHooks();
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
