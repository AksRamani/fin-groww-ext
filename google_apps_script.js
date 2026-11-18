/**
 * FinGroww Trading Extension - Google Sheets Webhook Script (Master Ledger)
 *
 * INSTRUCTIONS TO DEPLOY:
 * 1. Open your Google Sheet.
 * 2. Click Extensions > Apps Script.
 * 3. Delete any existing code in Code.gs, paste this entire script, and click Save (💾).
 * 4. Click Deploy > New deployment (or Manage deployments > Edit > New version if updating).
 * 5. Select type: "Web app".
 * 6. Description: "FinGroww Daily PnL Sync with Charges & Taxes"
 * 7. Execute as: "Me" (your Google account).
 * 8. Who has access: "Anyone" (allows the extension to post data).
 * 9. Click "Deploy", authorize access, and copy the Web App URL (ends with /exec).
 * 10. Paste that Web App URL in the FinGroww extension popup under "Google Sheet Config".
 */

function doPost(e) {
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

    // Headers with Charges & Taxes and Net Total after Charges & Taxes
    const headers = [
      "Date",
      "Day",
      "Time (IST)",
      "Trader / Profile",
      "Total P&L (₹)",
      "Charges & Taxes (₹)",
      "Net Total after Charges & Taxes (₹)",
      "Realized P&L (₹)",
      "Unrealized P&L (₹)",
      "Account Equity (₹)",
      "Trades Count",
      "Session Status",
      "Win Rate / Notes",
      "Last Synced At",
    ];

    // Set up headers if brand new sheet
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      applyHeaderFormatting(sheet);
    } else {
      // Auto-migrate legacy 12-column layout to 14-column layout if needed
      migrateLegacyColumnsIfNeeded(sheet, headers);
    }

    const rows = payload.rows || [];

    // Purge any legacy combined summary rows from sheet
    const initialLastRow = sheet.getLastRow();
    if (initialLastRow > 1) {
      const currentValues = sheet.getRange(2, 1, initialLastRow - 1, 4).getValues();
      for (let r = currentValues.length - 1; r >= 0; r--) {
        const rowTrader = String(currentValues[r][3]).trim();
        if (!rowTrader || rowTrader.includes("ALL USERS") || rowTrader.includes("Combined")) {
          sheet.deleteRow(r + 2);
        }
      }
    }

    if (rows.length === 0) {
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "No real profile rows to write",
          count: 0,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Read all existing data to prevent duplicate rows for the same Date + Trader
    const data = sheet.getDataRange().getValues();
    const existingRowMap = {}; // Key: "YYYY-MM-DD_TraderName" => rowNumber
    for (let i = 1; i < data.length; i++) {
      const rowDate = String(data[i][0]).trim();
      const rowTrader = String(data[i][3]).trim();
      if (rowDate && rowTrader) {
        existingRowMap[rowDate + "_" + rowTrader] = i + 1;
      }
    }

    let updatedCount = 0;
    let insertedCount = 0;
    const nowIst = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    });

    rows.forEach((r) => {
      const key = String(r.date).trim() + "_" + String(r.trader).trim();
      const isCombined = String(r.trader).includes("ALL USERS");

      const totalPnl = Number(r.totalPnl) || 0;
      // Real charges & taxes fetched from the website box/server account per profile
      const charges = Number(r.charges !== undefined ? r.charges : (r.total_charges !== undefined ? r.total_charges : 0)) || 0;

      let targetRowNum = existingRowMap[key];
      if (!targetRowNum) {
        targetRowNum = sheet.getLastRow() + 1;
      }

      // Dynamic formula: Col G = Col E (Total P&L) - Col F (Charges & Taxes)
      const netFormula = `=E${targetRowNum}-F${targetRowNum}`;

      const rowValues = [
        r.date,
        r.dayName || "",
        r.time || "15:30:00",
        r.trader,
        totalPnl,
        charges,
        netFormula,
        Number(r.realizedPnl) || 0,
        Number(r.unrealizedPnl) || 0,
        Number(r.equity) || 100000,
        Number(r.tradesCount) || 0,
        r.status || "RUNNING",
        r.notes || "",
        nowIst,
      ];

      if (existingRowMap[key]) {
        // Update existing row
        const rowNum = existingRowMap[key];
        const range = sheet.getRange(rowNum, 1, 1, rowValues.length);
        range.setValues([rowValues]);
        formatRow(sheet, rowNum, isCombined, totalPnl, charges);
        updatedCount++;
      } else {
        // Append new day row
        sheet.appendRow(rowValues);
        const newRowNum = sheet.getLastRow();
        existingRowMap[key] = newRowNum;
        formatRow(sheet, newRowNum, isCombined, totalPnl, charges);
        insertedCount++;
      }
    });

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
  }
}

