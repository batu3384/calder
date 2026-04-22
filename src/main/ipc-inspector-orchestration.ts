import { BrowserWindow, shell } from 'electron';
import { setInspectorEventsMiddleware } from './hook-status';
import { createAutoApprovalOrchestrator } from './calder-governance/auto-approval-orchestrator';
import { resolveAutoApprovalInput } from './calder-governance/auto-approval-dispatch';
import { applySessionOverrideToGovernanceState } from './ipc-auto-approval-governance';
import { discoverProjectGovernance } from './calder-governance/discovery';
import { writePty } from './pty-manager';
import {
  PLAYWRIGHT_TRANSCRIPT_BUFFER_MAX_CHARS,
  appendAutoApprovalAudit,
  extractPlaywrightNavigateUrlsFromTerminalChunk,
  shouldMirrorPlaywrightNavigate,
  shouldMirrorPlaywrightNavigateUrl,
  type PlaywrightMirrorState,
} from './ipc-playwright-mirror';
import { openUrlWithBrowserPolicy } from './browser-open-policy';
import type { InspectorEvent } from '../shared/types/session';
import type { ProjectGovernanceState } from '../shared/types/governance';
import {
  buildMiniMaxToolCallRecoveryPrompt,
  shouldTriggerMiniMaxToolCallRecovery,
  type MiniMaxToolCallRecoveryState,
} from './minimax-toolcall-recovery';

const MINIMAX_TOOLCALL_RECOVERY_COOLDOWN_MS = 45_000;
const miniMaxToolCallRecoveryBySession = new Map<string, MiniMaxToolCallRecoveryState>();
const playwrightMirrorBySession = new Map<string, PlaywrightMirrorState>();
const playwrightTranscriptBufferBySession = new Map<string, string>();

export interface InspectorOrchestrationRuntime {
  autoApprovalOrchestrator: ReturnType<typeof createAutoApprovalOrchestrator>;
  getGovernanceState: (projectPath: string, sessionId?: string) => Promise<ProjectGovernanceState>;
  mirrorPlaywrightFromPtyData: (sessionId: string, cwd: string, chunk: string) => void;
}

export function clearInspectorOrchestrationSession(sessionId: string): void {
  miniMaxToolCallRecoveryBySession.delete(sessionId);
  playwrightMirrorBySession.delete(sessionId);
  playwrightTranscriptBufferBySession.delete(sessionId);
}

export function resetInspectorOrchestrationCaches(): void {
  miniMaxToolCallRecoveryBySession.clear();
  playwrightMirrorBySession.clear();
  playwrightTranscriptBufferBySession.clear();
}

export function createInspectorOrchestration(): InspectorOrchestrationRuntime {
  const autoApprovalOrchestrator = createAutoApprovalOrchestrator({
    sendApproval: (sessionId, providerId) => {
      const approvalInput = resolveAutoApprovalInput(providerId);
      const sent = writePty(sessionId, approvalInput);
      if (!sent) {
        throw new Error(`Failed to write approval input: missing PTY session (${sessionId}).`);
      }
    },
    emitInspectorEvents: (sessionId, events) => {
      appendAutoApprovalAudit(sessionId, events);
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('session:inspectorEvents', sessionId, events);
      }
    },
  });

  setInspectorEventsMiddleware((sessionId, events) => {
    void autoApprovalOrchestrator.handleInspectorEvents(sessionId, events).catch((error) => {
      console.warn('Auto-approval orchestrator failed:', error);
    });
    let finalEvents = events;
    for (const event of events) {
      const now = Date.now();

      const mirroredTarget = shouldMirrorPlaywrightNavigate(sessionId, event, playwrightMirrorBySession, now);
      if (mirroredTarget) {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          void openUrlWithBrowserPolicy(
            {
              url: mirroredTarget.url,
              cwd: mirroredTarget.cwd,
              sessionId: mirroredTarget.sessionId,
              preferEmbedded: true,
            },
            win,
            (target) => shell.openExternal(target),
          ).catch((error) => {
            console.warn('Playwright mirror open failed:', error);
          });
        }
        finalEvents = [
          ...finalEvents,
          {
            type: 'status_update',
            timestamp: now,
            hookEvent: 'PlaywrightMirror',
            message: `Mirrored Playwright navigate to Calder browser: ${mirroredTarget.url}`,
          },
        ];
      }

      if (event.type !== 'stop') continue;
      const lastMessage = typeof event.last_assistant_message === 'string'
        ? event.last_assistant_message
        : '';
      const previousState = miniMaxToolCallRecoveryBySession.get(sessionId);
      if (!shouldTriggerMiniMaxToolCallRecovery(lastMessage, previousState, now, MINIMAX_TOOLCALL_RECOVERY_COOLDOWN_MS)) {
        continue;
      }

      const normalizedMessage = lastMessage.trim();
      miniMaxToolCallRecoveryBySession.set(sessionId, {
        lastTriggeredAt: now,
        lastMessage: normalizedMessage,
        attempts: (previousState?.attempts ?? 0) + 1,
      });

      try {
        writePty(sessionId, `${buildMiniMaxToolCallRecoveryPrompt()}\n`);
      } catch (error) {
        console.warn('MiniMax tool-call recovery dispatch failed:', error);
      }

      finalEvents = [
        ...finalEvents,
        {
          type: 'status_update',
          timestamp: now,
          hookEvent: 'MiniMaxToolCallRecovery',
          message: 'MiniMax pseudo tool-call markup detected; recovery prompt was sent automatically.',
        },
      ];
    }
    return finalEvents;
  });

  const getGovernanceState = async (projectPath: string, sessionId?: string): Promise<ProjectGovernanceState> => {
    const baseState = await discoverProjectGovernance(projectPath);
    const sessionMode = sessionId ? autoApprovalOrchestrator.getSessionOverride(sessionId) : undefined;
    return applySessionOverrideToGovernanceState(baseState, sessionMode);
  };

  const mirrorPlaywrightFromPtyData = (sessionId: string, cwd: string, chunk: string): void => {
    if (!chunk || chunk.length === 0) return;
    const previous = playwrightTranscriptBufferBySession.get(sessionId) ?? '';
    const combined = `${previous}${chunk}`;
    const buffer = combined.length > PLAYWRIGHT_TRANSCRIPT_BUFFER_MAX_CHARS
      ? combined.slice(-PLAYWRIGHT_TRANSCRIPT_BUFFER_MAX_CHARS)
      : combined;
    playwrightTranscriptBufferBySession.set(sessionId, buffer);

    const urls = extractPlaywrightNavigateUrlsFromTerminalChunk(buffer);
    if (urls.length === 0) return;

    const win = BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return;

    for (const url of urls) {
      const now = Date.now();
      if (!shouldMirrorPlaywrightNavigateUrl(sessionId, url, playwrightMirrorBySession, now)) {
        continue;
      }

      void openUrlWithBrowserPolicy(
        { url, cwd, sessionId, preferEmbedded: true },
        win,
        (target) => shell.openExternal(target),
      ).catch((error) => {
        console.warn('Playwright transcript mirror open failed:', error);
      });

      win.webContents.send('session:inspectorEvents', sessionId, [{
        type: 'status_update',
        timestamp: now,
        hookEvent: 'PlaywrightMirror',
        message: `Mirrored Playwright navigate from terminal output: ${url}`,
      } satisfies InspectorEvent]);
    }
  };

  return {
    autoApprovalOrchestrator,
    getGovernanceState,
    mirrorPlaywrightFromPtyData,
  };
}
