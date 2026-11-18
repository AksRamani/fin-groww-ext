# FinGroww Google Sheet Auto-Sync Setup Guide

This guide explains how to connect your **Google Sheet** to the FinGroww Trading Extension for automatic end-of-day profit and loss storage, including per-profile **Charges & Taxes** and **Net Total after Charges & Taxes**.

---

### Step 1: Create a Google Sheet
1. Open [Google Sheets](https://sheets.new) in your browser.
2. Name your sheet: `FinGroww Trading Journal`.

---

### Step 2: Add the Apps Script Code
1. In your Google Sheet, click **Extensions > Apps Script**.
2. Delete everything inside the code editor (`Code.gs`).
3. Open [google_apps_script.js](file:///d:/fingroww-trading-extension/google_apps_script.js), copy all its contents, and paste it into the editor.
4. Click the **Save** button (💾).

---

### Step 3: Deploy or Update as a Web App
1. **If deploying for the first time**:
   - Click the blue **Deploy** button at the top-right > **New deployment**.
   - Select type: **Web app**.
   - **Description**: `FinGroww Daily PnL Sync with Charges & Taxes`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` *(Required so the extension can send data without asking for Google login credentials)*
   - Click **Deploy**, click **Authorize access**, and copy the **Web App URL** (ends with `/exec`).
2. **If updating an existing deployment**:
   - Click **Deploy > Manage deployments**.
   - Click the **pencil icon (Edit)**.
   - Under **Version**, select **New version**.
   - Click **Deploy**.
3. **Clean Duplicates & Reformat Existing Data (1-Click)**:
   - Reload your Google Sheet in the browser tab.
   - You will see a new menu in the top toolbar: **FinGroww** > **🧹 Clean Duplicates & Reformat All (Daily Tables)**.
   - Click it once! It will instantly delete all duplicate entries, separate days into daily tables with dynamic date titles (`📅 17 Nov 2026 (Tuesday)`, `📅 18 Nov 2026 (Wednesday)`), fix all cell formulas (`=B{row}-C{row}`), format all currencies with `₹`, and restore crisp alternating rows.

---

### Step 4: Paste URL into Extension Popup
1. Open the FinGroww Extension popup.
2. Click the **📅 Day-to-Day P&L** tab.
3. In the **Google Sheet End-of-Day Sync** card, click **⚙️ Config**.
4. Paste your Web App URL into the field and click **Save**.
5. Keep **"Auto-sync at Market Close (3:30 PM IST)"** checked.

---

### How Data Appears in Your Sheet
- **Every day at 3:30 PM IST (or when you click "Sync to Sheet Now")**:
  - Automatically structures the ledger into distinct **Daily Tables** on `Daily PnL Ledger`.
  - **Date Table Title Banner**: Every day gets its own table with a full-width header banner displaying the dynamic date & day (e.g. `📅 18 Nov 2026 (Wednesday)`), with a clean **white background** and bold dark typography.
  - **No Redundant Columns**: "Date", "Day", and "Time (IST)" are removed from profile rows so the table begins directly with **Trader / Profile**.
  - **Blank Row Divider**: A clean blank row separates each day's table.
  - **Zero Duplicates Guarantee**: Concurrency lock (`LockService`) prevents race conditions between multiple sync ticks. Existing days are updated in place.
  - **10 Table Columns (Pure Backend Metrics Matching the Website)**:
    1. **Trader / Profile** (Col A, e.g. `PARTH 18-Nov`)
    2. **Net Total P&L (₹)** (Col B, direct backend net P&L)
    3. **Charges & Taxes (₹)** (Col C, direct backend broker charges & taxes)
    4. **Realized P&L (₹)** (Col D, direct backend realized P&L, bold green/red)
    5. **Unrealized P&L (₹)** (Col E, direct backend mark-to-market unrealized P&L, bold green/red)
    6. **Account Equity (₹)** (Col F, direct backend equity)
    7. **Trades Count** (Col G)
    8. **Session Status** (Col H)
    9. **Win Rate / Notes** (Col I)
    10. **Last Synced At** (Col J)
  - **Professional Formatting**:
    - All monetary figures formatted with Indian Rupee symbol `₹`, standard commas, and negative values enclosed in `(₹...)` or red highlight.
    - Alternating clean row backgrounds (`#ffffff` and `#f8fafc`).
    - Session statuses highlighted (Green for `RUNNING`, Red for `STOPPED`, Gray for `PAUSED`).
  - **1-Click Table Organizer**:
    Click **FinGroww** $\rightarrow$ **🧹 Clean Duplicates & Reformat All (Daily Tables)** to automatically group any past records into daily tables with dynamic date titles, white backgrounds, and blank row dividers.
