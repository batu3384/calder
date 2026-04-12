import type { BrowserWindow } from 'electron';
import type { CliProvider } from './provider';
import type { CliProviderMeta, ProviderConfig, SettingsValidationResult } from '../../shared/types';
import { getFullPath } from '../pty-manager';
import { resolveBinary, validateBinaryExists } from './resolve-binary';
import { getBlackboxConfig, findBlackboxTranscriptPath } from '../blackbox-config';
import { startConfigWatcher as startConfigWatch, stopConfigWatcher as stopConfigWatch } from '../config-watcher';
import { stopBlackboxSessionWatcher } from '../blackbox-session-watcher';

const binaryCache = { path: null as string | null };
const INERT_SETTINGS: SettingsValidationResult = { statusLine: 'missing', hooks: 'missing', hookDetails: {} };

export class BlackboxProvider implements CliProvider {
  readonly meta: CliProviderMeta = {
    id: 'blackbox',
    displayName: 'Blackbox CLI',
    binaryName: 'blackbox',
    capabilities: {
      sessionResume: true,
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
      configReading: true,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
      planModeArg: '--approval-mode=plan',
    },
    defaultContextWindowSize: 200_000,
  };

  resolveBinaryPath(): string {
    return resolveBinary('blackbox', binaryCache);
  }

  validatePrerequisites(): { ok: boolean; message: string } {
    return validateBinaryExists('blackbox', 'Blackbox CLI', 'curl -fsSL https://blackbox.ai/install.sh | bash');
  }

  buildEnv(_sessionId: string, baseEnv: Record<string, string>): Record<string, string> {
    return { ...baseEnv, PATH: getFullPath() };
  }

  buildArgs(opts: { cliSessionId: string | null; isResume: boolean; extraArgs: string; initialPrompt?: string }): string[] {
    const args: string[] = [];
    if (opts.isResume && opts.cliSessionId) {
      args.push('--resume-checkpoint', `session-${opts.cliSessionId}`);
    }
    if (opts.extraArgs) {
      args.push(...opts.extraArgs.split(/\s+/).filter(Boolean));
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
    stopBlackboxSessionWatcher();
  }

  startConfigWatcher(win: BrowserWindow, projectPath: string): void {
    startConfigWatch(win, projectPath, 'blackbox');
  }

  stopConfigWatcher(): void {
    stopConfigWatch();
  }

  async getConfig(projectPath: string): Promise<ProviderConfig> {
    return getBlackboxConfig(projectPath);
  }

  getShiftEnterSequence(): string | null {
    return null;
  }

  validateSettings(): SettingsValidationResult {
    return INERT_SETTINGS;
  }

  reinstallSettings(): void {}

  getTranscriptPath(cliSessionId: string, projectPath: string): string | null {
    return findBlackboxTranscriptPath(cliSessionId, projectPath);
  }
}

/** @internal Test-only: reset cached binary path */
export function _resetCachedPath(): void {
  binaryCache.path = null;
}
