/**
 * FinGroww Trading Extension - Google Sheets Webhook Script (Master Ledger)
 *
 * LAYOUT:
 * - Each day has its own dedicated table with dynamic date title: "📅 18 Nov 2026 (Wednesday)".
 * - Table Title Banner has a clean WHITE background with bold professional typography.
 * - Redundant "Date", "Day", and "Time (IST)" columns removed; table starts directly with "Trader / Profile".
 * - All financial metrics (Net Total P&L, Charges & Taxes, Realized P&L, Unrealized P&L, Account Equity)
 *   are fetched directly from the backend API without redundant in-extension calculations or formulas.
 * - A clean blank row separates each day's table.
 *
 * INSTRUCTIONS TO UPDATE / DEPLOY:
 * 1. Open your Google Sheet.
 * 2. Click Extensions > Apps Script.
 * 3. Replace all existing code with this updated script and click Save (💾).
 * 4. Click Deploy > Manage deployments > Click Edit (pencil icon) > Under Version choose "New version" > Click Deploy.
 * 5. In your Google Sheet, reload the page. Click menu: "FinGroww" > "🧹 Clean Duplicates & Reformat All (Daily Tables)".
 *    All existing rows will instantly reorganize into daily tables starting with Trader / Profile, dynamic date titles, white banner backgrounds, and blank row dividers!
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("FinGroww")
    .addItem(
      "🚀 Reset & Load 18 Nov (Fresh Clean Table)",
      "resetSheetTodayOnly",
    )
    .addItem(
      "🧹 Clean Duplicates & Reformat All (Daily Tables)",
      "cleanDuplicatesAndFixSheet",
    )
    .addItem("🔄 Recalculate Formulas", "recalculateAllFormulas")
    .addToUi();
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(30000); // 30s timeout
  if (!hasLock) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "busy",
        message:
          "Another sync is currently writing to the sheet. Please retry in a moment.",
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "error",
          message: "No post data received",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("Daily PnL Ledger");
    if (!sheet) {
      sheet = ss.insertSheet("Daily PnL Ledger");
    }

    const rows = payload.rows || [];
    if (rows.length === 0) {
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "No real profile rows to write",
          count: 0,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Step 1: Read all existing days and records from sheet
    const daysMap = readExistingDaysFromSheet(sheet);

    // Step 2: Merge incoming payload rows into daysMap
    const nowIst = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    });

    rows.forEach((r) => {
      const normDate = normalizeDate(r.dateKey || r.date);
      const trader = String(r.trader || "").trim();
      if (!normDate || !trader || trader.includes("ALL USERS")) return;

      const normTraderKey = normalizeTrader(trader);

      if (!daysMap[normDate]) {
        daysMap[normDate] = {
          dateKey: normDate,
          records: {},
        };
      }

      const totalPnl = Number(r.totalPnl) || 0;
      const charges =
        Number(
          r.charges !== undefined
            ? r.charges
            : r.total_charges !== undefined
              ? r.total_charges
              : 0,
        ) || 0;

      let realized = Number(r.realizedPnl) || 0;
      let unrealized = Number(r.unrealizedPnl) || 0;

      // Reconcile Realized vs Unrealized
      const notesStr = String(r.notes || "");
      const hasOpen =
        notesStr.includes("Open") || Number(r.openPositionsCount) > 0;
      if (!hasOpen || unrealized === 0) {
        if (realized === 0 && totalPnl !== 0) realized = totalPnl;
        unrealized = 0;
      } else if (realized === 0 && unrealized !== 0 && totalPnl !== 0) {
        realized = totalPnl - unrealized;
      }

      daysMap[normDate].records[normTraderKey] = {
        trader: trader,
        totalPnl: totalPnl,
        charges: charges,
        realized: realized,
        unrealized: unrealized,
        equity: Number(r.equity) || 100000,
        tradesCount: Number(r.tradesCount) || 0,
        status: r.status || "RUNNING",
        notes: r.notes || "",
        lastSynced: nowIst,
      };
    });

    // Step 3: Render entire sheet into clean Daily Tables with blank rows between them
    renderAllDayTables(sheet, daysMap);

    return ContentService.createTextOutput(
      JSON.stringify({
        status: "success",
        total: rows.length,
        syncedAt: nowIst,
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "error",
        message: err.toString(),
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Triggered automatically when user edits any cell in Google Sheets.
 * Re-applies number formatting and status styling.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== "Daily PnL Ledger") return;

    const row = e.range.getRow();
    const col = e.range.getColumn();
    if (row <= 2) return;

    if (col >= 2 && col <= 6) {
      const totalPnl = Number(sheet.getRange(row, 2).getValue()) || 0;
      const charges = Number(sheet.getRange(row, 3).getValue()) || 0;
      const status = String(sheet.getRange(row, 8).getValue());
      formatDataRow(sheet, row, totalPnl, charges, status);
    }
  } catch (err) {
    console.error("onEdit error:", err);
  }
}

/**
 * Reads existing sheet records and groups them accurately by dateKey.
 * Handles old 14-column, 13-column, 12-column, and new 11-column layouts.
 */
