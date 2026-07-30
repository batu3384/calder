import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { CliProviderMeta } from '../../shared/types/provider';
import { getFullPath } from '../full-path';
import { cleanupAll as cleanupHookStatus } from '../hooks/hook-status';
import { normalizePtyColorEnv } from '../pty-color-env';
import { sanitizeExtraArgs } from '../security/sanitize';
import { BaseCliProvider } from './base-cli-provider';
import { resolveBinary, validateBinaryExists } from './resolve-binary';

const binaryCache = { path: null as string | null };

export class ClaudeProvider extends BaseCliProvider {
  readonly meta: CliProviderMeta = {
    id: 'claude',
    displayName: 'Claude Code',
    binaryName: 'claude',
    capabilities: {
      sessionResume: true,
      costTracking: true,
      contextWindow: true,
      hookStatus: true,
      shiftEnterNewline: true,
      pendingPromptTrigger: 'startup-arg',
      planModeArg: '--permission-mode plan',
    },
    defaultContextWindowSize: 200_000,
  };

  protected readonly binaryName = 'claude';
  protected readonly installCommand = 'npm install -g @anthropic-ai/claude-code';
  protected readonly binaryCache = binaryCache;

  resolveBinaryPath(): string {
    return resolveBinary('claude', binaryCache);
  }

  validatePrerequisites(): { ok: boolean; message: string } {
    return validateBinaryExists(
      'claude',
      'Claude Code CLI',
      'npm install -g @anthropic-ai/claude-code',
    );
  }

  buildEnv(sessionId: string, baseEnv: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = { ...baseEnv };
    delete env.CLAUDE_CODE;
    env.CLAUDE_IDE_SESSION_ID = sessionId;
    env.PATH = getFullPath();
    env.CALDER_RUNTIME = '1';
    return normalizePtyColorEnv(env);
  }

  buildArgs(opts: {
    cliSessionId: string | null;
    isResume: boolean;
    extraArgs: string;
    initialPrompt?: string;
  }): string[] {
    const args: string[] = [];
    if (opts.cliSessionId) {
      if (opts.isResume) {
        args.push('-r', opts.cliSessionId);
      } else {
        args.push('--session-id', opts.cliSessionId);
      }
    }
    if (opts.initialPrompt) {
      args.push(opts.initialPrompt);
    }
    if (opts.extraArgs) {
      args.push(...sanitizeExtraArgs(opts.extraArgs));
    }
    return args;
  }

  cleanup(): void {
    cleanupHookStatus();
  }

  getShiftEnterSequence(): string | null {
    return '\x1b[13;2u';
  }

  getTranscriptPath(cliSessionId: string, projectPath: string): string | null {
    const slug = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
    const filePath = path.join(os.homedir(), '.claude', 'projects', slug, `${cliSessionId}.jsonl`);
    return fs.existsSync(filePath) ? filePath : null;
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

/** @internal Test-only: reset cached binary path */
export function _resetCachedPath(): void {
  binaryCache.path = null;
}
