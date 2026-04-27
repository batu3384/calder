import { describe, expect, it } from 'vitest';
import { buildDiagnosticsSummaryModel } from './diagnostics-summary.js';
import type { ProjectRecord, SessionRecord } from '../state.js';
import type { AutoApprovalMode } from '../../shared/types/governance.js';

function makeProject(session: SessionRecord, effectiveMode: AutoApprovalMode = 'off'): ProjectRecord {
  return {
    id: 'p1',
    name: 'Browser',
    path: '/repo/browser',
    sessions: [session],
    activeSessionId: session.id,
    sessionHistory: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    projectGovernance: {
      autoApproval: {
        globalMode: effectiveMode,
        projectMode: undefined,
        sessionMode: undefined,
        effectiveMode,
        policySource: 'global',
        safeToolProfile: 'default-read-only',
        recentDecisions: [],
      },
      summary: {
        guardrailCount: 0,
        budgetCount: 0,
        checklistCount: 0,
        providerProfileCount: 0,
      },
    },
  } as ProjectRecord;
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's1',
    name: 'Claude',
    providerId: 'claude',
    cliSessionId: 'cli-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('diagnostics summary model', () => {
  it('surfaces gateway model routing separately from the native CLI provider', () => {
    const session = makeSession({
      cost: {
        model: 'MiniMax-M2.7',
        totalCostUsd: 0.42,
        totalInputTokens: 100,
        totalOutputTokens: 20,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalDurationMs: 1000,
        totalApiDurationMs: 800,
      },
      contextWindow: {
        totalTokens: 25_000,
        contextWindowSize: 100_000,
        usedPercentage: 25,
      },
    });

    const model = buildDiagnosticsSummaryModel({
      project: makeProject(session),
      activeSession: session,
      gitStatus: {
        isGitRepo: true,
        branch: 'main',
        ahead: 0,
        behind: 0,
        staged: 0,
        modified: 0,
        untracked: 0,
        conflicted: 0,
      },
      language: 'en',
      providerLabel: 'Claude Code',
    });

    expect(model.tone).toBe('active');
    expect(model.cards[0]).toMatchObject({
      label: 'Route',
      value: 'Gateway',
      detail: 'Claude Code -> MiniMax · MiniMax-M2.7',
      tone: 'active',
    });
    expect(model.cards[1]).toMatchObject({
      label: 'Tracking',
      value: 'Live',
      detail: 'Cost + context at 25%.',
    });
  });

  it('promotes unsafe auto approval and git conflicts to warning tone', () => {
    const session = makeSession();
    const model = buildDiagnosticsSummaryModel({
      project: makeProject(session, 'full_auto_unsafe'),
      activeSession: session,
      gitStatus: {
        isGitRepo: true,
        branch: 'main',
        ahead: 0,
        behind: 0,
        staged: 0,
        modified: 0,
        untracked: 0,
        conflicted: 2,
      },
      language: 'tr',
      providerLabel: 'Claude Code',
    });

    expect(model.title).toBe('Çalışma Güveni');
    expect(model.tone).toBe('warning');
    expect(model.cards[2]).toMatchObject({
      label: 'Onay',
      value: 'Tehlikeli otonom',
      tone: 'warning',
    });
    expect(model.cards[3]).toMatchObject({
      label: 'Git',
      value: 'Çakışma',
      detail: '2 çakışmalı dosya.',
      tone: 'warning',
    });
  });
});
