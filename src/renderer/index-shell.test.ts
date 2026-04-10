import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf-8');

describe('index shell contract', () => {
  it('exposes cockpit wrappers for sidebar and top bar chrome', () => {
    expect(html).toContain('class="sidebar-title-group"');
    expect(html).toContain('class="sidebar-brand-block"');
    expect(html).toContain('class="tab-bar-main"');
    expect(html).toContain('class="tab-bar-meta"');
  });
});
