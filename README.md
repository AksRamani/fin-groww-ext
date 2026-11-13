# FinGroww Paper Trading - Multi-Tab IDE Status Bar Extension

A high-frequency Chrome extension (Manifest V3) that docks an IDE-style status bar at the bottom of **all browser tabs** with real-time stock price and position synchronization, live market ticks, running leaderboard rankings, and individual trade exit controls.

---

## ✨ Features

1. **Status Bar on All Open Tabs**:
   - Pinned cleanly to the bottom (`height: 38px`, `z-index: 2147483647`).
   - Isolated inside Shadow DOM (`#fingroww-statusbar-host`) so host page CSS/frameworks cannot interfere.
   - Host SPA resilient (`MutationObserver` ensures it stays mounted across client-side page routing).

2. **Real-Time Synchronization**:
   - Background service worker synchronizes selected profile, open positions, and net P&L every 3 seconds across **all open browser tabs**.
   - Asynchronous 10-second live market tick triggers backend NSE re-calculation (`/api/paper/session/tick`).
   - Flash animations: LTP numbers flash **Green** on price increases and **Red** on price drops.

3. **Active Running Profiles Leaderboard**:
   - Leaderboard ranks are filtered strictly from active/running engines (e.g., `Rank #5 of 6 Running`).

4. **Trade Exit Controls**:
   - **Position Exit**: Every open trade in the horizontal ticker and drawer table has its own `✕ Exit` button.
   - **Exit All**: Click `▲` to open the drawer and click `⚠️ Exit All Positions` to close all trades.
   - **No Exit Bar Button**: The status bar stays visible and clean. Use `—` or `Alt + S` to minimize into a subtle floating badge.

---

## 🚀 How to Reload & Apply Changes

1. Open Chrome and go to `chrome://extensions/`.
2. Locate **FinGroww Trading Status Bar**.
3. Click the **Reload (↻)** icon.
4. Refresh any open tabs (`Ctrl + F5`) to see the updated status bar.
