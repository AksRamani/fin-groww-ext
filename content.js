/**
 * FinGroww Paper Trading - Multi-Tab Trading Monitor & Status Bar
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

    /* Fixed Bottom Status Bar Container */
    #fg-ide-statusbar {
      position: fixed !important;
      bottom: 0px !important;
      left: 0px !important;
      right: 0px !important;
      width: 100% !important;
      height: 38px !important;
      background: rgba(11, 15, 23, 0.94) !important;
      background-color: rgba(11, 15, 23, 0.94) !important;
      backdrop-filter: blur(16px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
      border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
      color: #e2e8f0 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Helvetica Neue", Arial, sans-serif !important;
      -webkit-font-smoothing: antialiased !important;
      -moz-osx-font-smoothing: grayscale !important;
      font-size: 11.5px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 0 10px !important;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5), 0 -1px 0 rgba(255, 255, 255, 0.03) inset !important;
      user-select: none !important;
      line-height: 1.4 !important;
      pointer-events: auto !important;
      z-index: 2147483647 !important;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }

    #fg-ide-statusbar.fg-minimized {
      transform: translateY(100%) !important;
    }

    /* Floating Restore Button when Minimized */
    #fg-ide-restore-btn {
      position: fixed !important;
      bottom: 14px;
      right: 18px;
      background: rgba(11, 15, 23, 0.94) !important;
      backdrop-filter: blur(16px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
      border: 1px solid rgba(56, 189, 248, 0.4) !important;
      color: #38bdf8 !important;
      border-radius: 20px !important;
      padding: 5px 13px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif !important;
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
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(56, 189, 248, 0.25) !important;
      transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease !important;
      touch-action: none !important;
    }

    #fg-ide-restore-btn:hover {
      background: rgba(22, 27, 34, 0.98) !important;
      border-color: #38bdf8 !important;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.7), 0 0 16px rgba(56, 189, 248, 0.4) !important;
    }

    #fg-ide-restore-btn.fg-dragging {
      cursor: grabbing !important;
      opacity: 0.95 !important;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85), 0 0 20px rgba(56, 189, 248, 0.6) !important;
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
      gap: 5px !important;
      background: rgba(255, 255, 255, 0.04) !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      border-radius: 6px !important;
      padding: 2px 8px !important;
      height: 26px !important;
      cursor: pointer !important;
      transition: all 0.2s ease !important;
    }

    .fg-profile-select-chip:hover {
      background: rgba(255, 255, 255, 0.08) !important;
      border-color: rgba(56, 189, 248, 0.4) !important;
    }

    .fg-chip-icon {
      font-size: 11px !important;
      line-height: 1 !important;
      opacity: 0.85 !important;
    }

    #fg-bar-profile-select {
      background: transparent !important;
      border: none !important;
      color: #38bdf8 !important;
      font-family: inherit !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      outline: none !important;
      max-width: 125px !important;
      text-overflow: ellipsis !important;
    }

    #fg-bar-profile-select option {
      background: #161b22 !important;
      color: #f0f6fc !important;
    }

    /* Overall P&L Pill */
    .fg-pnl-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 2px 10px !important;
      height: 26px !important;
      border-radius: 6px !important;
      font-weight: 700 !important;
      font-size: 11.5px !important;
      font-variant-numeric: tabular-nums !important;
      white-space: nowrap !important;
      cursor: pointer !important;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }

    .fg-pnl-badge:hover {
      filter: brightness(1.15) !important;
      transform: translateY(-0.5px) !important;
    }

    .fg-pnl-positive {
      background: rgba(16, 185, 129, 0.12) !important;
      border: 1px solid rgba(16, 185, 129, 0.35) !important;
      color: #34d399 !important;
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.12) !important;
    }

    .fg-pnl-negative {
      background: rgba(239, 68, 68, 0.12) !important;
      border: 1px solid rgba(239, 68, 68, 0.35) !important;
      color: #f87171 !important;
      box-shadow: 0 0 10px rgba(239, 68, 68, 0.12) !important;
    }

    .fg-pnl-neutral {
      background: rgba(255, 255, 255, 0.04) !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      color: #94a3b8 !important;
    }

    /* Rank Badge among Running Profiles */
    .fg-rank-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      padding: 2px 8px !important;
      height: 26px !important;
      border-radius: 6px !important;
      background: rgba(245, 158, 11, 0.1) !important;
      border: 1px solid rgba(245, 158, 11, 0.25) !important;
      color: #fbbf24 !important;
      font-weight: 600 !important;
      font-size: 11px !important;
      font-variant-numeric: tabular-nums !important;
      white-space: nowrap !important;
      transition: all 0.2s ease !important;
    }

    .fg-rank-badge:hover {
      background: rgba(245, 158, 11, 0.18) !important;
      border-color: rgba(245, 158, 11, 0.45) !important;
    }

    .fg-rank-badge.top-1 {
      background: rgba(234, 179, 8, 0.2) !important;
      border-color: rgba(234, 179, 8, 0.5) !important;
      color: #fde047 !important;
      box-shadow: 0 0 10px rgba(234, 179, 8, 0.2) !important;
    }

    /* Center Section: Positions Ticker with Maximum Horizontal Space */
    .fg-bar-center {
      flex: 1 !important;
      display: flex !important;
      align-items: center !important;
      overflow: hidden !important;
      margin: 0 8px !important;
      position: relative !important;
      mask-image: linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent) !important;
      -webkit-mask-image: linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent) !important;
    }

    .fg-ticker-track {
      display: flex !important;
      align-items: center !important;
      gap: 7px !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
      scroll-behavior: smooth !important;
      padding: 0 14px !important;
      width: 100% !important;
    }

    .fg-ticker-track::-webkit-scrollbar {
      display: none !important;
    }

    /* Position Pill Card in Ticker */
    .fg-position-tag {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      background: rgba(22, 27, 34, 0.75) !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      padding: 0 8px !important;
      height: 26px !important;
      border-radius: 6px !important;
      font-size: 11px !important;
      white-space: nowrap !important;
      cursor: default !important;
      flex-shrink: 0 !important;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }

    /* Green border if position is in profits */
    .fg-position-tag.fg-pos-profit {
      border: 1px solid rgba(34, 197, 94, 0.38) !important;
      background: rgba(34, 197, 94, 0.08) !important;
      box-shadow: 0 1px 4px rgba(34, 197, 94, 0.12) !important;
    }

    .fg-position-tag.fg-pos-profit:hover {
      border-color: rgba(34, 197, 94, 0.8) !important;
      background: rgba(34, 197, 94, 0.15) !important;
      box-shadow: 0 2px 10px rgba(34, 197, 94, 0.25) !important;
    }

    /* Red border if position is in loss */
    .fg-position-tag.fg-pos-loss {
      border: 1px solid rgba(239, 68, 68, 0.38) !important;
      background: rgba(239, 68, 68, 0.08) !important;
      box-shadow: 0 1px 4px rgba(239, 68, 68, 0.12) !important;
    }

    .fg-position-tag.fg-pos-loss:hover {
      border-color: rgba(239, 68, 68, 0.8) !important;
      background: rgba(239, 68, 68, 0.15) !important;
      box-shadow: 0 2px 10px rgba(239, 68, 68, 0.25) !important;
    }

    .fg-position-tag.fg-pos-neutral {
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
    }

    .fg-pos-side {
      font-weight: 800 !important;
      font-size: 9px !important;
      letter-spacing: 0.5px !important;
      padding: 1.5px 5px !important;
      border-radius: 3px !important;
      line-height: 1 !important;
    }

    .fg-pos-side-buy {
      background: rgba(34, 197, 94, 0.22) !important;
      color: #4ade80 !important;
    }

    .fg-pos-side-sell {
      background: rgba(239, 68, 68, 0.22) !important;
      color: #f87171 !important;
    }

    .fg-pos-symbol {
      font-weight: 700 !important;
      font-size: 11.5px !important;
      color: #f8fafc !important;
      cursor: pointer !important;
      letter-spacing: 0.2px !important;
    }

    .fg-pos-symbol:hover {
      color: #38bdf8 !important;
    }

    .fg-pos-ltp {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
      font-variant-numeric: tabular-nums !important;
      font-weight: 600 !important;
      font-size: 11px !important;
      color: #cbd5e1 !important;
      background: rgba(255, 255, 255, 0.05) !important;
      padding: 1px 5px !important;
      border-radius: 3px !important;
      transition: background-color 0.4s ease, color 0.4s ease !important;
    }

    /* Real-time price flashes */
    .fg-flash-up {
      background: rgba(34, 197, 94, 0.4) !important;
      color: #ffffff !important;
    }

    .fg-flash-down {
      background: rgba(239, 68, 68, 0.4) !important;
      color: #ffffff !important;
    }

    .fg-pos-pnl {
      font-variant-numeric: tabular-nums !important;
      font-weight: 700 !important;
      font-size: 11px !important;
    }

    .fg-pos-pnl.positive {
      color: #34d399 !important;
    }

    .fg-pos-pnl.negative {
      color: #f87171 !important;
    }

    /* PnL Percentage in status bar */
    .fg-pos-pct {
      font-variant-numeric: tabular-nums !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      margin-left: 1px !important;
      opacity: 0.9 !important;
    }

    .fg-pos-pct.positive {
      color: #34d399 !important;
    }

    .fg-pos-pct.negative {
      color: #f87171 !important;
    }

    /* Individual Position Exit Button */
    .fg-pos-exit-btn {
      background: rgba(255, 255, 255, 0.05) !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      color: #94a3b8 !important;
      padding: 1.5px 6px !important;
      border-radius: 4px !important;
      font-size: 9.5px !important;
      font-weight: 600 !important;
      font-family: inherit !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      margin-left: 2px !important;
      line-height: 1.3 !important;
      white-space: nowrap !important;
    }

    .fg-pos-exit-btn:hover {
      background: #ef4444 !important;
      border-color: #ef4444 !important;
      color: #ffffff !important;
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.45) !important;
      transform: translateY(-0.5px) !important;
    }

    .fg-pos-exit-btn.exiting {
      opacity: 0.6 !important;
      pointer-events: none !important;
      background: #334155 !important;
      color: #94a3b8 !important;
      border-color: #475569 !important;
    }

    .fg-no-positions {
      color: #94a3b8 !important;
      font-size: 11px !important;
      font-style: italic !important;
      padding: 0 10px !important;
      white-space: nowrap !important;
    }

    /* Right Controls */
    .fg-bar-right {
      display: flex !important;
      align-items: center !important;
      gap: 5px !important;
      flex-shrink: 0 !important;
    }

    .fg-status-pill {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      padding: 2px 8px !important;
      height: 26px !important;
      border-radius: 12px !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      letter-spacing: 0.4px !important;
    }

    .fg-status-running, .fg-status-live {
      background: rgba(34, 197, 94, 0.1) !important;
      border: 1px solid rgba(34, 197, 94, 0.28) !important;
      color: #4ade80 !important;
    }

    .fg-status-idle {
      background: rgba(148, 163, 184, 0.1) !important;
      border: 1px solid rgba(148, 163, 184, 0.25) !important;
      color: #94a3b8 !important;
    }

    .fg-status-dot {
      width: 6px !important;
      height: 6px !important;
      border-radius: 50% !important;
      background: #22c55e !important;
      box-shadow: 0 0 6px #22c55e !important;
      animation: fg-pulse 2s infinite !important;
    }

    @keyframes fg-pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
      100% { opacity: 1; transform: scale(1); }
    }

    .fg-btn-icon {
      background: rgba(255, 255, 255, 0.04) !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      color: #94a3b8 !important;
      width: 26px !important;
      height: 26px !important;
      border-radius: 6px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      font-size: 11.5px !important;
      transition: all 0.15s ease !important;
      padding: 0 !important;
    }

    .fg-btn-icon:hover {
      background: rgba(255, 255, 255, 0.1) !important;
      color: #f8fafc !important;
      border-color: rgba(255, 255, 255, 0.2) !important;
      transform: translateY(-0.5px) !important;
    }

    .fg-btn-icon:active {
      transform: scale(0.92) !important;
    }

    .fg-spin {
      animation: fg-rotate 0.8s linear infinite !important;
    }

    @keyframes fg-rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Expandable Bottom Drawer Table */
    #fg-ide-drawer {
      position: fixed !important;
      bottom: 38px !important;
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      max-height: 480px !important;
      background: rgba(11, 15, 23, 0.96) !important;
      backdrop-filter: blur(20px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
      border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
      box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.8) !important;
      z-index: 2147483646 !important;
      display: none;
      flex-direction: column !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif !important;
      color: #e2e8f0 !important;
      user-select: none !important;
      pointer-events: auto !important;
    }

    #fg-ide-drawer.fg-drawer-open {
      display: flex !important;
    }

    .fg-drawer-header {
      padding: 10px 16px !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      background: rgba(17, 24, 39, 0.85) !important;
    }

    .fg-drawer-title-group {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
    }

    .fg-drawer-tabs {
      display: inline-flex !important;
      align-items: center !important;
      background: rgba(0, 0, 0, 0.4) !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      border-radius: 6px !important;
      padding: 2px !important;
      gap: 3px !important;
    }

    .fg-drawer-tab {
      background: transparent !important;
      border: none !important;
      color: #94a3b8 !important;
      font-family: inherit !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      padding: 4px 10px !important;
      border-radius: 4px !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      outline: none !important;
    }

    .fg-drawer-tab:hover {
      color: #f8fafc !important;
      background: rgba(255, 255, 255, 0.06) !important;
    }

    .fg-drawer-tab.fg-tab-active {
      background: rgba(56, 189, 248, 0.18) !important;
      color: #38bdf8 !important;
      border: 1px solid rgba(56, 189, 248, 0.35) !important;
    }

    .fg-drawer-daily-bar {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 8px 16px !important;
      background: rgba(15, 23, 42, 0.75) !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
      gap: 12px !important;
      flex-wrap: wrap !important;
    }

    .fg-drawer-daily-kpis {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      flex-wrap: wrap !important;
    }

    .fg-drawer-kpi-card {
      padding: 4px 10px !important;
      border-radius: 6px !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      font-variant-numeric: tabular-nums !important;
    }

    .fg-drawer-kpi-profit {
      background: rgba(34, 197, 94, 0.12) !important;
      border: 1px solid rgba(34, 197, 94, 0.35) !important;
      color: #34d399 !important;
    }

    .fg-drawer-kpi-loss {
      background: rgba(239, 68, 68, 0.12) !important;
      border: 1px solid rgba(239, 68, 68, 0.35) !important;
      color: #f87171 !important;
    }

    .fg-drawer-kpi-net {
      background: rgba(56, 189, 248, 0.12) !important;
      border: 1px solid rgba(56, 189, 248, 0.35) !important;
      color: #38bdf8 !important;
    }

    .fg-drawer-tabs-bar {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 6px 16px !important;
      background: rgba(11, 15, 23, 0.95) !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
      gap: 12px !important;
      flex-wrap: wrap !important;
    }

    .fg-drawer-daily-container {
      padding: 12px 16px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
    }

    .fg-daily-card {
      background: rgba(17, 24, 39, 0.75) !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      border-radius: 8px !important;
      padding: 10px 14px !important;
      transition: all 0.15s ease !important;
    }

    .fg-daily-card:hover {
      background: rgba(30, 41, 59, 0.8) !important;
      border-color: rgba(255, 255, 255, 0.15) !important;
    }

    .fg-daily-card.fg-is-profit {
      border-left: 3.5px solid #22c55e !important;
    }

    .fg-daily-card.fg-is-loss {
      border-left: 3.5px solid #ef4444 !important;
    }

    .fg-daily-card.fg-is-breakeven {
      border-left: 3.5px solid #64748b !important;
    }

    .fg-daily-row-top {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      margin-bottom: 6px !important;
    }

    .fg-daily-row-bottom {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      font-size: 11px !important;
      color: #94a3b8 !important;
    }

    .fg-daily-user-breakdown {
      margin-top: 8px !important;
      padding-top: 8px !important;
      border-top: 1px dashed rgba(255, 255, 255, 0.08) !important;
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
    }

    .fg-daily-user-pill {
      font-size: 10px !important;
      padding: 2px 7px !important;
      border-radius: 4px !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      background: rgba(0, 0, 0, 0.3) !important;
      border: 1px solid rgba(255, 255, 255, 0.06) !important;
      font-variant-numeric: tabular-nums !important;
    }

    .fg-drawer-title {
      font-weight: 700 !important;
      font-size: 13px !important;
      color: #f8fafc !important;
      letter-spacing: 0.3px !important;
    }

    .fg-drawer-select {
      background: rgba(11, 15, 23, 0.9) !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      color: #38bdf8 !important;
      border-radius: 6px !important;
      padding: 3px 8px !important;
      font-family: inherit !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
    }

    .fg-drawer-meta-pill {
      font-size: 11px !important;
      font-weight: 600 !important;
      font-variant-numeric: tabular-nums !important;
      color: #94a3b8 !important;
      padding: 3px 9px !important;
      background: rgba(255, 255, 255, 0.04) !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      border-radius: 6px !important;
    }

    .fg-drawer-actions {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }

    .fg-btn-close-all {
      background: rgba(239, 68, 68, 0.12) !important;
      border: 1px solid rgba(239, 68, 68, 0.35) !important;
      color: #f87171 !important;
      padding: 4px 12px !important;
      border-radius: 6px !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: all 0.2s ease !important;
    }

    .fg-btn-close-all:hover {
      background: #ef4444 !important;
      border-color: #ef4444 !important;
      color: #ffffff !important;
      box-shadow: 0 0 10px rgba(239, 68, 68, 0.4) !important;
    }

    .fg-drawer-body {
      overflow-y: auto !important;
      max-height: 420px !important;
      padding: 0 !important;
    }

    .fg-positions-table {
      width: 100% !important;
      border-collapse: collapse !important;
      font-size: 11.5px !important;
      text-align: left !important;
      font-variant-numeric: tabular-nums !important;
    }

    .fg-positions-table th {
      background: rgba(17, 24, 39, 0.95) !important;
      color: #94a3b8 !important;
      font-weight: 600 !important;
      font-size: 10.5px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
      padding: 8px 12px !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
      position: sticky !important;
      top: 0 !important;
      z-index: 2 !important;
    }

    .fg-positions-table td {
      padding: 8px 12px !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
      color: #e2e8f0 !important;
    }

    /* Table Rows: Green for profit, Red for loss */
    .fg-positions-table tr.fg-row-profit td {
      background: rgba(34, 197, 94, 0.06) !important;
      border-bottom: 1px solid rgba(34, 197, 94, 0.18) !important;
    }

    .fg-positions-table tr.fg-row-profit:hover td {
      background: rgba(34, 197, 94, 0.12) !important;
    }

    .fg-positions-table tr.fg-row-profit td:first-child {
      border-left: 3px solid #22c55e !important;
    }

    .fg-positions-table tr.fg-row-loss td {
      background: rgba(239, 68, 68, 0.06) !important;
      border-bottom: 1px solid rgba(239, 68, 68, 0.18) !important;
    }

    .fg-positions-table tr.fg-row-loss:hover td {
      background: rgba(239, 68, 68, 0.12) !important;
    }

    .fg-positions-table tr.fg-row-loss td:first-child {
      border-left: 3px solid #ef4444 !important;
    }

    /* Table Badges for PnL and % */
    .fg-tbl-pill {
      display: inline-block !important;
      padding: 2px 8px !important;
      border-radius: 4px !important;
      font-weight: 700 !important;
      font-size: 11px !important;
      font-variant-numeric: tabular-nums !important;
      white-space: nowrap !important;
    }

    .fg-tbl-profit {
      background: rgba(34, 197, 94, 0.16) !important;
      color: #34d399 !important;
      border: 1px solid rgba(34, 197, 94, 0.4) !important;
    }

    .fg-tbl-loss {
      background: rgba(239, 68, 68, 0.16) !important;
      color: #f87171 !important;
      border: 1px solid rgba(239, 68, 68, 0.4) !important;
    }

    /* Hover Details Tooltip / Popover */
    #fg-position-popover {
      position: fixed !important;
      background: rgba(15, 23, 42, 0.96) !important;
      backdrop-filter: blur(16px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
      border: 1px solid rgba(56, 189, 248, 0.4) !important;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.9), 0 0 16px rgba(56, 189, 248, 0.15) !important;
      border-radius: 8px !important;
      padding: 12px 16px !important;
      font-size: 11.5px !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif !important;
      color: #e2e8f0 !important;
      z-index: 2147483647 !important;
      display: none;
      pointer-events: none !important;
      min-width: 260px !important;
      font-variant-numeric: tabular-nums !important;
    }

    /* Toast Notification */
    #fg-toast {
      position: fixed !important;
      bottom: 48px !important;
      right: 18px !important;
      background: rgba(15, 23, 42, 0.95) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      color: #f8fafc !important;
      padding: 8px 14px !important;
      border-radius: 6px !important;
      font-size: 11px !important;
      font-weight: 500 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      z-index: 2147483647 !important;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.7) !important;
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
  let showAfterHours = false;
  let serverMarketOpen = null;
  let cachedDailyHistory = null;
  const DUMMY_MOCK_PROFILES = [
    "Options-Hedger-X",
    "BankNifty-Delta-9",
    "Trend-Follower-55",
    "Alpha-Scalper-01",
    "Nifty-Momentum-Pro"
  ];

  function purgeDummyFromHistory(history) {
    if (!history || !history.byUser) return { byUser: {} };
    const cleanByUser = {};
    for (const [user, days] of Object.entries(history.byUser)) {
      if (DUMMY_MOCK_PROFILES.includes(user)) continue;
      const cleanDays = {};
      for (const [dateKey, dayRec] of Object.entries(days || {})) {
        if (!dayRec || dayRec.isReal === false) continue;
        const trades = Number(dayRec.tradesCount) || 0;
        const pnl = Number(dayRec.totalPnl) || 0;
        const realized = Number(dayRec.realizedPnl) || 0;
        if (trades > 0 || pnl !== 0 || realized !== 0) {
          cleanDays[dateKey] = dayRec;
        }
      }
      if (Object.keys(cleanDays).length > 0) {
        cleanByUser[user] = cleanDays;
      }
    }
    return { byUser: cleanByUser };
  }

  let drawerActiveTab = "positions"; // "positions" or "daily"
  let drawerDailyUser = "";
  let hasTriggeredEodCheck = false;

  // Indian Market Hours (IST: Mon-Fri 9:00 AM - 3:30 PM)
  function isIndianMarketOpenNow() {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: false,
        weekday: "short",
        hour: "numeric",
        minute: "numeric",
        second: "numeric"
      });
      const parts = formatter.formatToParts(new Date());
      const map = {};
      for (const p of parts) map[p.type] = p.value;
      const weekday = map.weekday;
      const isWeekday = weekday !== "Sat" && weekday !== "Sun";
      if (!isWeekday) return false;
      const hour = parseInt(map.hour, 10) % 24;
      const minute = parseInt(map.minute, 10);
      const totalMins = hour * 60 + minute;
      // 9:00 AM (540 mins) to 3:30 PM (930 mins) IST
      return totalMins >= 540 && totalMins < 930;
    } catch (e) {
      const now = new Date();
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (3600000 * 5.5));
      const day = ist.getDay();
      if (day === 0 || day === 6) return false;
      const totalMins = ist.getHours() * 60 + ist.getMinutes();
      return totalMins >= 540 && totalMins < 930;
    }
  }

  // Update visibility: hides both status bar & pill when Indian market is closed unless user enabled showAfterHours
  function updateMarketVisibility() {
    if (!hostEl) return;
    const localOpen = isIndianMarketOpenNow();
    // Local clock is strictly authoritative for the 3:30 PM cutoff.
    // If local clock says market is closed (>= 3:30 PM, < 9:00 AM, or weekend), it IS closed.
    // During trading hours (9:00 AM - 3:30 PM), if backend explicitly reports closed (holiday), it also closes.
    const isMarketOpen = localOpen && (serverMarketOpen !== false);
    const shouldDisplay = isMarketOpen || showAfterHours;

    const bar = shadowRoot?.getElementById("fg-ide-statusbar");
    const restoreBtn = shadowRoot?.getElementById("fg-ide-restore-btn");
    const drawer = shadowRoot?.getElementById("fg-ide-drawer");

    if (!shouldDisplay) {
      hostEl.style.setProperty("display", "none", "important");
      if (bar) bar.style.setProperty("display", "none", "important");
      if (restoreBtn) restoreBtn.style.setProperty("display", "none", "important");
      if (drawer) drawer.style.setProperty("display", "none", "important");
      hidePopover();
    } else {
      hostEl.style.removeProperty("display");
      if (bar) bar.style.removeProperty("display");
      if (drawer) drawer.style.removeProperty("display");
      if (restoreBtn) {
        restoreBtn.style.removeProperty("display");
        const isMin = localStorage.getItem("fg_is_minimized") === "true";
        restoreBtn.style.display = isMin ? "inline-flex" : "none";
      }
    }

    // After 3:30 PM IST on weekdays, trigger end-of-day Google Sheet sync check once per tab session
    if (!localOpen) {
      try {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const ist = new Date(utc + (3600000 * 5.5));
        const day = ist.getDay();
        const totalMins = ist.getHours() * 60 + ist.getMinutes();
        if (day >= 1 && day <= 5 && totalMins >= 930 && !hasTriggeredEodCheck) {
          hasTriggeredEodCheck = true;
          chrome.runtime.sendMessage({ type: "CHECK_END_OF_DAY_SYNC" });
        }
      } catch (e) {}
    } else {
      hasTriggeredEodCheck = false;
    }
  }

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

  // Sort open positions from highest profit to highest loss
  function sortPositions(positions) {
    if (!positions || !Array.isArray(positions)) return [];
    return [...positions].sort((a, b) => {
      const pnlA = Number(a.unrealized_pnl) || 0;
      const pnlB = Number(b.unrealized_pnl) || 0;
      if (pnlB !== pnlA) {
        return pnlB - pnlA; // Highest profit first, down to largest loss
      }
      const pctA = getPositionPct(a);
      const pctB = getPositionPct(b);
      return pctB - pctA;
    });
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
      <div class="fg-drawer-tabs-bar">
        <div class="fg-drawer-tabs">
          <button type="button" class="fg-drawer-tab fg-tab-active" id="fg-tab-positions">
            ⚡ Open Positions (<span id="fg-tab-positions-count">0</span>)
          </button>
          <button type="button" class="fg-drawer-tab" id="fg-tab-daily-pnl">
            📅 Day-to-Day P&L
          </button>
        </div>
        <div class="fg-drawer-tab-actions" id="fg-drawer-daily-actions" style="display:none;align-items:center;gap:8px;">
          <label style="font-size:11px;color:#94a3b8;font-weight:600;">Trader:</label>
          <select class="fg-drawer-select" id="fg-drawer-daily-user-select" title="Filter Day-to-Day P&L by Trader">
            <option value="ALL">👥 All Active Users (Combined)</option>
          </select>
        </div>
      </div>
      <div class="fg-drawer-body" id="fg-drawer-table-wrap">
        <!-- Rendered by renderDrawerTable() -->
      </div>
      <div class="fg-drawer-body" id="fg-drawer-daily-wrap" style="display:none;">
        <!-- Rendered by renderDrawerDailyPnl() -->
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

    updateMarketVisibility();
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
      if (isDrawerOpen) {
        if (drawerActiveTab === "daily") {
          renderDrawerDailyPnl();
        } else {
          renderDrawerTable();
        }
      }
    };

    drawerToggleBtn.addEventListener("click", toggleDrawer);
    pnlBadge.addEventListener("click", toggleDrawer);
    drawerCloseBtn.addEventListener("click", () => {
      isDrawerOpen = false;
      drawer.classList.remove("fg-drawer-open");
      const icon = shadowRoot.getElementById("fg-drawer-icon");
      if (icon) icon.textContent = "▲";
    });

    // Drawer Tabs: Open Positions vs Day-to-Day P&L
    const tabPositions = shadowRoot.getElementById("fg-tab-positions");
    const tabDailyPnl = shadowRoot.getElementById("fg-tab-daily-pnl");
    const tableWrap = shadowRoot.getElementById("fg-drawer-table-wrap");
    const dailyWrap = shadowRoot.getElementById("fg-drawer-daily-wrap");
    const dailyActions = shadowRoot.getElementById("fg-drawer-daily-actions");

    if (tabPositions) {
      tabPositions.addEventListener("click", () => {
        drawerActiveTab = "positions";
        tabPositions.classList.add("fg-tab-active");
        tabDailyPnl?.classList.remove("fg-tab-active");
        if (tableWrap) tableWrap.style.display = "block";
        if (dailyWrap) dailyWrap.style.display = "none";
        if (dailyActions) dailyActions.style.display = "none";
        renderDrawerTable();
      });
    }

    if (tabDailyPnl) {
      tabDailyPnl.addEventListener("click", () => {
        drawerActiveTab = "daily";
        tabDailyPnl.classList.add("fg-tab-active");
        tabPositions?.classList.remove("fg-tab-active");
        if (tableWrap) tableWrap.style.display = "none";
        if (dailyWrap) dailyWrap.style.display = "block";
        if (dailyActions) dailyActions.style.display = "flex";
        renderDrawerDailyPnl();
      });
    }

    const drawerDailyUserSel = shadowRoot.getElementById("fg-drawer-daily-user-select");
    if (drawerDailyUserSel) {
      drawerDailyUserSel.addEventListener("change", (e) => {
        drawerDailyUser = e.target.value;
        renderDrawerDailyPnl();
      });
    }

    // Helper to toggle and persist minimized state across tabs and refreshes
    const setMinimizedState = (minimized) => {
      try {
        localStorage.setItem("fg_is_minimized", minimized ? "true" : "false");
      } catch (e) {}
      chrome.storage.local.set({ fg_is_minimized: !!minimized });

      if (minimized) {
        bar.classList.add("fg-minimized");
        drawer.classList.remove("fg-drawer-open");
        isDrawerOpen = false;
        const icon = shadowRoot.getElementById("fg-drawer-icon");
        if (icon) icon.textContent = "▲";
      } else {
        bar.classList.remove("fg-minimized");
      }
      updateMarketVisibility();
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

    if (payload.daily_pnl_history) {
      cachedDailyHistory = payload.daily_pnl_history;
    }

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

        // Always sort positions from highest profit to highest loss
        activePositions = sortPositions(positions);
        renderPositionsTicker(flashMap);
      }
    } else if (activePositions.length > 0) {
      activePositions = sortPositions(activePositions);
      renderPositionsTicker({});
    }

    // Update open positions tab counter
    const countEl = shadowRoot.getElementById("fg-tab-positions-count");
    if (countEl) countEl.textContent = activePositions.length;

    renderProfileSelectors();
    renderAccountMetrics(status);
    renderRank();
    renderDrawerMeta();

    if (isDrawerOpen) {
      if (drawerActiveTab === "daily") {
        renderDrawerDailyPnl();
      } else {
        renderDrawerTable();
      }
    }
  }

  // Render Profile Selectors on bar and drawer
  function renderProfileSelectors() {
    const barSel = shadowRoot?.getElementById("fg-bar-profile-select");
    const drawerSel = shadowRoot?.getElementById("fg-drawer-profile-select");
    const dailyUserSel = shadowRoot?.getElementById("fg-drawer-daily-user-select");

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

    // Populate Daily P&L user filter (Strictly Real Profiles Only)
    if (dailyUserSel) {
      const userSet = new Set();
      Object.keys(cachedDailyHistory?.byUser || {}).forEach(u => {
        if (!DUMMY_MOCK_PROFILES.includes(u)) userSet.add(u);
      });
      profilesList.forEach(p => {
        const u = typeof p === "string" ? p : p.user_name;
        if (u && !DUMMY_MOCK_PROFILES.includes(u)) userSet.add(u);
      });
      leaderboardData.forEach(p => {
        const u = p.user_name || p.name;
        if (u && !DUMMY_MOCK_PROFILES.includes(u)) userSet.add(u);
      });

      const userList = Array.from(userSet).sort();
      if (!drawerDailyUser || drawerDailyUser === "ALL" || !userSet.has(drawerDailyUser)) {
        drawerDailyUser = currentProfile || userList[0] || "";
      }

      if (userList.length > 0) {
        dailyUserSel.innerHTML = userList.map(u => 
          `<option value="${u}" ${drawerDailyUser === u ? "selected" : ""}>👤 ${u}</option>`
        ).join("");
        dailyUserSel.value = drawerDailyUser;
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

    const sortedPositions = sortPositions(activePositions);

    track.innerHTML = sortedPositions.map((pos) => {
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

    const sortedPositions = sortPositions(activePositions);

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
          ${sortedPositions.map((pos) => {
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

  // Compute Day-to-Day P&L Summary & Records for a specific trader profile (Profile-by-Profile only)
  function computeDailyPnlSummary(historyByUser, targetUser) {
    if (!targetUser || targetUser === "ALL") {
      const availableUsers = Object.keys(historyByUser || {}).filter(u => !DUMMY_MOCK_PROFILES.includes(u));
      targetUser = currentProfile || availableUsers[0] || "";
    }

    const userDays = (historyByUser && historyByUser[targetUser]) || {};
    const records = Object.values(userDays)
      .filter(d => {
        if (!d || d.isReal === false) return false;
        const trades = Number(d.tradesCount) || 0;
        const pnl = Number(d.totalPnl) || 0;
        const realized = Number(d.realizedPnl) || 0;
        return trades > 0 || pnl !== 0 || realized !== 0;
      })
      .map(d => ({
        ...d,
        user: targetUser
      }));

    records.sort((a, b) => b.date.localeCompare(a.date));

    let totalProfit = 0;
    let totalLoss = 0;
    let netPnl = 0;
    let winDaysCount = 0;
    let lossDaysCount = 0;
    let breakevenDaysCount = 0;

    for (const r of records) {
      const pnl = Number(r.totalPnl) || 0;
      netPnl += pnl;
      if (pnl > 0) {
        totalProfit += pnl;
        winDaysCount++;
      } else if (pnl < 0) {
        totalLoss += Math.abs(pnl);
        lossDaysCount++;
      } else {
        breakevenDaysCount++;
      }
    }

    const totalTradingDays = records.length;
    const winRate = totalTradingDays > 0 ? (winDaysCount / totalTradingDays) * 100 : 0;

    return {
      records,
      totalProfit,
      totalLoss,
      netPnl,
      winDaysCount,
      lossDaysCount,
      breakevenDaysCount,
      totalTradingDays,
      winRate
    };
  }

  // Render Day-to-Day Profit & Loss Tab in the Drawer (Strictly Profile-by-Profile)
  function renderDrawerDailyPnl() {
    const wrap = shadowRoot?.getElementById("fg-drawer-daily-wrap");
    if (!wrap) return;

    const cleanHistory = purgeDummyFromHistory(cachedDailyHistory);
    cachedDailyHistory = cleanHistory;
    const historyByUser = cleanHistory?.byUser || {};

    if (!drawerDailyUser || drawerDailyUser === "ALL") {
      const availableUsers = Object.keys(historyByUser).filter(u => !DUMMY_MOCK_PROFILES.includes(u));
      drawerDailyUser = currentProfile || availableUsers[0] || "";
    }

    const summary = computeDailyPnlSummary(historyByUser, drawerDailyUser);

    let todayKey = "";
    try {
      todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    } catch (e) {
      todayKey = new Date().toISOString().slice(0, 10);
    }

    const netSign = summary.netPnl > 0 ? "+" : "";
    const netClass = summary.netPnl > 0 ? "fg-drawer-kpi-profit" : (summary.netPnl < 0 ? "fg-drawer-kpi-loss" : "fg-drawer-kpi-net");

    wrap.innerHTML = `
      <div class="fg-drawer-daily-bar">
        <div class="fg-drawer-daily-kpis">
          <div class="fg-drawer-kpi-card fg-drawer-kpi-profit" title="Sum of all positive daily profits">
            <span>📈 Profit:</span>
            <span>+${formatInr(summary.totalProfit)}</span>
            <span style="opacity:0.75;font-size:10px;">(${summary.winDaysCount}W)</span>
          </div>
          <div class="fg-drawer-kpi-card fg-drawer-kpi-loss" title="Sum of all daily losses">
            <span>📉 Loss:</span>
            <span>-${formatInr(summary.totalLoss)}</span>
            <span style="opacity:0.75;font-size:10px;">(${summary.lossDaysCount}L)</span>
          </div>
          <div class="fg-drawer-kpi-card ${netClass}" title="Net Overall P&L = Total Profit - Total Loss">
            <span>💰 Net Total P&L:</span>
            <span>${netSign}${formatInr(summary.netPnl)}</span>
          </div>
          <div class="fg-drawer-meta-pill" title="Win Rate percentage across trading days">
            🎯 Win Rate: <strong>${summary.winRate.toFixed(1)}%</strong>
          </div>
        </div>
        <div style="font-size:11px;color:#94a3b8;font-weight:600;">
          Showing: <span style="color:#38bdf8;">👤 ${drawerDailyUser}</span> • ${summary.totalTradingDays} Days Logged
        </div>
      </div>
      <div class="fg-drawer-daily-container">
        ${summary.records.length === 0 ? `
          <div style="padding:28px 20px;text-align:center;color:#8b949e;">
            <div style="font-size:13px;font-weight:700;color:#c9d1d9;">No Real Day-to-Day Records Found</div>
            <div style="font-size:11px;margin-top:4px;">No trading activity logged yet for <strong>${drawerDailyUser}</strong>.</div>
          </div>
        ` : summary.records.map((r) => {
          const pnl = Number(r.totalPnl) || 0;
          const isProfit = pnl > 0;
          const isLoss = pnl < 0;
          const isToday = r.date === todayKey;
          const cardClass = isProfit ? "fg-is-profit" : (isLoss ? "fg-is-loss" : "fg-is-breakeven");
          const pillClass = isProfit ? "fg-tbl-profit" : (isLoss ? "fg-tbl-loss" : "");
          const pnlSign = isProfit ? "+" : "";

          return `
            <div class="fg-daily-card ${cardClass}">
              <div class="fg-daily-row-top">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-weight:800;color:#f8fafc;font-size:12.5px;">${r.displayDate}</span>
                  <span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.08);color:#94a3b8;">${r.dayName}</span>
                  ${isToday ? `<span style="font-size:10px;font-weight:800;padding:1px 6px;border-radius:4px;background:rgba(56,189,248,0.2);color:#38bdf8;">TODAY</span>` : ""}
                </div>
                <div>
                  <span class="fg-tbl-pill ${pillClass}" style="font-size:12px;font-weight:800;padding:3px 8px;">
                    ${pnlSign}${formatInr(pnl)}
                  </span>
                </div>
              </div>
              <div class="fg-daily-row-bottom">
                <div>
                  <span>👤 Trader: <strong style="color:#38bdf8;">${r.user}</strong> • Status: <strong style="color:#e2e8f0;">${r.status || "RUNNING"}</strong></span>
                </div>
                <div>
                  <span>Trades Executed: <strong style="color:#e2e8f0;">${r.tradesCount || 0}</strong></span>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  // Real-time synchronization listener: listens to background sync on ALL tabs
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.fg_daily_pnl_history) {
        cachedDailyHistory = purgeDummyFromHistory(changes.fg_daily_pnl_history.newValue);
        renderProfileSelectors();
        if (isDrawerOpen && drawerActiveTab === "daily") {
          renderDrawerDailyPnl();
        }
      }
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
        const icon = shadowRoot?.getElementById("fg-drawer-icon");
        if (isMin) {
          if (bar) bar.classList.add("fg-minimized");
          if (drawer) drawer.classList.remove("fg-drawer-open");
          isDrawerOpen = false;
          if (icon) icon.textContent = "▲";
        } else {
          if (bar) bar.classList.remove("fg-minimized");
        }
        try {
          localStorage.setItem("fg_is_minimized", isMin ? "true" : "false");
        } catch (e) {}
        updateMarketVisibility();
      }
      if (changes.fg_show_after_hours !== undefined) {
        showAfterHours = changes.fg_show_after_hours.newValue === true;
        updateMarketVisibility();
      }
      if (changes.fg_selected_profile) {
        currentProfile = changes.fg_selected_profile.newValue || currentProfile;
        renderProfileSelectors();
      }
      if (changes.fg_latest_data) {
        if (typeof changes.fg_latest_data.newValue?.is_market_open === "boolean") {
          serverMarketOpen = changes.fg_latest_data.newValue.is_market_open;
          updateMarketVisibility();
        }
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
    updateMarketVisibility();
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

    // High-frequency check (every 1s) so the instant 3:30 PM arrives, the bar and pill auto-hide without tab refresh
    setInterval(updateMarketVisibility, 1000);

    try {
      const stored = await chrome.storage.local.get(["fg_latest_data", "fg_selected_profile", "fg_is_minimized", "fg_pill_pos", "fg_show_after_hours", "fg_daily_pnl_history"]);
      if (stored.fg_daily_pnl_history) {
        cachedDailyHistory = purgeDummyFromHistory(stored.fg_daily_pnl_history);
      }
      if (stored.fg_show_after_hours !== undefined) {
        showAfterHours = stored.fg_show_after_hours === true;
      }
      if (typeof stored.fg_latest_data?.is_market_open === "boolean") {
        serverMarketOpen = stored.fg_latest_data.is_market_open;
      }
      updateMarketVisibility();

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
