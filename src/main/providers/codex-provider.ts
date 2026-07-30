import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { CliProviderMeta } from '../../shared/types/provider';
import { stopCodexSessionWatcher } from '../codex-session-watcher';
import { getFullPath } from '../full-path';
import { normalizePtyColorEnv } from '../pty-color-env';
import { sanitizeExtraArgs } from '../security/sanitize';
import { BaseCliProvider } from './base-cli-provider';
import { resolveBinary, validateBinaryExists } from './resolve-binary';

const CALDER_SESSION_ID = 'CALDER_SESSION_ID';
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
    env[CALDER_SESSION_ID] = sessionId;
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

  cleanup(): void {
    stopCodexSessionWatcher();
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
