import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('./custom-select.ts', import.meta.url), 'utf-8');

describe('custom select floating surface contract', () => {
  it('anchors dropdowns through the shared floating surface helper', () => {
    expect(source).toContain('anchorFloatingSurface');
    expect(source).toContain('FloatingSurfaceOptions');
    expect(source).toContain('let floatingCleanup');
    expect(source).toContain('anchorFloatingSurface(trigger, dropdown');
    expect(source).toContain('floatingCleanup?.()');
  });

  it('supports caller-controlled floating placement and open-state hooks', () => {
    expect(source).toContain('export interface CustomSelectConfig');
    expect(source).toContain('floating?: FloatingSurfaceOptions | false;');
    expect(source).toContain('onOpenChange?: (open: boolean) => void;');
    expect(source).toContain('...config.floating');
    expect(source).toContain('config.onOpenChange?.(true);');
    expect(source).toContain('config.onOpenChange?.(false);');
    expect(source).toContain('event.composedPath');
    expect(source).toContain('eventTargetsCurrentSelect');
    expect(source).toContain("document.addEventListener('pointerdown', onOutsidePointerDown);");
  });

  it('locks dropdown width to trigger width to avoid full-page expansion', () => {
    expect(source).toContain('trigger.getBoundingClientRect().width');
    expect(source).toContain('dropdown.style.minWidth =');
  });

  it('lets fast inline controls opt out of floating-ui and update value in place', () => {
    expect(source).toContain('floating?: FloatingSurfaceOptions | false;');
    expect(source).toContain("wrapper.dataset.floating = config.floating === false ? 'inline' : 'floating';");
    expect(source).toContain('setValue(value: string): void;');
    expect(source).toContain('if (config.floating !== false)');
  });
});
