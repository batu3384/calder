import type {
  MobileDependencyId,
  MobileDependencyInstallProgressEvent,
} from '../../shared/types/mobile';
import {
  clampPercent,
} from '../mobile-dependency-doctor-utils';

interface BuildProgressEventInput {
  installId: string;
  dependencyId: MobileDependencyId;
  phase: MobileDependencyInstallProgressEvent['phase'];
  startedAt: string;
  finishedAt?: string;
  stepIndex?: number;
  totalSteps?: number;
  command?: string;
  message?: string;
  detail?: string;
  source?: 'stdout' | 'stderr';
  percent?: number;
  stepPercent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  remainingBytes?: number;
}

export function computeOverallPercent(
  totalSteps: number,
  stepIndex: number,
  stepPercent?: number,
  downloadedBytes?: number,
  totalBytes?: number,
): number {
  if (totalSteps <= 0) return 0;
  const completedBeforeStep = Math.max(0, stepIndex - 1);
  let stepFraction = 0;
  if (typeof stepPercent === 'number' && Number.isFinite(stepPercent)) {
    stepFraction = clampPercent(stepPercent) / 100;
  } else if (
    typeof downloadedBytes === 'number' &&
    typeof totalBytes === 'number' &&
    Number.isFinite(downloadedBytes) &&
    Number.isFinite(totalBytes) &&
    totalBytes > 0
  ) {
    stepFraction = Math.max(0, Math.min(1, downloadedBytes / totalBytes));
  }
  return clampPercent(((completedBeforeStep + stepFraction) / totalSteps) * 100);
}

export function buildProgressEvent(input: BuildProgressEventInput): MobileDependencyInstallProgressEvent {
  const event: MobileDependencyInstallProgressEvent = {
    installId: input.installId,
    dependencyId: input.dependencyId,
    phase: input.phase,
    startedAt: input.startedAt,
  };
  if (input.finishedAt) event.finishedAt = input.finishedAt;
  if (typeof input.stepIndex === 'number') event.stepIndex = input.stepIndex;
  if (typeof input.totalSteps === 'number') event.totalSteps = input.totalSteps;
  if (input.command) event.command = input.command;
  if (input.message) event.message = input.message;
  if (input.detail) event.detail = input.detail;
  if (input.source) event.source = input.source;
  if (typeof input.percent === 'number' && Number.isFinite(input.percent)) event.percent = clampPercent(input.percent);
  if (typeof input.stepPercent === 'number' && Number.isFinite(input.stepPercent)) event.stepPercent = clampPercent(input.stepPercent);
  if (typeof input.downloadedBytes === 'number' && Number.isFinite(input.downloadedBytes)) event.downloadedBytes = Math.max(0, input.downloadedBytes);
  if (typeof input.totalBytes === 'number' && Number.isFinite(input.totalBytes)) event.totalBytes = Math.max(0, input.totalBytes);
  if (typeof input.remainingBytes === 'number' && Number.isFinite(input.remainingBytes)) event.remainingBytes = Math.max(0, input.remainingBytes);
  return event;
}

export function pushChunkLines(
  chunk: string,
  remainderRef: { value: string },
  handleLine: (line: string) => void,
): void {
  const normalized = chunk.replace(/\r/g, '\n');
  const text = remainderRef.value + normalized;
  const parts = text.split('\n');
  remainderRef.value = parts.pop() ?? '';
  for (const raw of parts) {
    const line = raw.trim();
    if (!line) continue;
    handleLine(line);
  }
}

export function flushInstallRemainder(
  source: 'stdout' | 'stderr',
  remainderRef: { value: string },
  handleLine: (source: 'stdout' | 'stderr', line: string) => void,
): void {
  const remainder = remainderRef.value.trim();
  if (!remainder) return;
  handleLine(source, remainder);
}
