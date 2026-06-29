/**
 * Zod schemas for runtime validation of state, IPC messages, and config files.
 * Provides runtime type safety complementing compile-time TypeScript types.
 */

import { z } from 'zod';

// ============================================================
// Provider Types
// ============================================================

export const ProviderIdSchema = z.enum(['claude', 'codex', 'copilot', 'antigravity', 'qwen']);

export const CliProviderCapabilitySchema = z.object({
  sessionResume: z.boolean(),
  costTracking: z.boolean(),
  contextWindow: z.boolean(),
  hookStatus: z.boolean(),
  configReading: z.boolean(),
  shiftEnterNewline: z.boolean(),
  pendingPromptTrigger: z.union([
    z.literal('startup-arg'),
    z.literal('env-var'),
    z.literal('none'),
    z.string(),
  ]),
  planModeArg: z.string().optional(),
});

export const CliProviderMetaSchema = z.object({
  id: ProviderIdSchema,
  displayName: z.string(),
  binaryName: z.string(),
  capabilities: CliProviderCapabilitySchema,
  defaultContextWindowSize: z.number().int().positive(),
});

// ============================================================
// Session Types
// ============================================================

export const SessionRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  cliSessionId: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
  costAccumulatedUsd: z.number().min(0).default(0),
  transcriptPath: z.string().nullable().optional(),
  isAgentMode: z.boolean().default(false),
  planMode: z.boolean().default(false),
  providerId: ProviderIdSchema.optional(),
});

export const ProjectRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  activeSessionId: z.string().nullable().optional(),
  sessions: z.array(SessionRecordSchema).default([]),
});

// ============================================================
// State Types
// ============================================================

export const PreferencesSchema = z.object({
  soundOnSessionWaiting: z.boolean().default(true),
  notificationsDesktop: z.boolean().default(true),
  debugMode: z.boolean().default(false),
  sessionHistoryEnabled: z.boolean().default(true),
  insightsEnabled: z.boolean().default(true),
  autoTitleEnabled: z.boolean().default(true),
  appearanceTheme: z.enum(['system', 'light', 'dark']).optional(),
  sidebarViews: z.record(z.string(), z.boolean()).optional(),
});

export const PersistedStateSchema = z.object({
  version: z.literal(1),
  projects: z.array(ProjectRecordSchema).default([]),
  activeProjectId: z.string().nullable().default(null),
  preferences: PreferencesSchema.default(() => ({
    soundOnSessionWaiting: true,
    notificationsDesktop: true,
    debugMode: false,
    sessionHistoryEnabled: true,
    insightsEnabled: true,
    autoTitleEnabled: true,
  })),
});

// ============================================================
// Governance Types
// ============================================================

export const AutoApprovalModeSchema = z.enum([
  'off',
  'edit_only',
  'edit_plus_safe_tools',
  'full_auto',
  'full_auto_unsafe',
]);

// ============================================================
// IPC Payload Validation
// ============================================================

export const PtyCreateSchema = z.object({
  sessionId: z.string().min(1).max(256),
  cwd: z.string().min(1),
  cliSessionId: z.string().nullable(),
  isResume: z.boolean(),
  extraArgs: z.string().max(10_000),
  providerId: ProviderIdSchema.default('claude'),
  initialPrompt: z.string().max(100_000).optional(),
});

export const PtyWriteSchema = z.object({
  sessionId: z.string().min(1),
  data: z.string().max(1 * 1024 * 1024), // 1MB max
});

export const PtyResizeSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().min(1).max(10000),
  rows: z.number().int().min(1).max(10000),
});

export const FsReadFileSchema = z.object({
  filePath: z.string().min(1),
  maxBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024)
    .default(10 * 1024 * 1024), // 10MB default
});

export const StoreSaveSchema = z.object({
  state: z.unknown(),
  maxBytes: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024)
    .default(25 * 1024 * 1024),
});

export const ExternalUrlSchema = z.string().refine(
  (val) => {
    try {
      const parsed = new URL(val);
      return (
        parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:'
      );
    } catch {
      return false;
    }
  },
  { message: 'Only HTTP(S) and mailto URLs are allowed' },
);

// ============================================================
// Config File Schemas
// ============================================================

export const GovernancePolicySchema = z.object({
  version: z.number().int().positive(),
  mode: z.union([z.literal('advisory'), z.literal('enforced')]),
  budgetLimitUsd: z.number().min(0).optional(),
  allowedMcpServers: z.array(z.string()).optional(),
  rules: z
    .array(
      z.object({
        id: z.string().min(1),
        priority: z.number().int(),
        operation: z.string(),
        action: z.enum(['allow', 'block', 'ask', 'warn']),
        reason: z.string().optional(),
      }),
    )
    .optional(),
});

// ============================================================
// Validation Utilities
// ============================================================

/**
 * Validates data against a Zod schema with clear error messages.
 */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { ok: true; data: T } | { ok: false; errors: string[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
}

/**
 * Parse and validate or throw.
 */
export function validateOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Validation failed: ${errors}`);
  }
  return result.data;
}