/**
 * Triggered automatically when user edits any cell in the Google Sheet.
 * If user edits Col 5 (Total P&L) or Col 6 (Charges & Taxes), Col 7 (Net Total after Charges)
 * is automatically recalculated and formatted.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== "Daily PnL Ledger") return;

    const row = e.range.getRow();
    const col = e.range.getColumn();
    if (row <= 1) return; // Ignore header

    // Check if user edited Total P&L (Col 5) or Charges & Taxes (Col 6)
    if (col === 5 || col === 6) {
      const totalPnl = Number(sheet.getRange(row, 5).getValue()) || 0;
      const charges = Number(sheet.getRange(row, 6).getValue()) || 0;

      // Ensure Net Total formula is intact: Total P&L - Charges & Taxes
      const netCell = sheet.getRange(row, 7);
      netCell.setFormula(`=E${row}-F${row}`);

      formatRow(sheet, row, false, totalPnl, charges);
    }
  } catch (err) {
    console.error("onEdit error:", err);
  }
}

/**
 * Migration helper: If user has an existing sheet with older 12 columns,
 * seamlessly insert Charges & Taxes and Net Total columns without data loss.
 */
function migrateLegacyColumnsIfNeeded(sheet, expectedHeaders) {
  try {
    const col6Val = String(sheet.getRange(1, 6).getValue()).trim();
    if (col6Val === "Realized P&L (₹)" || col6Val.includes("Realized")) {
      // Insert 2 new columns after Column 5 (Total P&L)
      sheet.insertColumnsAfter(5, 2);
      sheet.getRange(1, 6).setValue("Charges & Taxes (₹)");
      sheet.getRange(1, 7).setValue("Net Total after Charges & Taxes (₹)");

      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        for (let r = 2; r <= lastRow; r++) {
          sheet.getRange(r, 6).setValue(0);
          sheet.getRange(r, 7).setFormula(`=E${r}-F${r}`);
          const pnl = Number(sheet.getRange(r, 5).getValue()) || 0;
          formatRow(sheet, r, false, pnl, 0);
        }
      }
      applyHeaderFormatting(sheet);
    }
  } catch (e) {}
}

/**
 * Header formatting helper
 */
function applyHeaderFormatting(sheet) {
  try {
    const headerRange = sheet.getRange("A1:N1");
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#0f172a");
    headerRange.setFontColor("#38bdf8");
    headerRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);

    // Auto resize columns
    for (let i = 1; i <= 14; i++) {
      if (i === 4) sheet.setColumnWidth(i, 180);
      else if (i === 5 || i === 6 || i === 7) sheet.setColumnWidth(i, 160);
      else sheet.setColumnWidth(i, 130);
    }
  } catch (e) {}
}

/**
 * Row formatting helper:
 * - Col 5 (Total P&L): Green for profit, Red for loss
 * - Col 6 (Charges & Taxes): Gold/Amber
 * - Col 7 (Net Total after Charges): Bold Green (>0) or Bold Red (<0)
 */
function formatRow(sheet, rowNum, isCombined, pnl, charges) {
  try {
    const rowRange = sheet.getRange(rowNum, 1, 1, 14);
    if (isCombined) {
      rowRange.setBackground("#1e293b");
      rowRange.setFontWeight("bold");
    } else {
      rowRange.setBackground(rowNum % 2 === 0 ? "#f8fafc" : "#ffffff");
      rowRange.setFontWeight("normal");
    }

    // 1. Total P&L (Col 5)
    const pnlCell = sheet.getRange(rowNum, 5);
    pnlCell.setFontWeight("bold");
    pnlCell.setFontColor(pnl > 0 ? "#15803d" : pnl < 0 ? "#b91c1c" : "#475569");
    pnlCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");

    // 2. Charges & Taxes (Col 6)
    const chgCell = sheet.getRange(rowNum, 6);
    chgCell.setFontWeight("600");
    chgCell.setFontColor("#b45309"); // Dark Amber / Gold
    chgCell.setNumberFormat("₹#,##0.00;₹0.00");

    // 3. Net Total after Charges & Taxes (Col 7)
    const netCell = sheet.getRange(rowNum, 7);
    netCell.setFontWeight("bold");
    const netVal = pnl - charges;
    netCell.setFontColor(netVal > 0 ? "#15803d" : netVal < 0 ? "#b91c1c" : "#475569");
    netCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");
  } catch (e) {}
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
