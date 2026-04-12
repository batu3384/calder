import { execFile } from 'child_process';
import { isWin } from './platform';

const HTTP_PROBE_TIMEOUT_MS = 450;
const MAX_CANDIDATE_PORTS = 16;
const PREFERRED_PORT_ORDER = [3000, 5173, 4173, 8080, 4200, 8000, 8787, 8081];
const HTML_CONTENT_TYPE_RE = /\b(text\/html|application\/xhtml\+xml)\b/i;
const HTML_MARKER_RE = /<(?:!doctype html|html|head|body|title)\b/i;
const TITLE_RE = /<title>\s*([^<]+?)\s*<\/title>/i;
const INTERNAL_PROCESS_RE = /^(electron|chrome|chromium|firefox|safari)$/i;
const INTERNAL_SERVER_RE = /\bAirTunes\b/i;
const INTERNAL_BODY_RE = /\b(browser control|antigravity browser control)\b/i;

interface ListeningPortEntry {
  port: number;
  processName?: string;
}

export interface LocalBrowserTarget {
  url: string;
  label: string;
  meta: string;
}

function rankPort(port: number): number {
  const preferredIndex = PREFERRED_PORT_ORDER.indexOf(port);
  return preferredIndex === -1 ? PREFERRED_PORT_ORDER.length + port : preferredIndex;
}

function parseListeningEntries(
  output: string,
  platform: NodeJS.Platform = process.platform,
): ListeningPortEntry[] {
  const entries = new Map<number, ListeningPortEntry>();

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (platform === 'win32') {
      if (!/\bLISTENING\b/i.test(trimmed)) continue;
      const match = trimmed.match(/[:.](\d+)\s+\S+\s+LISTENING\b/i);
      const port = match ? Number.parseInt(match[1], 10) : Number.NaN;
      if (Number.isInteger(port) && port > 0 && port <= 65535) {
        entries.set(port, { port });
      }
      continue;
    }

    if (!/\(LISTEN\)/.test(trimmed)) continue;
    const match = trimmed.match(/[:.](\d+)\s+\(LISTEN\)/);
    const port = match ? Number.parseInt(match[1], 10) : Number.NaN;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      continue;
    }

    const processName = trimmed.split(/\s+/, 2)[0];
    entries.set(port, { port, processName });
  }

  return [...entries.values()].sort((a, b) => rankPort(a.port) - rankPort(b.port));
}

export function parseListeningPorts(output: string, platform: NodeJS.Platform = process.platform): number[] {
  return parseListeningEntries(output, platform).map((entry) => entry.port);
}

async function listListeningPorts(): Promise<ListeningPortEntry[]> {
  try {
    if (isWin) {
      const stdout = await runCommand('netstat', ['-ano', '-p', 'tcp']);
      return parseListeningEntries(stdout, 'win32');
    }

    const stdout = await runCommand('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN']);
    return parseListeningEntries(stdout, process.platform);
  } catch {
    return [];
  }
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 1200 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function extractTitle(bodySample: string): string | null {
  const match = bodySample.match(TITLE_RE);
  return match ? match[1].trim() : null;
}

function looksLikeBrowserSurface(contentType: string, bodySample: string, status: number): boolean {
  if ([301, 302, 303, 307, 308].includes(status)) return true;
  if (status < 200 || status >= 400) return false;
  if (HTML_CONTENT_TYPE_RE.test(contentType)) return true;
  return HTML_MARKER_RE.test(bodySample);
}

function isInternalSurface(processName: string | undefined, server: string, bodySample: string): boolean {
  if (processName && INTERNAL_PROCESS_RE.test(processName)) return true;
  if (INTERNAL_SERVER_RE.test(server)) return true;
  return INTERNAL_BODY_RE.test(bodySample);
}

async function inspectBrowserTarget(entry: ListeningPortEntry): Promise<LocalBrowserTarget | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(`http://localhost:${entry.port}/`, {
      redirect: 'manual',
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const server = response.headers.get('server') ?? '';
    const bodySample = [301, 302, 303, 307, 308].includes(response.status)
      ? ''
      : (await response.text()).slice(0, 2048);

    if (isInternalSurface(entry.processName, server, bodySample)) {
      return null;
    }

    if (!looksLikeBrowserSurface(contentType, bodySample, response.status)) {
      return null;
    }

    const title = extractTitle(bodySample);
    return {
      url: `http://localhost:${entry.port}/`,
      label: `localhost:${entry.port}`,
      meta: title || 'Open in browser',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverLocalBrowserTargets(): Promise<LocalBrowserTarget[]> {
  const candidatePorts = (await listListeningPorts()).slice(0, MAX_CANDIDATE_PORTS);
  if (candidatePorts.length === 0) return [];

  const probeResults = await Promise.all(candidatePorts.map((entry) => inspectBrowserTarget(entry)));
  return probeResults.filter((target): target is LocalBrowserTarget => !!target);
}