function readExistingDaysFromSheet(sheet) {
  const daysMap = {};
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return daysMap;

  const data = sheet
    .getRange(1, 1, lastRow, Math.max(14, sheet.getLastColumn()))
    .getValues();
  let currentActiveDateKey = "";

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const firstCell = String(row[0] || "").trim();

    // 1. Reset active date on blank separator rows
    if (!firstCell) {
      currentActiveDateKey = "";
      continue;
    }

    // 2. Detect Table Title Banner: e.g. "📅 18 Nov 2026 (Wednesday)"
    if (firstCell.startsWith("📅")) {
      const match = firstCell.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
      if (match) {
        currentActiveDateKey = normalizeDate(match[1]);
      }
      continue;
    }

    // 3. Ignore Header Rows
    if (
      firstCell === "Date" ||
      firstCell === "Day" ||
      firstCell === "Time (IST)" ||
      firstCell.includes("Trader") ||
      firstCell.includes("Total P&L")
    ) {
      continue;
    }

    // 4. Robust Date Detection: Scan row cells backwards for date pattern DD/MM/YYYY
    let rowDateKey = "";
    let lastSynced = "";
    for (let c = row.length - 1; c >= 0; c--) {
      const cellVal = String(row[c] || "").trim();
      if (!cellVal) continue;
      const syncMatch = cellVal.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (syncMatch) {
        const d = syncMatch[1].padStart(2, "0");
        const m = syncMatch[2].padStart(2, "0");
        const y = syncMatch[3];
        rowDateKey = `${y}-${m}-${d}`;
        if (!lastSynced) lastSynced = cellVal;
        break;
      }
    }

    // Check if Col A was a Date (Legacy 14-col format: "17 Nov 2026")
    const possibleDate = normalizeDate(row[0]);
    if (!rowDateKey && possibleDate && possibleDate.length === 10) {
      rowDateKey = possibleDate;
    }

    // Check if Col A was a Day name (Legacy 13-col format: "Tue" -> 2026-11-17, "Wed" -> 2026-11-18)
    if (!rowDateKey) {
      if (firstCell === "Wed" || firstCell === "Wednesday")
        rowDateKey = "2026-11-18";
      else if (firstCell === "Tue" || firstCell === "Tuesday")
        rowDateKey = "2026-11-17";
      else if (firstCell === "Mon" || firstCell === "Monday")
        rowDateKey = "2026-11-16";
    }

    // Fallback to active table date banner
    if (!rowDateKey && currentActiveDateKey) {
      rowDateKey = currentActiveDateKey;
    }

    // Determine row columns based on layout:
    let trader = "";
    let totalPnl = 0;
    let charges = 0;
    let realized = 0;
    let unrealized = 0;
    let equity = 100000;
    let tradesCount = 0;
    let status = "RUNNING";
    let notes = "";
    if (!lastSynced) {
      lastSynced = String(row[row.length - 1] || "");
    }

    if (possibleDate && possibleDate.length === 10 && row[3]) {
      // Legacy 14-column layout (Col 0=Date, Col 1=Day, Col 2=Time, Col 3=Trader, Col 4=Total PnL...)
      trader = String(row[3] || "").trim();
      totalPnl = Number(row[4]) || 0;
      charges = Number(row[5]) || 0;
      realized = Number(row[7]) || 0;
      unrealized = Number(row[8]) || 0;
      equity = Number(row[9]) || 100000;
      tradesCount = Number(row[10]) || 0;
      status = String(row[11] || "RUNNING");
      notes = String(row[12] || "");
    } else if (
      firstCell === "Tue" ||
      firstCell === "Wed" ||
      firstCell === "Mon" ||
      firstCell === "Thu" ||
      firstCell === "Fri"
    ) {
      // 13-column layout with Day in Col A (Col 0=Day, Col 1=Time, Col 2=Trader, Col 3=Total PnL...)
      trader = String(row[2] || "").trim();
      totalPnl = Number(row[3]) || 0;
      charges = Number(row[4]) || 0;
      realized = Number(row[6]) || 0;
      unrealized = Number(row[7]) || 0;
      equity = Number(row[8]) || 100000;
      tradesCount = Number(row[9]) || 0;
      status = String(row[10] || "RUNNING");
      notes = String(row[11] || "");
    } else if (
      String(row[0] || "").includes(":") ||
      String(row[0] || "").includes("1899")
    ) {
      // 12-column layout with Time in Col A (Col 0=Time, Col 1=Trader, Col 2=Total PnL, Col 3=Brokrage...)
      trader = String(row[1] || "").trim();
      totalPnl = Number(row[2]) || 0;
      charges = Number(row[3]) || 0;
      realized = Number(row[5]) || 0;
      unrealized = Number(row[6]) || 0;
      equity = Number(row[7]) || 100000;
      tradesCount = Number(row[8]) || 0;
      status = String(row[9] || "RUNNING");
      notes = String(row[10] || "");
    } else if (Number(row[5]) >= 30000 || (row[7] && isNaN(Number(row[7])))) {
      // 10-column layout (Col 0=Trader, Col 1=Net Total PnL, Col 2=Charges, Col 3=Realized, Col 4=Unrealized, Col 5=Equity, Col 6=Trades, Col 7=Status, Col 8=Notes)
      trader = String(row[0] || "").trim();
      totalPnl = Number(row[1]) || 0;
      charges = Number(row[2]) || 0;
      realized = Number(row[3]) || 0;
      unrealized = Number(row[4]) || 0;
      equity = Number(row[5]) || 100000;
      tradesCount = Number(row[6]) || 0;
      status = String(row[7] || "RUNNING");
      notes = String(row[8] || "");
    } else if (row[1] !== undefined) {
      // Legacy 11-column layout (Col 0=Trader, Col 1=Total PnL, Col 2=Brokrage, Col 3=Total Profit, Col 4=Realized, Col 5=Unrealized, Col 6=Equity, Col 7=Trades, Col 8=Status, Col 9=Notes)
      trader = String(row[0] || "").trim();
      totalPnl = Number(row[1]) || 0;
      charges = Number(row[2]) || 0;
      realized = Number(row[4]) || 0;
      unrealized = Number(row[5]) || 0;
      equity = Number(row[6]) || 100000;
      tradesCount = Number(row[7]) || 0;
      status = String(row[8] || "RUNNING");
      notes = String(row[9] || "");
    }

    // Strict Validation: Filter out invalid trader names (numbers, floats, empty)
    if (!trader || /^[-\d\.,]+$/.test(trader) || trader.includes("ALL USERS")) {
      continue;
    }

    // Strict Validation: Filter out invalid dates (must be year 2024-2030)
    if (!rowDateKey || !/^202[4-9]-\d{2}-\d{2}$/.test(rowDateKey)) {
      continue;
    }

    const normTrader = normalizeTrader(trader);
    if (!daysMap[rowDateKey]) {
      daysMap[rowDateKey] = {
        dateKey: rowDateKey,
        records: {},
      };
    }

    // Auto-reconcile Realized vs Unrealized
    if (unrealized === 0 && realized === 0 && totalPnl !== 0) {
      realized = totalPnl;
    } else if (realized === 0 && unrealized !== 0 && totalPnl !== 0) {
      realized = totalPnl - unrealized;
    }

    daysMap[rowDateKey].records[normTrader] = {
      trader: trader,
      totalPnl: totalPnl,
      charges: charges,
      realized: realized,
      unrealized: unrealized,
      equity: equity,
      tradesCount: tradesCount,
      status: status,
      notes: notes,
      lastSynced: lastSynced,
    };
  }

  return daysMap;
}

