/**
 * Abstract base class for CLI providers — consolidates common provider logic.
 * Reduces duplication across claude/codex/copilot/antigravity/qwen providers.
 * All providers should extend this class and override only provider-specific methods.
 */

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
import { getFullPath } from '../full-path';
import { installStatusLineScript } from '../hooks/hook-status';
import type { CliProvider } from './provider';
import { resolveBinary, validateBinaryExists } from './resolve-binary';

const CALDER_RUNTIME_ENV = { CALDER_RUNTIME: '1' };

export abstract class BaseCliProvider implements CliProvider {
  abstract readonly meta: CliProviderMeta;

  /**
   * The binary cache — subclasses should initialize as `const binaryCache = { path: null as string | null };`
   */
  protected abstract binaryCache: { path: string | null };

  /**
   * Subclasses override to provide the binary name for resolution.
   */
  protected abstract binaryName: string;

  /**
   * Subclasses override to provide the install command shown when binary is missing.
   */
  protected abstract installCommand: string;

  /**
   * Environment variable key for session ID.
   * Override in subclass if the provider uses a different var name.
   * Return null if the provider does not set a session ID env var.
   */
  protected get sessionIdEnvVar(): string | null {
    return 'CLAUDE_IDE_SESSION_ID';
  }

  resolveBinaryPath(): string {
    if (this.binaryCache.path) return this.binaryCache.path;
    this.binaryCache.path = resolveBinary(this.binaryName, this.binaryCache);
    return this.binaryCache.path;
  }

  validatePrerequisites(): { ok: boolean; message: string } {
    return validateBinaryExists(this.binaryName, this.meta.displayName, this.installCommand);
  }

  buildEnv(sessionId: string, baseEnv: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = { ...baseEnv };
    delete env.CLAUDE_CODE;
    const envVar = this.sessionIdEnvVar;
    if (envVar) env[envVar] = sessionId;
    env.PATH = getFullPath();
    env.CALDER_RUNTIME = CALDER_RUNTIME_ENV.CALDER_RUNTIME;
    return env;
  }

  buildArgs(opts: {
    cliSessionId: string | null;
    isResume: boolean;
    extraArgs: string;
    initialPrompt?: string;
  }): string[] {
    const args: string[] = [];
    if (opts.cliSessionId && opts.isResume) {
      this.appendResumeArgs(args, opts.cliSessionId);
    }
    if (!opts.isResume && opts.initialPrompt) {
      this.appendInitialPromptArg(args, opts.initialPrompt);
    }
    if (opts.extraArgs) {
      args.push(...opts.extraArgs.split(/\s+/).filter(Boolean));
    }
    return args;
  }

  /**
   * Override in subclass to add provider-specific resume args.
   * Default: -r <cliSessionId>
   */
  protected appendResumeArgs(args: string[], cliSessionId: string): void {
    args.push('-r', cliSessionId);
  }

  /**
   * Override in subclass to change how initial prompt is passed.
   * Default: append as-is (positional arg)
   */
  protected appendInitialPromptArg(args: string[], initialPrompt: string): void {
    args.push(initialPrompt);
  }

  installStatusScripts(): void {
    installStatusLineScript();
  }

  cleanup(): void {
    stopConfigWatch();
  }

  startConfigWatcher(win: BrowserWindow, projectPath: string): void {
    startConfigWatch(win, projectPath, this.meta.id);
  }

  stopConfigWatcher(): void {
    stopConfigWatch();
  }

  getShiftEnterSequence(): string | null {
    return null;
  }

  reinstallSettings(): void {
    installStatusLineScript();
  }

  /**
   * Subclasses override to return null if they don't support transcript paths.
   */
  getTranscriptPath(_cliSessionId: string, _projectPath: string): string | null {
    return null;
  }

  parseCostFromOutput(rawText: string): { totalCostUsd: number } | null {
    const COST_RE = /\$(\d+\.\d{2,})/g;
    let match: RegExpExecArray | null;
    let lastCost: string | null = null;
    while ((match = COST_RE.exec(rawText)) !== null) {
      lastCost = match[0];
    }
    if (lastCost) {
      return { totalCostUsd: parseFloat(lastCost.replace('$', '')) };
    }
    return null;
  }

  // Abstract methods — must be implemented by subclasses
  abstract installHooks(win?: BrowserWindow | null): Promise<void>;
  abstract getConfig(projectPath: string): Promise<ProviderConfig>;
  abstract validateSettings(): SettingsValidationResult;
}
