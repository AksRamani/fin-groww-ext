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

### 6. Day-to-Day Profit & Loss Storage (Strictly Real Profile-by-Profile Data)
- **100% Real Server Data Only**: Zero dummy, mock, or seeded past dates data. Only captures actual trading activity from live profiles that executed trades or booked profit/loss.
- **Strictly Profile-by-Profile**:
  - No combined totals or combined investment summaries.
  - Review any specific trader profile (`PARTH 18-Nov`, `Aks-new-55k`, `Akshay`, `FinGroww-Alpha`, etc.) individually to analyze their exact session P&L, trade counts, equity, win rates, broker charges, and net return after fees.
- **Summary KPI Cards & Item Chips**:
  - **Total Profit**: Sum of all winning day profits ($\sum_{pnl > 0} pnl$) with count of winning days.
  - **Total Loss**: Sum of all losing day losses ($\sum_{pnl < 0} |pnl|$) with count of losing days.
  - **Net Total P&L**: $\text{Total Profit} - \text{Total Loss}$ (color-coded in emerald green / red).
  - **Charges & Taxes**: Real broker charges & taxes fetched per profile from the website/account card.
  - **Net Total after Charges**: Live deduction ($\text{Total P\&L} - \text{Charges \& Taxes}$) displayed on every daily ledger card.
  - **Win Rate %**: Calculated win percentage (`winDays / totalDays * 100`).
- **Dual-Surface Availability**:
  - Available inside the extension popup under the **📅 Day-to-Day P&L** tab.
  - Available inside the in-page bottom status bar drawer under the **📅 Day-to-Day P&L** tab.

### 7. Google Sheets End-of-Day Auto-Sync & CSV Export (Option A: Master Ledger)
- **Automatic Sync at Market Close (3:30 PM IST)**: At the end of the day after 3:30 PM IST, the extension gathers all profile data for profiles that made trades or booked profit/loss, and automatically syncs them to your connected Google Sheet.
- **14-Column Profile-by-Profile Ledger Structure**:
  1. **Date** (e.g. `18 Nov 2026`)
  2. **Day** (e.g. `Wednesday`)
  3. **Time (IST)** (e.g. `15:30:00`)
  4. **Trader / Profile** (e.g. `PARTH 18-Nov`)
  5. **Total P&L (₹)** (Gross / Net P&L before charges)
  6. **Charges & Taxes (₹)** (Real broker charges & taxes fetched directly per profile from the website card)
  7. **Net Total after Charges & Taxes (₹)** (Dynamic formula: `=E{row}-F{row}`)
  8. **Realized P&L (₹)**
  9. **Unrealized P&L (₹)**
  10. **Account Equity (₹)**
  11. **Trades Count**
  12. **Session Status**
  13. **Win Rate / Notes**
  14. **Last Synced At**
- **Live Auto-Calculation while Editing the Sheet**:
  - Whenever you manually edit **Total P&L** (Column E) or **Charges & Taxes** (Column F) inside Google Sheets, **Column G** (`Net Total after Charges & Taxes`) updates automatically via formula and Apps Script trigger `onEdit(e)`.
  - Color-codes positive net total in bold green and losses in bold red.
  - **Auto-Migration of Existing Sheets**: Existing sheets with 12 columns automatically have the 2 new columns inserted and formulas generated without losing prior rows.
  - **Smart Upsert (Zero Duplicates)**: If synced more than once on the same day, the Google Apps Script updates existing rows in place rather than creating duplicate entries.
- **Popup Controls**:
  - **⚙️ Config Drawer**: Easily save your Google Apps Script Webhook URL and toggle auto-sync.
  - **📤 Sync to Sheet Now**: One-click manual sync for immediate export with live progress feedback and automatic CORS/redirect fallback.
  - **📥 Daily Ledger CSV**: One-click offline export downloading the complete 13-column profile ledger as a `.csv` file.

### 8. End-of-Day Complete Trade Details CSV Auto-Download (150+ Trades)
- **Automatic Download at Market Close (3:30 PM IST)**:
  - At **3:30 PM IST** (Monday through Friday), the extension automatically queries the server for all trade details executed during the day for the selected profile and triggers an immediate automatic CSV file download directly to your computer.
  - Generates file: `FinGroww_Trades_<Profile>_<YYYY-MM-DD>.csv` (e.g. `FinGroww_Trades_Parth_Gohel_2026-11-18.csv`).