/**
 * Renders all days as distinct tables with:
 * - DYNAMIC date title banner per sync: "📅 18 Nov 2026 (Wednesday)"
 * - WHITE background (#ffffff) with bold text for table title banner
 * - NO "Date", "Day", or "Time (IST)" columns in rows (all in title banner)
 * - Pure backend metrics (Net Total P&L, Charges & Taxes, Realized P&L, Unrealized P&L, Equity)
 * - Blank row separator between tables
 */
function renderAllDayTables(sheet, daysMap) {
  sheet.clear();

  const sortedDates = Object.keys(daysMap).sort((a, b) => a.localeCompare(b));
  if (sortedDates.length === 0) return;

  // 10 Table Columns directly from backend (No redundant calculations)
  const tableHeaders = [
    "Trader / Profile",
    "Net Total P&L (₹)",
    "Charges & Taxes (₹)",
    "Realized P&L (₹)",
    "Unrealized P&L (₹)",
    "Account Equity (₹)",
    "Trades Count",
    "Session Status",
    "Win Rate / Notes",
    "Last Synced At",
  ];

  let currentRow = 1;

  sortedDates.forEach((dKey) => {
    const dayObj = daysMap[dKey];
    const records = dayObj.records || {};
    const traders = Object.keys(records);
    if (traders.length === 0) return;

    // 1. Table Title Banner Row: DYNAMIC date computed directly from dKey
    const dynamicTitleText = `📅 ${formatDisplayDateTitle(dKey)}`;
    const titleCell = sheet.getRange(currentRow, 1);
    titleCell.setValue(dynamicTitleText);

    const titleRange = sheet.getRange(currentRow, 1, 1, 10);
    titleRange.merge();
    titleRange.setBackground("#ffffff"); // WHITE BACKGROUND
    titleRange.setFontColor("#0f172a"); // Deep navy text
    titleRange.setFontWeight("bold");
    titleRange.setFontSize(12);
    titleRange.setVerticalAlignment("middle");
    titleRange.setHorizontalAlignment("left");
    sheet.setRowHeight(currentRow, 34);
    currentRow++;

    // 2. Table Column Headers Row
    const headerRange = sheet.getRange(currentRow, 1, 1, 10);
    headerRange.setValues([tableHeaders]);
    headerRange.setBackground("#1e293b"); // Deep slate navy
    headerRange.setFontColor("#f1f5f9"); // Crisp white
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(10);
    headerRange.setVerticalAlignment("middle");
    headerRange.setHorizontalAlignment("center");
    sheet.setRowHeight(currentRow, 28);
    currentRow++;

    // 3. Profile Data Rows
    traders.forEach((tKey) => {
      const rec = records[tKey];
      const rowValues = [
        rec.trader,
        rec.totalPnl,
        rec.charges,
        rec.realized,
        rec.unrealized,
        rec.equity,
        rec.tradesCount,
        rec.status,
        rec.notes,
        rec.lastSynced,
      ];

      const rowRange = sheet.getRange(currentRow, 1, 1, 10);
      rowRange.setValues([rowValues]);

      formatDataRow(sheet, currentRow, rec.totalPnl, rec.charges, rec.status);
      currentRow++;
    });

    // 4. Blank row separator between tables
    const blankRowRange = sheet.getRange(currentRow, 1, 1, 10);
    blankRowRange.setBackground("#ffffff");
    blankRowRange.clearContent();
    sheet.setRowHeight(currentRow, 22);
    currentRow++;
  });

  applyTableColumnWidths(sheet);
}

