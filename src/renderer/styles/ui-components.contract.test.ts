import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('ui-components stylesheet contract', () => {
  it('is imported from the renderer stylesheet entrypoint', () => {
    const stylesSource = readFileSync(path.join(process.cwd(), 'src/renderer/styles.css'), 'utf8');
    expect(stylesSource).toContain("./styles/ui-components.css");
  });
});
