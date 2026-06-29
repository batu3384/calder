import type { SurfaceSelectionRange } from '../../../shared/types/project-surface.js';
import type { CalderProtocolMessage } from './protocol.js';

export function normalizeSemanticAdapterHint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'textual' || normalized === 'ink' || normalized === 'blessed') {
    return normalized;
  }
  return undefined;
}

export function getSemanticBucket(
  store: Map<string, Map<string, CalderProtocolMessage>>,
  projectId: string,
): Map<string, CalderProtocolMessage> {
  const existing = store.get(projectId);
  if (existing) return existing;
  const bucket = new Map<string, CalderProtocolMessage>();
  store.set(projectId, bucket);
  return bucket;
}

export function getSemanticNodeForSelection(
  semanticNodes: Map<string, Map<string, CalderProtocolMessage>>,
  projectId: string,
  selection: SurfaceSelectionRange,
): CalderProtocolMessage | undefined {
  return [...(semanticNodes.get(projectId)?.values() ?? [])].find(
    (node) =>
      node.bounds &&
      node.bounds.startRow <= selection.startRow &&
      node.bounds.endRow >= selection.endRow,
  );
}

export function getFocusedSemanticNodeId(
  semanticFocusNodes: Map<string, Map<string, CalderProtocolMessage>>,
  projectId: string,
): string | undefined {
  return semanticFocusNodes.get(projectId)?.values().next().value?.nodeId;
}

export function buildSemanticMeta(
  semanticFocusNodes: Map<string, Map<string, CalderProtocolMessage>>,
  semanticStateNodes: Map<string, Map<string, CalderProtocolMessage>>,
  projectId: string,
  semanticNode?: CalderProtocolMessage,
): Record<string, unknown> | undefined {
  if (!semanticNode) return undefined;
  const focusMessage = semanticFocusNodes.get(projectId)?.get(semanticNode.nodeId);
  const stateMessage = semanticStateNodes.get(projectId)?.get(semanticNode.nodeId);
  return {
    ...(semanticNode.meta ?? {}),
    ...(focusMessage?.meta ?? {}),
    ...(stateMessage?.meta ?? {}),
  };
}
