export const MOBILE_PAGE_STYLES_CONTROLS_QUICK = `    .quick-controls {
      display: none;
      margin-top: 10px;
      gap: 10px;
    }
    .quick-controls.visible {
      display: grid;
    }
    .quick-controls-title {
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .quick-controls-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .quick-controls-grid .btn {
      width: 100%;
      min-height: 38px;
      padding: 9px 8px;
      font-size: 12px;
    }
    .quick-controls-grid .btn[data-control="up"],
    .quick-controls-grid .btn[data-control="left"],
    .quick-controls-grid .btn[data-control="down"],
    .quick-controls-grid .btn[data-control="right"] {
      font-size: 14px;
      font-weight: 700;
    }
`;
