import type { CliProviderMeta } from '../../shared/types/provider';
import { getFullPath } from '../full-path';
import type { CliProvider } from './provider';
import { resolveBinary, validateBinaryExists } from './resolve-binary';

const CALDER_RUNTIME_ENV = { CALDER_RUNTIME: '1' };

export abstract class BaseCliProvider implements CliProvider {
  abstract readonly meta: CliProviderMeta;

  protected abstract binaryCache: { path: string | null };
  protected abstract binaryName: string;
  protected abstract installCommand: string;

  protected get sessionIdEnvVar(): string | null {
    return 'CLAUDE_IDE_SESSION_ID';
  }

  resolveBinaryPath(): string {
    if (this.binaryCache.path) return this.binaryCache.path;
    this.binaryCache.path = resolveBinary(this.binaryName, this.binaryCache);
    return this.binaryCache.path;
  }

  getInstallCommand(): string {
    return this.installCommand;
  }

  clearBinaryCache(): void {
    this.binaryCache.path = null;
  }

  checkBinaryInstalled(): { ok: boolean; message: string } {
    return validateBinaryExists(this.binaryName, this.meta.displayName, this.installCommand);
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

  protected appendResumeArgs(args: string[], cliSessionId: string): void {
    args.push('-r', cliSessionId);
  }

  protected appendInitialPromptArg(args: string[], initialPrompt: string): void {
    args.push(initialPrompt);
  }

  cleanup(): void {
    // no-op by default; providers override to release resources.
  }

  getShiftEnterSequence(): string | null {
    return null;
  }

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
}
