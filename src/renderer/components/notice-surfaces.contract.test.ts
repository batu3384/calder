import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const alertSource = readFileSync(new URL('./alert-banner.ts', import.meta.url), 'utf-8');
const updateSource = readFileSync(new URL('./update-banner.ts', import.meta.url), 'utf-8');
const alertsCss = readFileSync(new URL('../styles/alerts.css', import.meta.url), 'utf-8');
const sidebarCss = readFileSync(new URL('../styles/sidebar.css', import.meta.url), 'utf-8');
const primitives = readFileSync(new URL('../styles/primitives.css', import.meta.url), 'utf-8');

describe('notice surfaces contract', () => {
  it('uses structured copy and action groups for inline notices', () => {
    expect(alertSource).toContain('insight-alert-copy');
    expect(alertSource).toContain('insight-alert-actions');
    expect(updateSource).toContain('update-banner-copy');
    expect(updateSource).toContain('update-banner-actions');
  });

  it('styles alerts and update banners through a shared inline-notice shell', () => {
    expect(primitives).toContain('.calder-inline-notice');
    expect(alertsCss).toContain('.insight-alert-copy');
    expect(alertsCss).toContain('.insight-alert-actions');
    expect(sidebarCss).toContain('.update-banner-copy');
    expect(sidebarCss).toContain('.update-banner-actions');
  });
});
