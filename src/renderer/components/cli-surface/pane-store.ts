import { clearCliSurfaceLinkDispatch } from './link-dispatch.js';
import type { CliSurfaceInstance } from './pane-instance.js';
import type { CalderProtocolMessage } from './protocol.js';

export interface CliSurfacePaneStore {
  instances: Map<string, CliSurfaceInstance>;
  semanticNodes: Map<string, Map<string, CalderProtocolMessage>>;
  semanticFocusNodes: Map<string, Map<string, CalderProtocolMessage>>;
  semanticStateNodes: Map<string, Map<string, CalderProtocolMessage>>;
  semanticAdapterHints: Map<string, string>;
  protocolRemainders: Map<string, string>;
  semanticRegionVersions: Map<string, number>;
  clearProjectSurfaceCaches(projectId: string): void;
}

export function createCliSurfacePaneStore(): CliSurfacePaneStore {
  const instances = new Map<string, CliSurfaceInstance>();
  const semanticNodes = new Map<string, Map<string, CalderProtocolMessage>>();
  const semanticFocusNodes = new Map<string, Map<string, CalderProtocolMessage>>();
  const semanticStateNodes = new Map<string, Map<string, CalderProtocolMessage>>();
  const semanticAdapterHints = new Map<string, string>();
  const protocolRemainders = new Map<string, string>();
  const semanticRegionVersions = new Map<string, number>();

  return {
    instances,
    semanticNodes,
    semanticFocusNodes,
    semanticStateNodes,
    semanticAdapterHints,
    protocolRemainders,
    semanticRegionVersions,
    clearProjectSurfaceCaches(projectId: string): void {
      semanticNodes.delete(projectId);
      semanticFocusNodes.delete(projectId);
      semanticStateNodes.delete(projectId);
      semanticAdapterHints.delete(projectId);
      protocolRemainders.delete(projectId);
      semanticRegionVersions.delete(projectId);
      clearCliSurfaceLinkDispatch(projectId);
    },
  };
}
