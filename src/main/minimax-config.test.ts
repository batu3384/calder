import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

import * as fs from 'fs';
import { getMiniMaxConfig } from './minimax-config';

const n = (p: string) => p.replace(/\\/g, '/');
const mockReadFileSync = vi.mocked(fs.readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockReadFileSync.mockImplementation(() => {
    throw new Error('ENOENT');
  });
});

describe('getMiniMaxConfig', () => {
  it('returns empty config when no MiniMax files exist', async () => {
    await expect(getMiniMaxConfig('/project')).resolves.toEqual({
      mcpServers: [],
      agents: [],
      skills: [],
      commands: [],
    });
  });

  it('tolerates a valid ~/.mmx/config.json without inventing unsupported sections', async () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.mmx/config.json') {
        return JSON.stringify({
          region: 'global',
          defaultTextModel: 'MiniMax-M2.7-highspeed',
        }) as any;
      }
      throw new Error('ENOENT');
    });

    await expect(getMiniMaxConfig('/project')).resolves.toEqual({
      mcpServers: [],
      agents: [],
      skills: [],
      commands: [],
    });
  });
});
