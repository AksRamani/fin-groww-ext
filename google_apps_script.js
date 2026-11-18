/**
 * FinGroww Trading Extension - Google Sheets Webhook Script (Master Ledger)
 *
 * FEATURES:
 * 1. Automatic Concurrency Lock (prevents race-condition duplicate row inserts)
 * 2. Robust Date & Profile Normalization (prevents duplicate rows on multiple syncs)
 * 3. In-Sheet Deduplication Engine (automatically cleans up existing duplicate rows)
 * 4. Isolated Row Formulas (=E{row}-F{row}) to prevent cross-profile formula shifting
 * 5. Full 14-Column Professional Visualization & Financial Number Formatting
 * 6. FinGroww Custom Menu in Google Sheets ("Clean Duplicates & Reformat All")
 *
 * INSTRUCTIONS TO UPDATE / DEPLOY:
 * 1. Open your Google Sheet.
 * 2. Click Extensions > Apps Script.
 * 3. Replace all existing code with this updated script and click Save (💾).
 * 4. Click Deploy > Manage deployments > Click Edit (pencil icon) > Under Version choose "New version" > Click Deploy.
 * 5. In your Google Sheet, reload the page. You will see a new menu: "FinGroww" > "🧹 Clean Duplicates & Reformat All".
 *    Click that once to instantly clean up existing duplicate rows and reformat all data!
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("FinGroww")
    .addItem("🧹 Clean Duplicates & Reformat All", "cleanDuplicatesAndFixSheet")
    .addItem("🔄 Recalculate Formulas", "recalculateAllFormulas")
    .addToUi();
}

function doPost(e) {
  // Use ScriptLock to prevent concurrent webhooks from interleaving row writes
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(30000); // Wait up to 30 seconds for lock
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

    // Create sheet if it does not exist
    if (!sheet) {
      sheet = ss.insertSheet("Daily PnL Ledger");
    }

    // 14 Standard Ledger Headers with Brokrage and Total Profit
    const headers = [
      "Date",
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

    // Set up headers or migrate legacy columns
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      applyHeaderFormatting(sheet);
    } else {
      migrateLegacyColumnsIfNeeded(sheet, headers);
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

    // Step 1: Pre-clean any existing duplicate rows in the sheet
    cleanDuplicatesAndFixSheet(sheet);

    // Step 2: Read current data to map existing rows by canonical (Date + Trader)
    const dataRange = sheet.getDataRange();
    const data = dataRange.getValues();
    const existingRowMap = {}; // Key: "YYYY-MM-DD_tradername" => rowNumber

    for (let i = 1; i < data.length; i++) {
      const rDate = normalizeDate(data[i][0]);
      const rTrader = normalizeTrader(data[i][3]);
      if (rDate && rTrader) {
        existingRowMap[rDate + "_" + rTrader] = i + 1;
      }
    }

    let updatedCount = 0;
    let insertedCount = 0;
    const nowIst = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    });

    rows.forEach((r) => {
      const normDate = normalizeDate(r.dateKey || r.date);
      const normTrader = normalizeTrader(r.trader);
      if (!normDate || !normTrader) return;

      const key = normDate + "_" + normTrader;
      const isCombined = String(r.trader).includes("ALL USERS");

      const totalPnl = Number(r.totalPnl) || 0;
      const charges = Number(
        r.charges !== undefined ? r.charges : (r.total_charges !== undefined ? r.total_charges : 0),
      ) || 0;
      const netVal = totalPnl - charges;

      let targetRowNum = existingRowMap[key];

      if (targetRowNum) {
        // Update existing row in place
        const rowValues = [
          r.date,
          r.dayName || "",
          r.time || "15:30:00",
          r.trader,
          totalPnl,
          charges,
          netVal, // Cell formula will be set below
          Number(r.realizedPnl) || 0,
          Number(r.unrealizedPnl) || 0,
          Number(r.equity) || 100000,
          Number(r.tradesCount) || 0,
          r.status || "RUNNING",
          r.notes || "",
          nowIst,
        ];
        sheet.getRange(targetRowNum, 1, 1, 14).setValues([rowValues]);
        sheet.getRange(targetRowNum, 7).setFormula(`=E${targetRowNum}-F${targetRowNum}`);
        formatRow(sheet, targetRowNum, isCombined, totalPnl, charges, r.status);
        updatedCount++;
      } else {
        // Append new day row
        const newRowNum = sheet.getLastRow() + 1;
        const rowValues = [
          r.date,
          r.dayName || "",
          r.time || "15:30:00",
          r.trader,
          totalPnl,
          charges,
          netVal,
          Number(r.realizedPnl) || 0,
          Number(r.unrealizedPnl) || 0,
          Number(r.equity) || 100000,
          Number(r.tradesCount) || 0,
          r.status || "RUNNING",
          r.notes || "",
          nowIst,
        ];
        sheet.appendRow(rowValues);
        const actualRowNum = sheet.getLastRow();
        existingRowMap[key] = actualRowNum;
        sheet.getRange(actualRowNum, 7).setFormula(`=E${actualRowNum}-F${actualRowNum}`);
        formatRow(sheet, actualRowNum, isCombined, totalPnl, charges, r.status);
        insertedCount++;
      }
    });

    applyHeaderFormatting(sheet);

    return ContentService.createTextOutput(
      JSON.stringify({
        status: "success",
        updated: updatedCount,
        inserted: insertedCount,
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
 * If user edits Col 5 (Total P&L) or Col 6 (Brokrage), Col 7 (Total Profit)
 * is dynamically recalculated and formatted.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== "Daily PnL Ledger") return;

    const row = e.range.getRow();
    const col = e.range.getColumn();
    if (row <= 1) return; // Ignore header

    // Check if user edited Total P&L (Col 5) or Brokrage (Col 6)
    if (col === 5 || col === 6) {
      const totalPnl = Number(sheet.getRange(row, 5).getValue()) || 0;
      const charges = Number(sheet.getRange(row, 6).getValue()) || 0;
      const status = String(sheet.getRange(row, 12).getValue());

      // Ensure Total Profit formula is intact: Total P&L - Brokrage
      const netCell = sheet.getRange(row, 7);
      netCell.setFormula(`=E${row}-F${row}`);

      formatRow(sheet, row, false, totalPnl, charges, status);
    }
  } catch (err) {
    console.error("onEdit error:", err);
  }
}

/**
 * Robust date normalizer: converts Date instances, ISO dates ("2026-11-18"),
 * and display dates ("18 Nov 2026") into canonical "YYYY-MM-DD".
 */
function normalizeDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "Asia/Kolkata", "yyyy-MM-dd");
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Try parsing date string like "18 Nov 2026"
  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    return Utilities.formatDate(new Date(parsed), "Asia/Kolkata", "yyyy-MM-dd");
  }

  // Fallback: match day, month word, year
  const match = s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]+)[\s\-\/](\d{4})/);
  if (match) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, "Asia/Kolkata", "yyyy-MM-dd");
    }
  }
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Normalizes trader profile name for case-insensitive lookup
 */
function normalizeTrader(val) {
  return String(val || "").trim().toLowerCase();
}

/**
 * Deduplication Engine:
 * Scans the sheet, groups rows by canonical (Date + Trader), retains the best/latest row,
 * deletes any redundant duplicate rows, and fixes all formulas and styling.
 */
function cleanDuplicatesAndFixSheet(targetSheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = targetSheet || ss.getSheetByName("Daily PnL Ledger");
  if (!sheet) return { removed: 0, retained: 0 };

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { removed: 0, retained: 0 };

  // Read all data rows
  const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
  const groups = {}; // key => array of records

  for (let i = 0; i < data.length; i++) {
    const rowNum = i + 2;
    const rowDate = data[i][0];
    const rowTrader = data[i][3];

    const traderStr = String(rowTrader || "").trim();
    // Drop legacy combined summary rows
    if (!traderStr || traderStr.includes("ALL USERS") || traderStr.includes("Combined")) {
      continue;
    }

    const normDate = normalizeDate(rowDate);
    const normTrader = normalizeTrader(traderStr);
    if (!normDate || !normTrader) continue;

    const key = normDate + "_" + normTrader;
    if (!groups[key]) groups[key] = [];

    // Calculate record quality score to retain the most complete/latest entry
    let score = 0;
    const lastSynced = String(data[i][13] || "");
    if (lastSynced.includes("pm") || lastSynced.includes("am")) score += 20;
    if (Number(data[i][10]) > 0) score += 10; // Trades count
    if (Number(data[i][5]) > 0) score += 5;   // Brokrage
    if (Number(data[i][4]) !== 0) score += 5; // PnL

    groups[key].push({
      rowNum: rowNum,
      score: score,
      lastSynced: lastSynced,
    });
  }

  // Find duplicate row indices to delete
  const rowsToDelete = [];
  let retainedCount = 0;

  for (const key in groups) {
    const list = groups[key];
    retainedCount++;
    if (list.length > 1) {
      // Sort by score descending, then by rowNum descending (latest row wins)
      list.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.rowNum - a.rowNum;
      });
      // Retain list[0], mark rest for deletion
      for (let j = 1; j < list.length; j++) {
        rowsToDelete.push(list[j].rowNum);
      }
    }
  }

  // Delete duplicate rows from bottom to top so indices remain valid
  rowsToDelete.sort((a, b) => b - a);
  rowsToDelete.forEach((rNum) => {
    sheet.deleteRow(rNum);
  });

  // Re-format and re-link formulas for all remaining rows
  const newLastRow = sheet.getLastRow();
  if (newLastRow > 1) {
    for (let r = 2; r <= newLastRow; r++) {
      const pnl = Number(sheet.getRange(r, 5).getValue()) || 0;
      const charges = Number(sheet.getRange(r, 6).getValue()) || 0;
      const status = String(sheet.getRange(r, 12).getValue());
      sheet.getRange(r, 7).setFormula(`=E${r}-F${r}`);

      // Auto-reconcile Realized P&L if missing: Realized = Total P&L - Unrealized P&L
      const realCell = sheet.getRange(r, 8);
      const unrealCell = sheet.getRange(r, 9);
      const realVal = Number(realCell.getValue()) || 0;
      const unrealVal = Number(unrealCell.getValue()) || 0;
      if (realVal === 0 && pnl !== 0) {
        realCell.setValue(pnl - unrealVal);
      }

      formatRow(sheet, r, false, pnl, charges, status);
    }
  }

  applyHeaderFormatting(sheet);

  return { removed: rowsToDelete.length, retained: retainedCount };
}

