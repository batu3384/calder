export const MOBILE_PAGE_STYLES_BASE_CONTROLS_BUTTONS = `    .btn {
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 10px 14px;
      background: linear-gradient(180deg, #5a99ff, var(--accent-strong));
      color: #f7fbff;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.01em;
      transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease, background 160ms ease;
      box-shadow: 0 10px 20px rgba(40, 91, 203, 0.34);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:hover:not([disabled]) {
      filter: brightness(1.06);
      box-shadow: 0 12px 24px rgba(40, 91, 203, 0.36);
      transform: translateY(-1px);
    }
    .btn:active { transform: translateY(1px); }
    .btn[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
      box-shadow: none;
    }
    .btn.secondary {
      background: linear-gradient(180deg, rgba(22, 34, 60, 0.94), rgba(12, 24, 44, 0.88));
      border-color: var(--border);
      color: var(--text);
      box-shadow: none;
    }
    .btn.ghost {
      background: rgba(10, 20, 36, 0.72);
      border-color: rgba(131, 168, 246, 0.34);
      box-shadow: none;
      color: #d9e6ff;
    }
    .btn.slim {
      padding: 8px 10px;
      font-size: 12px;
      border-radius: 10px;
    }

`;
