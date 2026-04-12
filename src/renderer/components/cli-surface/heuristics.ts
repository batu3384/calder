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
    regions.push({
      label: 'settings panel',
      selection: {
        mode: 'region',
        startRow: boxedStart,
        endRow: boxedEnd,
        startCol: 0,
        endCol: Math.max(...lines.slice(boxedStart, boxedEnd + 1).map((line) => line.length)),
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
