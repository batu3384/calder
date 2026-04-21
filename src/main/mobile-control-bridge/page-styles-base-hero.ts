export const MOBILE_PAGE_STYLES_BASE_HERO = `    .hero-kicker {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #bfd0ff;
    }
    .hero-kicker::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: linear-gradient(180deg, #78adff, #4b8aff);
      box-shadow: 0 0 0 4px rgba(92, 142, 255, 0.15);
    }
    .otp-row {
      margin-top: 12px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
    }
    .otp-meta {
      margin-top: 8px;
      font-size: 11px;
      color: var(--muted);
      opacity: 0.9;
    }
    .otp-helper {
      margin-top: 6px;
      font-size: 11px;
      line-height: 1.45;
      color: #b6c6e8;
    }
    .otp {
      width: 100%;
      min-width: 0;
      padding: 11px 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(7, 15, 30, 0.95), rgba(6, 13, 28, 0.9));
      color: var(--text);
      letter-spacing: 0.24em;
      font-size: 20px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
`;
