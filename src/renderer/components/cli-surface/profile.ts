import type { CliSurfaceDiscoveryCandidate, CliSurfaceProfile } from '../../../shared/types.js';

export function formatCliSurfaceCommand(command: string, args?: string[]): string {
  return [command, ...(args ?? [])].join(' ');
}

export function createDiscoveredCliSurfaceProfile(
  candidate: CliSurfaceDiscoveryCandidate,
): CliSurfaceProfile {
  return {
    id: candidate.id,
    name: formatCliSurfaceCommand(candidate.command, candidate.args),
    command: candidate.command,
    args: candidate.args,
    cwd: candidate.cwd,
  };
}

export function getCliSurfaceProfileLabel(profile: CliSurfaceProfile): string {
  const legacyAutoName = profile.args?.[profile.args.length - 1] ?? profile.command;
  if (profile.name === legacyAutoName) {
    return formatCliSurfaceCommand(profile.command, profile.args);
  }
  return profile.name;
}
