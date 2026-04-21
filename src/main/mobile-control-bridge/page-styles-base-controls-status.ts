export const MOBILE_PAGE_STYLES_BASE_CONTROLS_STATUS = `    .status {
      margin-top: 8px;
      font-size: 12px;
      color: var(--muted);
      min-height: 18px;
      border-left: 2px solid transparent;
      padding-left: 8px;
    }
    .status.error { color: var(--danger); }
    .status.ok { color: var(--ok); }
    .status.error { border-left-color: rgba(255, 125, 136, 0.6); }
    .status.ok { border-left-color: rgba(84, 207, 156, 0.64); }
    .status-grid {
      display: grid;
      gap: 8px;
    }
    .stage-rail {
      margin-top: 11px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
    }
    .stage-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 1px solid rgba(125, 160, 240, 0.28);
      background: rgba(10, 19, 36, 0.72);
      color: #adc0e8;
      min-height: 34px;
      padding: 7px 10px;
      font-size: 11px;
      letter-spacing: 0.045em;
      text-transform: uppercase;
      transition: border-color 160ms ease, color 160ms ease, background 160ms ease, box-shadow 160ms ease;
      text-align: center;
    }
    .stage-chip.active {
      border-color: rgba(127, 169, 255, 0.76);
      color: #e7f0ff;
      box-shadow: 0 0 0 1px rgba(127, 169, 255, 0.28) inset;
    }
    .stage-chip.done {
      border-color: rgba(84, 207, 156, 0.74);
      color: #dff8ec;
      background: rgba(11, 36, 31, 0.8);
    }

`;
