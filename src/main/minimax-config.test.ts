import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

import * as fs from 'fs';
import * as path from 'path';
import { getMiniMaxConfig } from './minimax-config';

const n = (p: string) => p.replace(/\\/g, '/');
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockStatSync = vi.mocked(fs.statSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockReadFileSync.mockImplementation(() => {
    throw new Error('ENOENT');
  });
  mockReaddirSync.mockImplementation(() => {
    throw new Error('ENOENT');
  });
  mockStatSync.mockImplementation(() => {
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

  it('reads skills from user and project .mmx directories', async () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.mmx/config.json') {
        return JSON.stringify({ region: 'global' }) as any;
      }
      if (filePath === '/mock/home/.mmx/skills/ui-ux-pro-max/SKILL.md') {
        return '---\nname: ui-ux-pro-max\ndescription: User skill\n---\n' as any;
      }
      if (filePath === '/project/.mmx/skills/local/SKILL.md') {
        return '---\nname: local\ndescription: Project skill\n---\n' as any;
      }
      throw new Error('ENOENT');
    });

    mockReaddirSync.mockImplementation((inputPath) => {
      const dirPath = n(String(inputPath));
      if (dirPath === '/mock/home/.mmx/skills') return ['ui-ux-pro-max'] as any;
      if (dirPath === '/project/.mmx/skills') return ['local'] as any;
      throw new Error('ENOENT');
    });

    mockStatSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (
        filePath === '/mock/home/.mmx/skills/ui-ux-pro-max/SKILL.md'
        || filePath === '/project/.mmx/skills/local/SKILL.md'
      ) {
        return { isFile: () => true } as any;
      }
      throw new Error('ENOENT');
    });

    await expect(getMiniMaxConfig('/project')).resolves.toEqual({
      mcpServers: [],
      agents: [],
      skills: [
        {
          name: 'ui-ux-pro-max',
          description: 'User skill',
          scope: 'user',
          filePath: path.join('/mock/home', '.mmx', 'skills', 'ui-ux-pro-max', 'SKILL.md'),
        },
        {
          name: 'local',
          description: 'Project skill',
          scope: 'project',
          filePath: path.join('/project', '.mmx', 'skills', 'local', 'SKILL.md'),
        },
      ],
      commands: [],
    });
  });
});