- **Comprehensive Columns (Zero Truncation even for 150+ or 500+ trades)**:
  - **Trade Identifiers**: Trade ID, Trader Profile, Symbol, Instrument Name, Instrument Type, Side (BUY/SELL), Status (CLOSED / OPEN).
  - **Order & Pricing Metrics**: Quantity, Entry Price (₹), Exit / Current Price (₹), Target Price (₹), Stop Loss (₹).
  - **Profit & Loss Metrics**: Gross P&L (₹), Brokerage / Charges (₹), Net P&L (₹), Return %, Outcome (WIN / LOSS / BREAKEVEN).
  - **Trade Lifecycle & Exit Reason**: Exit Reason (e.g., `TARGET_HIT`, `STOP_LOSS`, `TRAILING_SL`, `BREAKEVEN_STOP_HIT`, `MANUAL_EXIT`, `OPEN_POSITION`), Entry Time, Exit Time, Holding Duration.
  - **Advanced Signals & Rationale**: Strategy Name, Trailing Stop State, Slippage (₹), Allocated Margin / Capital (₹), Expiry Date, and Full Signal Rationale.
- **Manual 1-Click Export Everywhere**:
  - **Toolbar Popup**: Dedicated `📥 Export Trades CSV` button on the main view and inside Day-to-Day P&L.
  - **In-Page Bottom Status Bar Drawer**: One-click `📥 Export Trades CSV` button in the drawer header to download instantly from any web page without opening the popup.
  - **Auto-Download Toggle**: Switch on/off automatic 3:30 PM CSV download at any time in the popup settings.

### 9. Real-Time Synchronization & Stale-While-Revalidate Engine
- **Fast 3-Second State Polling**: Fetches account metrics, active positions, profiles, and running leaderboards every 3 seconds.
- **10-Second Live Market Quotes Tick**: Runs `POST /api/paper/session/tick` asynchronously during market hours to recalculate NSE live option/equity quotes on the server.
- **Reliable Multi-Profile Switching**:
  - Guarantees immediate visual update when choosing any profile without auto-reverting to previously stored profiles.
  - Direct endpoint query (`/api/paper/session/state?user=<profile>`) loads fresh profile data instantly.
  - In-flight background sync race conditions and cross-profile payload mismatches are strictly rejected.
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
| **`▲` Button** | Toggle detailed positions drawer table & daily P&L |
| **`📥 Export Trades CSV`** | Fetch and download complete trade-by-trade CSV (profit, loss, exit reason, prices) for selected profile |
| **`⚡ Open Positions` Tab** | View and exit live sorted open trades |
| **`📅 Day-to-Day P&L` Tab** | View day-to-day profit & loss history and user analytics |
| **`📤 Sync to Sheet Now`** | Immediately sync day-to-day ledger to Google Sheet |
| **`📥 Daily Ledger`** | Download complete historical daily ledger as a CSV file |
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

## 📊 Google Sheets Setup Guide
See [GOOGLE_SHEET_SETUP.md](GOOGLE_SHEET_SETUP.md) for 1-minute step-by-step instructions and [google_apps_script.js](google_apps_script.js) for the ready-to-paste webhook code.

---

## 📦 Repository & Project Structure

- **Remote**: `https://github.com/AksRamani/fin-groww-ext.git`
- **Branch**: `main`
- **Local Git Identity**:
  - Name: `Aakash Ramani`
  - Email: `aakashramani1020@gmail.com`

```
D:\fingroww-trading-extension\
├── manifest.json            # Manifest V3 extension configuration
├── background.js           # Background service worker (real-time sync, NSE ticks, daily P&L, auto-sync)
├── content.js              # Injected Shadow DOM status bar, draggable pill, drawer tabs
├── content.css             # Shadow DOM styles (green/red borders, animations, drawer)
├── popup.html              # Toolbar popup UI (Positions tab, Day-to-Day P&L tab, Google Sheet sync)
├── popup.js                # Popup controller, day-to-day computations, CSV export, Sheet sync
├── popup.css               # Modern dark-theme popup stylesheet
├── google_apps_script.js   # Ready-to-paste Google Apps Script webhook code (Option A: Master Ledger)
├── GOOGLE_SHEET_SETUP.md   # Step-by-step 1-minute Google Sheets deployment guide
├── icons/                  # Extension icons (16px, 48px, 128px)
├── .gitignore              # Git ignore rules
└── README.md               # Comprehensive documentation
```
