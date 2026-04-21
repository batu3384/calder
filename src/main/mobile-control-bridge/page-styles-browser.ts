export const MOBILE_PAGE_STYLES_BROWSER = `    .browser-controls {
      display: none;
      margin-top: 0;
      gap: 8px;
    }
    .browser-controls.visible {
      display: grid;
    }
    .browser-session-row {
      margin-top: 0;
    }
    .browser-controls-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .browser-controls-grid .btn {
      min-height: 36px;
      font-size: 12px;
    }
    .browser-control-status {
      margin-top: 0;
    }
    .browser-inspect-selection {
      margin: 2px 0 0;
      font-size: 12px;
      line-height: 1.4;
      color: var(--muted);
      min-height: 18px;
    }
    .browser-inspect-composer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      margin-top: 2px;
    }
    .browser-inspect-composer input {
      min-height: 36px;
    }
    .browser-inspect-composer .btn {
      min-height: 36px;
      white-space: nowrap;
      padding-inline: 12px;
    }
`;