/**
 * Formats data rows with proper alignments, colors, and currency numbers
 */
function formatDataRow(sheet, rowNum, pnl, charges, status) {
  try {
    const rowRange = sheet.getRange(rowNum, 1, 1, 10);

    // Zebra striping
    rowRange.setBackground(rowNum % 2 === 0 ? "#f8fafc" : "#ffffff");
    rowRange.setFontWeight("normal");
    rowRange.setVerticalAlignment("middle");
    rowRange.setFontSize(10);
    sheet.setRowHeight(rowNum, 26);

    // Col 1: Trader / Profile (Left, Bold Navy)
    sheet
      .getRange(rowNum, 1)
      .setHorizontalAlignment("left")
      .setFontWeight("bold")
      .setFontColor("#0f172a");

    // Col 2: Net Total P&L (₹) - Right, Bold Green/Red
    const pnlCell = sheet.getRange(rowNum, 2);
    pnlCell.setHorizontalAlignment("right").setFontWeight("bold");
    pnlCell.setFontColor(pnl > 0 ? "#15803d" : pnl < 0 ? "#b91c1c" : "#475569");
    pnlCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 3: Charges & Taxes (₹) - Right, Bold Amber
    const chgCell = sheet.getRange(rowNum, 3);
    chgCell.setHorizontalAlignment("right").setFontWeight("600");
    chgCell.setFontColor("#b45309");
    chgCell.setNumberFormat("₹#,##0.00;₹0.00");

    // Col 4: Realized P&L (₹) - Right, Bold Green/Red
    const realCell = sheet.getRange(rowNum, 4);
    realCell.setHorizontalAlignment("right").setFontWeight("600");
    const realVal = Number(realCell.getValue()) || 0;
    realCell.setFontColor(
      realVal > 0 ? "#15803d" : realVal < 0 ? "#b91c1c" : "#475569",
    );
    realCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 5: Unrealized P&L (₹) - Right, Bold Green/Red
    const unrealCell = sheet.getRange(rowNum, 5);
    unrealCell.setHorizontalAlignment("right").setFontWeight("600");
    const unrealVal = Number(unrealCell.getValue()) || 0;
    unrealCell.setFontColor(
      unrealVal > 0 ? "#15803d" : unrealVal < 0 ? "#b91c1c" : "#475569",
    );
    unrealCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 6: Account Equity (₹) - Right
    sheet
      .getRange(rowNum, 6)
      .setHorizontalAlignment("right")
      .setNumberFormat("₹#,##0.00;₹0.00");

    // Col 7: Trades Count - Center
    sheet
      .getRange(rowNum, 7)
      .setHorizontalAlignment("center")
      .setNumberFormat("#,##0");

    // Col 8: Session Status - Center, Bold Green/Red/Gray
    const statusCell = sheet.getRange(rowNum, 8);
    statusCell.setHorizontalAlignment("center").setFontWeight("bold");
    const stUpper = String(status || "").toUpperCase();
    if (stUpper.includes("RUNNING")) {
      statusCell.setFontColor("#15803d");
    } else if (stUpper.includes("STOPPED")) {
      statusCell.setFontColor("#b91c1c");
    } else if (stUpper.includes("PAUSED")) {
      statusCell.setFontColor("#64748b");
    } else {
      statusCell.setFontColor("#334155");
    }

    // Col 9: Win Rate / Notes - Left
    sheet.getRange(rowNum, 9).setHorizontalAlignment("left");

    // Col 10: Last Synced At - Center, Muted
    sheet
      .getRange(rowNum, 10)
      .setHorizontalAlignment("center")
      .setFontColor("#64748b")
      .setFontSize(9);
  } catch (e) {
    console.error("formatDataRow error on row " + rowNum + ":", e);
  }
}

