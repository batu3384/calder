/**
 * IPC payload validation — Zod schemas for renderer → main messages.
 */

import { validateOrThrow } from './schemas.js';
import { PtyCreateSchema, PtyResizeSchema, PtyWriteSchema } from './schemas.js';

export interface PtyCreatePayload {
  sessionId: string;
  cwd: string;
  cliSessionId: string | null;
  isResume: boolean;
  extraArgs: string;
  providerId: 'claude' | 'codex' | 'copilot' | 'antigravity' | 'qwen';
  initialPrompt?: string;
}

export function validatePtyCreatePayload(
  sessionId: string,
  cwd: string,
  cliSessionId: string | null,
  isResume: boolean,
  extraArgs: string,
  providerId: string,
  initialPrompt?: string,
): PtyCreatePayload {
  const parsed = validateOrThrow(PtyCreateSchema, {
    sessionId,
    cwd,
    cliSessionId,
    isResume,
    extraArgs,
    providerId,
    initialPrompt,
  });
  return {
    ...parsed,
    providerId: parsed.providerId ?? 'claude',
  };
}

export function validatePtyWritePayload(sessionId: string, data: string): { sessionId: string; data: string } {
  return validateOrThrow(PtyWriteSchema, { sessionId, data });
}

export function validatePtyResizePayload(
  sessionId: string,
  cols: number,
  rows: number,
): { sessionId: string; cols: number; rows: number } {
  return validateOrThrow(PtyResizeSchema, { sessionId, cols, rows });
}
