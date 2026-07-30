// ponytail: cross-origin iframe capture needs CDP/frame-tree bridge; upgrade via main-process debugger attach.
export function isCrossOriginFrameSrc(src: string | null | undefined, parentHref: string): boolean {
  const trimmed = src?.trim();
  if (!trimmed || trimmed === 'about:blank') return false;

  try {
    const parentOrigin = new URL(parentHref).origin;
    const resolved = new URL(trimmed, parentHref);
    if (resolved.protocol === 'about:') return false;
    return resolved.origin !== parentOrigin;
  } catch {
    return true;
  }
}

export function isCrossOriginFrameElement(el: Element): boolean {
  const tag = el.tagName;
  if (tag !== 'IFRAME' && tag !== 'FRAME') return false;

  const frame = el as HTMLIFrameElement;
  try {
    const childWindow = frame.contentWindow;
    if (!childWindow) return true;
    if (frame.contentDocument) return false;

    return isCrossOriginFrameSrc(frame.getAttribute('src'), window.location.href);
  } catch {
    return true;
  }
}