/**
 * Optimal column widths for the 10 columns
 */
function applyTableColumnWidths(sheet) {
  try {
    sheet.setColumnWidth(1, 190); // Trader / Profile
    sheet.setColumnWidth(2, 150); // Net Total P&L (₹)
    sheet.setColumnWidth(3, 145); // Charges & Taxes (₹)
    sheet.setColumnWidth(4, 140); // Realized P&L (₹)
    sheet.setColumnWidth(5, 140); // Unrealized P&L (₹)
    sheet.setColumnWidth(6, 145); // Account Equity (₹)
    sheet.setColumnWidth(7, 100); // Trades Count
    sheet.setColumnWidth(8, 125); // Session Status
    sheet.setColumnWidth(9, 270); // Win Rate / Notes
    sheet.setColumnWidth(10, 160); // Last Synced At
  } catch (e) {}
}

/**
 * Menu action: Clears any corrupted or shifted rows and dynamically populates
 * the current day's active profiles directly from the live FinGroww server API.
 */
function resetSheetTodayOnly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Daily PnL Ledger");
  if (!sheet) {
    sheet = ss.insertSheet("Daily PnL Ledger");
  }

  const todayKey = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
  const nowIst = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  const todayRecords = {};

  // Fetch live profiles and session states dynamically from FinGroww server
  try {
    const profRes = UrlFetchApp.fetch(
      "https://fingroww-trading.onrender.com/api/paper/profiles",
      { muteHttpExceptions: true },
    );
    if (profRes.getResponseCode() === 200) {
      const pJson = JSON.parse(profRes.getContentText());
      (pJson.profiles || []).forEach((p) => {
        try {
          const stRes = UrlFetchApp.fetch(
            `https://fingroww-trading.onrender.com/api/paper/session/state?user=${encodeURIComponent(p.user_name)}`,
            { muteHttpExceptions: true },
          );
          if (stRes.getResponseCode() === 200) {
            const stJson = JSON.parse(stRes.getContentText());
            if (stJson && stJson.account) {
              const acc = stJson.account;
              const trades = Number(
                acc.total_trades ||
                  (stJson.stats && stJson.stats.total_trades) ||
                  p.total_trades ||
                  0,
              );
              const pnl =
                Number(
                  acc.total_pnl !== undefined ? acc.total_pnl : p.net_pnl,
                ) || 0;
              const charges = Number(acc.total_charges || 0);
              if (trades > 0 || pnl !== 0 || charges > 0) {
                const k = normalizeTrader(p.user_name);
                const openCount = stJson.active_positions
                  ? stJson.active_positions.length
                  : 0;
                let notes = `${trades} trades (${p.winning_trades || 0}W / ${p.losing_trades || 0}L - ${(p.win_rate || 0).toFixed(1)}% WR)`;
                if (openCount > 0) notes += ` • ${openCount} Open`;

                todayRecords[k] = {
                  trader: p.user_name,
                  totalPnl: pnl,
                  charges: charges,
                  realized: Number(acc.realized_pnl || 0),
                  unrealized: Number(acc.unrealized_pnl || 0),
                  equity: Number(acc.account_equity || 100000),
                  tradesCount: trades,
                  status: stJson.status || p.status || "RUNNING",
                  notes: notes,
                  lastSynced: nowIst,
                };
              }
            }
          }
        } catch (e) {}
      });
    }
  } catch (err) {
    console.error("Live fetch error:", err);
  }

  if (Object.keys(todayRecords).length === 0) {
    sheet.clear();
    SpreadsheetApp.getUi().alert("Sheet cleared. Please click 'Sync to Sheet Now' in the FinGroww extension popup to populate today's data.");
    return;
  }

  const daysMap = {
    [todayKey]: {
      dateKey: todayKey,
      records: todayRecords,
    },
  };

  renderAllDayTables(sheet, daysMap);
}

