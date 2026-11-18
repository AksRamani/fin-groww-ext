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

### Step 3: Deploy as a Web App
1. Click the blue **Deploy** button at the top-right > **New deployment** (or **Manage deployments** > **Edit** > **New version** if updating an existing deployment).
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in the fields:
   - **Description**: `FinGroww Daily PnL Sync with Charges & Taxes`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` *(Required so the extension can send data without asking for Google login credentials)*
4. Click **Deploy**.
5. Click **Authorize access**, choose your Google account, and click **Allow**.
6. Copy the generated **Web App URL** (it ends with `/exec`).

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
  - Automatically appends today's real trading ledger to the sheet named `Daily PnL Ledger`.
  - Strictly **Profile-by-Profile** (no aggregated combined row).
  - Only records profiles that made trades or booked profit/loss today (100% real server data).
  - **14 Ledger Columns**:
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
    Whenever you manually change **Total P&L** (Column E) or **Charges & Taxes** (Column F) inside Google Sheets, the **Net Total after Charges & Taxes** (Column G) updates immediately via formula and script trigger `onEdit(e)`.
  - **Zero Duplicates**: If synced more than once on the same date, it updates that day's existing rows instead of creating duplicates.
  - **Auto-Migration**: If you already have an existing sheet with 12 columns, the script automatically inserts the two new columns and calculates formulas without losing past data.
