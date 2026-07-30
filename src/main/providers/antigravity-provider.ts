import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { CliProviderMeta } from '../../shared/types/provider';
import { getFullPath } from '../full-path';
import { normalizePtyColorEnv } from '../pty-color-env';
import { sanitizeExtraArgs } from '../security/sanitize';
import { BaseCliProvider } from './base-cli-provider';
import { resolveBinary, validateBinaryExists } from './resolve-binary';

const CALDER_SESSION_ID = 'CALDER_SESSION_ID';
const binaryCache = { path: null as string | null };
const legacyBinaryCache = { path: null as string | null };

export class AntigravityProvider extends BaseCliProvider {
  readonly meta: CliProviderMeta = {
    id: 'antigravity',
    displayName: 'Antigravity CLI',
    binaryName: 'agy',
    capabilities: {
      sessionResume: true,
      costTracking: true,
      contextWindow: true,
      hookStatus: true,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
    },
    defaultContextWindowSize: 1_000_000,
  };

  protected readonly binaryName = 'agy';
  protected readonly installCommand = 'brew install --cask antigravity-cli';
  protected readonly binaryCache = binaryCache;

  clearBinaryCache(): void {
    this.binaryCache.path = null;
    legacyBinaryCache.path = null;
  }

  resolveBinaryPath(): string {
    const primary = resolveBinary('agy', binaryCache);
    if (primary !== 'agy') return primary;
    return resolveBinary('antigravity', legacyBinaryCache);
  }

  validatePrerequisites(): { ok: boolean; message: string } {
    const agyCheck = validateBinaryExists(
      'agy',
      'Antigravity CLI',
      'brew install --cask antigravity-cli',
    );
    if (agyCheck.ok) return agyCheck;
    return validateBinaryExists(
      'antigravity',
      'Antigravity CLI',
      'brew install --cask antigravity-cli',
    );
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
      args.push('--conversation', opts.cliSessionId);
    }
    if (opts.extraArgs) {
      args.push(...sanitizeExtraArgs(opts.extraArgs));
    }
    if (opts.initialPrompt) {
      args.push('-i', opts.initialPrompt);
    }
    return args;
  }

  getTranscriptPath(cliSessionId: string, projectPath: string): string | null {
    try {
      const tmpRoot = path.join(os.homedir(), '.gemini', 'tmp');
      if (!fs.existsSync(tmpRoot)) return null;

      let chatsDir: string | null = null;
      for (const entry of fs.readdirSync(tmpRoot)) {
        const projectRootFile = path.join(tmpRoot, entry, '.project_root');
        try {
          const contents = fs.readFileSync(projectRootFile, 'utf-8').trim();
          if (contents === projectPath) {
            chatsDir = path.join(tmpRoot, entry, 'chats');
            break;
          }
        } catch {
          // missing or unreadable .project_root — skip
        }
      }
      if (!chatsDir || !fs.existsSync(chatsDir)) return null;

      const shortId = cliSessionId.slice(0, 8);
      const suffix = `-${shortId}.json`;
      const candidates = fs
        .readdirSync(chatsDir)
        .filter((f) => f.startsWith('session-') && f.endsWith(suffix))
        .map((f) => {
          const full = path.join(chatsDir!, f);
          let mtime = 0;
          try {
            mtime = fs.statSync(full).mtimeMs;
          } catch {
            /* ignore missing file */
          }
          return { full, mtime };
        })
        .sort((a, b) => b.mtime - a.mtime);

      for (const c of candidates) {
        try {
          const raw = fs.readFileSync(c.full, 'utf-8');
          if (raw.includes(cliSessionId)) return c.full;
        } catch {
          // unreadable — skip
        }
      }
      return candidates[0]?.full ?? null;
    } catch {
      return null;
    }
  }
}

/** @internal Test-only: reset cached binary path */
export function _resetCachedPath(): void {
  binaryCache.path = null;
  legacyBinaryCache.path = null;
}
