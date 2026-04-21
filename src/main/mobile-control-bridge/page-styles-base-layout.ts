export const MOBILE_PAGE_STYLES_BASE_LAYOUT = `    :root {
      color-scheme: dark;
      --bg: #060a14;
      --bg-alt: #0a1326;
      --panel: rgba(11, 20, 38, 0.78);
      --panel-strong: rgba(14, 25, 46, 0.9);
      --border: rgba(120, 163, 255, 0.28);
      --border-strong: rgba(146, 182, 255, 0.48);
      --text: #e9f1ff;
      --muted: #9fb0d6;
      --accent: #4d8dff;
      --accent-strong: #2f73ff;
      --accent-soft: rgba(77, 141, 255, 0.2);
      --danger: #ff7d88;
      --ok: #54cf9c;
      --shadow: 0 24px 48px rgba(1, 5, 14, 0.5);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Fira Sans", "Avenir Next", "SF Pro Text", "Segoe UI", "Helvetica Neue", sans-serif;
      background:
        radial-gradient(circle at 14% 18%, rgba(42, 109, 255, 0.44) 0%, rgba(42, 109, 255, 0) 42%),
        radial-gradient(circle at 86% 4%, rgba(74, 203, 255, 0.24) 0%, rgba(74, 203, 255, 0) 34%),
        linear-gradient(165deg, var(--bg-alt) 0%, var(--bg) 52%, #050913 100%);
      color: var(--text);
      min-height: 100vh;
      padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
      position: relative;
      overflow-x: hidden;
      overscroll-behavior-y: contain;
    }
    body::before,
    body::after {
      content: "";
      position: fixed;
      width: 52vmax;
      height: 52vmax;
      border-radius: 999px;
      filter: blur(34px);
      opacity: 0.2;
      pointer-events: none;
      z-index: 0;
      animation: aurora-drift 22s ease-in-out infinite alternate;
    }
    body::before {
      top: -22vmax;
      right: -18vmax;
      background: radial-gradient(circle at 32% 40%, rgba(86, 165, 255, 0.95) 0%, rgba(86, 165, 255, 0) 65%);
    }
    body::after {
      bottom: -24vmax;
      left: -16vmax;
      background: radial-gradient(circle at 56% 52%, rgba(70, 236, 187, 0.68) 0%, rgba(70, 236, 187, 0) 70%);
      animation-delay: 1.2s;
    }
    @keyframes aurora-drift {
      0% { transform: translate3d(0, 0, 0) scale(1); }
      100% { transform: translate3d(3vmax, -2vmax, 0) scale(1.06); }
    }
    .shell {
      position: relative;
      z-index: 1;
      max-width: 680px;
      margin: 0 auto;
      display: grid;
      gap: 14px;
    }
    .panel {
      background:
        linear-gradient(165deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015) 35%, rgba(255,255,255,0) 100%),
        var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 15px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .hero-panel {
      background:
        radial-gradient(circle at 8% 10%, rgba(91, 157, 255, 0.22) 0%, rgba(91, 157, 255, 0) 44%),
        linear-gradient(165deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015) 40%, rgba(255,255,255,0) 100%),
        var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 21px;
      line-height: 1.15;
      letter-spacing: -0.015em;
      font-weight: 700;
    }
    p { margin: 7px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
`;
