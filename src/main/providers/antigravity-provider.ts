import type { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { CliProviderMeta, ProviderConfig, SettingsValidationResult } from '../../shared/types/provider';
import { getAntigravityConfig } from '../antigravity-config';
import { cleanupAntigravityHooks, installAntigravityHooks, SESSION_ID_VAR,validateAntigravityHooks } from '../antigravity-hooks';
import { startConfigWatcher as startConfigWatch, stopConfigWatcher as stopConfigWatch } from '../config-watcher';
import { EXTERNAL_HOOK_INJECTION_ENABLED } from '../external-hook-policy';
import { getFullPath } from '../full-path';
import { sanitizeExtraArgs } from '../security/sanitize';
import { BaseCliProvider } from './base-cli-provider';
import { resolveBinary, validateBinaryExists } from './resolve-binary';

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
      configReading: true,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
    },
    defaultContextWindowSize: 1_000_000,
  };

  protected readonly binaryName = 'agy';
  protected readonly installCommand = 'brew install --cask antigravity-cli';
  protected readonly binaryCache = binaryCache;

  resolveBinaryPath(): string {
    const primary = resolveBinary('agy', binaryCache);
    if (primary !== 'agy') return primary;
    return resolveBinary('antigravity', legacyBinaryCache);
  }

  validatePrerequisites(): { ok: boolean; message: string } {
    const agyCheck = validateBinaryExists('agy', 'Antigravity CLI', 'brew install --cask antigravity-cli');
    if (agyCheck.ok) return agyCheck;
    return validateBinaryExists('antigravity', 'Antigravity CLI', 'brew install --cask antigravity-cli');
  }

  buildEnv(sessionId: string, baseEnv: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = { ...baseEnv };
    delete env.CLAUDE_CODE;
    env[SESSION_ID_VAR] = sessionId;
    env.PATH = getFullPath();
    env.CALDER_RUNTIME = '1';
    return env;
  }

  buildArgs(opts: { cliSessionId: string | null; isResume: boolean; extraArgs: string; initialPrompt?: string }): string[] {
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

  async installHooks(): Promise<void> {
    installAntigravityHooks();
  }

  installStatusScripts(): void {}

  cleanup(): void {
    stopConfigWatch();
  }

  startConfigWatcher(win: BrowserWindow, projectPath: string): void {
    startConfigWatch(win, projectPath, 'antigravity');
  }

  stopConfigWatcher(): void {
    stopConfigWatch();
  }

  async getConfig(projectPath: string): Promise<ProviderConfig> {
    return getAntigravityConfig(projectPath);
  }

  getShiftEnterSequence(): string | null {
    return null;
  }

  validateSettings(): SettingsValidationResult {
    return validateAntigravityHooks();
  }

  reinstallSettings(): void {
    if (!EXTERNAL_HOOK_INJECTION_ENABLED) {
      cleanupAntigravityHooks();
      return;
    }
    installAntigravityHooks();
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
      const candidates = fs.readdirSync(chatsDir)
        .filter((f) => f.startsWith('session-') && f.endsWith(suffix))
        .map((f) => {
          const full = path.join(chatsDir!, f);
          let mtime = 0;
          try { mtime = fs.statSync(full).mtimeMs; } catch { /* ignore missing file */ }
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
