import type {
  CliSurfaceDiscoveryCandidate,
  CliSurfaceDiscoveryResult,
  CliSurfaceProfile,
  ProjectRecord,
} from '../../../shared/types.js';
import { createDiscoveredCliSurfaceProfile } from './profile.js';

interface SetupDeps {
  discover: (projectPath: string) => Promise<CliSurfaceDiscoveryResult>;
  start: (profile: CliSurfaceProfile) => Promise<void>;
  persist: (profile: CliSurfaceProfile) => void;
  showQuickSetup: (project: ProjectRecord, candidates: CliSurfaceDiscoveryCandidate[]) => void;
  showManualSetup: (project: ProjectRecord) => void;
}

export async function openCliSurfaceWithSetup(project: ProjectRecord, deps: SetupDeps): Promise<void> {
  const cliState = project.surface?.cli;
  const saved = cliState?.profiles.find((profile) => profile.id === cliState.selectedProfileId) ?? cliState?.profiles[0];
  if (saved) {
    await deps.start(saved);
    return;
  }

  const result = await deps.discover(project.path);
  if (result.confidence === 'high' && result.candidates.length === 1) {
    const profile = createDiscoveredCliSurfaceProfile(result.candidates[0]);
    deps.persist(profile);
    await deps.start(profile);
    return;
  }

  if (result.confidence === 'medium' && result.candidates.length > 0) {
    deps.showQuickSetup(project, result.candidates);
    return;
  }

  deps.showManualSetup(project);
}
