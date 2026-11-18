/**
 * FinGroww Trading Extension - Google Sheets Webhook Script (Master Ledger)
 *
 * LAYOUT:
 * - Each day has its own dedicated table with dynamic date title: "📅 18 Nov 2026 (Wednesday)".
 * - Table Title Banner has a clean WHITE background with bold professional typography.
 * - Redundant "Date" and "Day" columns are removed from profile rows (included in table title).
 * - A clean blank row separates each day's table.
 * - Column E (Total Profit) uses dynamic formula: =C{row}-D{row} (Total P&L - Brokrage).
 * - Real server Realized and Unrealized P&L populated for all traders.
 *
 * INSTRUCTIONS TO UPDATE / DEPLOY:
 * 1. Open your Google Sheet.
 * 2. Click Extensions > Apps Script.
 * 3. Replace all existing code with this updated script and click Save (💾).
 * 4. Click Deploy > Manage deployments > Click Edit (pencil icon) > Under Version choose "New version" > Click Deploy.
 * 5. In your Google Sheet, reload the page. Click menu: "FinGroww" > "🧹 Clean Duplicates & Reformat All (Daily Tables)".
 *    All existing rows will instantly reorganize into daily tables with dynamic date titles, white banner backgrounds, and blank row dividers!
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

    // Step 1: Read all existing days and records from sheet
    const daysMap = readExistingDaysFromSheet(sheet);

    // Step 2: Merge incoming payload rows into daysMap
    const nowIst = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

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
      const charges = Number(
        r.charges !== undefined
          ? r.charges
          : (r.total_charges !== undefined ? r.total_charges : 0),
      ) || 0;

      let realized = Number(r.realizedPnl) || 0;
      let unrealized = Number(r.unrealizedPnl) || 0;

      // Reconcile Realized vs Unrealized
      const notesStr = String(r.notes || "");
      const hasOpen = notesStr.includes("Open") || (Number(r.openPositionsCount) > 0);
      if (!hasOpen || unrealized === 0) {
        if (realized === 0 && totalPnl !== 0) realized = totalPnl;
        unrealized = 0;
      } else if (realized === 0 && unrealized !== 0 && totalPnl !== 0) {
        realized = totalPnl - unrealized;
      }

      daysMap[normDate].records[normTraderKey] = {
        time: cleanTimeString(r.time || "15:30:00"),
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
 * If user edits Col C (Total P&L) or Col D (Brokrage), Col E (Total Profit)
 * is dynamically recalculated: =C{row}-D{row}.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== "Daily PnL Ledger") return;

    const row = e.range.getRow();
    const col = e.range.getColumn();
    if (row <= 2) return;

    // Col 3 is Total P&L (Col C), Col 4 is Brokrage (Col D)
    if (col === 3 || col === 4) {
      const totalPnl = Number(sheet.getRange(row, 3).getValue()) || 0;
      const charges = Number(sheet.getRange(row, 4).getValue()) || 0;
      const status = String(sheet.getRange(row, 10).getValue());

      const netCell = sheet.getRange(row, 5);
      netCell.setFormula(`=C${row}-D${row}`);

      formatDataRow(sheet, row, totalPnl, charges, status);
    }
  } catch (err) {
    console.error("onEdit error:", err);
  }
}

/**
 * Reads existing sheet records and groups them accurately by dateKey.
 * Handles old 14-column layout, 13-column layout, and current daily table layout.
 */
