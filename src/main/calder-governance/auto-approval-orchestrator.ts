import type {
  AutoApprovalDecision,
  AutoApprovalMode,
  AutoApprovalPolicySource,
  InspectorEvent,
  ProviderId,
} from '../../shared/types.js';
import {
  classifyAutoApprovalOperation,
  decideAutoApprovalAction,
  type AutoApprovalOperationInput,
} from './auto-approval-classifier.js';
import { discoverProjectGovernance } from './discovery.js';

interface SessionRegistration {
  providerId: ProviderId | null;
  projectPath: string | null;
}

interface ResolvedAutoApprovalState {
  effectiveMode: AutoApprovalMode;
  policySource: AutoApprovalPolicySource;
}

export interface AutoApprovalOrchestrator {
  registerSession(sessionId: string, providerId: ProviderId | null | undefined, projectPath: string | null | undefined): void;
  unregisterSession(sessionId: string): void;
  handleInspectorEvents(sessionId: string, events: InspectorEvent[]): Promise<void>;
}

interface AutoApprovalOrchestratorOptions {
  sendApproval: (sessionId: string, providerId: ProviderId) => void | Promise<void>;
  emitInspectorEvents: (sessionId: string, events: InspectorEvent[]) => void;
  resolveAutoApprovalState?: (projectPath: string | null) => Promise<ResolvedAutoApprovalState>;
  now?: () => number;
  rateLimitMs?: number;
}

const DEFAULT_RATE_LIMIT_MS = 1500;
const SUPPORTED_PROVIDER_IDS = new Set<ProviderId>([
  'claude',
  'codex',
  'gemini',
  'qwen',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length > 0 ? items : undefined;
}

function extractOperationInput(event: InspectorEvent): AutoApprovalOperationInput {
  const rawInput = isRecord(event.tool_input) ? event.tool_input : undefined;
  return {
    tool: asString(event.tool_name),
    command: rawInput ? asString(rawInput.command) : undefined,
    args: rawInput ? asStringArray(rawInput.args) : undefined,
    text: rawInput ? asString(rawInput.text) : undefined,
    label: rawInput ? asString(rawInput.label) : undefined,
  };
}

async function resolveAutoApprovalStateFromProject(projectPath: string | null): Promise<ResolvedAutoApprovalState> {
  if (!projectPath) {
    return { effectiveMode: 'off', policySource: 'fallback' };
  }

  const governanceState = await discoverProjectGovernance(projectPath);
  const autoApproval = governanceState.autoApproval;
  if (!autoApproval) {
    return { effectiveMode: 'off', policySource: 'fallback' };
  }

  return {
    effectiveMode: autoApproval.effectiveMode,
    policySource: autoApproval.policySource,
  };
}

export function createAutoApprovalOrchestrator(options: AutoApprovalOrchestratorOptions): AutoApprovalOrchestrator {
  const sessions = new Map<string, SessionRegistration>();
  const lastAutoApprovalAt = new Map<string, number>();
  const now = options.now ?? (() => Date.now());
  const rateLimitMs = options.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  const resolveAutoApprovalState = options.resolveAutoApprovalState ?? resolveAutoApprovalStateFromProject;

  return {
    registerSession(sessionId, providerId, projectPath) {
      sessions.set(sessionId, {
        providerId: providerId ?? null,
        projectPath: projectPath ?? null,
      });
    },

    unregisterSession(sessionId) {
      sessions.delete(sessionId);
      lastAutoApprovalAt.delete(sessionId);
    },

    async handleInspectorEvents(sessionId, events) {
      if (!Array.isArray(events) || events.length === 0) return;

      for (const event of events) {
        if (event.type !== 'permission_request') continue;

        const session = sessions.get(sessionId);
        const providerId = session?.providerId;
        const providerSupported = providerId !== null && providerId !== undefined && SUPPORTED_PROVIDER_IDS.has(providerId);
        const approvalState = await resolveAutoApprovalState(session?.projectPath ?? null);
        const operationClass = classifyAutoApprovalOperation(extractOperationInput(event));
        const initialDecision = decideAutoApprovalAction(approvalState.effectiveMode, operationClass);

        let finalDecision: AutoApprovalDecision = initialDecision.decision;
        let finalReason = initialDecision.reason;

        if (finalDecision === 'allow' && !providerSupported) {
          finalDecision = 'ask';
          finalReason = 'Provider is missing or unsupported for auto-approval; manual approval required.';
        }

        if (finalDecision === 'allow') {
          const requestTimestamp = now();
          const lastTimestamp = lastAutoApprovalAt.get(sessionId);
          if (lastTimestamp !== undefined && requestTimestamp - lastTimestamp < rateLimitMs) {
            finalDecision = 'ask';
            finalReason = `Auto-approval rate limited: requests must be at least ${rateLimitMs}ms apart.`;
          } else {
            lastAutoApprovalAt.set(sessionId, requestTimestamp);
            await options.sendApproval(sessionId, providerId as ProviderId);
          }
        }

        options.emitInspectorEvents(sessionId, [{
          type: 'approval_decision',
          timestamp: now(),
          hookEvent: 'AutoApprovalOrchestrator',
          tool_name: event.tool_name,
          tool_input: event.tool_input,
          auto_approval: {
            policy_source: approvalState.policySource,
            effective_mode: approvalState.effectiveMode,
            operation_class: operationClass,
            decision: finalDecision,
            reason: finalReason,
          },
        }]);
      }
    },
  };
}

export { DEFAULT_RATE_LIMIT_MS };
