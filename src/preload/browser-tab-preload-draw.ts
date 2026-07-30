import { ipcRenderer } from 'electron';

export interface BrowserTabDrawModeDeps {
  exitInspectMode: () => void;
  exitFlowMode: () => void;
}

export function createBrowserTabDrawMode(deps: BrowserTabDrawModeDeps) {
  let drawMode = false;
  let drawCanvas: HTMLCanvasElement | null = null;
  let drawCtx: CanvasRenderingContext2D | null = null;
  let drawing = false;
  let strokeCompleted = false;

  function applyDrawStyles(ctx: CanvasRenderingContext2D): void {
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ff3b30';
  }

  function ensureDrawCanvas(): HTMLCanvasElement {
    if (!drawCanvas) {
      drawCanvas = document.createElement('canvas');
      drawCanvas.setAttribute('data-calder-overlay', 'true');
      const penSvg =
        "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 -960 960 960'>" +
        "<path fill='black' stroke='white' stroke-width='90' stroke-linejoin='round' paint-order='stroke' " +
        "d='M180.18-144q-15.18 0-25.68-10.3-10.5-10.29-10.5-25.52v-86.85q0-14.33 5-27.33 5-13 16-24l477-477q11-11 23.84-16 12.83-5 27-5 14.16 0 27.16 5t24 16l51 51q11 11 16 24t5 26.54q0 14.45-5.02 27.54T795-642L318-165q-11 11-23.95 16t-27.24 5h-86.63ZM693-642l51-51-51-51-51 51 51 51Z'/>" +
        '</svg>';
      drawCanvas.style.cssText =
        'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
        'z-index:2147483646;pointer-events:auto;' +
        `cursor:url("data:image/svg+xml;utf8,${penSvg}") 5 24, crosshair;` +
        'background:transparent;';
      drawCanvas.width = window.innerWidth;
      drawCanvas.height = window.innerHeight;
      document.documentElement.appendChild(drawCanvas);
      drawCtx = drawCanvas.getContext('2d');
      if (drawCtx) applyDrawStyles(drawCtx);
    }
    return drawCanvas;
  }

  function onDrawPointerDown(e: PointerEvent): void {
    if (!drawMode || !drawCtx) return;
    e.preventDefault();
    e.stopPropagation();
    if (drawCanvas?.hasPointerCapture && drawCanvas.setPointerCapture) {
      try {
        if (!drawCanvas.hasPointerCapture(e.pointerId)) drawCanvas.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture can fail on synthetic/untrusted events.
      }
    }
    if (strokeCompleted && drawCanvas) {
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      strokeCompleted = false;
    }
    drawing = true;
    drawCtx.beginPath();
    drawCtx.moveTo(e.clientX, e.clientY);
  }

  function onDrawPointerMove(e: PointerEvent): void {
    if (!drawMode || !drawing || !drawCtx) return;
    e.preventDefault();
    drawCtx.lineTo(e.clientX, e.clientY);
    drawCtx.stroke();
  }

  function onDrawPointerUp(e: PointerEvent): void {
    if (!drawMode || !drawing) return;
    e.preventDefault();
    if (drawCanvas?.hasPointerCapture && drawCanvas.releasePointerCapture) {
      try {
        if (drawCanvas.hasPointerCapture(e.pointerId))
          drawCanvas.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release failures; stroke completion still proceeds.
      }
    }
    drawing = false;
    strokeCompleted = true;
    ipcRenderer.sendToHost('draw-stroke-end', { x: e.clientX, y: e.clientY });
  }

  function onDrawResize(): void {
    if (!drawCanvas || !drawCtx) return;
    const tmp = document.createElement('canvas');
    tmp.width = drawCanvas.width;
    tmp.height = drawCanvas.height;
    tmp.getContext('2d')?.drawImage(drawCanvas, 0, 0);
    drawCanvas.width = window.innerWidth;
    drawCanvas.height = window.innerHeight;
    applyDrawStyles(drawCtx);
    drawCtx.drawImage(tmp, 0, 0);
  }

  function enterDrawMode(): void {
    deps.exitInspectMode();
    deps.exitFlowMode();
    drawMode = true;
    strokeCompleted = false;
    const canvas = ensureDrawCanvas();
    canvas.style.display = 'block';
    canvas.addEventListener('pointerdown', onDrawPointerDown, true);
    canvas.addEventListener('pointermove', onDrawPointerMove, true);
    canvas.addEventListener('pointerup', onDrawPointerUp, true);
    canvas.addEventListener('pointercancel', onDrawPointerUp, true);
    window.addEventListener('resize', onDrawResize);
  }

  function exitDrawMode(): void {
    drawMode = false;
    drawing = false;
    strokeCompleted = false;
    if (drawCanvas) {
      drawCanvas.removeEventListener('pointerdown', onDrawPointerDown, true);
      drawCanvas.removeEventListener('pointermove', onDrawPointerMove, true);
      drawCanvas.removeEventListener('pointerup', onDrawPointerUp, true);
      drawCanvas.removeEventListener('pointercancel', onDrawPointerUp, true);
      if (drawCtx) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      drawCanvas.remove();
      drawCanvas = null;
      drawCtx = null;
    }
    window.removeEventListener('resize', onDrawResize);
  }

  function clearDrawing(): void {
    if (drawCtx && drawCanvas) {
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    }
    strokeCompleted = false;
  }

  return {
    isActive: () => drawMode,
    enterDrawMode,
    exitDrawMode,
    clearDrawing,
  };
}
