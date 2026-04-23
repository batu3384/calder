import type { ProviderId } from '../shared/types/provider.js';
import type { ProjectRecord } from '../shared/types/project-state.js';
import type { SessionRecord } from '../shared/types/session.js';
import { appendProjectGovernanceToPrompt } from './project-governance-prompt.js';
import { appendProjectTeamContextToPrompt } from './project-team-context-prompt.js';

interface ResumeWithProviderSource {
  archivedSessionId?: string;
  sessionId?: string;
}

interface ResumeWithProviderOptions {
  project: ProjectRecord;
  source: ResumeWithProviderSource;
  targetProviderId: ProviderId;
  buildResumePrompt: (
    sourceProviderId: ProviderId,
    sourceCliSessionId: string | null,
    projectPath: string,
    sourceName: string,
  ) => Promise<string>;
  pushNav: (sessionId: string) => void;
}

function resolveSourceSession(
  project: ProjectRecord,
  source: ResumeWithProviderSource,
): { sourceProviderId: ProviderId; sourceCliSessionId: string | null; sourceName: string } | null {
  if (source.archivedSessionId) {
    const archived = project.sessionHistory?.find((entry) => entry.id === source.archivedSessionId);
    if (!archived || !archived.providerId) return null;
    return {
      sourceProviderId: archived.providerId,
      sourceCliSessionId: archived.cliSessionId,
      sourceName: archived.name,
    };
  }
  if (source.sessionId) {
    const existing = project.sessions.find((session) => session.id === source.sessionId);
    if (!existing || !existing.providerId) return null;
    return {
      sourceProviderId: existing.providerId,
      sourceCliSessionId: existing.cliSessionId,
      sourceName: existing.name,
    };
  }
  return null;
}

export async function resumeProjectWithProvider(options: ResumeWithProviderOptions): Promise<SessionRecord | undefined> {
  const { project, source, targetProviderId, buildResumePrompt, pushNav } = options;
  const sourceSession = resolveSourceSession(project, source);
  if (!sourceSession) return undefined;

  const initialPrompt = await buildResumePrompt(
    sourceSession.sourceProviderId,
    sourceSession.sourceCliSessionId,
    project.path,
    sourceSession.sourceName,
  );

  const session: SessionRecord = {
    id: crypto.randomUUID(),
    name: `${sourceSession.sourceName} (↪ ${targetProviderId})`,
    providerId: targetProviderId,
    cliSessionId: null,
    createdAt: new Date().toISOString(),
    pendingInitialPrompt: appendProjectGovernanceToPrompt(
      appendProjectTeamContextToPrompt(initialPrompt, project.projectTeamContext),
      project.projectGovernance,
    ),
  };
  project.sessions.push(session);
  project.activeSessionId = session.id;
  pushNav(session.id);
  if (project.layout.mode === 'mosaic') {
    project.layout.splitPanes.push(session.id);
  }
  return session;
}
