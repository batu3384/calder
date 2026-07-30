import type { CliProviderMeta } from '../../shared/types/provider';
import { getFullPath } from '../full-path';
import { normalizePtyColorEnv } from '../pty-color-env';
import { sanitizeExtraArgsQuiet } from '../security/sanitize';
import { BaseCliProvider } from './base-cli-provider';
import { resolveBinary, validateBinaryExists } from './resolve-binary';

const binaryCache = { path: null as string | null };

export class CursorProvider extends BaseCliProvider {
  readonly meta: CliProviderMeta = {
    id: 'cursor',
    displayName: 'Cursor CLI',
    binaryName: 'agent',
    capabilities: {
      sessionResume: true,
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'startup-arg',
    },
    defaultContextWindowSize: 200_000,
  };

  protected readonly binaryName = 'agent';
  protected readonly installCommand = 'curl https://cursor.com/install -fsS | bash';
  protected readonly binaryCache = binaryCache;

  resolveBinaryPath(): string {
    return resolveBinary('agent', binaryCache);
  }

  validatePrerequisites(): { ok: boolean; message: string } {
    return validateBinaryExists(
      'agent',
      'Cursor CLI',
      'curl https://cursor.com/install -fsS | bash',
    );
  }

  buildEnv(_sessionId: string, baseEnv: Record<string, string>): Record<string, string> {
    return normalizePtyColorEnv({ ...baseEnv, PATH: getFullPath() });
  }

  buildArgs(opts: {
    cliSessionId: string | null;
    isResume: boolean;
    extraArgs: string;
    initialPrompt?: string;
  }): string[] {
    const args: string[] = [];
    if (opts.isResume && opts.cliSessionId) {
      args.push('--resume', opts.cliSessionId);
    }
    if (opts.extraArgs) {
      args.push(...sanitizeExtraArgsQuiet(opts.extraArgs));
    }
    if (!opts.isResume && opts.initialPrompt) {
      args.push(opts.initialPrompt);
    }
    return args;
  }
}

export function _resetCachedPath(): void {
  binaryCache.path = null;
}
