/** Soft chime for Pixel Office permission / done transitions. */
let audioCtx: AudioContext | null = null;

export function playOfficeChime(kind: 'permission' | 'done'): void {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = kind === 'permission' ? 740 : 988;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // ignore autoplay / AudioContext errors
  }
}
