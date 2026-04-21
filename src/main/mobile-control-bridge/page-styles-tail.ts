export const MOBILE_PAGE_STYLES_TAIL = `    .badge {
      display: inline-flex;
      align-items: center;
      padding: 5px 9px;
      border-radius: 999px;
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: rgba(9, 18, 34, 0.78);
    }
    input:focus-visible,
    select:focus-visible,
    button:focus-visible {
      outline: 2px solid rgba(142, 183, 255, 0.95);
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        animation: none !important;
        transition: none !important;
      }
    }
    @media (max-width: 520px) {
      .panel {
        padding: 13px;
        border-radius: 16px;
      }
      .otp-row {
        grid-template-columns: 1fr;
      }
      .session-switch-row {
        grid-template-columns: 1fr;
      }
      .command-chip-list {
        grid-template-columns: 1fr;
      }
      .browser-inspect-composer {
        grid-template-columns: 1fr;
      }
      .stage-rail {
        grid-template-columns: 1fr;
      }
      .composer.visible {
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas:
          "prev input next"
          "send send send";
      }
      .composer #send {
        width: 100%;
      }
      .terminal {
        min-height: 268px;
      }
    }`;
