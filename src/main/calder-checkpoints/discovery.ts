import fs from 'node:fs';
import path from 'node:path';
import type { ProjectCheckpointSource, ProjectCheckpointState } from '../../shared/types.js';

interface RawCheckpointFile {
  schemaVersion?: number;
  id?: string;
  label?: string;
  createdAt?: string;
  sessionCount?: number;
  changedFileCount?: number;
  sessions?: Array<{
    type?: string;
    cliSessionId?: string | null;
  }>;
}

function formatSummaryPart(count: number, singular: string, plural: string): string | null {
  if (count <= 0) return null;
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function joinSummaryParts(parts: string[]): string {
  if (parts.length === 0) return 'Restores saved session state';
  if (parts.length === 1) return `Restores ${parts[0]}`;
  if (parts.length === 2) return `Restores ${parts[0]} and ${parts[1]}`;
  return `Restores ${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

function buildRestoreSummary(contents: RawCheckpointFile): string {
  const sessions = contents.sessions ?? [];
  const cliCount = sessions.filter((session) => !session.type || session.type === 'claude').length;
  const browserCount = sessions.filter((session) => session.type === 'browser-tab').length;
  const fileReaderCount = sessions.filter((session) => session.type === 'file-reader').length;
  const diffCount = sessions.filter((session) => session.type === 'diff-viewer').length;
  const remoteCount = sessions.filter((session) => session.type === 'remote-terminal').length;
  const inspectorCount = sessions.filter((session) => session.type === 'mcp-inspector').length;

  const parts = [
    formatSummaryPart(cliCount, 'CLI', 'CLI sessions'),
    formatSummaryPart(browserCount, 'browser surface', 'browser surfaces'),
    formatSummaryPart(fileReaderCount, 'file view', 'file views'),
    formatSummaryPart(diffCount, 'diff view', 'diff views'),
    formatSummaryPart(remoteCount, 'remote session', 'remote sessions'),
    formatSummaryPart(inspectorCount, 'inspector', 'inspectors'),
  ].filter((part): part is string => Boolean(part));

  if (parts.length > 0) {
    return joinSummaryParts(parts);
  }

  const fallbackCount = contents.sessionCount ?? 0;
  return fallbackCount > 0
    ? `Restores ${fallbackCount} session${fallbackCount === 1 ? '' : 's'}`
    : 'Restores saved session state';
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function listCheckpointFiles(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath)
      .filter((entry) => entry.endsWith('.json'))
      .sort((left, right) => right.localeCompare(left));
  } catch {
    return [];
  }
}

function readCheckpoint(filePath: string): ProjectCheckpointSource | null {
  try {
    const contents = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RawCheckpointFile;
    const stat = fs.statSync(filePath);
    return {
      id: contents.id ?? `checkpoint:${filePath}`,
      path: filePath,
      displayName: path.basename(filePath),
      label: contents.label ?? path.basename(filePath, '.json'),
      createdAt: contents.createdAt ?? new Date(stat.mtimeMs).toISOString(),
      lastUpdated: new Date(stat.mtimeMs).toISOString(),
      sessionCount: contents.sessionCount ?? 0,
      changedFileCount: contents.changedFileCount ?? 0,
      restoreSummary: buildRestoreSummary(contents),
    };
  } catch {
    return null;
  }
}

export async function discoverProjectCheckpoints(projectPath: string): Promise<ProjectCheckpointState> {
  const checkpointDir = path.join(projectPath, '.calder', 'checkpoints');
  const checkpoints = listCheckpointFiles(checkpointDir)
    .map((entry) => path.join(checkpointDir, entry))
    .filter(isFile)
    .map((filePath) => readCheckpoint(filePath))
    .filter((checkpoint): checkpoint is ProjectCheckpointSource => Boolean(checkpoint));

  const lastUpdated = checkpoints
    .map((checkpoint) => checkpoint.lastUpdated)
    .sort()
    .at(-1);

  return {
    checkpoints,
    lastUpdated,
  };
}
