import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { EvidenceEvent, EvidenceRunMeta } from '../../shared/types-evidence.js';
import { EVIDENCE_SCHEMA_VERSION } from '../../shared/types-evidence.js';
import { ingestEvent } from './finalization.js';
import { redactHomePaths } from './redact.js';
import { readEvents, readMeta, readReview, readSummary } from './store.js';

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString();
}

function buildMarkdownExport(params: {
  meta: EvidenceRunMeta;
  events: EvidenceEvent[];
  summary: ReturnType<typeof readSummary>;
  review: ReturnType<typeof readReview>;
}): string {
  const { meta, events, summary, review } = params;
  const lines: string[] = [
    '# Session Evidence Export',
    '',
    `**Run ID:** ${meta.runId}`,
    `**Session:** ${meta.calderSessionId}`,
    `**Provider:** ${meta.providerId}`,
    `**Project:** ${redactHomePaths(meta.projectPath)}`,
    `**State:** ${meta.state}`,
    `**Completion:** ${meta.completionState}`,
    `**Created:** ${meta.createdAt}`,
    meta.completedAt ? `**Completed:** ${meta.completedAt}` : '',
    '',
  ].filter(Boolean);

  if (summary) {
    lines.push(
      '## Summary',
      '',
      `- Coverage: ${summary.coverage}`,
      `- Events: ${summary.eventCounts.total}`,
      `- Git observations: ${summary.gitObservationCount}`,
      `- Summary stale: ${summary.summaryStale ? 'yes' : 'no'}`,
      '',
    );
    if (summary.healthGaps.length > 0) {
      lines.push('### Health gaps', '');
      for (const gap of summary.healthGaps) {
        lines.push(`- ${gap}`);
      }
      lines.push('');
    }
  }

  if (review) {
    lines.push('## Review', '', `**Status:** ${review.status}`, '');
    if (review.notes) {
      lines.push(review.notes, '');
    }
  }

  lines.push('## Events', '');
  for (const event of events) {
    lines.push(
      `### ${event.seq}. ${event.type}`,
      '',
      `- Time: ${formatTimestamp(event.timestamp)}`,
      `- Source: ${event.source}`,
      `- Confidence: ${event.confidence}`,
    );
    if (event.toolName) lines.push(`- Tool: ${event.toolName}`);
    if (event.outcome) lines.push(`- Outcome: ${event.outcome}`);
    if (event.policyDecision) {
      lines.push(
        `- Policy: ${event.policyDecision.decision} (${event.policyDecision.operationClass})`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function exportEvidenceRun(
  runId: string,
  format: 'json' | 'markdown',
  targetPath: string,
): Promise<void> {
  if (!path.isAbsolute(targetPath)) {
    throw new Error('Export path must be absolute');
  }

  const meta = readMeta(runId);
  if (!meta) {
    throw new Error(`Evidence run not found: ${runId}`);
  }

  const events = readEvents(runId);
  const summary = readSummary(runId);
  const review = readReview(runId);
  const exportedAt = new Date().toISOString();

  const exportedMeta = { ...meta, projectPath: redactHomePaths(meta.projectPath) };
  const content =
    format === 'json'
      ? JSON.stringify({ meta: exportedMeta, summary, review, events, exportedAt }, null, 2)
      : buildMarkdownExport({ meta, events, summary, review });

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');

  if (meta.state !== 'sealed') {
    const exportEvent: EvidenceEvent = {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      eventId: randomUUID(),
      evidenceRunId: runId,
      calderSessionId: meta.calderSessionId,
      providerId: meta.providerId,
      projectId: meta.projectId,
      type: 'export_created',
      providerEventName: 'export_created',
      timestamp: Date.now(),
      seq: meta.lastSeq + 1,
      source: 'calder_runtime',
      confidence: 'verified',
      sanitizedMeta: { format, targetPath: path.basename(targetPath) },
    };
    await ingestEvent(runId, exportEvent);
  }
}
