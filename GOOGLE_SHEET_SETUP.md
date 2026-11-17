# FinGroww Google Sheet Auto-Sync Setup Guide

This guide explains how to connect your **Google Sheet** to the FinGroww Trading Extension for automatic end-of-day profit and loss storage.

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
1. Click the blue **Deploy** button at the top-right > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in the fields:
   - **Description**: `FinGroww Daily PnL Sync`
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
  - Automatically appends today's rows to the sheet named `Daily PnL Ledger`.
  - Appends an aggregated summary row: `ALL USERS (Combined)`.
  - Appends individual rows for every active trader (`Aks-new-55k`, `Alpha-Scalper-01`, etc.).
  - Color-codes positive P&L in green and losses in red.
  - **Zero Duplicates**: If synced more than once on the same date, it updates that day's existing rows instead of creating duplicates.