/**
 * Utility to recalculate and fix all formula references and P&L reconciliation
 */
function recalculateAllFormulas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Daily PnL Ledger");
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  for (let r = 2; r <= lastRow; r++) {
    const pnl = Number(sheet.getRange(r, 5).getValue()) || 0;
    const charges = Number(sheet.getRange(r, 6).getValue()) || 0;
    const status = String(sheet.getRange(r, 12).getValue());
    sheet.getRange(r, 7).setFormula(`=E${r}-F${r}`);

    const realCell = sheet.getRange(r, 8);
    const unrealCell = sheet.getRange(r, 9);
    const realVal = Number(realCell.getValue()) || 0;
    const unrealVal = Number(unrealCell.getValue()) || 0;
    if (realVal === 0 && pnl !== 0) {
      realCell.setValue(pnl - unrealVal);
    }

    formatRow(sheet, r, false, pnl, charges, status);
  }
  applyHeaderFormatting(sheet);
}

/**
 * Migration helper: If user has an existing sheet with older 12 columns
 * or legacy header titles, seamlessly rename / insert columns without data loss.
 */
function migrateLegacyColumnsIfNeeded(sheet, expectedHeaders) {
  try {
    const col6Val = String(sheet.getRange(1, 6).getValue()).trim();
    if (col6Val === "Realized P&L (₹)" || col6Val.includes("Realized")) {
      // Insert 2 new columns after Column 5 (Total P&L)
      sheet.insertColumnsAfter(5, 2);
      sheet.getRange(1, 6).setValue("Brokrage (₹)");
      sheet.getRange(1, 7).setValue("Total Profit (₹)");

      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        for (let r = 2; r <= lastRow; r++) {
          sheet.getRange(r, 6).setValue(0);
          sheet.getRange(r, 7).setFormula(`=E${r}-F${r}`);
          const pnl = Number(sheet.getRange(r, 5).getValue()) || 0;
          formatRow(sheet, r, false, pnl, 0, "RUNNING");
        }
      }
    } else {
      // Standardize headers
      sheet.getRange(1, 6).setValue("Brokrage (₹)");
      sheet.getRange(1, 7).setValue("Total Profit (₹)");
    }
    applyHeaderFormatting(sheet);
  } catch (e) {
    console.error("Migration error:", e);
  }
}

/**
 * Header formatting helper:
 * Deep Navy background, Cyan text, centered, frozen top row, optimal column widths.
 */
function applyHeaderFormatting(sheet) {
  try {
    const headerRange = sheet.getRange("A1:N1");
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#0f172a");
    headerRange.setFontColor("#38bdf8");
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");
    headerRange.setFontSize(10);
    sheet.setRowHeight(1, 36);
    sheet.setFrozenRows(1);

    // Set professional column widths
    sheet.setColumnWidth(1, 115); // Date
    sheet.setColumnWidth(2, 60);  // Day
    sheet.setColumnWidth(3, 85);  // Time (IST)
    sheet.setColumnWidth(4, 180); // Trader / Profile
    sheet.setColumnWidth(5, 140); // Total P&L (₹)
    sheet.setColumnWidth(6, 130); // Brokrage (₹)
    sheet.setColumnWidth(7, 145); // Total Profit (₹)
    sheet.setColumnWidth(8, 130); // Realized P&L (₹)
    sheet.setColumnWidth(9, 135); // Unrealized P&L (₹)
    sheet.setColumnWidth(10, 140); // Account Equity (₹)
    sheet.setColumnWidth(11, 100); // Trades Count
    sheet.setColumnWidth(12, 120); // Session Status
    sheet.setColumnWidth(13, 260); // Win Rate / Notes
    sheet.setColumnWidth(14, 160); // Last Synced At
  } catch (e) {
    console.error("applyHeaderFormatting error:", e);
  }
}

