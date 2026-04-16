import type {
  AutoApprovalDecision,
  AutoApprovalMode,
  AutoApprovalOperationClass,
} from '../../shared/types.js';

export interface AutoApprovalOperationInput {
  tool?: string | null;
  command?: string | null;
  args?: readonly string[] | null;
  text?: string | null;
  label?: string | null;
}

export interface AutoApprovalDecisionResult {
  decision: AutoApprovalDecision;
  reason: string;
}

const EDIT_TOOLS = new Set(['write', 'edit', 'multiedit']);
const SHELL_TOOLS = new Set(['bash', 'sh']);
const SAFE_NON_SHELL_TOOLS = new Set([
  'exitplanmode',
]);

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+(?:"|')?-rf(?:"|')?(?=\s|$)/i,
  /\bgit\s+reset\s+(?:"|')?--hard(?:"|')?(?=\s|$)/i,
  /\bgit\s+checkout\s+(?:"|')?--(?:"|')?(?=\s|$)/i,
];

const SAFE_COMMAND_PATTERNS: RegExp[] = [
  /^rg(?:\s|$)/i,
  /^rg\s+--files(?:\s|$)/i,
  /^ls(?:\s|$)/i,
  /^pwd(?:\s|$)/i,
  /^cat(?:\s|$)/i,
  /^head(?:\s|$)/i,
  /^tail(?:\s|$)/i,
  /^wc(?:\s|$)/i,
  /^git\s+(?:status|log|show|diff)(?:\s|$)/i,
];

const SAFE_PIPE_SEGMENT_PATTERNS: RegExp[] = [
  /^sort(?:\s|$)/i,
  /^uniq(?:\s|$)/i,
  /^basename(?:\s|$)/i,
  /^dirname(?:\s|$)/i,
];

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function getShellCommandText(input: AutoApprovalOperationInput): string {
  const command = normalize(input.command);
  if (command) {
    const args = normalize(input.args?.join(' '));
    return args ? `${command} ${args}` : command;
  }

  const args = normalize(input.args?.join(' '));
  if (args) {
    return args;
  }

  return '';
}

function stripWrappingQuotes(token: string): string {
  if (
    (token.startsWith("'") && token.endsWith("'")) ||
    (token.startsWith('"') && token.endsWith('"'))
  ) {
    return token.slice(1, -1);
  }

  return token;
}

function normalizeFlagToken(token: string): string {
  return stripWrappingQuotes(token.trim())
    .replace(/^\\+/, '')
    .replace(/\\(.)/g, '$1')
    .toLowerCase();
}

function tokenizeFlags(command: string): string[] {
  return command
    .split(/\s+/)
    .map(normalizeFlagToken)
    .filter((token) => token.length > 0);
}

function containsUnquotedSequence(command: string, sequence: string): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\' && !inSingleQuote) {
      escaped = true;
      continue;
    }

    if (character === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (character === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (command.startsWith(sequence, index)) {
      return true;
    }
  }

  return false;
}

function hasUnquotedSingleAmpersandOperator(command: string): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\' && !inSingleQuote) {
      escaped = true;
      continue;
    }

    if (character === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (character === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote || character !== '&') {
      continue;
    }

    const previousCharacter = command[index - 1];
    const nextCharacter = command[index + 1];
    if (previousCharacter !== '&' && nextCharacter !== '&') {
      return true;
    }
  }

  return false;
}

function hasDangerousFindFlag(command: string): boolean {
  if (!/^find(?:\s|$)/i.test(command)) {
    return false;
  }

  const disallowedFindFlags = new Set([
    '-delete',
    '-exec',
    '-execdir',
    '-ok',
    '-okdir',
    '-fprint',
    '-fprint0',
    '-fprintf',
    '-fls',
  ]);
  const tokens = tokenizeFlags(command);
  return tokens.some((token) => disallowedFindFlags.has(token));
}

function isClearlyReadOnlyFind(command: string): boolean {
  if (!/^find(?:\s|$)/i.test(command)) {
    return false;
  }

  return !hasDangerousFindFlag(command);
}

function hasRiskyRgFlag(command: string): boolean {
  if (!/^rg(?:\s|$)/i.test(command)) {
    return false;
  }

  const tokens = tokenizeFlags(command);
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--') {
      break;
    }

    if (token === '--pre' || token.startsWith('--pre=')) {
      return true;
    }
  }

  return false;
}

function hasRiskyGitDiffFlag(command: string): boolean {
  if (!/^git\s+diff(?:\s|$)/i.test(command)) {
    return false;
  }

  const tokens = tokenizeFlags(command);
  if (tokens[0] !== 'git' || tokens[1] !== 'diff') {
    return false;
  }

  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--') {
      break;
    }

    if (token === '--output' || token.startsWith('--output=')) {
      return true;
    }
  }

  return false;
}

