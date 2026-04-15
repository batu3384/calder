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

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+checkout\s+--(?=\s|$)/i,
];

const SAFE_COMMAND_PATTERNS: RegExp[] = [
  /^rg(?:\s|$)/i,
  /^rg\s+--files(?:\s|$)/i,
  /^ls(?:\s|$)/i,
  /^pwd(?:\s|$)/i,
  /^cat(?:\s|$)/i,
  /^sed\s+-n(?:\s|$)/i,
  /^head(?:\s|$)/i,
  /^tail(?:\s|$)/i,
  /^wc(?:\s|$)/i,
  /^git\s+(?:status|log|show|diff)(?:\s|$)/i,
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
    '-fprintf',
    '-fls',
  ]);
  const tokens = command
    .toLowerCase()
    .split(/\s+/)
    .map(stripWrappingQuotes);
  return tokens.some((token) => disallowedFindFlags.has(token));
}

function isClearlyReadOnlyFind(command: string): boolean {
  if (!/^find(?:\s|$)/i.test(command)) {
    return false;
  }

  return !hasDangerousFindFlag(command);
}

function isSafeReadOnlyCommand(command: string): boolean {
  if (!command) {
    return false;
  }

  if (/[;\r\n]|&&|\|\||\||`|\$\(/.test(command)) {
    return false;
  }

  if (/>|>>/.test(command)) {
    return false;
  }

  return SAFE_COMMAND_PATTERNS.some((pattern) => pattern.test(command)) || isClearlyReadOnlyFind(command);
}

export function classifyAutoApprovalOperation(input: AutoApprovalOperationInput | undefined | null): AutoApprovalOperationClass {
  if (!input || !normalize(input.tool)) {
    return 'unknown';
  }

  const tool = normalize(input.tool).toLowerCase();
  if (EDIT_TOOLS.has(tool)) {
    return 'edit';
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
