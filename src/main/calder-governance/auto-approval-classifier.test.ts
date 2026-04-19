import { describe, expect, it } from 'vitest';
import {
  classifyAutoApprovalOperation,
  decideAutoApprovalAction,
} from './auto-approval-classifier.js';

describe('classifyAutoApprovalOperation', () => {
  it.each([
    [{ tool: 'Write' }, 'edit'],
    [{ tool: 'Edit' }, 'edit'],
    [{ tool: 'MultiEdit' }, 'edit'],
  ] as const)('classifies edit tools as edit: %j', (input, expected) => {
    expect(classifyAutoApprovalOperation(input)).toBe(expected);
  });

  it.each([
    [{ tool: 'Bash', command: 'rg --files src' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'ls -la' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'pwd' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'cat README.md' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'rg "foo&bar" src' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'head -n 5 README.md' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'tail -n 5 README.md' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'wc -l src/main.ts' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'find . -maxdepth 1 -type f' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'git status --short' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'git log --oneline -n 5' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'git show HEAD~1' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'git diff -- src/main.ts' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'rg "needle" src' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'find src -type f -name "*.tsx" | xargs -I {} basename {} | sort' }, 'safe_tool'],
    [{ tool: 'Bash', command: 'find ~/.claude/projects -type f -name "*.md" | head -20' }, 'safe_tool'],
  ] as const)('classifies read-only bash commands as safe_tool: %j', (input, expected) => {
    expect(classifyAutoApprovalOperation(input)).toBe(expected);
  });

  it.each([
    [{ tool: 'Bash', command: 'rm -rf dist' }, 'destructive'],
    [{ tool: 'Bash', command: 'git reset --hard HEAD~1' }, 'destructive'],
    [{ tool: 'Bash', command: 'git checkout -- src/main.ts' }, 'destructive'],
    [{ tool: 'Bash', command: 'rm "-rf" dist' }, 'destructive'],
    [{ tool: 'Bash', command: "rm '-rf' dist" }, 'destructive'],
    [{ tool: 'Bash', command: 'git reset "--hard" HEAD~1' }, 'destructive'],
    [{ tool: 'Bash', command: "git reset '--hard' HEAD~1" }, 'destructive'],
    [{ tool: 'Bash', command: 'git checkout "--" src/main.ts' }, 'destructive'],
    [{ tool: 'Bash', command: "git checkout '--' src/main.ts" }, 'destructive'],
    [{ tool: 'bash', command: 'bash', args: ['-lc', 'rm -rf dist'] }, 'destructive'],
    [{ tool: 'sh', command: 'sh', args: ['-lc', 'git reset --hard HEAD~1'] }, 'destructive'],
    [{ tool: 'Bash', command: 'find . -maxdepth 1 -type f -fprint out.txt' }, 'destructive'],
    [{ tool: 'Bash', command: 'find . -maxdepth 1 -type f -fprint0 out.txt' }, 'destructive'],
    [{ tool: 'Bash', command: 'find . -maxdepth 1 -type f -fprintf out.txt %p' }, 'destructive'],
    [{ tool: 'Bash', command: 'find . \\-exec echo {} \\;' }, 'destructive'],
    [{ tool: 'Bash', command: 'find . -ex\\ec echo {} \\;' }, 'destructive'],
  ] as const)('classifies destructive bash commands as destructive: %j', (input, expected) => {
    expect(classifyAutoApprovalOperation(input)).toBe(expected);
  });

  it.each([
    [{ tool: 'Bash', command: 'sed -n 1,20p src/main.ts' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'npm test' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'git add src/main.ts' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'python script.py' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'cat README.md & ls -la' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'cat <(printf hello)' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'cat README.md | xargs rm' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'cat README.md\ngit add src/main.ts' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'rg --pre=cat "needle" src' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'rg --pre cat "needle" src' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'rg --pr\\e=cat "needle" src' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'git diff --output=patch.diff -- src/main.ts' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'git diff --output patch.diff -- src/main.ts' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'git diff --out\\put=patch.diff -- src/main.ts' }, 'risky_tool'],
    [{ tool: 'Bash', command: 'rg foo $(rm -rf dist)' }, 'destructive'],
    [{ tool: 'Bash', command: 'cat README.md `rm -rf dist`' }, 'destructive'],
    [{ tool: 'Bash', command: "find . '-exec' rm -rf {} \\;" }, 'destructive'],
    [{ tool: 'Bash', command: 'find . "-delete"' }, 'destructive'],
  ] as const)('classifies other bash commands as risky_tool: %j', (input, expected) => {
    expect(classifyAutoApprovalOperation(input)).toBe(expected);
  });

  it.each([
    [{ tool: 'ExitPlanMode' }, 'safe_tool'],
    [{ tool: 'Read', command: 'ls -la' }, 'risky_tool'],
    [{ tool: 'Search', command: 'cat README.md' }, 'risky_tool'],
  ] as const)('does not classify non-Bash tool payloads as safe_tool: %j', (input, expected) => {
    expect(classifyAutoApprovalOperation(input)).toBe(expected);
  });

  it.each([
    [undefined],
    [null],
    [{}],
    [{ tool: 'Bash' }],
  ] as const)('returns unknown for missing data: %j', (input) => {
    expect(classifyAutoApprovalOperation(input)).toBe('unknown');
  });
});

