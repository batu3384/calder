/**
 * Tooltip system using floating-ui for positioning.
 * Provides styled, accessible tooltips with delay support.
 */

import { autoUpdate, computePosition, flip, offset, type Placement,shift } from '@floating-ui/dom';

export interface TooltipOptions {
  content: string;
  placement?: Placement;
  delay?: number;
  maxWidth?: number;
}

interface TooltipInstance {
  show(): void;
  hide(): void;
  destroy(): void;
}

let activeTooltip: TooltipInstance | null = null;

function createTooltipEl(content: string, maxWidth?: number): HTMLElement {
  const tooltip = document.createElement('div');
  tooltip.className = 'calder-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.textContent = content;
  tooltip.appendChild(text);

  if (maxWidth) {
    tooltip.style.maxWidth = `${maxWidth}px`;
  }

  return tooltip;
}

export function showTooltip(target: HTMLElement, options: TooltipOptions): TooltipInstance {
  const { content, placement = 'top', delay = 300, maxWidth } = options;

  const tooltipEl = createTooltipEl(content, maxWidth);
  let showTimer: number | null = null;
  let isVisible = false;
  let cleanupAutoUpdate: (() => void) | null = null;

  const hide = () => {
    if (showTimer !== null) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (isVisible) {
      tooltipEl.classList.remove('visible');
      tooltipEl.setAttribute('aria-hidden', 'true');
      isVisible = false;
    }
    if (cleanupAutoUpdate) {
      cleanupAutoUpdate();
      cleanupAutoUpdate = null;
    }
  };

  const show = () => {
    hide();
    showTimer = window.setTimeout(() => {
      showTimer = null;

      document.body.appendChild(tooltipEl);

      cleanupAutoUpdate = autoUpdate(target, tooltipEl, () => {
        computePosition(target, tooltipEl, {
          placement,
          middleware: [offset(8), flip(), shift({ padding: 4 })],
        }).then((pos) => {
          tooltipEl.style.left = `${pos.x}px`;
          tooltipEl.style.top = `${pos.y}px`;
        });
      });

      tooltipEl.classList.add('visible');
      tooltipEl.setAttribute('aria-hidden', 'false');
      isVisible = true;

      if (activeTooltip && activeTooltip !== tooltipInstance) {
        activeTooltip.hide();
      }
      activeTooltip = tooltipInstance;
    }, delay);
  };

  const destroy = () => {
    hide();
    tooltipEl.remove();
    if (activeTooltip === tooltipInstance) {
      activeTooltip = null;
    }
  };

  const tooltipInstance: TooltipInstance = { show, hide, destroy };
  return tooltipInstance;
}

export function enableTooltip(target: HTMLElement, options: TooltipOptions): () => void {
  const instance = showTooltip(target, options);

  target.addEventListener('mouseenter', instance.show);
  target.addEventListener('mouseleave', instance.hide);
  target.addEventListener('focus', instance.show);
  target.addEventListener('blur', instance.hide);

  return () => {
    target.removeEventListener('mouseenter', instance.show);
    target.removeEventListener('mouseleave', instance.hide);
    target.removeEventListener('focus', instance.show);
    target.removeEventListener('blur', instance.hide);
    instance.destroy();
  };
}