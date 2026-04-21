export const MOBILE_PAGE_STYLES_BASE_VIEWS = `    .mobile-view-tabs {
      margin-top: 12px;
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: thin;
    }
    .mobile-view-tab {
      flex: 1 1 0;
      min-width: 100px;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 9px 10px;
      background: linear-gradient(180deg, rgba(10, 18, 35, 0.94), rgba(8, 17, 33, 0.9));
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
    }
    .mobile-view-tab.active {
      color: var(--text);
      background: linear-gradient(180deg, rgba(18, 33, 59, 0.95), rgba(13, 26, 49, 0.92));
      border-color: var(--border-strong);
    }
    .mobile-view-tab:disabled {
      opacity: 0.45;
    }
    .mobile-view-pane {
      display: none;
      margin-top: 12px;
    }
    .mobile-view-pane.active {
      display: block;
      animation: pane-enter 160ms ease;
    }
    @keyframes pane-enter {
      0% { opacity: 0; transform: translateY(6px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    .terminal-toolbar {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .terminal-toolbar .btn.slim.active {
      border-color: var(--border-strong);
      color: #ffffff;
      background: linear-gradient(180deg, rgba(22, 46, 85, 0.95), rgba(15, 32, 59, 0.9));
    }
    .terminal {
      width: 100%;
      min-height: 320px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background:
        linear-gradient(180deg, rgba(7, 12, 24, 0.9), rgba(4, 8, 16, 0.93)),
        repeating-linear-gradient(180deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 26px);
      padding: 12px 12px 14px;
      margin-top: 0;
      font-family: "Fira Code", "SFMono-Regular", "Menlo", "Monaco", "Cascadia Mono", "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      overflow-y: auto;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
    }
`;
