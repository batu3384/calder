import { execFile } from 'child_process';
import { getFullPath } from './pty-manager';
import {
  MOBILE_DOCTOR_INSTALL_SPECS as INSTALL_SPECS,
  type DoctorInstallSpec as InstallSpec,
  type DoctorInstallStep as InstallStep,
} from './mobile-dependency-doctor-config';
import {
  getAndroidBinaryCandidates,
  resolveBinary,
} from './mobile-dependency-doctor-binaries';
import {
  clampPercent,
  firstNonEmptyLine,
  getAppiumDriverInstallTarget,
  isDriverAlreadyInstalledFailure,
  normalizeInstallFailureMessage,
  parseBytePairFromLine,
  parsePercentFromLine,
  sanitizeCommandResult,
  stripAnsi,
} from './mobile-dependency-doctor-utils';
import {
  createInstallId,
  runCommandStreaming,
} from './mobile-dependency-doctor-install-runner';
import type {
  MobileDependencyId,
  MobileDependencyInstallProgressEvent,
  MobileDependencyInstallResult,
} from '../shared/types/mobile';

const CHECK_TIMEOUT_MS = 20_000;
const INSTALL_TIMEOUT_MS = 12 * 60_000;

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface CommandRunner {
  run(
    command: string,
    args: string[],
    options?: { timeoutMs?: number },
  ): Promise<CommandResult>;
}

interface DoctorOptions {
  runner?: CommandRunner;
  hostPlatform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export interface InstallDependencyOptions extends DoctorOptions {
  installId?: string;
  onProgress?: (event: MobileDependencyInstallProgressEvent) => void;
}

const defaultRunner: CommandRunner = {
  run(command, args, options) {
    const timeoutMs = options?.timeoutMs ?? CHECK_TIMEOUT_MS;
    return new Promise((resolve) => {
      execFile(
        command,
        args,
        {
          env: { ...process.env, PATH: getFullPath() },
          encoding: 'utf-8',
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ code: 0, stdout, stderr });
            return;
          }

          const err = error as NodeJS.ErrnoException & {
            code?: number | string;
            stdout?: string;
            stderr?: string;
          };
          resolve({
            code: typeof err.code === 'number' ? err.code : 1,
            stdout: err.stdout ?? stdout ?? '',
            stderr: err.stderr ?? stderr ?? err.message ?? '',
          });
        },
      );
    });
  },
};

