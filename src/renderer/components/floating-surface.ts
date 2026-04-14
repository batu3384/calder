import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
  type Placement,
} from '@floating-ui/dom';

export type FloatingPlacement = Extract<
  Placement,
  'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-start' | 'left-start'
>;

export interface FloatingSurfaceOptions {
  placement?: FloatingPlacement;
  offsetPx?: number;
  maxWidthPx?: number;
  maxHeightPx?: number;
  strategy?: 'absolute' | 'fixed';
}

export function anchorFloatingSurface(
  reference: HTMLElement,
  floating: HTMLElement,
  options: FloatingSurfaceOptions = {},
): () => void {
  const {
    placement = 'bottom-start',
    offsetPx = 8,
    maxWidthPx = 420,
    maxHeightPx = 420,
    strategy = 'fixed',
  } = options;

  const previousVisibility = floating.style.visibility;
  let revealed = false;
  floating.style.visibility = 'hidden';

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    floating.style.visibility = previousVisibility;
  };

  const update = async () => {
    const { x, y } = await computePosition(reference, floating, {
      strategy,
      placement,
      middleware: [
        offset(offsetPx),
        flip(),
        shift({ padding: 8 }),
        size({
          padding: 8,
          apply({ availableWidth, availableHeight, elements }) {
            Object.assign(elements.floating.style, {
              maxWidth: `${Math.max(180, Math.min(maxWidthPx, availableWidth))}px`,
              maxHeight: `${Math.max(120, Math.min(maxHeightPx, availableHeight))}px`,
            });
          },
        }),
      ],
    });

    Object.assign(floating.style, {
      position: strategy,
      left: `${x}px`,
      top: `${y}px`,
      right: 'auto',
      bottom: 'auto',
    });
    reveal();
  };

  const cleanup = autoUpdate(reference, floating, update);
  void update().catch(() => reveal());
  return () => {
    cleanup();
    floating.style.visibility = previousVisibility;
  };
}
