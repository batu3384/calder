import * as fs from 'node:fs';
import * as path from 'node:path';

import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron';

import type { EvidenceReview, EvidenceReviewStatus } from '../shared/types-evidence.js';
import { EVIDENCE_SCHEMA_VERSION } from '../shared/types-evidence.js';
import {
  getActiveRunId,
  getEvidenceSettings,
  onCrashRecover,
  setEvidenceEventNotifier,
  setEvidenceSettings,
} from './calder-evidence/coordinator.js';
import { exportEvidenceRun } from './calder-evidence/export.js';
import { rebuildSummary } from './calder-evidence/finalization.js';
import { evaluateEvidenceHealth } from './calder-evidence/health.js';
import {
  countEvents,
  deleteAllEvidence,
  deleteRun,
  getStorageUsageBytes,
  readEvents,
  readMeta,
  readReview,
  readSummary,
  writeReview,
} from './calder-evidence/index.js';
import { findRunIdByCalderSessionId, resolveEvidenceRunId } from './calder-evidence/run-resolve.js';
import { normalizeEvidenceSubscribeRunIds } from './calder-evidence/subscribe-ids.js';

const evidenceSubscribers = new Map<number, { runIds: Set<string>; sender: WebContents }>();

const destroyHookedSenders = new Set<number>();

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

function normalizeExportExtension(filePath: string, format: 'json' | 'markdown'): string {
  const ext = format === 'json' ? '.json' : '.md';
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.json') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return filePath;
  }
  return `${filePath}${ext}`;
}

