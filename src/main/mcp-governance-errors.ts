export const MCP_GOVERNANCE_ERROR_CODES = {
  DENIED: 'MCP_GOVERNANCE_DENIED',
  MISSING_PROJECT_PATH: 'MCP_GOVERNANCE_MISSING_PROJECT_PATH',
  NO_ACTIVE_PROJECT: 'MCP_GOVERNANCE_NO_ACTIVE_PROJECT',
  UNKNOWN_PROJECT: 'MCP_GOVERNANCE_UNKNOWN_PROJECT',
} as const;

export type McpGovernanceErrorCode =
  (typeof MCP_GOVERNANCE_ERROR_CODES)[keyof typeof MCP_GOVERNANCE_ERROR_CODES];

export interface McpGovernanceOperation {
  kind: 'mcp';
  label: string;
  target?: string;
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message.trim();
  }
  return String(error).trim();
}

export function formatMcpGovernanceError(code: McpGovernanceErrorCode, message: string): string {
  return `${code}: ${message}`;
}

export function buildMcpGovernanceFailure(
  code: McpGovernanceErrorCode,
  message: string,
): { success: false; error: string } {
  return {
    success: false,
    error: formatMcpGovernanceError(code, message),
  };
}

function classifyMcpGovernanceErrorCode(
  error: unknown,
  fallbackCode: McpGovernanceErrorCode,
): McpGovernanceErrorCode {
  const message = asErrorMessage(error).toLowerCase();
  if (message.includes('projectpath is required for project mcp scope')) {
    return MCP_GOVERNANCE_ERROR_CODES.MISSING_PROJECT_PATH;
  }
  if (message.includes('requires an active project')) {
    return MCP_GOVERNANCE_ERROR_CODES.NO_ACTIVE_PROJECT;
  }
  if (message.includes('requires a known project path')) {
    return MCP_GOVERNANCE_ERROR_CODES.UNKNOWN_PROJECT;
  }
  if (message.includes('governance policy blocked')) {
    return MCP_GOVERNANCE_ERROR_CODES.DENIED;
  }
  return fallbackCode;
}

function fallbackMessageForCode(
  code: McpGovernanceErrorCode,
  fallbackMessage: string,
  originalError: unknown,
): string {
  const message = asErrorMessage(originalError);
  if (code === MCP_GOVERNANCE_ERROR_CODES.MISSING_PROJECT_PATH) {
    return message || 'projectPath is required for project MCP scope';
  }
  if (code === MCP_GOVERNANCE_ERROR_CODES.NO_ACTIVE_PROJECT) {
    return message || 'MCP runtime operation requires an active project';
  }
  if (code === MCP_GOVERNANCE_ERROR_CODES.UNKNOWN_PROJECT) {
    return message || 'MCP operation requires a known project path';
  }
  return fallbackMessage;
}

export function buildMcpGovernanceFailureFromError(
  error: unknown,
  fallbackCode: McpGovernanceErrorCode,
  fallbackMessage: string,
): { success: false; error: string } {
  const code = classifyMcpGovernanceErrorCode(error, fallbackCode);
  return buildMcpGovernanceFailure(code, fallbackMessageForCode(code, fallbackMessage, error));
}
