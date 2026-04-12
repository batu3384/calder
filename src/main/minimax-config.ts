import * as path from 'path';
import { homedir } from 'os';
import { readJsonSafe } from './fs-utils';
import type { ProviderConfig } from '../shared/types';

export async function getMiniMaxConfig(_projectPath: string): Promise<ProviderConfig> {
  const mmxDir = path.join(homedir(), '.mmx');

  // MiniMax CLI currently exposes account/runtime settings, but not a verified
  // skills/agents/MCP surface we can render in Calder yet.
  readJsonSafe(path.join(mmxDir, 'config.json'));
  readJsonSafe(path.join(mmxDir, 'credentials.json'));

  return {
    mcpServers: [],
    agents: [],
    skills: [],
    commands: [],
  };
}
