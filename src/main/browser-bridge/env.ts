import { pathSep } from '../platform';

export interface BrowserBridgeEnvState {
  launcherPath: string;
  shimDir: string;
  nodeHookPath: string;
  token: string;
  url: string;
  realOpenPath?: string;
  realXdgOpenPath?: string;
}

function appendNodeRequire(existingNodeOptions: string | undefined, hookPath: string): string {
  const requireFlag = `--require=${hookPath}`;
  if (!existingNodeOptions || existingNodeOptions.trim().length === 0) {
    return requireFlag;
  }
  if (existingNodeOptions.includes(requireFlag) || existingNodeOptions.includes(hookPath)) {
    return existingNodeOptions;
  }
  return `${existingNodeOptions} ${requireFlag}`;
}

function prependPath(originalPath: string | undefined, entry: string): string {
  if (!originalPath) return entry;
  const segments = originalPath.split(pathSep).filter(Boolean);
  if (segments.includes(entry)) {
    return [entry, ...segments.filter((segment) => segment !== entry)].join(pathSep);
  }
  return [entry, ...segments].join(pathSep);
}

export function buildBrowserBridgeEnvFromState(
  cwd: string,
  env: Record<string, string>,
  bridgeState: BrowserBridgeEnvState,
): Record<string, string> {
  const nextEnv: Record<string, string> = {
    ...env,
    BROWSER: bridgeState.launcherPath,
    PATH: prependPath(env.PATH, bridgeState.shimDir),
    CALDER_BROWSER_BRIDGE_URL: bridgeState.url,
    CALDER_BROWSER_BRIDGE_TOKEN: bridgeState.token,
    CALDER_BROWSER_BRIDGE_LAUNCHER: bridgeState.launcherPath,
    CALDER_BROWSER_BRIDGE_CWD: cwd,
    NODE_OPTIONS: appendNodeRequire(env.NODE_OPTIONS, bridgeState.nodeHookPath),
  };

  if (bridgeState.realOpenPath) {
    nextEnv.CALDER_BROWSER_BRIDGE_REAL_OPEN = bridgeState.realOpenPath;
  }
  if (bridgeState.realXdgOpenPath) {
    nextEnv.CALDER_BROWSER_BRIDGE_REAL_XDG_OPEN = bridgeState.realXdgOpenPath;
  }

  return nextEnv;
}
