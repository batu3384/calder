import { formatPointLabel } from './dependency-scoping.js';
import type { MobileSurfaceInspectState } from './types.js';

interface BuildMobileInspectPromptOptions {
  inspectState: MobileSurfaceInspectState;
  platformLabel: string;
}

export function buildMobileInspectPrompt(options: BuildMobileInspectPromptOptions): string | null {
  const { inspectState, platformLabel } = options;
  if (!inspectState.screenshot || !inspectState.screenshot.success || !inspectState.screenshot.dataUrl) return null;
  if (!inspectState.selectedPoint) return null;
  const instruction = inspectState.instruction.trim();
  if (!instruction) return null;

  const lines = [
    `Mobile inspect task (${platformLabel}).`,
    `Selected point: ${formatPointLabel(inspectState.selectedPoint)}.`,
  ];
  if (typeof inspectState.screenshot.width === 'number' && typeof inspectState.screenshot.height === 'number') {
    lines.push(`Screenshot size: ${inspectState.screenshot.width}x${inspectState.screenshot.height}.`);
  }
  if (inspectState.screenshot.deviceName) {
    lines.push(`Device: ${inspectState.screenshot.deviceName}.`);
  } else if (inspectState.screenshot.deviceId) {
    lines.push(`Device id: ${inspectState.screenshot.deviceId}.`);
  }
  if (inspectState.screenshot.capturedAt) {
    lines.push(`Capture timestamp: ${inspectState.screenshot.capturedAt}.`);
  }
  if (inspectState.selectedElement?.success && inspectState.selectedElement.element) {
    const element = inspectState.selectedElement.element;
    const elementParts: string[] = [];
    if (element.className) elementParts.push(`class=${element.className}`);
    if (element.resourceId) elementParts.push(`resourceId=${element.resourceId}`);
    if (element.contentDesc) elementParts.push(`contentDesc=${element.contentDesc}`);
    if (element.text) elementParts.push(`text=${element.text}`);
    if (element.bounds) {
      const { left, top, right, bottom } = element.bounds;
      elementParts.push(`bounds=[${left},${top}]-[${right},${bottom}]`);
    }
    if (elementParts.length > 0) {
      lines.push(`Matched element: ${elementParts.join(', ')}.`);
    }
  }
  lines.push(`Instruction: ${instruction}`);
  return lines.join('\n');
}

export function resolveMobileInspectPromptError(inspectState: MobileSurfaceInspectState): string {
  if (!inspectState.screenshot?.dataUrl) {
    return 'Capture a simulator frame first.';
  }
  if (!inspectState.selectedPoint) {
    return 'Pick a point on the captured frame first.';
  }
  if (!inspectState.instruction.trim()) {
    return 'Write an instruction before sending.';
  }
  return 'Inspect prompt is incomplete.';
}
