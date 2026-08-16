import { MAX_DELTA_TIME_SEC } from './types.js';

export interface GameLoopCallbacks {
  update: (dt: number) => void;
  render: (ctx: CanvasRenderingContext2D) => void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function startGameLoop(canvas: HTMLCanvasElement, callbacks: GameLoopCallbacks): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  ctx.imageSmoothingEnabled = false;
  let lastTime = 0;
  let rafId = 0;
  let stopped = false;
  const reducedMotion = prefersReducedMotion();

  const frame = (time: number): void => {
    if (stopped) return;
    const dt = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, MAX_DELTA_TIME_SEC);
    lastTime = time;
    if (!reducedMotion) {
      callbacks.update(dt);
      ctx.imageSmoothingEnabled = false;
      callbacks.render(ctx);
    }
    rafId = requestAnimationFrame(frame);
  };

  if (reducedMotion) {
    callbacks.update(0);
    ctx.imageSmoothingEnabled = false;
    callbacks.render(ctx);
    return () => {
      stopped = true;
    };
  }

  rafId = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
  };
}