/**
 * Professional Row Formatting:
 * - Proper zebra-striped alternating backgrounds (#ffffff / #f8fafc)
 * - Number formatting for all financial fields (₹ symbol, commas, red negative values)
 * - Column-specific alignments and status color highlights
 */
function formatRow(sheet, rowNum, isCombined, pnl, charges, status) {
  try {
    const rowRange = sheet.getRange(rowNum, 1, 1, 14);

    // Background & font base
    if (isCombined) {
      rowRange.setBackground("#1e293b");
      rowRange.setFontWeight("bold");
    } else {
      rowRange.setBackground(rowNum % 2 === 0 ? "#f8fafc" : "#ffffff");
      rowRange.setFontWeight("normal");
    }

    sheet.setRowHeight(rowNum, 26);
    rowRange.setVerticalAlignment("middle");
    rowRange.setFontSize(10);

    // Col 1: Date (Center)
    sheet.getRange(rowNum, 1).setHorizontalAlignment("center").setNumberFormat("@");
    // Col 2: Day (Center)
    sheet.getRange(rowNum, 2).setHorizontalAlignment("center");
    // Col 3: Time (Center)
    sheet.getRange(rowNum, 3).setHorizontalAlignment("center");
    // Col 4: Trader / Profile (Left, Bold)
    sheet.getRange(rowNum, 4).setHorizontalAlignment("left").setFontWeight("bold").setFontColor("#0f172a");

    // Col 5: Total P&L (₹) - Right, Bold, Green/Red
    const pnlCell = sheet.getRange(rowNum, 5);
    pnlCell.setHorizontalAlignment("right").setFontWeight("bold");
    pnlCell.setFontColor(pnl > 0 ? "#15803d" : pnl < 0 ? "#b91c1c" : "#475569");
    pnlCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 6: Brokrage (₹) - Right, Bold Amber
    const chgCell = sheet.getRange(rowNum, 6);
    chgCell.setHorizontalAlignment("right").setFontWeight("600");
    chgCell.setFontColor("#b45309");
    chgCell.setNumberFormat("₹#,##0.00;₹0.00");

    // Col 7: Total Profit (₹) - Right, Bold, Green/Red
    const netCell = sheet.getRange(rowNum, 7);
    netCell.setHorizontalAlignment("right").setFontWeight("bold");
    const netVal = pnl - charges;
    netCell.setFontColor(netVal > 0 ? "#15803d" : netVal < 0 ? "#b91c1c" : "#475569");
    netCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 8: Realized P&L (₹) - Right, Bold Green/Red
    const realCell = sheet.getRange(rowNum, 8);
    realCell.setHorizontalAlignment("right").setFontWeight("600");
    const realVal = Number(realCell.getValue()) || 0;
    realCell.setFontColor(realVal > 0 ? "#15803d" : realVal < 0 ? "#b91c1c" : "#475569");
    realCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 9: Unrealized P&L (₹) - Right, Bold Green/Red
    const unrealCell = sheet.getRange(rowNum, 9);
    unrealCell.setHorizontalAlignment("right").setFontWeight("600");
    const unrealVal = Number(unrealCell.getValue()) || 0;
    unrealCell.setFontColor(unrealVal > 0 ? "#15803d" : unrealVal < 0 ? "#b91c1c" : "#475569");
    unrealCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // Col 10: Account Equity (₹) - Right
    sheet.getRange(rowNum, 10).setHorizontalAlignment("right").setNumberFormat("₹#,##0.00;₹0.00");

    // Col 11: Trades Count - Center
    sheet.getRange(rowNum, 11).setHorizontalAlignment("center").setNumberFormat("#,##0");

    // Col 12: Session Status - Center, Bold (Green for RUNNING, Gray for PAUSED, Red for STOPPED)
    const statusCell = sheet.getRange(rowNum, 12);
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

    // Col 13: Win Rate / Notes - Left
    sheet.getRange(rowNum, 13).setHorizontalAlignment("left");

    // Col 14: Last Synced At - Center, Muted
    sheet.getRange(rowNum, 14).setHorizontalAlignment("center").setFontColor("#64748b").setFontSize(9);
  } catch (e) {
    console.error("formatRow error:", e);
  }
}

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "ok",
      message: "FinGroww Google Sheets Webhook is active and waiting for POST data.",
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}
