import * as path from 'path';
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

import { getCopilotConfig } from './copilot-config';

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

describe('getCopilotConfig', () => {
  it('returns empty config when no Copilot files exist', async () => {
    await expect(getCopilotConfig('/project')).resolves.toEqual({
      mcpServers: [],
      agents: [],
      skills: [],
      commands: [],
    });
  });

  it('reads user and project MCP config with project override', async () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.copilot/mcp-config.json') {
        return JSON.stringify({
          mcpServers: {
            shared: { command: 'docker user' },
            github: { url: 'https://api.githubcopilot.test' },
          },
        }) as any;
      }
      if (filePath === '/project/.mcp.json') {
        return JSON.stringify({
          servers: {
            shared: { command: 'docker project' },
            local: { url: 'http://localhost:3333' },
          },
        }) as any;
      }
      throw new Error('ENOENT');
    });

    const config = await getCopilotConfig('/project');
    expect(config.mcpServers).toEqual([
      {
        name: 'shared',
        url: 'docker project',
        status: 'configured',
        scope: 'project',
        filePath: path.join('/project', '.mcp.json'),
      },
      {
        name: 'github',
        url: 'https://api.githubcopilot.test',
        status: 'configured',
        scope: 'user',
        filePath: path.join('/mock/home', '.copilot', 'mcp-config.json'),
      },
      {
        name: 'local',
        url: 'http://localhost:3333',
        status: 'configured',
        scope: 'project',
        filePath: path.join('/project', '.mcp.json'),
      },
    ]);
  });

  it('reads skills from default and configured Copilot skill directories', async () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.copilot/config.json') {
        return JSON.stringify({
          skillDirectories: ['/shared/copilot-skills'],
        }) as any;
      }
      if (filePath === '/mock/home/.copilot/skills/user-skill/SKILL.md') {
        return '---\nname: UserSkill\ndescription: User scope skill\n---\n' as any;
      }
      if (filePath === '/project/.github/skills/project-skill/SKILL.md') {
        return '---\nname: ProjectSkill\ndescription: Project scope skill\n---\n' as any;
      }
      if (filePath === '/shared/copilot-skills/shared-skill/SKILL.md') {
        return '---\nname: SharedSkill\ndescription: Shared skill directory\n---\n' as any;
      }
      throw new Error('ENOENT');
    });

    mockReaddirSync.mockImplementation((inputPath) => {
      const dirPath = n(String(inputPath));
      if (dirPath === '/mock/home/.copilot/skills') return ['user-skill'] as any;
      if (dirPath === '/project/.github/skills') return ['project-skill'] as any;
      if (dirPath === '/shared/copilot-skills') return ['shared-skill'] as any;
      throw new Error('ENOENT');
    });

    mockStatSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (
        filePath === '/mock/home/.copilot/skills/user-skill/SKILL.md' ||
        filePath === '/project/.github/skills/project-skill/SKILL.md' ||
        filePath === '/shared/copilot-skills/shared-skill/SKILL.md'
      ) {
        return { isFile: () => true } as any;
      }
      throw new Error('ENOENT');
    });

    const config = await getCopilotConfig('/project');
    expect(config.skills).toEqual([
      {
        name: 'UserSkill',
        description: 'User scope skill',
        scope: 'user',
        filePath: path.join('/mock/home', '.copilot', 'skills', 'user-skill', 'SKILL.md'),
      },
      {
        name: 'ProjectSkill',
        description: 'Project scope skill',
        scope: 'project',
        filePath: path.join('/project', '.github', 'skills', 'project-skill', 'SKILL.md'),
      },
      {
        name: 'SharedSkill',
        description: 'Shared skill directory',
        scope: 'user',
        filePath: path.join('/shared/copilot-skills', 'shared-skill', 'SKILL.md'),
      },
    ]);
  });

  it('skips malformed MCP entries and tolerates non-object MCP config payloads', async () => {
    mockReadFileSync.mockImplementation((inputPath) => {
      const filePath = n(String(inputPath));
      if (filePath === '/mock/home/.copilot/mcp-config.json') {
        return JSON.stringify({
          mcpServers: {
            ok: { command: 'docker run ok' },
            empty: { args: ['--verbose'] },
          },
        }) as any;
      }
      if (filePath === '/project/.mcp.json') {
        return JSON.stringify('not-an-object') as any;
      }
      throw new Error('ENOENT');
    });

    const config = await getCopilotConfig('/project');
    expect(config.mcpServers).toEqual([
      {
        name: 'ok',
        url: 'docker run ok',
        status: 'configured',
        scope: 'user',
        filePath: path.join('/mock/home', '.copilot', 'mcp-config.json'),
      },
    ]);
  });

  it('handles hidden/missing skills and deduplicates configured skill roots from config + env', async () => {
    vi.stubEnv(
      'COPILOT_CUSTOM_INSTRUCTIONS_DIRS',
      ['/shared/a', '/shared/c', '/shared/a', ''].join(path.delimiter),
    );

    try {
      mockReadFileSync.mockImplementation((inputPath) => {
        const filePath = n(String(inputPath));
        if (filePath === '/mock/home/.copilot/config.json') {
          return JSON.stringify({
            skillDirectories: ['/shared/a', '/shared/b', '/shared/b', '', '   ', 42],
          }) as any;
        }
        if (filePath === '/mock/home/.copilot/skills/nofm/SKILL.md') {
          return '# no frontmatter\n' as any;
        }
        if (filePath === '/mock/home/.copilot/skills/empty/SKILL.md') {
          return '' as any;
        }
        if (filePath === '/mock/home/.copilot/skills/invalid/SKILL.md') {
          return '---\nname: invalid\nline without colon\n---\n' as any;
        }
        if (filePath === '/project/.github/skills/shared/SKILL.md') {
          return '---\nname: Shared\ndescription: Project shared\n---\n' as any;
        }
        if (filePath === '/shared/a/shared/SKILL.md') {
          return '---\nname: Shared\ndescription: External shared\n---\n' as any;
        }
        if (filePath === '/shared/b/fallback/SKILL.md') {
          return '---\ndescription: fallback desc\n---\n' as any;
        }
        throw new Error('ENOENT');
      });

      mockReaddirSync.mockImplementation((inputPath) => {
        const dirPath = n(String(inputPath));
        if (dirPath === '/mock/home/.copilot/skills') {
          return ['.hidden', 'missing', 'nofm', 'empty', 'invalid'] as any;
        }
        if (dirPath === '/project/.github/skills') return ['shared'] as any;
        if (dirPath === '/shared/a') return ['shared'] as any;
        if (dirPath === '/shared/b') return ['fallback'] as any;
        if (dirPath === '/shared/c') return [] as any;
        throw new Error('ENOENT');
      });

      mockStatSync.mockImplementation((inputPath) => {
        const filePath = n(String(inputPath));
        if (
          filePath === '/mock/home/.copilot/skills/nofm/SKILL.md' ||
          filePath === '/mock/home/.copilot/skills/empty/SKILL.md' ||
          filePath === '/mock/home/.copilot/skills/invalid/SKILL.md' ||
          filePath === '/project/.github/skills/shared/SKILL.md' ||
          filePath === '/shared/a/shared/SKILL.md' ||
          filePath === '/shared/b/fallback/SKILL.md'
        ) {
          return { isFile: () => true } as any;
        }
        throw new Error('ENOENT');
      });

      const config = await getCopilotConfig('/project');
      expect(config.skills).toEqual([
        {
          name: 'nofm',
          description: '',
          scope: 'user',
          filePath: path.join('/mock/home', '.copilot', 'skills', 'nofm', 'SKILL.md'),
        },
        {
          name: 'empty',
          description: '',
          scope: 'user',
          filePath: path.join('/mock/home', '.copilot', 'skills', 'empty', 'SKILL.md'),
        },
        {
          name: 'invalid',
          description: '',
          scope: 'user',
          filePath: path.join('/mock/home', '.copilot', 'skills', 'invalid', 'SKILL.md'),
        },
        {
          name: 'Shared',
          description: 'Project shared',
          scope: 'project',
          filePath: path.join('/project', '.github', 'skills', 'shared', 'SKILL.md'),
        },
        {
          name: 'fallback',
          description: 'fallback desc',
          scope: 'user',
          filePath: path.join('/shared/b', 'fallback', 'SKILL.md'),
        },
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
