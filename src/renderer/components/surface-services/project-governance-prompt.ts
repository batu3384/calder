import * as projectGovernancePromptModule from '../../project-governance-prompt.js';

type ProjectGovernancePromptModule = typeof projectGovernancePromptModule;
const projectGovernancePrompt = projectGovernancePromptModule as ProjectGovernancePromptModule;

export const appendProjectGovernanceToPrompt: ProjectGovernancePromptModule['appendProjectGovernanceToPrompt'] =
  (...args) => projectGovernancePrompt.appendProjectGovernanceToPrompt(...args);
