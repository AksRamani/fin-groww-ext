/**
 * FinGroww Paper Trading - Multi-Tab IDE Status Bar & Realtime Monitor
 * Features:
 * - Green border for profit positions, red border for loss positions
 * - Percentage of profit and loss in status bar and detailed table
 * - Clicking "-" toggles the detailed positions table
 * - Detailed table rows with red/green backgrounds, borders, and colored % pills
 * - Real-time profile & live price synchronization across ALL tabs
 * - Individual ✕ Exit button for every open position
 * - Removed Exit Bar button (status bar stays clean and always available)
 * - Compact profile selector directly on the status bar
 * - Real-time green/red price flash animations on every price tick
 * - Filtered leaderboard ranking computed strictly from active/running profiles
 */

(function () {
  // Prevent duplicate injection in the same tab/frame
  if (window.__FINGROWW_STATUSBAR_INJECTED__) return;
  window.__FINGROWW_STATUSBAR_INJECTED__ = true;

  // Only inject in top window (not inside iframes)
  if (window.top !== window.self) return;

  const STATUSBAR_CSS = `
    * {
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    /* Fixed Bottom Status Bar */
    #fg-ide-statusbar {
      position: fixed !important;
      bottom: 0px !important;
      left: 0px !important;
      right: 0px !important;
      width: 100% !important;
      height: 38px !important;
      background: #0d1117 !important;
      background-color: rgba(13, 17, 23, 0.98) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      border-top: 1px solid #30363d !important;
      color: #c9d1d9 !important;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
      font-size: 12px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 0 10px !important;
      box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.8) !important;
      user-select: none !important;
      line-height: 1.4 !important;
      pointer-events: auto !important;
      z-index: 2147483647 !important;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }

    #fg-ide-statusbar.fg-minimized {
      transform: translateY(100%) !important;
    }

    /* Floating Restore Button when Minimized (Draggable anywhere on screen) */
    #fg-ide-restore-btn {
      position: fixed !important;
      bottom: 12px;
      right: 18px;
      background: #161b22 !important;
      border: 1px solid #38bdf8 !important;
      color: #38bdf8 !important;
      border-radius: 20px !important;
      padding: 5px 12px !important;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      display: none;
      align-items: center !important;
      gap: 6px !important;
      cursor: grab !important;
      user-select: none !important;
      -webkit-user-select: none !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.7), 0 0 10px rgba(56, 189, 248, 0.3) !important;
      transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease !important;
      touch-action: none !important;
    }

    #fg-ide-restore-btn:hover {
      background: #1c2128 !important;
      border-color: #58a6ff !important;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.8), 0 0 14px rgba(56, 189, 248, 0.45) !important;
    }

    #fg-ide-restore-btn.fg-dragging {
      cursor: grabbing !important;
      opacity: 0.95 !important;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.9), 0 0 18px rgba(56, 189, 248, 0.6) !important;
      transform: scale(1.05) !important;
      transition: none !important;
    }

    /* Left Group: Profile selector, Overall P&L, Running Rank */
    .fg-bar-left {
      display: flex !important;
      align-items: center !important;
      gap: 7px !important;
      flex-shrink: 0 !important;
    }

    /* Compact Profile Selector */
    .fg-profile-select-chip {
      display: inline-flex !important;
      align-items: center !important;
      gap: 4px !important;
      background: #161b22 !important;
      border: 1px solid #30363d !important;
      border-radius: 4px !important;
      padding: 2px 7px !important;
      height: 26px !important;
      cursor: pointer !important;
      transition: border-color 0.2s ease !important;
    }

    .fg-profile-select-chip:hover {
      border-color: #58a6ff !important;
    }

    .fg-chip-icon {
      font-size: 11px !important;
      line-height: 1 !important;
    }

    #fg-bar-profile-select {
      background: transparent !important;
      border: none !important;
      color: #58a6ff !important;
      font-family: inherit !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      outline: none !important;
      max-width: 130px !important;
      text-overflow: ellipsis !important;
    }

    #fg-bar-profile-select option {
      background: #161b22 !important;
      color: #c9d1d9 !important;
    }

    /* Overall P&L Pill */
    .fg-pnl-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 3px 9px !important;
      border-radius: 4px !important;
      font-weight: 800 !important;
      font-size: 11px !important;
      white-space: nowrap !important;
      cursor: pointer !important;
    }

    /* Rank Badge among Running Profiles */
    .fg-rank-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 4px !important;
      padding: 2px 7px !important;
      border-radius: 4px !important;
      background: rgba(210, 153, 34, 0.15) !important;
      border: 1px solid rgba(210, 153, 34, 0.35) !important;
      color: #e3b341 !important;
      font-weight: 700 !important;
      font-size: 11px !important;
      white-space: nowrap !important;
    }

    .fg-rank-badge.top-1 {
      background: rgba(255, 215, 0, 0.25) !important;
      border-color: #ffd700 !important;
      color: #ffd700 !important;
    }

    .fg-pnl-positive {
      background: rgba(34, 197, 94, 0.16) !important;
      border: 1px solid rgba(34, 197, 94, 0.4) !important;
      color: #22c55e !important;
    }

    .fg-pnl-negative {
      background: rgba(239, 68, 68, 0.16) !important;
      border: 1px solid rgba(239, 68, 68, 0.4) !important;
      color: #ef4444 !important;
    }

    .fg-pnl-neutral {
      background: #161b22 !important;
      border: 1px solid #30363d !important;
      color: #8b949e !important;
    }

    /* Center Section: Positions Ticker with Maximum Horizontal Space */
    .fg-bar-center {
      flex: 1 !important;
      display: flex !important;
      align-items: center !important;
      overflow: hidden !important;
      margin: 0 10px !important;
      position: relative !important;
      mask-image: linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent) !important;
      -webkit-mask-image: linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent) !important;
    }

    .fg-ticker-track {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
      scroll-behavior: smooth !important;
      padding: 0 12px !important;
      width: 100% !important;
    }

    .fg-ticker-track::-webkit-scrollbar {
      display: none !important;
    }

    /* Position Pill in Ticker */
    .fg-position-tag {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      background: #161b22 !important;
      border: 1px solid #30363d !important;
      padding: 2px 8px !important;
      border-radius: 4px !important;
      font-size: 11px !important;
      white-space: nowrap !important;
      cursor: default !important;
      flex-shrink: 0 !important;
      transition: all 0.2s ease !important;
    }

    /* Green border if position is in profits */
    .fg-position-tag.fg-pos-profit {
      border: 1.5px solid #22c55e !important;
      background: rgba(34, 197, 94, 0.08) !important;
      box-shadow: 0 0 5px rgba(34, 197, 94, 0.25) !important;
    }

    .fg-position-tag.fg-pos-profit:hover {
      border-color: #16a34a !important;
      background: rgba(34, 197, 94, 0.16) !important;
      box-shadow: 0 0 9px rgba(34, 197, 94, 0.4) !important;
    }

    /* Red border if position is in loss */
    .fg-position-tag.fg-pos-loss {
      border: 1.5px solid #ef4444 !important;
      background: rgba(239, 68, 68, 0.08) !important;
      box-shadow: 0 0 5px rgba(239, 68, 68, 0.25) !important;
    }

    .fg-position-tag.fg-pos-loss:hover {
      border-color: #dc2626 !important;
      background: rgba(239, 68, 68, 0.16) !important;
      box-shadow: 0 0 9px rgba(239, 68, 68, 0.4) !important;
    }

    .fg-position-tag.fg-pos-neutral {
      border: 1px solid #30363d !important;
    }

    .fg-pos-side {
      font-weight: 800 !important;
      font-size: 9px !important;
      padding: 1px 4px !important;
      border-radius: 3px !important;
    }

    .fg-pos-side-buy {
      background: rgba(34, 197, 94, 0.2) !important;
      color: #22c55e !important;
    }

    .fg-pos-side-sell {
      background: rgba(239, 68, 68, 0.2) !important;
      color: #ef4444 !important;
    }

    .fg-pos-symbol {
      font-weight: 700 !important;
      color: #f0f6fc !important;
      cursor: pointer !important;
    }

    .fg-pos-ltp {
      font-weight: 700 !important;
      color: #e6edf3 !important;
      padding: 1px 4px !important;
      border-radius: 3px !important;
      transition: background-color 0.4s ease, color 0.4s ease !important;
    }

    /* Real-time price flashes */
    .fg-flash-up {
      background: rgba(34, 197, 94, 0.4) !important;
      color: #22c55e !important;
    }

    .fg-flash-down {
      background: rgba(239, 68, 68, 0.4) !important;
      color: #ef4444 !important;
    }

    .fg-pos-pnl {
      font-weight: 800 !important;
    }

    .fg-pos-pnl.positive {
      color: #22c55e !important;
    }

    .fg-pos-pnl.negative {
      color: #ef4444 !important;
    }

    /* PnL Percentage in status bar */
    .fg-pos-pct {
      font-size: 10px !important;
      font-weight: 800 !important;
      margin-left: 2px !important;
    }

    .fg-pos-pct.positive {
      color: #22c55e !important;
    }

    .fg-pos-pct.negative {
      color: #ef4444 !important;
    }

    /* Individual Position Exit Button */
    .fg-pos-exit-btn {
      background: rgba(239, 68, 68, 0.15) !important;
      border: 1px solid rgba(239, 68, 68, 0.45) !important;
      color: #ff7b72 !important;
      padding: 1px 7px !important;
      border-radius: 3px !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      font-family: inherit !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      margin-left: 4px !important;
      line-height: 1.3 !important;
      white-space: nowrap !important;
    }

    .fg-pos-exit-btn:hover {
      background: #ef4444 !important;
      border-color: #ef4444 !important;
      color: #ffffff !important;
      box-shadow: 0 0 6px rgba(239, 68, 68, 0.4) !important;
    }

    .fg-pos-exit-btn.exiting {
      opacity: 0.6 !important;
      pointer-events: none !important;
      background: #30363d !important;
      color: #8b949e !important;
      border-color: #484f58 !important;
    }

    .fg-no-positions {
      color: #8b949e !important;
      font-size: 11px !important;
      font-style: italic !important;
      padding: 0 10px !important;
      white-space: nowrap !important;
    }

    /* Right Controls */
    .fg-bar-right {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      flex-shrink: 0 !important;
    }

    .fg-status-pill {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      padding: 2px 7px !important;
      border-radius: 12px !important;
      font-size: 10px !important;
      font-weight: 700 !important;
    }

    .fg-status-running {
      background: rgba(34, 197, 94, 0.15) !important;
      border: 1px solid rgba(34, 197, 94, 0.4) !important;
      color: #22c55e !important;
    }

    .fg-status-dot {
      width: 6px !important;
      height: 6px !important;
      border-radius: 50% !important;
      background: #22c55e !important;
      box-shadow: 0 0 8px #22c55e !important;
      animation: fg-pulse 2s infinite !important;
    }

    @keyframes fg-pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
      100% { opacity: 1; transform: scale(1); }
    }

    .fg-btn-icon {
      background: transparent !important;
      border: 1px solid #30363d !important;
      color: #8b949e !important;
      width: 24px !important;
      height: 24px !important;
      border-radius: 4px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      font-size: 12px !important;
      transition: all 0.2s ease !important;
      padding: 0 !important;
    }

    .fg-btn-icon:hover {
      background: #21262d !important;
      color: #f0f6fc !important;
      border-color: #8b949e !important;
    }

    .fg-spin {
      animation: fg-rotate 0.8s linear infinite !important;
    }

    @keyframes fg-rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Expandable Bottom Drawer */
    #fg-ide-drawer {
      position: fixed !important;
      bottom: 38px !important;
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      max-height: 480px !important;
      background: #0d1117 !important;
      background-color: rgba(13, 17, 23, 0.98) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
      border-top: 1px solid #30363d !important;
      box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.8) !important;
      z-index: 2147483646 !important;
      display: none;
      flex-direction: column !important;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
      color: #c9d1d9 !important;
      user-select: none !important;
      pointer-events: auto !important;
    }

    #fg-ide-drawer.fg-drawer-open {
      display: flex !important;
    }

    .fg-drawer-header {
      padding: 10px 16px !important;
      border-bottom: 1px solid #30363d !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      background: #161b22 !important;
    }

    .fg-drawer-title-group {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
    }

    .fg-drawer-title {
      font-weight: 800 !important;
      font-size: 13px !important;
      color: #f0f6fc !important;
    }

    .fg-drawer-select {
      background: #0d1117 !important;
      border: 1px solid #30363d !important;
      color: #58a6ff !important;
      border-radius: 4px !important;
      padding: 3px 8px !important;
      font-family: inherit !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
    }

    .fg-drawer-meta-pill {
      font-size: 11px !important;
      color: #8b949e !important;
      padding: 2px 8px !important;
      background: #0d1117 !important;
      border: 1px solid #30363d !important;
      border-radius: 4px !important;
    }

    .fg-drawer-actions {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }

    .fg-btn-close-all {
      background: rgba(239, 68, 68, 0.15) !important;
      border: 1px solid rgba(239, 68, 68, 0.4) !important;
      color: #ff7b72 !important;
      padding: 4px 10px !important;
      border-radius: 4px !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
    }

    .fg-btn-close-all:hover {
      background: #ef4444 !important;
      color: #ffffff !important;
    }

    .fg-drawer-body {
      overflow-y: auto !important;
      max-height: 420px !important;
      padding: 0 !important;
    }

    .fg-positions-table {
      width: 100% !important;
      border-collapse: collapse !important;
      font-size: 11px !important;
      text-align: left !important;
    }

    .fg-positions-table th {
      background: #161b22 !important;
      color: #8b949e !important;
      font-weight: 600 !important;
      padding: 8px 12px !important;
      border-bottom: 1px solid #30363d !important;
      position: sticky !important;
      top: 0 !important;
      z-index: 2 !important;
    }

    .fg-positions-table td {
      padding: 8px 12px !important;
      border-bottom: 1px solid #21262d !important;
      color: #c9d1d9 !important;
    }

    /* Table Rows: Green for profit, Red for loss */
    .fg-positions-table tr.fg-row-profit td {
      background: rgba(34, 197, 94, 0.07) !important;
      border-bottom: 1px solid rgba(34, 197, 94, 0.22) !important;
    }

    .fg-positions-table tr.fg-row-profit:hover td {
      background: rgba(34, 197, 94, 0.15) !important;
    }

    .fg-positions-table tr.fg-row-profit td:first-child {
      border-left: 4px solid #22c55e !important;
    }

    .fg-positions-table tr.fg-row-loss td {
      background: rgba(239, 68, 68, 0.07) !important;
      border-bottom: 1px solid rgba(239, 68, 68, 0.22) !important;
    }

    .fg-positions-table tr.fg-row-loss:hover td {
      background: rgba(239, 68, 68, 0.15) !important;
    }

    .fg-positions-table tr.fg-row-loss td:first-child {
      border-left: 4px solid #ef4444 !important;
    }

    /* Table Badges for PnL and % */
    .fg-tbl-pill {
      display: inline-block !important;
      padding: 2px 8px !important;
      border-radius: 4px !important;
      font-weight: 800 !important;
      font-size: 11px !important;
      white-space: nowrap !important;
    }

    .fg-tbl-profit {
      background: rgba(34, 197, 94, 0.18) !important;
      color: #22c55e !important;
      border: 1px solid rgba(34, 197, 94, 0.45) !important;
    }

    .fg-tbl-loss {
      background: rgba(239, 68, 68, 0.18) !important;
      color: #ef4444 !important;
      border: 1px solid rgba(239, 68, 68, 0.45) !important;
    }

    /* Hover Details Tooltip / Popover */
    #fg-position-popover {
      position: fixed !important;
      background: #161b22 !important;
      border: 1px solid #38bdf8 !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.9) !important;
      border-radius: 6px !important;
      padding: 10px 14px !important;
      font-size: 11px !important;
      color: #c9d1d9 !important;
      z-index: 2147483647 !important;
      display: none;
      pointer-events: none !important;
      min-width: 250px !important;
    }

    /* Toast Notification */
    #fg-toast {
      position: fixed !important;
      bottom: 46px !important;
      right: 18px !important;
      background: #161b22 !important;
      border: 1px solid #30363d !important;
      color: #f0f6fc !important;
      padding: 8px 14px !important;
      border-radius: 6px !important;
      font-size: 11px !important;
      font-family: inherit !important;
      z-index: 2147483647 !important;
      box-shadow: 0 4px 16px rgba(0,0,0,0.8) !important;
      display: none;
      align-items: center !important;
      gap: 8px !important;
      transition: opacity 0.3s ease !important;
    }
  `;

  let currentProfile = "Aks-new-55k";
  let activePositions = [];
  let accountData = {};
  let leaderboardData = [];
  let profilesList = [];
  let previousPrices = {};
  let isDrawerOpen = false;
  let shadowRoot = null;
  let hostEl = null;

  // Format INR Currency
  function formatInr(val) {
    const num = Number(val) || 0;
    const sign = num < 0 ? "-₹" : "₹";
    return sign + Math.abs(num).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Format Percentage
  function formatPct(val) {
    const num = Number(val) || 0;
    const sign = num > 0 ? "+" : "";
    return `${sign}${num.toFixed(2)}%`;
  }

  // Helper to extract or calculate percentage for a position
  function getPositionPct(pos) {
    let pct = Number(pos.pnl_pct);
    if (!isNaN(pct) && pct !== undefined && pct !== null) {
      return pct;
    }
    const entry = Number(pos.entry_price) || 0;
    const curr = Number(pos.current_price) || entry;
    if (entry > 0) {
      return pos.side === "SELL" 
        ? ((entry - curr) / entry) * 100 
        : ((curr - entry) / entry) * 100;
    }
    return 0;
  }

  // Show Toast
  function showToast(msg, isSuccess = false) {
    const toast = shadowRoot?.getElementById("fg-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.style.borderColor = isSuccess ? "#22c55e" : "#38bdf8";
    toast.style.display = "flex";
    toast.style.opacity = "1";
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => { toast.style.display = "none"; }, 300);
    }, 2800);
  }

  // Create or retrieve Shadow Host
  function createShadowContainer() {
    if (document.getElementById("fingroww-statusbar-host")) {
      hostEl = document.getElementById("fingroww-statusbar-host");
      shadowRoot = hostEl.shadowRoot;
      return;
    }

    hostEl = document.createElement("div");
    hostEl.id = "fingroww-statusbar-host";
    hostEl.style.cssText = "position: fixed !important; bottom: 0 !important; left: 0 !important; width: 100% !important; height: 38px !important; z-index: 2147483647 !important; pointer-events: none !important;";

    shadowRoot = hostEl.attachShadow({ mode: "open" });

    // 1. Inject Styles
    const styleTag = document.createElement("style");
    styleTag.textContent = STATUSBAR_CSS;
    shadowRoot.appendChild(styleTag);

    // 2. Popover Tooltip
    const popover = document.createElement("div");
    popover.id = "fg-position-popover";
    shadowRoot.appendChild(popover);

    // 3. Toast
    const toast = document.createElement("div");
    toast.id = "fg-toast";
    shadowRoot.appendChild(toast);

    // 4. Expandable Drawer Table
    const drawer = document.createElement("div");
    drawer.id = "fg-ide-drawer";
    drawer.innerHTML = `
      <div class="fg-drawer-header">
        <div class="fg-drawer-title-group">
          <span class="fg-drawer-title">⚡ FinGroww Live Positions & Details</span>
          <select class="fg-drawer-select" id="fg-drawer-profile-select" title="Switch Trader Profile">
            <!-- Dynamically populated -->
          </select>
          <span class="fg-drawer-meta-pill" id="fg-drawer-rank">🏆 Rank #--</span>
          <span class="fg-drawer-meta-pill" id="fg-drawer-equity">💰 Equity: ₹0</span>
        </div>
        <div class="fg-drawer-actions">
          <button type="button" class="fg-btn-close-all" id="fg-btn-close-all" title="Close all open trades for this profile">
            <span>⚠️</span> Exit All Positions
          </button>
          <button type="button" class="fg-btn-icon" id="fg-drawer-refresh-btn" title="Refresh Live Data">↻</button>
          <button type="button" class="fg-btn-icon" id="fg-drawer-close-btn" title="Close Drawer Table">✕</button>
        </div>
      </div>
      <div class="fg-drawer-body" id="fg-drawer-table-wrap">
        <!-- Rendered by renderDrawerTable() -->
      </div>
    `;
    shadowRoot.appendChild(drawer);

    // 5. Main Status Bar
    const bar = document.createElement("div");
    bar.id = "fg-ide-statusbar";

    let isInitiallyMinimized = false;
    try {
      if (localStorage.getItem("fg_is_minimized") === "true") {
        isInitiallyMinimized = true;
      }
    } catch (e) {}

    if (isInitiallyMinimized) {
      bar.classList.add("fg-minimized");
    }

    bar.innerHTML = `
      <!-- Left: Profile selector chip, Overall P&L & Running Rank -->
      <div class="fg-bar-left">
        <div class="fg-profile-select-chip" title="Selected Profile (syncs across all tabs in real-time)">
          <span class="fg-chip-icon">👤</span>
          <select id="fg-bar-profile-select" aria-label="Select Trading Profile">
            <option value="${currentProfile}">${currentProfile}</option>
          </select>
        </div>

        <div class="fg-pnl-badge fg-pnl-neutral" id="fg-pnl-badge" title="Overall P&L (Click to open Drawer Table)">
          <span id="fg-pnl-icon">📈</span>
          <span id="fg-pnl-val">P&L: ₹0.00</span>
          <span id="fg-pnl-pct" style="font-size:11px;opacity:0.85;">(0.00%)</span>
        </div>

        <div class="fg-rank-badge" id="fg-rank-badge" title="Rank among running profiles">
          <span>🏆</span>
          <span id="fg-rank-text">Rank #-- Running</span>
        </div>
      </div>

      <!-- Center: Positions Ticker (Maximum Horizontal Space) -->
      <div class="fg-bar-center" id="fg-bar-center">
        <div class="fg-ticker-track" id="fg-ticker-track">
          <!-- Rendered by renderPositionsTicker() -->
        </div>
      </div>

      <!-- Right: Status, Refresh, Drawer Toggle & "-" Minimize Button -->
      <div class="fg-bar-right">
        <div class="fg-status-pill fg-status-running" id="fg-engine-status" title="Trading Engine Status">
          <span class="fg-status-dot"></span>
          <span id="fg-engine-status-text">LIVE</span>
        </div>

        <button type="button" class="fg-btn-icon" id="fg-btn-refresh" title="Real-time Sync Now">
          <span id="fg-sync-icon">↻</span>
        </button>

        <button type="button" class="fg-btn-icon" id="fg-btn-drawer" title="Toggle Detailed Positions Table (▲)">
          <span id="fg-drawer-icon">▲</span>
        </button>

        <button type="button" class="fg-btn-icon" id="fg-btn-minimize" title="Minimize Status Bar (-)">
          <span>—</span>
        </button>
      </div>
    `;
    shadowRoot.appendChild(bar);

    // 6. Floating Restore Badge (Draggable anywhere in the tab)
    const restoreBtn = document.createElement("button");
    restoreBtn.id = "fg-ide-restore-btn";
    restoreBtn.innerHTML = `<span style="opacity:0.6;font-size:10px;cursor:grab;" title="Drag to move">⠿</span> <span>(Alt+S)</span> <span id="fg-restore-pnl" style="font-size:11px;font-weight:800;">P&L: ₹0</span> <span>▲</span>`;
    restoreBtn.title = "Drag to move • Click or press Alt+S to restore status bar";

    // Restore saved position if present
    try {
      const rawPos = localStorage.getItem("fg_pill_pos");
      if (rawPos) {
        const pos = JSON.parse(rawPos);
        if (typeof pos.left === "number" && typeof pos.top === "number") {
          const maxLeft = Math.max(8, window.innerWidth - 180);
          const maxTop = Math.max(8, window.innerHeight - 40);
          restoreBtn.style.left = `${Math.max(8, Math.min(maxLeft, pos.left))}px`;
          restoreBtn.style.top = `${Math.max(8, Math.min(maxTop, pos.top))}px`;
          restoreBtn.style.bottom = "auto";
          restoreBtn.style.right = "auto";
        }
      }
    } catch (e) {}

    if (isInitiallyMinimized) {
      restoreBtn.style.display = "inline-flex";
    }
    shadowRoot.appendChild(restoreBtn);

    setupEventListeners(bar, drawer, restoreBtn);
    renderPositionsTicker({});

    // Attach to document
    if (document.body && hostEl.parentElement !== document.body) {
      document.body.appendChild(hostEl);
    } else if (!document.body && document.documentElement && hostEl.parentElement !== document.documentElement) {
      document.documentElement.appendChild(hostEl);
    }
  }

  function setupEventListeners(bar, drawer, restoreBtn) {
    const refreshBtn = shadowRoot.getElementById("fg-btn-refresh");
    const drawerToggleBtn = shadowRoot.getElementById("fg-btn-drawer");
    const drawerCloseBtn = shadowRoot.getElementById("fg-drawer-close-btn");
    const drawerRefreshBtn = shadowRoot.getElementById("fg-drawer-refresh-btn");
    const minimizeBtn = shadowRoot.getElementById("fg-btn-minimize");
    const pnlBadge = shadowRoot.getElementById("fg-pnl-badge");
    const barProfileSel = shadowRoot.getElementById("fg-bar-profile-select");
    const drawerProfileSel = shadowRoot.getElementById("fg-drawer-profile-select");
    const closeAllBtn = shadowRoot.getElementById("fg-btn-close-all");

    // Profile Selector Handlers
    const onProfileChange = (selected) => {
      if (selected && selected !== currentProfile) {
        currentProfile = selected;
        chrome.runtime.sendMessage({ type: "SET_PROFILE", profile: selected });
        showToast(`Switched profile to [${selected}]`);
      }
    };

    if (barProfileSel) {
      barProfileSel.addEventListener("change", (e) => onProfileChange(e.target.value));
    }
    if (drawerProfileSel) {
      drawerProfileSel.addEventListener("change", (e) => onProfileChange(e.target.value));
    }

    // Refresh Action
    const triggerRefresh = () => {
      const icon = shadowRoot.getElementById("fg-sync-icon");
      if (icon) icon.classList.add("fg-spin");
      chrome.runtime.sendMessage({ type: "FORCE_REFRESH" }, () => {
        setTimeout(() => {
          if (icon) icon.classList.remove("fg-spin");
        }, 600);
      });
    };

    refreshBtn.addEventListener("click", triggerRefresh);
    if (drawerRefreshBtn) drawerRefreshBtn.addEventListener("click", triggerRefresh);

    // Detailed Table Toggle (opened from "▲" button or PnL badge)
    const toggleDrawer = () => {
      isDrawerOpen = !isDrawerOpen;
      drawer.classList.toggle("fg-drawer-open", isDrawerOpen);
      const icon = shadowRoot.getElementById("fg-drawer-icon");
      if (icon) icon.textContent = isDrawerOpen ? "▼" : "▲";
      if (isDrawerOpen) renderDrawerTable();
    };

    drawerToggleBtn.addEventListener("click", toggleDrawer);
    pnlBadge.addEventListener("click", toggleDrawer);
    drawerCloseBtn.addEventListener("click", () => {
      isDrawerOpen = false;
      drawer.classList.remove("fg-drawer-open");
      const icon = shadowRoot.getElementById("fg-drawer-icon");
      if (icon) icon.textContent = "▲";
    });

    // Helper to toggle and persist minimized state across tabs and refreshes
    const setMinimizedState = (minimized) => {
      if (minimized) {
        bar.classList.add("fg-minimized");
        drawer.classList.remove("fg-drawer-open");
        isDrawerOpen = false;
        const icon = shadowRoot.getElementById("fg-drawer-icon");
        if (icon) icon.textContent = "▲";
        restoreBtn.style.display = "inline-flex";
      } else {
        bar.classList.remove("fg-minimized");
        restoreBtn.style.display = "none";
      }
      try {
        localStorage.setItem("fg_is_minimized", minimized ? "true" : "false");
      } catch (e) {}
      chrome.storage.local.set({ fg_is_minimized: !!minimized });
    };

    // Minimize Button ("—"): Hides the status bar and displays the small floating restore pill
    minimizeBtn.addEventListener("click", () => {
      setMinimizedState(true);
    });

    // Close All Positions Action
    closeAllBtn.addEventListener("click", () => {
      if (confirm(`Exit ALL open positions for profile [${currentProfile}]?`)) {
        closeAllBtn.textContent = "Exiting All...";
        chrome.runtime.sendMessage({ type: "CLOSE_ALL_POSITIONS", profile: currentProfile }, (res) => {
          closeAllBtn.innerHTML = `<span>⚠️</span> Exit All Positions`;
          showToast(`All positions closed for [${currentProfile}].`, true);
        });
      }
    });

    // Draggable logic for the minimized restore pill
    const setupDraggablePill = (pill, onRestoreClick) => {
      let isDragging = false;
      let hasMoved = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        isDragging = true;
        hasMoved = false;
        startX = e.clientX;
        startY = e.clientY;

        const rect = pill.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        pill.classList.add("fg-dragging");

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
      };

      const onPointerMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasMoved = true;
        }

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        const pillWidth = pill.offsetWidth || 160;
        const pillHeight = pill.offsetHeight || 32;
        const maxLeft = window.innerWidth - pillWidth - 8;
        const maxTop = window.innerHeight - pillHeight - 8;

        newLeft = Math.max(8, Math.min(maxLeft, newLeft));
        newTop = Math.max(8, Math.min(maxTop, newTop));

        pill.style.left = `${newLeft}px`;
        pill.style.top = `${newTop}px`;
        pill.style.bottom = "auto";
        pill.style.right = "auto";
      };

      const onPointerUp = () => {
        if (!isDragging) return;
        isDragging = false;
        pill.classList.remove("fg-dragging");

        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);

        if (hasMoved) {
          const rect = pill.getBoundingClientRect();
          const pos = { left: Math.round(rect.left), top: Math.round(rect.top) };
          try {
            localStorage.setItem("fg_pill_pos", JSON.stringify(pos));
          } catch (err) {}
          chrome.storage.local.set({ fg_pill_pos: pos });
        } else {
          onRestoreClick();
        }
      };

      pill.addEventListener("pointerdown", onPointerDown);

      window.addEventListener("resize", () => {
        const rect = pill.getBoundingClientRect();
        if (rect.left > 0 || rect.top > 0) {
          const maxLeft = Math.max(8, window.innerWidth - (pill.offsetWidth || 160) - 8);
          const maxTop = Math.max(8, window.innerHeight - (pill.offsetHeight || 32) - 8);
          if (rect.left > maxLeft || rect.top > maxTop) {
            pill.style.left = `${Math.min(rect.left, maxLeft)}px`;
            pill.style.top = `${Math.min(rect.top, maxTop)}px`;
          }
        }
      });
    };

    // Restore Button: Drag to move anywhere in tab, click to restore
    setupDraggablePill(restoreBtn, () => {
      setMinimizedState(false);
    });

    // Keyboard Shortcut (Alt + S)
    window.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        const isMin = bar.classList.contains("fg-minimized");
        setMinimizedState(!isMin);
      }
    });

    // Drag-to-scroll ticker
    const tickerTrack = shadowRoot.getElementById("fg-ticker-track");
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    tickerTrack.addEventListener("mousedown", (e) => {
      if (e.target.closest(".fg-pos-exit-btn")) return;
      isDown = true;
      startX = e.pageX - tickerTrack.offsetLeft;
      scrollLeft = tickerTrack.scrollLeft;
    });

    window.addEventListener("mouseup", () => { isDown = false; });
    tickerTrack.addEventListener("mouseleave", () => { isDown = false; });

    tickerTrack.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - tickerTrack.offsetLeft;
      const walk = (x - startX) * 1.5;
      tickerTrack.scrollLeft = scrollLeft - walk;
    });
  }

  // Handle position exit action
  function handleExitPosition(tradeId, symbol, btnEl) {
    if (!tradeId) return;
    if (btnEl) {
      btnEl.textContent = "Exiting...";
      btnEl.classList.add("exiting");
    }
    showToast(`Exiting position: ${symbol}...`);

    chrome.runtime.sendMessage({
      type: "CLOSE_POSITION",
      profile: currentProfile,
      tradeId: tradeId
    }, (res) => {
      showToast(`Position closed: ${symbol}`, true);
    });
  }

  // Update UI with real-time data received from background sync (Stale-While-Revalidate)
  function applyLatestData(payload) {
    if (!payload || !shadowRoot) return;

    const { profile, account, positions, status, leaderboard, profiles } = payload;
    if (profile) currentProfile = profile;

    // Retain older account metrics if incoming is empty/undefined
    if (account && Object.keys(account).length > 0) {
      accountData = account;
    }

    // Retain older leaderboard if incoming is empty/undefined
    if (leaderboard && Array.isArray(leaderboard) && leaderboard.length > 0) {
      leaderboardData = leaderboard;
    }

    // Retain older profiles list if incoming is empty/undefined
    if (profiles && Array.isArray(profiles) && profiles.length > 0) {
      profilesList = profiles;
    }

    // Positions: Only update if valid. Never wipe older positions with a blank/glitched payload!
    if (positions && Array.isArray(positions)) {
      const isSuspectEmptyPayload = positions.length === 0 && (!account || Object.keys(account).length === 0);
      if (!isSuspectEmptyPayload || activePositions.length === 0) {
        // Track price changes for flash animation
        const flashMap = {};
        positions.forEach((pos) => {
          const key = pos.trade_id || pos.symbol;
          const prev = previousPrices[key];
          const curr = Number(pos.current_price) || 0;
          if (prev !== undefined && prev !== null) {
            if (curr > prev) flashMap[key] = "up";
            else if (curr < prev) flashMap[key] = "down";
          }
          previousPrices[key] = curr;
        });

        activePositions = positions;
        renderPositionsTicker(flashMap);
      }
    } else if (activePositions.length > 0) {
      renderPositionsTicker({});
    }

    renderProfileSelectors();
    renderAccountMetrics(status);
    renderRank();
    renderDrawerMeta();

    if (isDrawerOpen) {
      renderDrawerTable();
    }
  }

  // Render Profile Selectors on bar and drawer
  function renderProfileSelectors() {
    const barSel = shadowRoot?.getElementById("fg-bar-profile-select");
    const drawerSel = shadowRoot?.getElementById("fg-drawer-profile-select");

    if (profilesList && profilesList.length > 0) {
      const optionsHtml = profilesList.map((p) => {
        const u = typeof p === "string" ? p : p.user_name;
        const isSel = u === currentProfile ? "selected" : "";
        return `<option value="${u}" ${isSel}>${u}</option>`;
      }).join("");

      if (barSel && (barSel.innerHTML.length < 50 || barSel.value !== currentProfile)) {
        barSel.innerHTML = optionsHtml;
        barSel.value = currentProfile;
      }
      if (drawerSel && (drawerSel.innerHTML.length < 50 || drawerSel.value !== currentProfile)) {
        drawerSel.innerHTML = optionsHtml;
        drawerSel.value = currentProfile;
      }
    }
  }

  // Render Overall P&L
  function renderAccountMetrics(engineStatusVal) {
    const pnlBadge = shadowRoot.getElementById("fg-pnl-badge");
    const pnlVal = shadowRoot.getElementById("fg-pnl-val");
    const pnlPct = shadowRoot.getElementById("fg-pnl-pct");
    const engineStatus = shadowRoot.getElementById("fg-engine-status");
    const engineText = shadowRoot.getElementById("fg-engine-status-text");
    const restorePnl = shadowRoot.getElementById("fg-restore-pnl");

    const totalPnl = Number(accountData.total_pnl) || 0;
    const retPct = Number(accountData.overall_return_pct) || 0;

    pnlVal.textContent = `P&L: ${formatInr(totalPnl)}`;
    pnlPct.textContent = `(${formatPct(retPct)})`;

    if (restorePnl) {
      restorePnl.textContent = `P&L: ${formatInr(totalPnl)}`;
      restorePnl.style.color = totalPnl >= 0 ? "#22c55e" : "#ef4444";
    }

    if (totalPnl > 0) {
      pnlBadge.className = "fg-pnl-badge fg-pnl-positive";
    } else if (totalPnl < 0) {
      pnlBadge.className = "fg-pnl-badge fg-pnl-negative";
    } else {
      pnlBadge.className = "fg-pnl-badge fg-pnl-neutral";
    }

    const st = engineStatusVal || "LIVE";
    engineText.textContent = st;
    engineStatus.className = `fg-status-pill fg-status-${st.toLowerCase()}`;
  }

  // Render Open Positions in Ticker with green/red borders, percentage, and EXIT BUTTON
  function renderPositionsTicker(flashMap) {
    const track = shadowRoot?.getElementById("fg-ticker-track");
    if (!track) return;

    if (!activePositions || activePositions.length === 0) {
      track.innerHTML = `
        <div class="fg-no-positions">
          <span style="color:#8b949e;">●</span> No active open positions for <strong>${currentProfile}</strong>
        </div>
      `;
      return;
    }

    track.innerHTML = activePositions.map((pos) => {
      const key = pos.trade_id || pos.symbol;
      const isBuy = pos.side === "BUY";
      const pnl = Number(pos.unrealized_pnl) || 0;
      const isProfit = pnl > 0;
      const isLoss = pnl < 0;
      const pnlSign = isProfit ? "+" : "";
      const pnlClass = isProfit ? "positive" : (isLoss ? "negative" : "");
      const borderClass = isProfit ? "fg-pos-profit" : (isLoss ? "fg-pos-loss" : "fg-pos-neutral");
      const flashClass = flashMap[key] === "up" ? "fg-flash-up" : (flashMap[key] === "down" ? "fg-flash-down" : "");
      const ltp = (Number(pos.current_price) || 0).toFixed(2);

      // Percentage calculation
      const pct = getPositionPct(pos);
      const pctSign = pct > 0 ? "+" : "";
      const pctFormatted = `${pctSign}${pct.toFixed(2)}%`;

      return `
        <div class="fg-position-tag ${borderClass}" data-trade-id="${pos.trade_id}">
          <span class="fg-pos-side ${isBuy ? "fg-pos-side-buy" : "fg-pos-side-sell"}">${pos.side || "BUY"}</span>
          <span class="fg-pos-symbol" title="Click to view details">${pos.symbol}</span>
          <span class="fg-pos-ltp ${flashClass}">₹${ltp}</span>
          <span class="fg-pos-pnl ${pnlClass}">${pnlSign}${formatInr(pnl)}</span>
          <span class="fg-pos-pct ${pnlClass}">(${pctFormatted})</span>
          <button type="button" class="fg-pos-exit-btn" data-trade-id="${pos.trade_id}" data-symbol="${pos.symbol}" title="Exit / Close this position">✕ Exit</button>
        </div>
      `;
    }).join("");

    // Attach Exit Button Handlers
    const exitBtns = track.querySelectorAll(".fg-pos-exit-btn");
    exitBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const tradeId = btn.getAttribute("data-trade-id");
        const symbol = btn.getAttribute("data-symbol");
        handleExitPosition(tradeId, symbol, btn);
      });
    });

    // Attach Hover Popovers
    const tags = track.querySelectorAll(".fg-pos-symbol");
    tags.forEach((tag) => {
      const parent = tag.closest(".fg-position-tag");
      const tradeId = parent.getAttribute("data-trade-id");
      const pos = activePositions.find((p) => p.trade_id === tradeId);
      if (!pos) return;

      tag.addEventListener("mouseenter", (e) => showPopover(pos, e));
      tag.addEventListener("mouseleave", hidePopover);
      tag.addEventListener("click", () => {
        isDrawerOpen = true;
        shadowRoot.getElementById("fg-ide-drawer").classList.add("fg-drawer-open");
        const icon = shadowRoot.getElementById("fg-drawer-icon");
        if (icon) icon.textContent = "▼";
        const dashIcon = shadowRoot.getElementById("fg-dash-icon");
        if (dashIcon) dashIcon.textContent = "✕";
        renderDrawerTable();
      });
    });
  }

  function showPopover(pos, e) {
    const pop = shadowRoot.getElementById("fg-position-popover");
    if (!pop) return;

    const pnl = Number(pos.unrealized_pnl) || 0;
    const pnlColor = pnl >= 0 ? "#22c55e" : "#ef4444";
    const pct = getPositionPct(pos);
    const pctSign = pct > 0 ? "+" : "";

    pop.innerHTML = `
      <div style="font-weight:800;color:#f0f6fc;font-size:12px;margin-bottom:5px;">
        ${pos.symbol} (${pos.side})
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin-bottom:6px;">
        <div><span style="color:#8b949e;">LTP:</span> <strong style="color:#fff;">₹${(Number(pos.current_price) || 0).toFixed(2)}</strong></div>
        <div><span style="color:#8b949e;">Entry:</span> ₹${(Number(pos.entry_price) || 0).toFixed(2)}</div>
        <div><span style="color:#8b949e;">Target:</span> <span style="color:#22c55e;">₹${(Number(pos.target_price) || 0).toFixed(2)}</span></div>
        <div><span style="color:#8b949e;">Stop Loss:</span> <span style="color:#ef4444;">₹${(Number(pos.stop_loss) || 0).toFixed(2)}</span></div>
        <div><span style="color:#8b949e;">Qty:</span> ${pos.quantity || 0} ${pos.lots ? `(${pos.lots}L)` : ""}</div>
        <div><span style="color:#8b949e;">P&L:</span> <strong style="color:${pnlColor};">${formatInr(pnl)} (${pctSign}${pct.toFixed(2)}%)</strong></div>
      </div>
      <div style="font-size:10px;color:#38bdf8;border-top:1px solid #30363d;padding-top:4px;">
        ${pos.strategy || "Paper trade setup"}
      </div>
    `;

    const rect = e.target.getBoundingClientRect();
    pop.style.left = `${Math.max(10, Math.min(window.innerWidth - 320, rect.left))}px`;
    pop.style.bottom = "46px";
    pop.style.display = "block";
  }

  function hidePopover() {
    const pop = shadowRoot?.getElementById("fg-position-popover");
    if (pop) pop.style.display = "none";
  }

  // Render Leaderboard Rank among Running Profiles
  function renderRank() {
    const rankBadge = shadowRoot.getElementById("fg-rank-badge");
    const rankText = shadowRoot.getElementById("fg-rank-text");
    const drawerRank = shadowRoot.getElementById("fg-drawer-rank");

    const total = leaderboardData.length || 6;
    const entry = leaderboardData.find((p) => p.user_name === currentProfile);
    let r = "--";

    if (entry && entry.rank) {
      r = entry.rank;
    } else {
      const idx = leaderboardData.findIndex((p) => p.user_name === currentProfile);
      if (idx !== -1) {
        r = idx + 1;
      }
    }

    const rankStr = `Rank #${r} of ${total} Running`;
    if (rankText) rankText.textContent = rankStr;
    if (drawerRank) drawerRank.textContent = `🏆 ${rankStr}`;
    if (rankBadge) {
      rankBadge.className = "fg-rank-badge" + (Number(r) === 1 ? " top-1" : "");
      rankBadge.title = `${currentProfile} is ranked #${r} out of ${total} active running profiles`;
    }
  }

  // Render Drawer Header Meta
  function renderDrawerMeta() {
    const rankEl = shadowRoot.getElementById("fg-drawer-rank");
    const equityEl = shadowRoot.getElementById("fg-drawer-equity");

    const total = leaderboardData.length || 6;
    const entry = leaderboardData.find((p) => p.user_name === currentProfile);
    const r = entry?.rank || (leaderboardData.findIndex((p) => p.user_name === currentProfile) + 1) || "--";
    if (rankEl) rankEl.textContent = `🏆 Rank #${r} of ${total}`;

    const eq = Number(accountData.account_equity) || 100000;
    if (equityEl) equityEl.textContent = `💰 Equity: ${formatInr(eq)}`;
  }

  // Render Detailed Drawer Table with Green/Red styling, Percentage, and Exit Buttons
  function renderDrawerTable() {
    const wrap = shadowRoot.getElementById("fg-drawer-table-wrap");
    if (!wrap) return;

    if (!activePositions || activePositions.length === 0) {
      wrap.innerHTML = `
        <div style="padding:28px 20px;text-align:center;color:#8b949e;">
          <div style="font-size:13px;font-weight:700;color:#c9d1d9;">No Active Positions Open</div>
          <div style="font-size:11px;margin-top:4px;">Profile <strong>${currentProfile}</strong> has 0 open trades.</div>
        </div>
      `;
      return;
    }

    wrap.innerHTML = `
      <table class="fg-positions-table">
        <thead>
          <tr>
            <th>Trade ID</th>
            <th>Symbol</th>
            <th>Side</th>
            <th>LTP (Current)</th>
            <th>Entry Price</th>
            <th>Target</th>
            <th>Stop Loss</th>
            <th>Quantity</th>
            <th>P&L (₹)</th>
            <th>Return %</th>
            <th style="text-align:center;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${activePositions.map((pos) => {
            const isBuy = pos.side === "BUY";
            const pnl = Number(pos.unrealized_pnl) || 0;
            const isProfit = pnl > 0;
            const isLoss = pnl < 0;
            const rowClass = isProfit ? "fg-row-profit" : (isLoss ? "fg-row-loss" : "");
            const badgeClass = isProfit ? "fg-tbl-profit" : (isLoss ? "fg-tbl-loss" : "");
            const pnlSign = isProfit ? "+" : "";

            const pct = getPositionPct(pos);
            const pctSign = pct > 0 ? "+" : "";
            const pctFormatted = `${pctSign}${pct.toFixed(2)}%`;
            const ltpColor = isProfit ? "#22c55e" : (isLoss ? "#ef4444" : "#ffffff");

            return `
              <tr class="${rowClass}">
                <td style="font-weight:700;color:#8b949e;">${pos.trade_id || "--"}</td>
                <td style="font-weight:800;color:#f0f6fc;">${pos.symbol}</td>
                <td>
                  <span class="fg-pos-side ${isBuy ? "fg-pos-side-buy" : "fg-pos-side-sell"}">
                    ${pos.side}
                  </span>
                </td>
                <td style="font-weight:800;color:${ltpColor};">₹${(Number(pos.current_price) || 0).toFixed(2)}</td>
                <td>₹${(Number(pos.entry_price) || 0).toFixed(2)}</td>
                <td style="color:#22c55e;">₹${(Number(pos.target_price) || 0).toFixed(2)}</td>
                <td style="color:#ef4444;">₹${(Number(pos.stop_loss) || 0).toFixed(2)}</td>
                <td>${pos.quantity || 0}</td>
                <td>
                  <span class="fg-tbl-pill ${badgeClass}">${pnlSign}${formatInr(pnl)}</span>
                </td>
                <td>
                  <span class="fg-tbl-pill ${badgeClass}">${pctFormatted}</span>
                </td>
                <td style="text-align:center;">
                  <button type="button" class="fg-pos-exit-btn" data-trade-id="${pos.trade_id}" data-symbol="${pos.symbol}" style="padding:3px 10px;font-size:11px;">
                    ✕ Exit
                  </button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    // Attach Table Exit Buttons
    const tableExitBtns = wrap.querySelectorAll(".fg-pos-exit-btn");
    tableExitBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tradeId = btn.getAttribute("data-trade-id");
        const symbol = btn.getAttribute("data-symbol");
        handleExitPosition(tradeId, symbol, btn);
      });
    });
  }

  // Real-time synchronization listener: listens to background sync on ALL tabs
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.fg_pill_pos && changes.fg_pill_pos.newValue) {
        const pos = changes.fg_pill_pos.newValue;
        const restoreBtn = shadowRoot?.getElementById("fg-ide-restore-btn");
        if (restoreBtn && typeof pos.left === "number" && typeof pos.top === "number") {
          const maxLeft = Math.max(8, window.innerWidth - 180);
          const maxTop = Math.max(8, window.innerHeight - 40);
          restoreBtn.style.left = `${Math.max(8, Math.min(maxLeft, pos.left))}px`;
          restoreBtn.style.top = `${Math.max(8, Math.min(maxTop, pos.top))}px`;
          restoreBtn.style.bottom = "auto";
          restoreBtn.style.right = "auto";
          try {
            localStorage.setItem("fg_pill_pos", JSON.stringify(pos));
          } catch (e) {}
        }
      }
      if (changes.fg_is_minimized !== undefined) {
        const isMin = changes.fg_is_minimized.newValue === true;
        const bar = shadowRoot?.getElementById("fg-ide-statusbar");
        const drawer = shadowRoot?.getElementById("fg-ide-drawer");
        const restoreBtn = shadowRoot?.getElementById("fg-ide-restore-btn");
        const icon = shadowRoot?.getElementById("fg-drawer-icon");
        if (isMin) {
          if (bar) bar.classList.add("fg-minimized");
          if (drawer) drawer.classList.remove("fg-drawer-open");
          isDrawerOpen = false;
          if (icon) icon.textContent = "▲";
          if (restoreBtn) restoreBtn.style.display = "inline-flex";
        } else {
          if (bar) bar.classList.remove("fg-minimized");
          if (restoreBtn) restoreBtn.style.display = "none";
        }
        try {
          localStorage.setItem("fg_is_minimized", isMin ? "true" : "false");
        } catch (e) {}
      }
      if (changes.fg_selected_profile) {
        currentProfile = changes.fg_selected_profile.newValue || currentProfile;
        renderProfileSelectors();
      }
      if (changes.fg_latest_data) {
        applyLatestData(changes.fg_latest_data.newValue);
      }
    }
  });

  // Specifically on fingroww.tech: sync when website changes user
  function hookWebsiteProfileChange() {
    if (!window.location.hostname.includes("fingroww.tech")) return;

    const checkWebUser = () => {
      try {
        const webUser = localStorage.getItem("fingroww_paper_user");
        if (webUser && webUser !== currentProfile) {
          currentProfile = webUser;
          chrome.runtime.sendMessage({ type: "SET_PROFILE", profile: webUser });
        }
      } catch (e) {}
    };

    setInterval(checkWebUser, 1500);

    const sel = document.getElementById("selUserProfile");
    if (sel) {
      sel.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val && val !== currentProfile) {
          currentProfile = val;
          chrome.runtime.sendMessage({ type: "SET_PROFILE", profile: val });
        }
      });
    }
  }

  // Keep alive in DOM (in case SPAs / React re-renders remove it)
  function ensureMounted() {
    createShadowContainer();
  }

  // Initialization
  async function init() {
    ensureMounted();

    // Hook website profile selector if on fingroww.tech
    hookWebsiteProfileChange();

    // Re-check periodically & observe DOM for SPA route changes
    setInterval(ensureMounted, 800);

    if (document.body) {
      const observer = new MutationObserver(ensureMounted);
      observer.observe(document.body, { childList: true });
    }

    try {
      const stored = await chrome.storage.local.get(["fg_latest_data", "fg_selected_profile", "fg_is_minimized", "fg_pill_pos"]);
      if (stored.fg_pill_pos && typeof stored.fg_pill_pos.left === "number" && typeof stored.fg_pill_pos.top === "number") {
        const restoreBtn = shadowRoot?.getElementById("fg-ide-restore-btn");
        if (restoreBtn) {
          const maxLeft = Math.max(8, window.innerWidth - 180);
          const maxTop = Math.max(8, window.innerHeight - 40);
          restoreBtn.style.left = `${Math.max(8, Math.min(maxLeft, stored.fg_pill_pos.left))}px`;
          restoreBtn.style.top = `${Math.max(8, Math.min(maxTop, stored.fg_pill_pos.top))}px`;
          restoreBtn.style.bottom = "auto";
          restoreBtn.style.right = "auto";
        }
      }

      if (stored.fg_is_minimized !== undefined) {
        const isMin = stored.fg_is_minimized === true;
        const bar = shadowRoot?.getElementById("fg-ide-statusbar");
        const restoreBtn = shadowRoot?.getElementById("fg-ide-restore-btn");
        if (isMin) {
          if (bar) bar.classList.add("fg-minimized");
          if (restoreBtn) restoreBtn.style.display = "inline-flex";
        } else {
          if (bar) bar.classList.remove("fg-minimized");
          if (restoreBtn) restoreBtn.style.display = "none";
        }
        try {
          localStorage.setItem("fg_is_minimized", isMin ? "true" : "false");
        } catch (e) {}
      }

      if (stored.fg_selected_profile) {
        currentProfile = stored.fg_selected_profile;
      }
      if (stored.fg_latest_data) {
        applyLatestData(stored.fg_latest_data);
      } else {
        chrome.runtime.sendMessage({ type: "FORCE_REFRESH" });
      }
    } catch (e) {
      console.warn("[FinGroww Status Bar] Storage read error:", e);
    }
  }

  // Run immediately or on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
    if (document.documentElement) ensureMounted();
  } else {
    init();
  }
})();
