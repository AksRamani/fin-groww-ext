# FinGroww Paper Trading - Multi-Tab Trading Monitor & Status Bar Extension

A high-frequency Chrome extension (Manifest V3) that docks a professional trading status bar across **all browser tabs** with real-time stock price and open position synchronization, live market ticks, running leaderboard rankings, and individual trade exit controls.

---

## ✨ Features & Architecture

### 1. Professional Trading Status Bar on All Browser Tabs
- **Zero Page Interference**: Injected into every page inside an isolated **Shadow DOM** (`#fingroww-statusbar-host`) with `position: fixed !important; bottom: 0; width: 100%; height: 38px; z-index: 2147483647 !important;`. Host page CSS, layout resets, and frameworks cannot break its styling.
- **SPA & Framework Resilient**: A background `MutationObserver` continuously ensures the bar stays mounted across React/Vue/Angular client-side route changes and dynamic DOM updates.
- **Glassmorphism & High-End Financial UI**: Dark translucent acrylic styling with backdrop blur, polished typography, tabular numeric alignment, and sleek status chips.

### 2. Live Open Positions Sorted from Highest Profit to Highest Loss
- **Smart P&L Ordering**: Open positions are automatically sorted descending from highest profit down to largest loss across the bottom ticker, drawer table, and popup view.
- **Dynamic Borders**:
  - **Profitable Trades**: Highlighted with an emerald green border and soft glow.
  - **Loss Trades**: Highlighted with a crimson red border and soft tint.
- **P&L & Percentage Returns**: Every open position card in the horizontal ticker displays both the rupee floating P&L and percentage return:
  ```
  [BUY] NIFTY 25100 CE  ₹12.40   +₹320.00   (+2.50%)    [✕ Exit]
  [BUY] TRENT 3200 CE   ₹40.40   -₹1,810.99 (-16.71%)   [✕ Exit]
  ```
- **Real-Time Price Flashes**: Quotes dynamically flash **Green** when prices tick up and **Red** on price drops.
- **Drag-to-Scroll Ticker**: Smooth horizontal scroll supporting mouse drag and trackpad gestures.

### 3. Detailed Positions Table Drawer (`▲`)
- Click **`▲`** or the **Overall P&L badge** to slide open a full-width detailed trades drawer:
  - **Color-Coded Rows**: 4px green or red left indicators, soft tinted row highlights, and bright pill badges for **P&L** and **Return %**.
  - **Detailed Columns**: Trade ID, Symbol, Side, LTP (Current), Entry Price, Target, Stop Loss, Quantity, P&L (₹), Return %, and Action.
  - **Exit All Positions**: One-click confirmation button to close all open trades simultaneously.

### 4. Freely Draggable & Persistent Minimized Pill
- **Minimizing**: Click **`—`** (or press **`Alt + S`**) to minimize the status bar into a compact floating pill:
  ```
  ⠿  (Alt+S)  P&L: -₹4,228.71  ▲
  ```
- **Freely Draggable Anywhere**: Click and drag the pill to any position on the screen (`cursor: grab / grabbing`). Boundary clamping prevents it from ever going offscreen.
- **Position Persistence**: Dropped coordinates `(X, Y)` are saved in `localStorage` and `chrome.storage.local`. When you refresh the tab, open new tabs, or resize the window, the pill stays exactly where you moved it.
- **Persistent Minimized State**: If minimized, refreshing the page or opening new pages starts directly in pill mode (0ms instant render without maximizing or flickering).
- **One-Click Restore**: Click the pill or press **`Alt + S`** to restore the full status bar.

### 5. Automatic Indian Market Hours Detection & Auto-Hide
- **Indian Market Schedule (IST: UTC+5:30)**:
  - **Trading Days**: Monday to Friday (Closed on weekends and NSE holidays).
  - **Trading Hours**: 9:00 AM – 3:30 PM IST.
- **Auto-Hide Behavior**:
  - At **3:30 PM IST**, both the status bar and the pill automatically hide completely.
  - At **9:00 AM IST**, they automatically re-appear across all open tabs.
- **Popup Override Setting**:
  - Open the extension toolbar popup to view the live market status (`🟢 Open` / `🔴 Closed`).
  - Toggle **"Show Bar & Pill After Market Closes"** to keep the bar and pill visible after market hours for reviewing past trades and analytics.

### 6. Real-Time Synchronization & Stale-While-Revalidate Engine
- **Fast 3-Second State Polling**: Fetches account metrics, active positions, profiles, and running leaderboards every 3 seconds.
- **10-Second Live Market Quotes Tick**: Runs `POST /api/paper/session/tick` asynchronously during market hours to recalculate NSE live option/equity quotes on the server.
- **Stale-While-Revalidate Cache**:
  - Maintains persistent multi-profile caches in memory and `chrome.storage.local`.
  - **Never** overwrites valid trade data with empty defaults (`[]` or `{}`) when the server is busy or network requests time out.
  - Older data is retained until fresh valid data arrives.
- **Active Running Profiles Leaderboard**: Leaderboard ranks are filtered strictly from active/running engines (e.g., `Rank #5 of 6 Running`).

---

## ⌨️ Keyboard Shortcuts & Controls

| Shortcut / Control | Action |
| :--- | :--- |
| **`Alt + S`** | Toggle minimize/restore between full bottom bar and floating pill |
| **`—` Button** | Minimize bottom status bar into the floating pill |
| **`▲` Button** | Toggle detailed positions drawer table |
| **`✕ Exit` Button** | Manually exit that specific open trade immediately |
| **`↻` Button** | Force immediate live sync & NSE market tick |
| **`⠿` Drag Handle** | Click & drag the minimized pill to reposition anywhere on the screen |

---

## 🚀 Installation & Reloading

1. Open Google Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the extension directory (`D:\fingroww-trading-extension`).
4. To apply any new updates:
   - Click the **Reload (↻)** icon on the extension card in `chrome://extensions/`.
   - Refresh any open browser tabs (`Ctrl + F5`).

---

## 📦 Repository & Project Structure

- **Remote**: `https://github.com/AksRamani/fin-groww-ext.git`
- **Branch**: `main`
- **Local Git Identity**:
  - Name: `Aakash Ramani`
  - Email: `aakashramani1020@gmail.com`

```
D:\fingroww-trading-extension\
├── manifest.json        # Manifest V3 extension configuration
├── background.js       # Background service worker (real-time sync, NSE market ticks, caching)
├── content.js          # Injected Shadow DOM status bar, draggable pill, and ticker
├── content.css         # Shadow DOM styles (green/red borders, animations, drawer)
├── popup.html          # Toolbar popup UI with market status and after-hours toggle
├── popup.js            # Popup controller and settings persistence
├── popup.css           # Modern dark-theme popup stylesheet
├── icons/              # Extension icons (16px, 48px, 128px)
├── .gitignore          # Git ignore rules
└── README.md           # Documentation
```
