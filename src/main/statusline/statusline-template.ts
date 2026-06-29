import { isWin, pythonBin } from '../platform';
import { buildStatusLinePythonTemplate } from './statusline-python-template';

export const STATUSLINE_PYTHON_HELPER = 'statusline.py';

export function buildStatusLinePython(statusDir: string): string {
  return buildStatusLinePythonTemplate(statusDir);
}

export function buildStatusLineWrapper(pythonPath: string, logPath: string): string {
  if (isWin) {
    return `@echo off\r\nif /I not "%CALDER_RUNTIME%"=="1" exit /b 0\r\npython "${pythonPath}" render 2>>"${logPath}"\r\n`;
  }
  return `#!/bin/sh\nif [ "\${CALDER_RUNTIME:-}" != "1" ]; then\n  exit 0\nfi\n${pythonBin} "${pythonPath}" render 2>>"${logPath}"\n`;
}