function readExistingDaysFromSheet(sheet) {
  const daysMap = {};
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return daysMap;

  const data = sheet.getRange(1, 1, lastRow, Math.max(14, sheet.getLastColumn())).getValues();
  let currentActiveDateKey = "";

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const firstCell = String(row[0] || "").trim();

    // 1. Detect Table Title Banner: "📅 18 Nov 2026 (Wednesday)"
    if (firstCell.startsWith("📅")) {
      const match = firstCell.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
      if (match) {
        currentActiveDateKey = normalizeDate(match[1]);
      }
      continue;
    }

    // 2. Ignore Header Rows & Blank Rows
    if (
      !firstCell ||
      firstCell === "Date" ||
      firstCell === "Day" ||
      firstCell === "Time (IST)" ||
      firstCell.includes("Trader") ||
      firstCell.includes("Total P&L")
    ) {
      continue;
    }

    // 3. Detect row's true date from Last Synced At (e.g. "17/11/2026..." or "18/11/2026...")
    let rowDateKey = "";
    const lastCellVal = String(row[row.length - 1] || "");
    const syncMatch = lastCellVal.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (syncMatch) {
      const d = syncMatch[1].padStart(2, "0");
      const m = syncMatch[2].padStart(2, "0");
      const y = syncMatch[3];
      rowDateKey = `${y}-${m}-${d}`;
    }

    // Check if Col A was a Date (Legacy format)
    const possibleDate = normalizeDate(row[0]);
    if (!rowDateKey && possibleDate && possibleDate.length === 10) {
      rowDateKey = possibleDate;
    }

    // Fallback to active table date banner
    if (!rowDateKey && currentActiveDateKey) {
      rowDateKey = currentActiveDateKey;
    }

    // Determine row columns based on layout:
    let time = "15:30:00";
    let trader = "";
    let totalPnl = 0;
    let charges = 0;
    let realized = 0;
    let unrealized = 0;
    let equity = 100000;
    let tradesCount = 0;
    let status = "RUNNING";
    let notes = "";
    let lastSynced = lastCellVal;

    if (possibleDate && possibleDate.length === 10 && row[3]) {
      // Legacy 14-column layout (Col 0=Date, Col 1=Day, Col 2=Time, Col 3=Trader, Col 4=Total PnL, Col 5=Brokrage...)
      time = cleanTimeString(row[2]);
      trader = String(row[3] || "").trim();
      totalPnl = Number(row[4]) || 0;
      charges = Number(row[5]) || 0;
      realized = Number(row[7]) || 0;
      unrealized = Number(row[8]) || 0;
      equity = Number(row[9]) || 100000;
      tradesCount = Number(row[10]) || 0;
      status = String(row[11] || "RUNNING");
      notes = String(row[12] || "");
    } else if (firstCell === "Tue" || firstCell === "Wed" || firstCell === "Mon" || firstCell === "Thu" || firstCell === "Fri") {
      // 13-column layout with Day in Col A (Col 0=Day, Col 1=Time, Col 2=Trader, Col 3=Total PnL, Col 4=Brokrage...)
      time = cleanTimeString(row[1]);
      trader = String(row[2] || "").trim();
      totalPnl = Number(row[3]) || 0;
      charges = Number(row[4]) || 0;
      realized = Number(row[6]) || 0;
      unrealized = Number(row[7]) || 0;
      equity = Number(row[8]) || 100000;
      tradesCount = Number(row[9]) || 0;
      status = String(row[10] || "RUNNING");
      notes = String(row[11] || "");
    } else if (row[1]) {
      // 12-column layout (Col 0=Time, Col 1=Trader, Col 2=Total PnL, Col 3=Brokrage, Col 4=Total Profit...)
      time = cleanTimeString(row[0]);
      trader = String(row[1] || "").trim();
      totalPnl = Number(row[2]) || 0;
      charges = Number(row[3]) || 0;
      realized = Number(row[5]) || 0;
      unrealized = Number(row[6]) || 0;
      equity = Number(row[7]) || 100000;
      tradesCount = Number(row[8]) || 0;
      status = String(row[9] || "RUNNING");
      notes = String(row[10] || "");
    }

    if (!rowDateKey || !trader || trader.includes("ALL USERS")) continue;

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
 * Renders all days as distinct tables with:
 * - DYNAMIC date title banner per sync: "📅 18 Nov 2026 (Wednesday)"
 * - WHITE background (#ffffff) with bold text for table title banner
 * - NO "Day" column and NO "Date" column in rows (all in table title)
 * - Blank row separator between tables
 */
function renderAllDayTables(sheet, daysMap) {
  sheet.clear();

  const sortedDates = Object.keys(daysMap).sort((a, b) => a.localeCompare(b));
  if (sortedDates.length === 0) return;

  // 12 Table Columns without Date and without Day
  const tableHeaders = [
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

  sortedDates.forEach((dKey) => {
    const dayObj = daysMap[dKey];
    const records = dayObj.records || {};
    const traders = Object.keys(records);
    if (traders.length === 0) return;

    // 1. Table Title Banner Row: DYNAMIC date computed directly from dKey
    const dynamicTitleText = `📅 ${formatDisplayDateTitle(dKey)}`;
    const titleCell = sheet.getRange(currentRow, 1);
    titleCell.setValue(dynamicTitleText);

    const titleRange = sheet.getRange(currentRow, 1, 1, 12);
    titleRange.merge();
    titleRange.setBackground("#ffffff"); // WHITE BACKGROUND as requested
    titleRange.setFontColor("#0f172a"); // Deep elegant navy/slate text
    titleRange.setFontWeight("bold");
    titleRange.setFontSize(12);
    titleRange.setVerticalAlignment("middle");
    titleRange.setHorizontalAlignment("left");
    sheet.setRowHeight(currentRow, 34);
    currentRow++;

    // 2. Table Column Headers Row
    const headerRange = sheet.getRange(currentRow, 1, 1, 12);
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
      const netVal = rec.totalPnl - rec.charges;
      const rowValues = [
        rec.time,
        rec.trader,
        rec.totalPnl,
        rec.charges,
        netVal, // Formula set below
        rec.realized,
        rec.unrealized,
        rec.equity,
        rec.tradesCount,
        rec.status,
        rec.notes,
        rec.lastSynced,
      ];

      const rowRange = sheet.getRange(currentRow, 1, 1, 12);
      rowRange.setValues([rowValues]);

      // Dynamic formula: Col E (Total Profit) = Col C (Total P&L) - Col D (Brokrage)
      sheet.getRange(currentRow, 5).setFormula(`=C${currentRow}-D${currentRow}`);

      formatDataRow(sheet, currentRow, rec.totalPnl, rec.charges, rec.status);
      currentRow++;
    });

    // 4. Blank row separator between tables
    const blankRowRange = sheet.getRange(currentRow, 1, 1, 12);
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
    const rowRange = sheet.getRange(rowNum, 1, 1, 12);

    // Zebra striping
    rowRange.setBackground(rowNum % 2 === 0 ? "#f8fafc" : "#ffffff");
    rowRange.setFontWeight("normal");
    rowRange.setVerticalAlignment("middle");
    rowRange.setFontSize(10);
    sheet.setRowHeight(rowNum, 26);

    // Col 1: Time (IST) - Center & string format so it never turns into 1899 date
    sheet.getRange(rowNum, 1).setHorizontalAlignment("center").setNumberFormat("@");

    // Col 2: Trader / Profile (Left, Bold Navy)
    sheet.getRange(rowNum, 2).setHorizontalAlignment("left").setFontWeight("bold").setFontColor("#0f172a");

    // Col 3: Total P&L (₹) - Right, Bold Green/Red
    const pnlCell = sheet.getRange(rowNum, 3);
    pnlCell.setHorizontalAlignment("right").setFontWeight("bold");
    pnlCell.setFontColor(pnl > 0 ? "#15803d" : pnl < 0 ? "#b91c1c" : "#475569");
    pnlCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 4: Brokrage (₹) - Right, Bold Amber
    const chgCell = sheet.getRange(rowNum, 4);
    chgCell.setHorizontalAlignment("right").setFontWeight("600");
    chgCell.setFontColor("#b45309");
    chgCell.setNumberFormat("₹#,##0.00;₹0.00");

    // Col 5: Total Profit (₹) - Right, Bold Green/Red
    const netCell = sheet.getRange(rowNum, 5);
    netCell.setHorizontalAlignment("right").setFontWeight("bold");
    const netVal = pnl - charges;
    netCell.setFontColor(netVal > 0 ? "#15803d" : netVal < 0 ? "#b91c1c" : "#475569");
    netCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 6: Realized P&L (₹) - Right, Bold Green/Red
    const realCell = sheet.getRange(rowNum, 6);
    realCell.setHorizontalAlignment("right").setFontWeight("600");
    const realVal = Number(realCell.getValue()) || 0;
    realCell.setFontColor(realVal > 0 ? "#15803d" : realVal < 0 ? "#b91c1c" : "#475569");
    realCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 7: Unrealized P&L (₹) - Right, Bold Green/Red
    const unrealCell = sheet.getRange(rowNum, 7);
    unrealCell.setHorizontalAlignment("right").setFontWeight("600");
    const unrealVal = Number(unrealCell.getValue()) || 0;
    unrealCell.setFontColor(unrealVal > 0 ? "#15803d" : unrealVal < 0 ? "#b91c1c" : "#475569");
    unrealCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 8: Account Equity (₹) - Right
    sheet.getRange(rowNum, 8).setHorizontalAlignment("right").setNumberFormat("₹#,##0.00;₹0.00");

    // Col 9: Trades Count - Center
    sheet.getRange(rowNum, 9).setHorizontalAlignment("center").setNumberFormat("#,##0");

    // Col 10: Session Status - Center, Bold Green/Red/Gray
    const statusCell = sheet.getRange(rowNum, 10);
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

    // Col 11: Win Rate / Notes - Left
    sheet.getRange(rowNum, 11).setHorizontalAlignment("left");

    // Col 12: Last Synced At - Center, Muted
    sheet.getRange(rowNum, 12).setHorizontalAlignment("center").setFontColor("#64748b").setFontSize(9);
  } catch (e) {
    console.error("formatDataRow error on row " + rowNum + ":", e);
  }
}

/**
 * Optimal column widths for the 12 columns
 */
function applyTableColumnWidths(sheet) {
  try {
    sheet.setColumnWidth(1, 95);  // Time (IST)
    sheet.setColumnWidth(2, 185); // Trader / Profile
    sheet.setColumnWidth(3, 145); // Total P&L (₹)
    sheet.setColumnWidth(4, 135); // Brokrage (₹)
    sheet.setColumnWidth(5, 150); // Total Profit (₹)
    sheet.setColumnWidth(6, 140); // Realized P&L (₹)
    sheet.setColumnWidth(7, 140); // Unrealized P&L (₹)
    sheet.setColumnWidth(8, 145); // Account Equity (₹)
    sheet.setColumnWidth(9, 100); // Trades Count
    sheet.setColumnWidth(10, 125); // Session Status
    sheet.setColumnWidth(11, 270); // Win Rate / Notes
    sheet.setColumnWidth(12, 160); // Last Synced At
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
 * Cleans ugly 1899 Date objects or GMT strings into standard "15:30:00"
 */
function cleanTimeString(val) {
  if (!val) return "15:30:00";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "Asia/Kolkata", "HH:mm:ss");
  }
  const s = String(val).trim();
  if (s.includes("GMT") || s.includes("1899") || s.includes("Standard Time")) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, "Asia/Kolkata", "HH:mm:ss");
    }
  }
  const match = s.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)/);
  if (match) return match[1];
  return "15:30:00";
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
  return "";
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