function computeOverallPercent(
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

function buildProgressEvent(input: {
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
}): MobileDependencyInstallProgressEvent {
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

function pushChunkLines(
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

async function runInstallStep(
  runner: CommandRunner,
  step: InstallStep,
  timeoutMs: number,
  onChunk?: (source: 'stdout' | 'stderr', chunk: string) => void,
): Promise<CommandResult> {
  if (onChunk && runner === defaultRunner) {
    return runCommandStreaming(step.command, step.args, timeoutMs, onChunk);
  }

  const result = await runner.run(step.command, step.args, { timeoutMs });
  if (onChunk) {
    if (result.stdout) onChunk('stdout', result.stdout);
    if (result.stderr) onChunk('stderr', result.stderr);
  }
  return result;
}

interface InstallExecutionContext {
  dependencyId: MobileDependencyId;
  installId: string;
  startedAt: string;
  onProgress?: (event: MobileDependencyInstallProgressEvent) => void;
}

interface InstallExecutionState {
  commandParts: string[];
  combinedStdout: string;
  combinedStderr: string;
  alreadyInstalledNote: string | null;
}

interface InstallStepTelemetry {
  latestStepPercent?: number;
  latestDownloadedBytes?: number;
  latestTotalBytes?: number;
  latestRemainingBytes?: number;
}

type InstallProgressInput = Omit<
  Parameters<typeof buildProgressEvent>[0],
  'installId' | 'dependencyId' | 'startedAt'
>;

function emitInstallProgress(context: InstallExecutionContext, input: InstallProgressInput): void {
  context.onProgress?.(buildProgressEvent({
    ...input,
    installId: context.installId,
    dependencyId: context.dependencyId,
    startedAt: context.startedAt,
  }));
}

function createInstallExecutionState(): InstallExecutionState {
  return {
    commandParts: [],
    combinedStdout: '',
    combinedStderr: '',
    alreadyInstalledNote: null,
  };
}

function buildInstallResult(
  context: InstallExecutionContext,
  state: InstallExecutionState,
  success: boolean,
  message: string,
): MobileDependencyInstallResult {
  return {
    dependencyId: context.dependencyId,
    success,
    message,
    command: state.commandParts.join(' && '),
    stdout: state.combinedStdout.trim(),
    stderr: state.combinedStderr.trim(),
  };
}

function buildEarlyInstallFailure(
  context: InstallExecutionContext,
  message: string,
): MobileDependencyInstallResult {
  emitInstallProgress(context, {
    phase: 'failed',
    finishedAt: new Date().toISOString(),
    message,
    percent: 0,
  });
  return {
    dependencyId: context.dependencyId,
    success: false,
    message,
  };
}

async function resolveInstallSteps(
  dependencyId: MobileDependencyId,
  spec: InstallSpec,
  runner: CommandRunner,
  env: NodeJS.ProcessEnv,
  hostPlatform: NodeJS.Platform,
): Promise<InstallStep[]> {
  if (dependencyId !== 'android-emulator') {
    return spec.steps;
  }

  const resolvedSdkManager = await resolveBinary(runner, 'sdkmanager', {
    fallbackPaths: getAndroidBinaryCandidates('sdkmanager', env, hostPlatform),
    probeArgs: ['--version'],
  });
  if (!resolvedSdkManager) {
    return spec.steps;
  }

  return spec.steps.map((step) =>
    step.command === 'sdkmanager'
      ? { ...step, command: resolvedSdkManager }
      : step,
  );
}

function processInstallLine(input: {
  context: InstallExecutionContext;
  source: 'stdout' | 'stderr';
  line: string;
  stepIndex: number;
  totalSteps: number;
  commandText: string;
  stepDriverTarget: string | null;
  telemetry: InstallStepTelemetry;
}): void {
  const cleanedLine = stripAnsi(input.line).trim();
  if (!cleanedLine) return;
  if (input.stepDriverTarget && /already installed/i.test(cleanedLine)) return;

  const parsedPercent = parsePercentFromLine(cleanedLine);
  if (parsedPercent !== null) {
    input.telemetry.latestStepPercent = parsedPercent;
  }

  const parsedBytes = parseBytePairFromLine(cleanedLine);
  if (parsedBytes) {
    input.telemetry.latestDownloadedBytes = parsedBytes.downloadedBytes;
    input.telemetry.latestTotalBytes = parsedBytes.totalBytes;
    input.telemetry.latestRemainingBytes = parsedBytes.remainingBytes;
  }

  emitInstallProgress(input.context, {
    phase: 'step_progress',
    stepIndex: input.stepIndex,
    totalSteps: input.totalSteps,
    command: input.commandText,
    source: input.source,
    detail: cleanedLine,
    stepPercent: input.telemetry.latestStepPercent,
    downloadedBytes: input.telemetry.latestDownloadedBytes,
    totalBytes: input.telemetry.latestTotalBytes,
    remainingBytes: input.telemetry.latestRemainingBytes,
    percent: computeOverallPercent(
      input.totalSteps,
      input.stepIndex,
      input.telemetry.latestStepPercent,
      input.telemetry.latestDownloadedBytes,
      input.telemetry.latestTotalBytes,
    ),
  });
}

function flushInstallRemainder(
  source: 'stdout' | 'stderr',
  remainderRef: { value: string },
  handleLine: (source: 'stdout' | 'stderr', line: string) => void,
): void {
  const remainder = remainderRef.value.trim();
  if (!remainder) return;
  handleLine(source, remainder);
}

async function executeInstallSteps(input: {
  context: InstallExecutionContext;
  state: InstallExecutionState;
  runner: CommandRunner;
  installSteps: InstallStep[];
}): Promise<MobileDependencyInstallResult | null> {
  const { context, state, runner, installSteps } = input;
  const totalSteps = installSteps.length;

  for (let index = 0; index < installSteps.length; index += 1) {
    const step = installSteps[index]!;
    const stepIndex = index + 1;
    const commandText = [step.command, ...step.args].join(' ');
    const stepDriverTarget = getAppiumDriverInstallTarget(step);
    const telemetry: InstallStepTelemetry = {};
    const stdoutRemainder = { value: '' };
    const stderrRemainder = { value: '' };

    state.commandParts.push(commandText);
    emitInstallProgress(context, {
      phase: 'step_started',
      stepIndex,
      totalSteps,
      command: commandText,
      percent: computeOverallPercent(totalSteps, stepIndex, 0),
      stepPercent: 0,
      message: `Running step ${stepIndex}/${totalSteps}`,
    });

    const handleLine = (source: 'stdout' | 'stderr', line: string): void => {
      processInstallLine({
        context,
        source,
        line,
        stepIndex,
        totalSteps,
        commandText,
        stepDriverTarget,
        telemetry,
      });
    };

    const rawResult = await runInstallStep(
      runner,
      step,
      step.timeoutMs ?? INSTALL_TIMEOUT_MS,
      (source, chunk) => {
        const remainderRef = source === 'stdout' ? stdoutRemainder : stderrRemainder;
        pushChunkLines(chunk, remainderRef, (line) => handleLine(source, line));
      },
    );
    const result = sanitizeCommandResult(rawResult);

    flushInstallRemainder('stdout', stdoutRemainder, handleLine);
    flushInstallRemainder('stderr', stderrRemainder, handleLine);

    state.combinedStdout += `${result.stdout}\n`;
    state.combinedStderr += `${result.stderr}\n`;

    if (result.code !== 0) {
      if (isDriverAlreadyInstalledFailure(step, result)) {
        const driverName = getAppiumDriverInstallTarget(step) ?? 'driver';
        const note = `Driver ${driverName} is already installed.`;
        state.alreadyInstalledNote = note;
        emitInstallProgress(context, {
          phase: 'step_finished',
          stepIndex,
          totalSteps,
          command: commandText,
          message: note,
          detail: note,
          percent: computeOverallPercent(totalSteps, stepIndex + 1, 0),
          stepPercent: 100,
        });
        continue;
      }

      const failureMessage = normalizeInstallFailureMessage(
        firstNonEmptyLine(result.stderr, result.stdout),
        step.command,
      );
      emitInstallProgress(context, {
        phase: 'failed',
        finishedAt: new Date().toISOString(),
        stepIndex,
        totalSteps,
        command: commandText,
        message: failureMessage,
        detail: result.stderr || result.stdout,
        percent: computeOverallPercent(
          totalSteps,
          stepIndex,
          telemetry.latestStepPercent,
          telemetry.latestDownloadedBytes,
          telemetry.latestTotalBytes,
        ),
        stepPercent: telemetry.latestStepPercent,
        downloadedBytes: telemetry.latestDownloadedBytes,
        totalBytes: telemetry.latestTotalBytes,
        remainingBytes: telemetry.latestRemainingBytes,
      });
      return buildInstallResult(context, state, false, failureMessage);
    }

    emitInstallProgress(context, {
      phase: 'step_finished',
      stepIndex,
      totalSteps,
      command: commandText,
      message: `Step ${stepIndex}/${totalSteps} completed.`,
      percent: computeOverallPercent(totalSteps, stepIndex + 1, 0),
      stepPercent: 100,
      downloadedBytes: telemetry.latestDownloadedBytes,
      totalBytes: telemetry.latestTotalBytes,
      remainingBytes: telemetry.latestRemainingBytes,
    });
  }

  return null;
}

export async function installMobileDependency(
  dependencyId: MobileDependencyId,
  options?: InstallDependencyOptions,
): Promise<MobileDependencyInstallResult> {
  const runner = options?.runner ?? defaultRunner;
  const hostPlatform = options?.hostPlatform ?? process.platform;
  const env = options?.env ?? process.env;
  const context: InstallExecutionContext = {
    dependencyId,
    installId: options?.installId || createInstallId(),
    onProgress: options?.onProgress,
    startedAt: new Date().toISOString(),
  };
  const spec = INSTALL_SPECS[dependencyId];

  if (!spec) {
    return buildEarlyInstallFailure(
      context,
      'No automatic install command is configured for this dependency.',
    );
  }

  if (spec.macOnly && hostPlatform !== 'darwin') {
    return buildEarlyInstallFailure(
      context,
      'Automatic install for this dependency is only available on macOS.',
    );
  }

  const state = createInstallExecutionState();
  const installSteps = await resolveInstallSteps(dependencyId, spec, runner, env, hostPlatform);
  const totalSteps = installSteps.length;
  emitInstallProgress(context, {
    phase: 'started',
    totalSteps,
    percent: 0,
    message: 'Starting installation...',
  });

  const failure = await executeInstallSteps({
    context,
    state,
    runner,
    installSteps,
  });
  if (failure) {
    return failure;
  }

  const successMessage = state.alreadyInstalledNote || 'Install command finished successfully.';
  emitInstallProgress(context, {
    phase: 'finished',
    finishedAt: new Date().toISOString(),
    totalSteps,
    percent: 100,
    message: successMessage,
  });
  return buildInstallResult(context, state, true, successMessage);
}