/**
 * Menu action: Clean duplicates, auto-reconcile P&L, and reformat entire sheet into Daily Tables
 */
function cleanDuplicatesAndFixSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Daily PnL Ledger");
  if (!sheet) return;

  const daysMap = readExistingDaysFromSheet(sheet);
  renderAllDayTables(sheet, daysMap);
}

/**
 * Recalculate all formulas in the sheet
 */
function recalculateAllFormulas() {
  cleanDuplicatesAndFixSheet();
}

/**
 * Generates dynamic title string directly from dateKey: "18 Nov 2026 (Wednesday)"
 */
function formatDisplayDateTitle(dateKey) {
  const s = String(dateKey || "").trim();
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const parts = s.split("-").map(Number);
    d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  } else {
    d = new Date(s);
  }

  if (isNaN(d.getTime())) return s;

  const dateStr = Utilities.formatDate(d, "Asia/Kolkata", "dd MMM yyyy");
  const dayName = Utilities.formatDate(d, "Asia/Kolkata", "EEEE");
  return `${dateStr} (${dayName})`;
}

/**
 * Normalizes date to canonical YYYY-MM-DD
 */
function normalizeDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const y = val.getFullYear();
    if (y < 2024 || y > 2030) return "";
    return Utilities.formatDate(val, "Asia/Kolkata", "yyyy-MM-dd");
  }
  const s = String(val).trim();
  // 1. Strict YYYY-MM-DD (e.g. 2026-11-18)
  const isoMatch = s.match(/^(202[4-9])-(\d{2})-(\d{2})$/);
  if (isoMatch) return s;

  // 2. Strict DD/MM/YYYY or DD-MM-YYYY (with 4-digit year 2024-2030)
  const slashMatch = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](202[4-9])/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  // 3. Strict DD MMM YYYY (e.g. "18 Nov 2026" with 4-digit year 2024-2030)
  const dmyMatch = s.match(
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(202[4-9])/i,
  );
  if (dmyMatch) {
    const months = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mo = months[dmyMatch[2].slice(0, 3).toLowerCase()];
    return `${dmyMatch[3]}-${mo}-${dmyMatch[1].padStart(2, "0")}`;
  }

  return "";
}

function normalizeTrader(val) {
  return String(val || "")
    .trim()
    .toLowerCase();
}

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "ok",
      message:
        "FinGroww Google Sheets Webhook is active and waiting for POST data.",
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}
