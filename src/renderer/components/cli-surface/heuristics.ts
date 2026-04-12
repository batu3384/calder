import type { SurfaceSelectionRange } from '../../../shared/types.js';

export interface InferredCliRegion {
  label: string;
  selection: SurfaceSelectionRange;
}

export function inferCliRegions(lines: string[]): InferredCliRegion[] {
  const regions: InferredCliRegion[] = [];

  const boxedStart = lines.findIndex((line) => /^[╭┌]/.test(line));
  const boxedEnd = boxedStart >= 0
    ? lines.findIndex((line, index) => index >= boxedStart && /^[╰└]/.test(line))
    : -1;

  if (boxedStart >= 0 && boxedEnd >= boxedStart) {
    const titleLine = lines[boxedStart]?.toLowerCase() ?? '';
    const boxedLabel = /(delete|remove|warning|error|confirm|\?)/i.test(titleLine)
      ? 'dialog'
      : 'settings panel';
    regions.push({
      label: boxedLabel,
      selection: {
        mode: 'region',
        startRow: boxedStart,
        endRow: boxedEnd,
        startCol: 0,
        endCol: Math.max(...lines.slice(boxedStart, boxedEnd + 1).map((line) => line.length)),
      },
    });
  }

  const taskLinePattern = /^\s*(?:[-*•]|\[\s?[xX ]\]|\d+[.)])\s+/;
  let taskStart = -1;
  let taskEnd = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (taskLinePattern.test(lines[index] ?? '')) {
      if (taskStart === -1) taskStart = index;
      taskEnd = index;
      continue;
    }
    if (taskStart !== -1) break;
  }

  if (taskStart >= 0 && taskEnd >= taskStart + 1) {
    regions.push({
      label: 'task list',
      selection: {
        mode: 'line',
        startRow: taskStart,
        endRow: taskEnd,
        startCol: 0,
        endCol: Math.max(...lines.slice(taskStart, taskEnd + 1).map((line) => line.length)),
      },
    });
  }

  const footerRow = lines.findIndex((line) =>
    /\[[^\]]+\]/.test(line) && /(restart|quit|open|save|cancel)/i.test(line),
  );
  if (footerRow >= 0) {
    regions.push({
      label: 'footer actions',
      selection: {
        mode: 'line',
        startRow: footerRow,
        endRow: footerRow,
        startCol: 0,
        endCol: lines[footerRow].length,
      },
    });
  }

  return regions;
}