describe('decideAutoApprovalAction', () => {
  it('hard-blocks destructive operations outside full_auto_unsafe mode', () => {
    expect(decideAutoApprovalAction('off', 'destructive')).toEqual({
      decision: 'block',
      reason: 'Destructive operations are not auto-approved in this mode.',
    });
    expect(decideAutoApprovalAction('edit_only', 'destructive')).toEqual({
      decision: 'block',
      reason: 'Destructive operations are not auto-approved in this mode.',
    });
    expect(decideAutoApprovalAction('edit_plus_safe_tools', 'destructive')).toEqual({
      decision: 'block',
      reason: 'Destructive operations are not auto-approved in this mode.',
    });
  });

  it('allows non-destructive operations in full_auto mode', () => {
    expect(decideAutoApprovalAction('full_auto', 'edit')).toEqual({
      decision: 'allow',
      reason: 'Non-destructive operations are auto-approved in full_auto mode (edit).',
    });
    expect(decideAutoApprovalAction('full_auto', 'safe_tool')).toEqual({
      decision: 'allow',
      reason: 'Non-destructive operations are auto-approved in full_auto mode (safe_tool).',
    });
    expect(decideAutoApprovalAction('full_auto', 'risky_tool')).toEqual({
      decision: 'allow',
      reason: 'Non-destructive operations are auto-approved in full_auto mode (risky_tool).',
    });
    expect(decideAutoApprovalAction('full_auto', 'unknown')).toEqual({
      decision: 'allow',
      reason: 'Non-destructive operations are auto-approved in full_auto mode (unknown).',
    });
  });

  it('still blocks destructive operations in full_auto mode', () => {
    expect(decideAutoApprovalAction('full_auto', 'destructive')).toEqual({
      decision: 'block',
      reason: 'Destructive operations are not auto-approved in this mode.',
    });
  });

  it('allows destructive operations in full_auto_unsafe mode', () => {
    expect(decideAutoApprovalAction('full_auto_unsafe', 'destructive')).toEqual({
      decision: 'allow',
      reason: 'All operations are auto-approved in full_auto_unsafe mode (destructive).',
    });
    expect(decideAutoApprovalAction('full_auto_unsafe', 'risky_tool')).toEqual({
      decision: 'allow',
      reason: 'All operations are auto-approved in full_auto_unsafe mode (risky_tool).',
    });
  });

  it('asks for safe tools in edit_only mode', () => {
    expect(decideAutoApprovalAction('edit_only', 'safe_tool')).toEqual({
      decision: 'ask',
      reason: 'Safe tools still require approval in edit_only mode.',
    });
  });

  it('allows edit and safe_tool in edit_plus_safe_tools mode', () => {
    expect(decideAutoApprovalAction('edit_plus_safe_tools', 'edit')).toEqual({
      decision: 'allow',
      reason: 'Edit operations are allowed in edit_plus_safe_tools mode.',
    });
    expect(decideAutoApprovalAction('edit_plus_safe_tools', 'safe_tool')).toEqual({
      decision: 'allow',
      reason: 'Safe tools are allowed in edit_plus_safe_tools mode.',
    });
  });

  it('asks for risky and unknown operations', () => {
    expect(decideAutoApprovalAction('edit_plus_safe_tools', 'risky_tool')).toEqual({
      decision: 'ask',
      reason: 'risky_tool operations require approval.',
    });
    expect(decideAutoApprovalAction('edit_plus_safe_tools', 'unknown')).toEqual({
      decision: 'ask',
      reason: 'unknown operations require approval.',
    });
  });

  it('asks for every operation when mode is off', () => {
    expect(decideAutoApprovalAction('off', 'edit')).toEqual({
      decision: 'ask',
      reason: 'Auto-approval is off.',
    });
  });
});