export function registerEvidenceIpcHandlers(): void {
  onCrashRecover();

  setEvidenceEventNotifier((runId, events) => {
    for (const [id, sub] of evidenceSubscribers) {
      if (sub.sender.isDestroyed()) {
        evidenceSubscribers.delete(id);
        continue;
      }
      if (!sub.runIds.has(runId)) continue;
      sub.sender.send('evidence:event', runId, events);
    }
  });

  ipcMain.handle('evidence:getSummary', (_event, id: string) => {
    const runId = resolveEvidenceRunId(id);
    if (!runId) return null;
    const meta = readMeta(runId);
    if (!meta) return null;
    const summary = readSummary(runId);
    const events = readEvents(runId);
    const health = evaluateEvidenceHealth({ meta, events, providerId: meta.providerId });
    return {
      summary,
      summaryStale: summary?.summaryStale ?? health.summaryStale,
      coverage: summary?.coverage ?? health.coverage,
      gaps: health.gaps,
      runId,
    };
  });

  ipcMain.handle('evidence:listEvents', (_event, id: string, offset = 0, limit = 200) => {
    const runId = resolveEvidenceRunId(id);
    if (!runId) return { runId: null, events: [], total: 0 };
    const safeOffset = Math.max(0, offset);
    const safeLimit = Math.min(Math.max(1, limit), 500);
    const events = readEvents(runId, { offset: safeOffset, limit: safeLimit });
    const meta = readMeta(runId);
    const total = meta?.eventCount ?? countEvents(runId);
    return {
      runId,
      events,
      total,
    };
  });

  ipcMain.handle('evidence:getHealth', (_event, id: string) => {
    const runId = resolveEvidenceRunId(id);
    if (!runId) return null;
    const meta = readMeta(runId);
    if (!meta) return null;
    const events = readEvents(runId);
    return evaluateEvidenceHealth({ meta, events, providerId: meta.providerId });
  });

  ipcMain.handle('evidence:getMeta', (_event, id: string) => {
    const runId = resolveEvidenceRunId(id);
    if (!runId) return null;
    return readMeta(runId);
  });

  ipcMain.handle('evidence:getReview', (_event, id: string) => {
    const runId = resolveEvidenceRunId(id);
    if (!runId) return null;
    return readReview(runId);
  });

  ipcMain.handle(
    'evidence:updateReview',
    (_event, runId: string, status: EvidenceReviewStatus, notes?: string) => {
      const meta = readMeta(runId);
      if (!meta) throw new Error('Evidence run not found');
      const review: EvidenceReview = {
        schemaVersion: EVIDENCE_SCHEMA_VERSION,
        runId,
        status,
        notes: typeof notes === 'string' ? notes.slice(0, 20_000) : undefined,
        updatedAt: new Date().toISOString(),
      };
      return writeReview(runId, review);
    },
  );

  ipcMain.handle('evidence:export', async (_event, runId: string, format: 'json' | 'markdown') => {
    const meta = readMeta(runId);
    if (!meta) throw new Error('Evidence run not found');

    const win = focusedWindow();
    if (!win) throw new Error('No window available for export dialog');
    const ext = format === 'json' ? 'json' : 'md';
    const result = await dialog.showSaveDialog(win, {
      title: 'Export session evidence',
      defaultPath: `evidence-${runId.slice(0, 8)}.${ext}`,
      filters: [
        format === 'json'
          ? { name: 'JSON', extensions: ['json'] }
          : { name: 'Markdown', extensions: ['md', 'markdown'] },
      ],
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true as const };
    }

    const targetPath = path.resolve(normalizeExportExtension(result.filePath, format));
    if (fs.existsSync(targetPath)) {
      const overwrite = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Cancel', 'Overwrite'],
        defaultId: 0,
        cancelId: 0,
        message: 'Overwrite existing export file?',
        detail: targetPath,
      });
      if (overwrite.response !== 1) {
        return { canceled: true as const };
      }
    }

    await exportEvidenceRun(runId, format, targetPath);
    return { canceled: false as const, filePath: targetPath };
  });

  ipcMain.handle('evidence:deleteRun', async (_event, runId: string) => {
    const meta = readMeta(runId);
    if (!meta) throw new Error('Evidence run not found');
    const win = focusedWindow();
    if (!win) throw new Error('No window available for delete confirmation');
    const confirm = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Cancel', 'Delete this run'],
      defaultId: 0,
      cancelId: 0,
      message: 'Delete this evidence run?',
      detail: 'This cannot be undone.',
    });
    if (confirm.response !== 1) {
      return { ok: false as const, canceled: true as const };
    }
    deleteRun(runId);
    return { ok: true as const, canceled: false as const };
  });

  ipcMain.handle('evidence:deleteAll', async () => {
    const win = focusedWindow();
    if (!win) throw new Error('No window available for delete confirmation');
    const confirm = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Cancel', 'Delete all evidence'],
      defaultId: 0,
      cancelId: 0,
      message: 'Delete all session evidence?',
      detail: 'This removes every evidence run and cannot be undone.',
    });
    if (confirm.response !== 1) {
      return { canceled: true as const };
    }
    deleteAllEvidence();
    return { canceled: false as const };
  });

  ipcMain.handle('evidence:getSettings', () => getEvidenceSettings());

  ipcMain.handle(
    'evidence:setSettings',
    (_event, settings: Parameters<typeof setEvidenceSettings>[0]) => setEvidenceSettings(settings),
  );

  ipcMain.handle('evidence:getStorageUsage', () => getStorageUsageBytes());

  ipcMain.handle('evidence:rebuildSummary', async (_event, runId: string) => {
    const meta = await rebuildSummary(runId);
    if (!meta) throw new Error('Evidence run not found');
    return readSummary(runId);
  });

  ipcMain.handle('evidence:resolveRunId', (_event, sessionId: string) =>
    findRunIdByCalderSessionId(sessionId),
  );

  ipcMain.on('evidence:subscribe', (event, runIdOrIds: string | string[]) => {
    const sender = event.sender;
    const runIds = new Set(normalizeEvidenceSubscribeRunIds(runIdOrIds));
    if (runIds.size === 0) {
      evidenceSubscribers.delete(sender.id);
      return;
    }
    evidenceSubscribers.set(sender.id, { runIds, sender });
    if (!destroyHookedSenders.has(sender.id)) {
      destroyHookedSenders.add(sender.id);
      sender.once('destroyed', () => {
        evidenceSubscribers.delete(sender.id);
        destroyHookedSenders.delete(sender.id);
      });
    }
  });

  ipcMain.on('evidence:unsubscribe', (event) => {
    evidenceSubscribers.delete(event.sender.id);
  });
}

export { findRunIdByCalderSessionId, getActiveRunId, resolveEvidenceRunId };
