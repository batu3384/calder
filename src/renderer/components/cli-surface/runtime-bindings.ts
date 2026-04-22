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

let runtimeBindingsAttached = false;
let stateBindingsAttached = false;

export function attachCliSurfaceRuntimeBindings(options: {
  getApi: () => CliSurfaceApi | undefined;
  onData: (projectId: string, data: string) => void;
  onStatus: (projectId: string, state: unknown) => void;
  onExit: (projectId: string, exitCode: number) => void;
  onError: (projectId: string, message: string) => void;
}): void {
  if (runtimeBindingsAttached) return;
  const api = options.getApi();
  if (!api) return;
  runtimeBindingsAttached = true;

  api.onData(options.onData);
  api.onStatus(options.onStatus);
  api.onExit(options.onExit);
  api.onError(options.onError);
}

export function attachCliSurfaceStateBindings(options: {
  subscribe: (event: StateEventName, cb: () => void) => void;
  rerender: () => void;
}): void {
  if (stateBindingsAttached) return;
  stateBindingsAttached = true;

  options.subscribe('state-loaded', options.rerender);
  options.subscribe('project-changed', options.rerender);
  options.subscribe('project-removed', options.rerender);
  options.subscribe('session-changed', options.rerender);
  options.subscribe('session-added', options.rerender);
  options.subscribe('session-removed', options.rerender);
}
