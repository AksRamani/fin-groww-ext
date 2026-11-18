/**
 * FinGroww Trading Extension - Google Sheets Webhook Script (Master Ledger)
 *
 * LAYOUT:
 * - Each day has its own dedicated, professional table.
 * - Table Title Banner displays the Date & Day (e.g. "📅 18 Nov 2026 (Wednesday)").
 * - The redundant "Date" column is removed from profile rows.
 * - A clean blank row separates each day's table.
 * - Column F (Total Profit) uses dynamic formula: =D{row}-E{row} (Total P&L - Brokrage).
 * - Real server Realized and Unrealized P&L populated for all traders.
 *
 * INSTRUCTIONS TO UPDATE / DEPLOY:
 * 1. Open your Google Sheet.
 * 2. Click Extensions > Apps Script.
 * 3. Replace all existing code with this updated script and click Save (💾).
 * 4. Click Deploy > Manage deployments > Click Edit (pencil icon) > Under Version choose "New version" > Click Deploy.
 * 5. In your Google Sheet, reload the page. Click menu: "FinGroww" > "🧹 Clean Duplicates & Reformat All (Daily Tables)".
 *    All existing rows will instantly reorganize into daily tables with date titles and blank row dividers!
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("FinGroww")
    .addItem("🧹 Clean Duplicates & Reformat All (Daily Tables)", "cleanDuplicatesAndFixSheet")
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
        message: "Another sync is currently writing to the sheet. Please retry in a moment.",
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

    // Step 1: Read all existing days and trader records from sheet
    const daysMap = readExistingDaysFromSheet(sheet);

    // Step 2: Merge incoming payload rows into daysMap
    const nowIst = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    rows.forEach((r) => {
      const normDate = normalizeDate(r.dateKey || r.date);
      const trader = String(r.trader || "").trim();
      if (!normDate || !trader || trader.includes("ALL USERS")) return;

      const normTraderKey = normalizeTrader(trader);
      const displayTitle = formatDisplayDateTitle(r.date, r.dayName);

      if (!daysMap[normDate]) {
        daysMap[normDate] = {
          displayTitle: displayTitle,
          records: {},
        };
      }

      const totalPnl = Number(r.totalPnl) || 0;
      const charges = Number(
        r.charges !== undefined
          ? r.charges
          : (r.total_charges !== undefined ? r.total_charges : 0),
      ) || 0;

      let realized = Number(r.realizedPnl) || 0;
      let unrealized = Number(r.unrealizedPnl) || 0;

      // Reconcile Realized vs Unrealized if missing
      const notesStr = String(r.notes || "");
      const hasOpen = notesStr.includes("Open") || (Number(r.openPositionsCount) > 0);
      if (!hasOpen || unrealized === 0) {
        if (realized === 0 && totalPnl !== 0) realized = totalPnl;
        unrealized = 0;
      } else if (realized === 0 && unrealized !== 0 && totalPnl !== 0) {
        realized = totalPnl - unrealized;
      }

      daysMap[normDate].records[normTraderKey] = {
        dayName: r.dayName || "",
        time: r.time || "15:30:00",
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
 * If user edits Col D (Total P&L) or Col E (Brokrage), Col F (Total Profit)
 * is dynamically recalculated: =D{row}-E{row}.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== "Daily PnL Ledger") return;

    const row = e.range.getRow();
    const col = e.range.getColumn();
    if (row <= 2) return;

    // Check if user edited Total P&L (Col 4 / D) or Brokrage (Col 5 / E)
    if (col === 4 || col === 5) {
      const totalPnl = Number(sheet.getRange(row, 4).getValue()) || 0;
      const charges = Number(sheet.getRange(row, 5).getValue()) || 0;
      const status = String(sheet.getRange(row, 11).getValue());

      const netCell = sheet.getRange(row, 6);
      netCell.setFormula(`=D${row}-E${row}`);

      formatDataRow(sheet, row, false, totalPnl, charges, status);
    }
  } catch (err) {
    console.error("onEdit error:", err);
  }
}

/**
 * Reads existing sheet records and groups them by canonical date.
 * Handles both legacy 14-column layout and the new daily tables layout.
 */
