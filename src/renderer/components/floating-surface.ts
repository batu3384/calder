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
  } = options;

  const update = async () => {
    const { x, y } = await computePosition(reference, floating, {
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
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
    });
  };

  const cleanup = autoUpdate(reference, floating, update);
  void update();
  return cleanup;
}
