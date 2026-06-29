import type { ProviderId, ProviderUpdateResult, ProviderUpdateSource } from '../../shared/types/provider';
import type { ProviderUpdaterRunner,ProviderUpdateSpec } from '../provider-updater-types';
import {
  buildCancelledResult,
  buildPostUpdateResult,
  buildUpdateErrorResult,
} from './update-result-helpers';

const UPDATE_TIMEOUT_MS = 6 * 60_000;

function getPrimaryToken(tokenOrTokens?: string | string[]): string | undefined {
  if (!tokenOrTokens) return undefined;
  return Array.isArray(tokenOrTokens) ? tokenOrTokens[0] : tokenOrTokens;
}

export function resolveUpdateCommand(
  binaryPath: string,
  source: ProviderUpdateSource,
  spec: ProviderUpdateSpec,
  sourcePackageToken?: string,
): { command: string; args: string[] } | null {
  if (source === 'self' && spec.selfUpdateArgs) {
    return { command: binaryPath, args: spec.selfUpdateArgs };
  }
  if (source === 'npm' && spec.npmPackage) {
    return { command: 'npm', args: ['install', '-g', `${spec.npmPackage}@latest`] };
  }
  if (source === 'brew-formula' && spec.brewFormula) {
    return { command: 'brew', args: ['upgrade', sourcePackageToken ?? getPrimaryToken(spec.brewFormula)!] };
  }
  if (source === 'brew-cask' && spec.brewCask) {
    return { command: 'brew', args: ['upgrade', '--cask', sourcePackageToken ?? getPrimaryToken(spec.brewCask)!] };
  }
  return null;
}

export async function applyUpdateCommandAndVerify(input: {
  providerId: ProviderId;
  providerName: string;
  binaryPath: string;
  source: ProviderUpdateSource;
  beforeVersion?: string;
  latestVersion?: string;
  checkCommand?: string;
  updateCommandInput: { command: string; args: string[] };
  runner: ProviderUpdaterRunner;
  signal?: AbortSignal;
  onStage?: (message: string) => void;
  readBinaryVersion: (
    runner: ProviderUpdaterRunner,
    binaryPath: string,
    signal?: AbortSignal,
  ) => Promise<string | undefined>;
  hasDifferentVersion: (beforeVersion?: string, afterVersion?: string) => boolean;
}): Promise<Omit<ProviderUpdateResult, 'durationMs'>> {
  const {
    providerId,
    providerName,
    binaryPath,
    source,
    beforeVersion,
    latestVersion,
    checkCommand,
    updateCommandInput,
    runner,
    signal,
    onStage,
    readBinaryVersion,
    hasDifferentVersion,
  } = input;
  const updateCommand = `${updateCommandInput.command} ${updateCommandInput.args.join(' ')}`.trim();

  // Build rollback command for failed npm updates — save package@version before update.
  const rollbackCommandStr = buildRollbackCommand(updateCommandInput, beforeVersion, latestVersion, source);

  onStage?.('Applying update command…');
  const updateExec = await runner.run(updateCommandInput.command, updateCommandInput.args, {
    timeoutMs: UPDATE_TIMEOUT_MS,
    signal,
  });
  if (signal?.aborted) {
    return buildCancelledResult({
      providerId,
      providerName,
      source,
      beforeVersion,
      latestVersion,
      checkCommand,
      updateCommand,
      updateAttempted: true,
      message: 'Update cancelled while command was running.',
    });
  }
  if (updateExec.code !== 0) {
    const errorMessage = (updateExec.stderr || updateExec.stdout || 'Update command failed').trim();

    // Attempt rollback if update failed and we have enough info to restore.
    if (rollbackCommandStr) {
      onStage?.('Update failed — attempting rollback…');
      try {
        const [rollbackCmd, rollbackArgs] = parseRollbackCommand(rollbackCommandStr);
        const rollbackResult = await runner.run(rollbackCmd, rollbackArgs, {
          timeoutMs: UPDATE_TIMEOUT_MS,
          signal,
        });
        if (rollbackResult.code === 0) {
          console.warn(`[provider-updater] rollback succeeded for ${providerId} after failed update: ${errorMessage}`);
        } else {
          console.error(`[provider-updater] rollback FAILED for ${providerId}. Original error: ${errorMessage}. Rollback error: ${rollbackResult.stderr || rollbackResult.stdout}`);
        }
      } catch (rollbackErr) {
        console.error(`[provider-updater] rollback threw for ${providerId}:`, rollbackErr);
      }
    }

    return buildUpdateErrorResult({
      providerId,
      providerName,
      source,
      checkCommand,
      updateCommand,
      beforeVersion,
      latestVersion,
      message: errorMessage,
    });
  }

  onStage?.('Verifying installed version…');
  const afterVersion = await readBinaryVersion(runner, binaryPath, signal);
  if (signal?.aborted) {
    return buildCancelledResult({
      providerId,
      providerName,
      source,
      beforeVersion,
      latestVersion,
      checkCommand,
      updateCommand,
      updateAttempted: true,
      message: 'Update cancelled before version verification completed.',
    });
  }

  return buildPostUpdateResult({
    providerId,
    providerName,
    source,
    checkCommand,
    updateCommand,
    beforeVersion,
    latestVersion,
    afterVersion,
    hasVersionBump: hasDifferentVersion(beforeVersion, afterVersion),
  });
}

/**
 * Builds a rollback install command from the original update command + version snapshot.
 * Only supports npm for now — Homebrew rollback requires more complex version resolution.
 */
function buildRollbackCommand(
  updateCommandInput: { command: string; args: string[] },
  beforeVersion?: string,
  latestVersion?: string,
  source?: ProviderUpdateSource,
): string | null {
  if (source === 'npm' && updateCommandInput.command === 'npm' && beforeVersion) {
    // Reconstruct package@version from the args, replacing @latest with @<beforeVersion>.
    const pkgArg = updateCommandInput.args.find((a) => a.startsWith('@') || (!a.startsWith('-')));
    if (pkgArg) {
      const pkg = pkgArg.replace(/@\w+$/, ''); // strip any existing version
      const version = beforeVersion.replace(/^[\^~]|latest$/, '');
      if (version && version !== 'latest') {
        return `npm install -g ${pkg}@${version}`;
      }
    }
  }
  return null;
}

function parseRollbackCommand(cmd: string): [string, string[]] {
  const parts = cmd.split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);
  return [command, args];
}
