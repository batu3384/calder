import type { IpcRenderer } from 'electron';

import type {
  EvidenceEvent,
  EvidenceHealth,
  EvidenceReview,
  EvidenceReviewStatus,
  EvidenceRunMeta,
  EvidenceSettings,
  EvidenceSummary,
} from '../shared/types-evidence.js';

type OnChannel = (channel: string, callback: (...args: unknown[]) => void) => () => void;

export interface EvidenceSummaryResult {
  summary: EvidenceSummary | null;
  summaryStale: boolean;
  coverage: EvidenceSummary['coverage'];
  gaps: EvidenceHealth['gaps'];
  runId: string;
}

export interface EvidenceListEventsResult {
  runId: string | null;
  events: EvidenceEvent[];
  total: number;
}

export interface PreloadEvidenceApi {
  getSummary(id: string): Promise<EvidenceSummaryResult | null>;
  listEvents(id: string, offset?: number, limit?: number): Promise<EvidenceListEventsResult>;
  getHealth(id: string): Promise<EvidenceHealth | null>;
  getMeta(id: string): Promise<EvidenceRunMeta | null>;
  getReview(id: string): Promise<EvidenceReview | null>;
  updateReview(
    runId: string,
    status: EvidenceReviewStatus,
    notes?: string,
  ): Promise<EvidenceReview>;
  export(
    runId: string,
    format: 'json' | 'markdown',
  ): Promise<{ canceled: true } | { canceled: false; filePath: string }>;
  deleteRun(runId: string): Promise<{ ok: boolean; canceled?: boolean }>;
  deleteAll(): Promise<{ canceled: boolean }>;
  getSettings(): Promise<EvidenceSettings>;
  setSettings(settings: EvidenceSettings): Promise<EvidenceSettings>;
  getStorageUsage(): Promise<number>;
  rebuildSummary(runId: string): Promise<EvidenceSummary | null>;
  resolveRunId(sessionId: string): Promise<string | null>;
  /** One runId or many — Ecosystem tab subscribes to all open CLI runs. */
  subscribe(runIdOrIds: string | string[]): void;
  unsubscribe(): void;
  onEvent(callback: (runId: string, events: EvidenceEvent[]) => void): () => void;
}

export function createPreloadEvidenceApi(
  ipcRenderer: IpcRenderer,
  onChannel: OnChannel,
): PreloadEvidenceApi {
  return {
    getSummary: (id) => ipcRenderer.invoke('evidence:getSummary', id),
    listEvents: (id, offset, limit) => ipcRenderer.invoke('evidence:listEvents', id, offset, limit),
    getHealth: (id) => ipcRenderer.invoke('evidence:getHealth', id),
    getMeta: (id) => ipcRenderer.invoke('evidence:getMeta', id),
    getReview: (id) => ipcRenderer.invoke('evidence:getReview', id),
    updateReview: (runId, status, notes) =>
      ipcRenderer.invoke('evidence:updateReview', runId, status, notes),
    export: (runId, format) => ipcRenderer.invoke('evidence:export', runId, format),
    deleteRun: (runId) => ipcRenderer.invoke('evidence:deleteRun', runId),
    deleteAll: () => ipcRenderer.invoke('evidence:deleteAll'),
    getSettings: () => ipcRenderer.invoke('evidence:getSettings'),
    setSettings: (settings) => ipcRenderer.invoke('evidence:setSettings', settings),
    getStorageUsage: () => ipcRenderer.invoke('evidence:getStorageUsage'),
    rebuildSummary: (runId) => ipcRenderer.invoke('evidence:rebuildSummary', runId),
    resolveRunId: (sessionId) => ipcRenderer.invoke('evidence:resolveRunId', sessionId),
    subscribe: (runIdOrIds) => ipcRenderer.send('evidence:subscribe', runIdOrIds),
    unsubscribe: () => ipcRenderer.send('evidence:unsubscribe'),
    onEvent: (callback) =>
      onChannel('evidence:event', (runId, events) =>
        callback(runId as string, events as EvidenceEvent[]),
      ),
  };
}
