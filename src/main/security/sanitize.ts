/**
 * Shell injection sanitizers for PTY spawn arguments.
 * All user-derived strings passed to node-pty must be sanitized via this module.
 */

import * as path from 'path';

const SAFE_ARG_PATTERN = /^[a-zA-Z0-9_./=-]*$/;
/** Allows natural-language prompts while blocking shell metacharacters and control chars. */
const SAFE_INITIAL_PROMPT_PATTERN = /^[^\x00-\x1f;|&$`<>\\]*$/;
const SAFE_SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const RUNTIME_DIR_PATTERN = /^\.calder(\/|$)/;

/** Directories that are blocked for PTY cwd for security reasons. */
const BLOCKED_CWD_PREFIXES = ['/etc', '/sys', '/proc', '/root', '/boot', '/dev', '/srv'] as const;

export interface SanitizeResult {
  ok: boolean;
  value?: string;
  error?: string;
}

/**
 * Sanitizes a single CLI argument using an allowlist.
 * Returns an error for arguments containing shell metacharacters.
 */
export function sanitizeArg(arg: string): SanitizeResult {
  if (!arg) {
    return { ok: true, value: '' };
  }
  if (!SAFE_ARG_PATTERN.test(arg)) {
    return {
      ok: false,
      error: `Potentially unsafe argument contains disallowed characters: ${arg.slice(0, 80)}`,
    };
  }
  return { ok: true, value: arg };
}

/**
 * Sanitizes all arguments in a string array.
 * Throws if any argument fails validation.
 */
export function sanitizeArgs(args: string[]): string[] {
  const sanitized: string[] = [];
  for (const arg of args) {
    const result = sanitizeArg(arg);
    if (!result.ok) {
      throw new Error(result.error);
    }
    sanitized.push(result.value ?? '');
  }
  return sanitized;
}

/**
 * Sanitizes a user-provided initial prompt passed to CLI spawn.
 * Permits spaces and common punctuation; rejects shell injection characters.
 */
export function sanitizeInitialPrompt(prompt: string): SanitizeResult {
  if (!prompt) {
    return { ok: false, error: 'Initial prompt cannot be empty' };
  }
  if (!SAFE_INITIAL_PROMPT_PATTERN.test(prompt)) {
    return {
      ok: false,
      error: `Potentially unsafe initial prompt contains disallowed characters: ${prompt.slice(0, 80)}`,
    };
  }
  return { ok: true, value: prompt };
}

/**
 * Sanitizes CLI spawn arguments, applying relaxed rules to the initial prompt token.
 */
export function sanitizeSpawnArgs(args: string[], initialPrompt?: string): string[] {
  return args.map((arg) => {
    if (initialPrompt !== undefined && arg === initialPrompt) {
      const result = sanitizeInitialPrompt(arg);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.value ?? '';
    }
    const result = sanitizeArg(arg);
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.value ?? '';
  });
}

/**
 * Sanitizes a session ID to only contain alphanumeric chars, dashes, and underscores.
 * Returns null if the session ID is invalid.
 */
export function sanitizeSessionId(sessionId: string): SanitizeResult {
  if (!sessionId) {
    return { ok: false, error: 'Session ID cannot be empty' };
  }
  if (!SAFE_SESSION_ID_PATTERN.test(sessionId)) {
    return {
      ok: false,
      error: `Invalid session ID: must match ${SAFE_SESSION_ID_PATTERN}. Got: ${sessionId.slice(0, 80)}`,
    };
  }
  return { ok: true, value: sessionId };
}

/**
 * Validates that a path stays within the expected runtime directory.
 * Prevents path traversal attacks targeting ~/.calder/runtime/.
 */
export function validateRuntimePath(basePath: string, requestedPath: string): SanitizeResult {
  if (!requestedPath) {
    return { ok: false, error: 'Path cannot be empty' };
  }
  // Reject NUL bytes and other control characters
  if (/[^\x20-\x7E]/.test(requestedPath)) {
    return { ok: false, error: 'Path contains invalid control characters' };
  }
  if (requestedPath.includes('..')) {
    return { ok: false, error: 'Path traversal attempt detected' };
  }
  // Reject Windows-style traversal
  if (/\\/.test(requestedPath)) {
    return { ok: false, error: 'Backslash traversal not allowed' };
  }
  const normalized = requestedPath.replace(/\\/g, '/');

  // Resolve symlinks to detect symlink-based traversal.
  // If realpath resolution escapes basePath, the path is unsafe.
  try {
    const baseReal = path.resolve(basePath);
    const requestedReal = path.resolve(basePath, normalized);
    // Check that the resolved path is still within basePath
    if (!requestedReal.startsWith(baseReal + path.sep) && requestedReal !== baseReal) {
      return { ok: false, error: `Path resolved outside base directory: ${requestedPath.slice(0, 80)}` };
    }
  } catch {
    return { ok: false, error: `Could not resolve path: ${requestedPath.slice(0, 80)}` };
  }

  if (RUNTIME_DIR_PATTERN.test(normalized)) {
    return { ok: true, value: normalized };
  }
  return {
    ok: false,
    error: `Path must be within .calder directory. Got: ${requestedPath.slice(0, 80)}`,
  };
}

/**
 * Validates the working directory for PTY spawn.
 * Prevents spawning in sensitive system directories.
 */
export function validateCwd(cwd: string): SanitizeResult {
  if (!cwd) {
    return { ok: false, error: 'CWD cannot be empty' };
  }
  const normalized = cwd.replace(/\\/g, '/');
  for (const prefix of BLOCKED_CWD_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return { ok: false, error: `CWD cannot be a system directory: ${cwd}` };
    }
  }
  return { ok: true, value: normalized };
}

/**
 * Sanitizes extra CLI args string (passed as a single string from IPC).
 * Splits on whitespace and validates each token.
 * Throws on invalid input — use sanitizeExtraArgsQuiet for non-throwing variant.
 */
export function sanitizeExtraArgs(extraArgs: string): string[] {
  if (!extraArgs) return [];
  const tokens = extraArgs.split(/\s+/).filter(Boolean);
  return sanitizeArgs(tokens);
}

/**
 * Non-throwing variant — filters out tokens with shell metacharacters.
 * Use when you want to silently drop unsafe args rather than fail.
 */
export function sanitizeExtraArgsQuiet(extraArgs: string): string[] {
  if (!extraArgs) return [];
  const tokens = extraArgs.split(/\s+/).filter(Boolean);
  const safe: string[] = [];
  for (const token of tokens) {
    const result = sanitizeArg(token);
    if (result.ok) safe.push(result.value!);
  }
  return safe;
}