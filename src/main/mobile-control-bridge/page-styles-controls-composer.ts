export const MOBILE_PAGE_STYLES_CONTROLS_COMPOSER = `    .composer {
      display: none;
      margin-top: 10px;
      gap: 8px;
      align-items: center;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      grid-template-areas: "prev input next send";
    }
    .composer.visible { display: grid; }
    .composer input {
      grid-area: input;
      min-width: 0;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: linear-gradient(180deg, rgba(7, 15, 30, 0.95), rgba(6, 13, 28, 0.9));
      color: var(--text);
      padding: 10px 12px;
      font-size: 13px;
    }
    .composer .btn[data-mobile-history-prev] { grid-area: prev; }
    .composer .btn[data-mobile-history-next] { grid-area: next; }
    .composer #send { grid-area: send; }
    .control-head {
      display: grid;
      gap: 7px;
      margin-top: 6px;
      margin-bottom: 8px;
    }
    .control-title {
      font-size: 11px;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--muted);
    }

`;