function splitUnquotedPipes(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === '\\' && !inSingleQuote) {
      current += character;
      escaped = true;
      continue;
    }

    if (character === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += character;
      continue;
    }

    if (character === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += character;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && character === '|') {
      const previousCharacter = command[index - 1];
      const nextCharacter = command[index + 1];
      if (previousCharacter !== '|' && nextCharacter !== '|') {
        segments.push(current.trim());
        current = '';
        continue;
      }
    }

    current += character;
  }

  segments.push(current.trim());
  return segments;
}

function isSafeReadOnlyXargs(command: string): boolean {
  return /^xargs(?:\s+-0)?(?:\s+-r)?(?:\s+-I\s+\{\})?\s+(?:basename|dirname)(?:\s|$)/i.test(command);
}

function isSafeReadOnlyCommandSegment(command: string): boolean {
  if (!command) return false;

  if (hasRiskyRgFlag(command) || hasRiskyGitDiffFlag(command)) {
    return false;
  }

  if (SAFE_COMMAND_PATTERNS.some((pattern) => pattern.test(command)) || isClearlyReadOnlyFind(command)) {
    return true;
  }

  if (SAFE_PIPE_SEGMENT_PATTERNS.some((pattern) => pattern.test(command))) {
    return true;
  }

  if (isSafeReadOnlyXargs(command)) {
    return true;
  }

  return false;
}

function isSafeReadOnlyCommand(command: string): boolean {
  if (!command) {
    return false;
  }

  if (/[;\r\n]|&&|\|\||`|\$\(/.test(command)) {
    return false;
  }

  if (hasUnquotedSingleAmpersandOperator(command)) {
    return false;
  }

  if (containsUnquotedSequence(command, '<(')) {
    return false;
  }

  if (/>|>>/.test(command)) {
    return false;
  }

  if (hasRiskyRgFlag(command) || hasRiskyGitDiffFlag(command)) {
    return false;
  }

  const segments = splitUnquotedPipes(command);
  if (segments.length === 0) {
    return false;
  }

  return segments.every((segment) => isSafeReadOnlyCommandSegment(segment));
}

export function classifyAutoApprovalOperation(input: AutoApprovalOperationInput | undefined | null): AutoApprovalOperationClass {
  if (!input || !normalize(input.tool)) {
    return 'unknown';
  }

  const tool = normalize(input.tool).toLowerCase();
  if (EDIT_TOOLS.has(tool)) {
    return 'edit';
  }

  if (SAFE_NON_SHELL_TOOLS.has(tool)) {
    return 'safe_tool';
  }

  if (!SHELL_TOOLS.has(tool)) {
    return 'risky_tool';
  }

  const command = getShellCommandText(input);
  if (!command) {
    return 'unknown';
  }

  if (DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command))) {
    return 'destructive';
  }

  if (hasDangerousFindFlag(command)) {
    return 'destructive';
  }

  if (isSafeReadOnlyCommand(command)) {
    return 'safe_tool';
  }

  return 'risky_tool';
}

export function decideAutoApprovalAction(
  mode: AutoApprovalMode,
  operationClass: AutoApprovalOperationClass,
): AutoApprovalDecisionResult {
  if (mode === 'full_auto') {
    return {
      decision: 'allow',
      reason: `All operations are auto-approved in full_auto mode (${operationClass}).`,
    };
  }

  if (operationClass === 'destructive') {
    return {
      decision: 'block',
      reason: 'Destructive operations are blocked in every auto-approval mode.',
    };
  }

  if (mode === 'off') {
    return {
      decision: 'ask',
      reason: 'Auto-approval is off.',
    };
  }

  if (operationClass === 'unknown' || operationClass === 'risky_tool') {
    return {
      decision: 'ask',
      reason: `${operationClass} operations require approval.`,
    };
  }

  if (mode === 'edit_only') {
    if (operationClass === 'edit') {
      return {
        decision: 'allow',
        reason: 'Edit operations are allowed in edit_only mode.',
      };
    }

    return {
      decision: 'ask',
      reason: 'Safe tools still require approval in edit_only mode.',
    };
  }

  if (mode === 'edit_plus_safe_tools') {
    if (operationClass === 'edit') {
      return {
        decision: 'allow',
        reason: 'Edit operations are allowed in edit_plus_safe_tools mode.',
      };
    }

    if (operationClass === 'safe_tool') {
      return {
        decision: 'allow',
        reason: 'Safe tools are allowed in edit_plus_safe_tools mode.',
      };
    }
  }

  return {
    decision: 'ask',
    reason: `${operationClass} operations require approval.`,
  };
}
