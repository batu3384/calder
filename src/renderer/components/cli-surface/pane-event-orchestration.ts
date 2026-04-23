import type { CliSurfaceRuntimeState, SurfaceSelectionRange } from '../../../shared/types/project-surface.js';
import { attachCliSurfaceRuntimeBindings, attachCliSurfaceStateBindings } from './runtime-bindings.js';
import { extractCalderOscMessages } from './protocol.js';
import type { CalderProtocolMessage } from './protocol.js';
import {
  getSemanticBucket as getSemanticBucketBehavior,
  normalizeSemanticAdapterHint as normalizeSemanticAdapterHintBehavior,
} from './semantic-state.js';
import type { CliSurfaceInstance } from './pane-instance.js';
import type { CliSurfacePaneStore } from './pane-store.js';

type CliSurfaceApi = {
  onData: (handler: (projectId: string, data: string) => void) => void;
  onStatus: (handler: (projectId: string, state: unknown) => void) => void;
  onExit: (handler: (projectId: string, exitCode: number) => void) => void;
  onError: (handler: (projectId: string, message: string) => void) => void;
};

type StateEventName =
  | 'state-loaded'
  | 'project-changed'
  | 'project-removed'
  | 'session-changed'
  | 'session-added'
  | 'session-removed';

interface AttachCliSurfacePaneBindingsOptions {
  getApi(): CliSurfaceApi | undefined;
  subscribeState(event: StateEventName, cb: () => void): void;
  getProjectIds(): string[];
  destroyPane(projectId: string): void;
  store: CliSurfacePaneStore;
  renderRuntimeMeta(instance: CliSurfaceInstance): void;
  renderInspectState(instance: CliSurfaceInstance): void;
  setInspectPayloadFromSelection(instance: CliSurfaceInstance, selection: SurfaceSelectionRange): void;
  scheduleTerminalDataFlush(instance: CliSurfaceInstance): void;
  updateRuntimeState(projectId: string, state: CliSurfaceRuntimeState): void;
  getRuntimeState(projectId: string): CliSurfaceRuntimeState | undefined;
  showComposerError(instance: CliSurfaceInstance, message: string): void;
}

export function attachCliSurfacePaneBindings(options: AttachCliSurfacePaneBindingsOptions): void {
  attachCliSurfaceRuntimeBindings({
    getApi: options.getApi,
    onData: (projectId, data) => {
      const { plainText, messages, remainder } = extractCalderOscMessages(
        data,
        options.store.protocolRemainders.get(projectId) ?? '',
      );
      if (remainder) {
        options.store.protocolRemainders.set(projectId, remainder);
      } else {
        options.store.protocolRemainders.delete(projectId);
      }

      if (messages.length > 0) {
        for (const message of messages) {
          if (message.type === 'focus') {
            const bucket = new Map<string, CalderProtocolMessage>();
            bucket.set(message.nodeId, message);
            options.store.semanticFocusNodes.set(projectId, bucket);
          } else {
            const store = message.type === 'state'
              ? options.store.semanticStateNodes
              : options.store.semanticNodes;
            getSemanticBucketBehavior(store, projectId).set(message.nodeId, message);
          }
          const adapterHint = normalizeSemanticAdapterHintBehavior(message.meta?.framework);
          if (adapterHint) {
            options.store.semanticAdapterHints.set(projectId, adapterHint);
          }
        }
        options.store.semanticRegionVersions.set(
          projectId,
          (options.store.semanticRegionVersions.get(projectId) ?? 0) + 1,
        );
      }

      const instance = options.store.instances.get(projectId);
      if (!instance) return;
      if (messages.length > 0) {
        options.renderRuntimeMeta(instance);
        const selection = instance.inspectState.selection ?? instance.inspectState.payload?.selection;
        if (selection) {
          options.setInspectPayloadFromSelection(instance, selection);
        }
      }
      if (!plainText) return;
      instance.pendingDataChunks.push(plainText);
      options.scheduleTerminalDataFlush(instance);
    },
    onStatus: (projectId, state) => {
      options.updateRuntimeState(projectId, state as CliSurfaceRuntimeState);
      const instance = options.store.instances.get(projectId);
      if (!instance) return;
      options.renderRuntimeMeta(instance);
    },
    onExit: (projectId, exitCode) => {
      const instance = options.store.instances.get(projectId);
      if (!instance) return;
      const runtime = options.getRuntimeState(projectId);
      if (runtime) {
        options.updateRuntimeState(projectId, {
          ...runtime,
          status: 'stopped',
          lastExitCode: exitCode,
        });
      }
      options.renderRuntimeMeta(instance);
    },
    onError: (projectId, message) => {
      const instance = options.store.instances.get(projectId);
      if (!instance) return;
      const runtime = options.getRuntimeState(projectId);
      options.updateRuntimeState(projectId, {
        ...(runtime ?? { status: 'error' }),
        status: 'error',
        lastError: message,
      });
      options.renderRuntimeMeta(instance);
      options.showComposerError(instance, message);
    },
  });

  attachCliSurfaceStateBindings({
    subscribe: options.subscribeState,
    rerender: () => {
      const activeProjectIds = new Set(options.getProjectIds());
      for (const projectId of [...options.store.instances.keys()]) {
        if (!activeProjectIds.has(projectId)) {
          options.destroyPane(projectId);
        }
      }

      options.store.instances.forEach((instance) => {
        options.renderRuntimeMeta(instance);
        options.renderInspectState(instance);
      });
    },
  });
}
