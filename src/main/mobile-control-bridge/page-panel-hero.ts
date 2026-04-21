import type { MobilePageCopy } from './copy';

export function renderHeroPanel(copy: MobilePageCopy): string {
  return `<section class="panel hero-panel">
      <div class="hero-kicker">${copy.heroKicker}</div>
      <h1>${copy.heading}</h1>
      <p>${copy.heroBody}</p>
      <div class="otp-row">
        <input id="otp" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${copy.otpPlaceholder}" />
        <button id="connect" class="btn" disabled>${copy.verifyConnect}</button>
      </div>
      <div class="otp-meta">${copy.otpMeta}</div>
      <div class="otp-helper">${copy.otpHelper}</div>
      <div id="status" class="status">${copy.waitingOtp}</div>
    </section>`;
}
