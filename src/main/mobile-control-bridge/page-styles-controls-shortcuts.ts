export const MOBILE_PAGE_STYLES_CONTROLS_SHORTCUTS = `    .shortcut-toggle-row {
      display: none;
    }
    .shortcut-toggle-row.visible {
      display: block;
    }
    .shortcut-toggle-row .btn {
      width: 100%;
      justify-content: center;
    }
    .shortcut-toggle-row .btn.active {
      border-color: var(--border-strong);
      background: linear-gradient(180deg, rgba(21, 44, 80, 0.96), rgba(15, 31, 58, 0.92));
      color: #f3f8ff;
    }
    .shortcut-hint {
      font-size: 11px;
      line-height: 1.4;
      color: var(--muted);
      margin-top: -2px;
    }
    .command-chip-list {
      display: none;
      margin-top: 8px;
      gap: 6px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .command-chip-list.visible {
      display: grid;
    }
    .command-chip {
      text-align: left;
      justify-content: flex-start;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

`;