function readExistingDaysFromSheet(sheet) {
  const daysMap = {};
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return daysMap;

  const data = sheet.getRange(1, 1, lastRow, Math.max(14, sheet.getLastColumn())).getValues();
  let currentTableDate = "";
  let currentTableTitle = "";

  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 1;
    const row = data[i];
    const firstCell = String(row[0] || "").trim();

    // 1. Detect Table Title Banner: "📅 18 Nov 2026 (Wednesday)"
    if (firstCell.startsWith("📅")) {
      const cleanTitle = firstCell.replace("📅", "").trim();
      currentTableTitle = cleanTitle;
      currentTableDate = normalizeDate(cleanTitle);
      continue;
    }

    // 2. Ignore Header Rows & Blank Rows
    if (
      !firstCell ||
      firstCell === "Date" ||
      firstCell === "Day" ||
      firstCell.includes("Trader") ||
      firstCell.includes("Total P&L")
    ) {
      continue;
    }

    // 3. Check if Legacy Row with Date in Col A
    const possibleDate = normalizeDate(row[0]);
    let dateKey = "";
    let dayName = "";
    let time = "";
    let trader = "";
    let totalPnl = 0;
    let charges = 0;
    let realized = 0;
    let unrealized = 0;
    let equity = 100000;
    let tradesCount = 0;
    let status = "RUNNING";
    let notes = "";
    let lastSynced = "";

    if (possibleDate && possibleDate.length === 10 && row[3]) {
      // Legacy 14-column layout
      dateKey = possibleDate;
      dayName = String(row[1] || "");
      time = String(row[2] || "15:30:00");
      trader = String(row[3] || "").trim();
      totalPnl = Number(row[4]) || 0;
      charges = Number(row[5]) || 0;
      realized = Number(row[7]) || 0;
      unrealized = Number(row[8]) || 0;
      equity = Number(row[9]) || 100000;
      tradesCount = Number(row[10]) || 0;
      status = String(row[11] || "RUNNING");
      notes = String(row[12] || "");
      lastSynced = String(row[13] || "");
      if (!currentTableTitle) {
        currentTableTitle = formatDisplayDateTitle(row[0], dayName);
      }
    } else if (currentTableDate && row[2]) {
      // New 13-column layout without Date column (Col A is Day, Col B is Time, Col C is Trader)
      dateKey = currentTableDate;
      dayName = String(row[0] || "");
      time = String(row[1] || "15:30:00");
      trader = String(row[2] || "").trim();
      totalPnl = Number(row[3]) || 0;
      charges = Number(row[4]) || 0;
      realized = Number(row[6]) || 0;
      unrealized = Number(row[7]) || 0;
      equity = Number(row[8]) || 100000;
      tradesCount = Number(row[9]) || 0;
      status = String(row[10] || "RUNNING");
      notes = String(row[11] || "");
      lastSynced = String(row[12] || "");
    }

    if (!dateKey || !trader || trader.includes("ALL USERS")) continue;

    const normTrader = normalizeTrader(trader);
    if (!daysMap[dateKey]) {
      daysMap[dateKey] = {
        displayTitle: currentTableTitle || dateKey,
        records: {},
      };
    }

    // Auto-reconcile Realized vs Unrealized
    if (unrealized === 0 && realized === 0 && totalPnl !== 0) {
      realized = totalPnl;
    } else if (realized === 0 && unrealized !== 0 && totalPnl !== 0) {
      realized = totalPnl - unrealized;
    }

    daysMap[dateKey].records[normTrader] = {
      dayName: dayName,
      time: time,
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
 * Renders all days as distinct tables with date title banner, column headers,
 * and a blank row between tables.
 */
function renderAllDayTables(sheet, daysMap) {
  sheet.clear();

  const sortedDates = Object.keys(daysMap).sort((a, b) => a.localeCompare(b));
  if (sortedDates.length === 0) return;

  const tableHeaders = [
    "Day",
    "Time (IST)",
    "Trader / Profile",
    "Total P&L (₹)",
    "Brokrage (₹)",
    "Total Profit (₹)",
    "Realized P&L (₹)",
    "Unrealized P&L (₹)",
    "Account Equity (₹)",
    "Trades Count",
    "Session Status",
    "Win Rate / Notes",
    "Last Synced At",
  ];

  let currentRow = 1;

  sortedDates.forEach((dKey, dIdx) => {
    const dayObj = daysMap[dKey];
    const records = dayObj.records || {};
    const traders = Object.keys(records);
    if (traders.length === 0) return;

    // 1. Table Title Banner Row: e.g. "📅 18 Nov 2026 (Wednesday)"
    const titleText = `📅 ${dayObj.displayTitle || dKey}`;
    sheet.getRange(currentRow, 1).setValue(titleText);
    const titleRange = sheet.getRange(currentRow, 1, 1, 13);
    titleRange.merge();
    titleRange.setBackground("#0f172a"); // Deep navy
    titleRange.setFontColor("#38bdf8"); // Cyan / Sky Blue
    titleRange.setFontWeight("bold");
    titleRange.setFontSize(11);
    titleRange.setVerticalAlignment("middle");
    titleRange.setHorizontalAlignment("left");
    sheet.setRowHeight(currentRow, 32);
    currentRow++;

    // 2. Table Column Headers
    const headerRange = sheet.getRange(currentRow, 1, 1, 13);
    headerRange.setValues([tableHeaders]);
    headerRange.setBackground("#1e293b"); // Slate Navy
    headerRange.setFontColor("#f1f5f9"); // Crisp white
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(10);
    headerRange.setVerticalAlignment("middle");
    headerRange.setHorizontalAlignment("center");
    sheet.setRowHeight(currentRow, 28);
    currentRow++;

    // 3. Profile Data Rows
    traders.forEach((tKey, rIdx) => {
      const rec = records[tKey];
      const netVal = rec.totalPnl - rec.charges;
      const rowValues = [
        rec.dayName,
        rec.time,
        rec.trader,
        rec.totalPnl,
        rec.charges,
        netVal, // Will be set to formula below
        rec.realized,
        rec.unrealized,
        rec.equity,
        rec.tradesCount,
        rec.status,
        rec.notes,
        rec.lastSynced,
      ];

      const rowRange = sheet.getRange(currentRow, 1, 1, 13);
      rowRange.setValues([rowValues]);

      // Set self-contained formula: Total Profit (Col F) = Col D - Col E
      sheet.getRange(currentRow, 6).setFormula(`=D${currentRow}-E${currentRow}`);

      formatDataRow(sheet, currentRow, false, rec.totalPnl, rec.charges, rec.status);
      currentRow++;
    });

    // 4. Blank row between tables (if not last table)
    const blankRowRange = sheet.getRange(currentRow, 1, 1, 13);
    blankRowRange.setBackground("#ffffff");
    blankRowRange.clearContent();
    sheet.setRowHeight(currentRow, 20);
    currentRow++;
  });

  applyTableColumnWidths(sheet);
}

/**
 * Formats a single data row with financial currency formats, alignments, and colors
 */
function formatDataRow(sheet, rowNum, isCombined, pnl, charges, status) {
  try {
    const rowRange = sheet.getRange(rowNum, 1, 1, 13);

    // Background alternating zebra
    rowRange.setBackground(rowNum % 2 === 0 ? "#f8fafc" : "#ffffff");
    rowRange.setFontWeight("normal");
    rowRange.setVerticalAlignment("middle");
    rowRange.setFontSize(10);
    sheet.setRowHeight(rowNum, 26);

    // Col 1: Day (Center)
    sheet.getRange(rowNum, 1).setHorizontalAlignment("center");
    // Col 2: Time (Center)
    sheet.getRange(rowNum, 2).setHorizontalAlignment("center");
    // Col 3: Trader / Profile (Left, Bold Navy)
    sheet.getRange(rowNum, 3).setHorizontalAlignment("left").setFontWeight("bold").setFontColor("#0f172a");

    // Col 4: Total P&L (₹) - Right, Bold Green/Red
    const pnlCell = sheet.getRange(rowNum, 4);
    pnlCell.setHorizontalAlignment("right").setFontWeight("bold");
    pnlCell.setFontColor(pnl > 0 ? "#15803d" : pnl < 0 ? "#b91c1c" : "#475569");
    pnlCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 5: Brokrage (₹) - Right, Bold Amber
    const chgCell = sheet.getRange(rowNum, 5);
    chgCell.setHorizontalAlignment("right").setFontWeight("600");
    chgCell.setFontColor("#b45309");
    chgCell.setNumberFormat("₹#,##0.00;₹0.00");

    // Col 6: Total Profit (₹) - Right, Bold Green/Red
    const netCell = sheet.getRange(rowNum, 6);
    netCell.setHorizontalAlignment("right").setFontWeight("bold");
    const netVal = pnl - charges;
    netCell.setFontColor(netVal > 0 ? "#15803d" : netVal < 0 ? "#b91c1c" : "#475569");
    netCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 7: Realized P&L (₹) - Right, Bold Green/Red
    const realCell = sheet.getRange(rowNum, 7);
    realCell.setHorizontalAlignment("right").setFontWeight("600");
    const realVal = Number(realCell.getValue()) || 0;
    realCell.setFontColor(realVal > 0 ? "#15803d" : realVal < 0 ? "#b91c1c" : "#475569");
    realCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 8: Unrealized P&L (₹) - Right, Bold Green/Red
    const unrealCell = sheet.getRange(rowNum, 8);
    unrealCell.setHorizontalAlignment("right").setFontWeight("600");
    const unrealVal = Number(unrealCell.getValue()) || 0;
    unrealCell.setFontColor(unrealVal > 0 ? "#15803d" : unrealVal < 0 ? "#b91c1c" : "#475569");
    unrealCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 9: Account Equity (₹) - Right
    sheet.getRange(rowNum, 9).setHorizontalAlignment("right").setNumberFormat("₹#,##0.00;₹0.00");

    // Col 10: Trades Count - Center
    sheet.getRange(rowNum, 10).setHorizontalAlignment("center").setNumberFormat("#,##0");

    // Col 11: Session Status - Center, Bold Green/Red/Gray
    const statusCell = sheet.getRange(rowNum, 11);
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

    // Col 12: Win Rate / Notes - Left
    sheet.getRange(rowNum, 12).setHorizontalAlignment("left");

    // Col 13: Last Synced At - Center, Muted
    sheet.getRange(rowNum, 13).setHorizontalAlignment("center").setFontColor("#64748b").setFontSize(9);
  } catch (e) {
    console.error("formatDataRow error on row " + rowNum + ":", e);
  }
}

/**
 * Set optimal column widths for the 13 columns
 */
function applyTableColumnWidths(sheet) {
  try {
    sheet.setColumnWidth(1, 65);  // Day
    sheet.setColumnWidth(2, 90);  // Time (IST)
    sheet.setColumnWidth(3, 185); // Trader / Profile
    sheet.setColumnWidth(4, 145); // Total P&L (₹)
    sheet.setColumnWidth(5, 135); // Brokrage (₹)
    sheet.setColumnWidth(6, 150); // Total Profit (₹)
    sheet.setColumnWidth(7, 140); // Realized P&L (₹)
    sheet.setColumnWidth(8, 140); // Unrealized P&L (₹)
    sheet.setColumnWidth(9, 145); // Account Equity (₹)
    sheet.setColumnWidth(10, 100); // Trades Count
    sheet.setColumnWidth(11, 125); // Session Status
    sheet.setColumnWidth(12, 270); // Win Rate / Notes
    sheet.setColumnWidth(13, 160); // Last Synced At
  } catch (e) {}
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
 * Helper to generate title banner string like "18 Nov 2026 (Wednesday)"
 */
function formatDisplayDateTitle(dateVal, dayName) {
  let dateStr = String(dateVal || "").trim();
  if (dateVal instanceof Date) {
    dateStr = Utilities.formatDate(dateVal, "Asia/Kolkata", "dd MMM yyyy");
    if (!dayName) dayName = Utilities.formatDate(dateVal, "Asia/Kolkata", "EEEE");
  } else {
    // If dateVal is "2026-11-18" or "18 Nov 2026"
    const parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) {
      const d = new Date(parsed);
      dateStr = Utilities.formatDate(d, "Asia/Kolkata", "dd MMM yyyy");
      if (!dayName) dayName = Utilities.formatDate(d, "Asia/Kolkata", "EEEE");
    }
  }

  if (dayName) {
    const fullDay = dayName.length <= 3
      ? (dayName === "Mon" ? "Monday" : dayName === "Tue" ? "Tuesday" : dayName === "Wed" ? "Wednesday" : dayName === "Thu" ? "Thursday" : dayName === "Fri" ? "Friday" : dayName)
      : dayName;
    return `${dateStr} (${fullDay})`;
  }
  return dateStr;
}

/**
 * Normalizes date to canonical YYYY-MM-DD
 */
function normalizeDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "Asia/Kolkata", "yyyy-MM-dd");
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    return Utilities.formatDate(new Date(parsed), "Asia/Kolkata", "yyyy-MM-dd");
  }

  const match = s.match(/(\d{1,2})[\s\-\/]([A-Za-z]+)[\s\-\/](\d{4})/);
  if (match) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, "Asia/Kolkata", "yyyy-MM-dd");
    }
  }
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeTrader(val) {
  return String(val || "").trim().toLowerCase();
}

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "ok",
      message: "FinGroww Google Sheets Webhook is active and waiting for POST data.",
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}
