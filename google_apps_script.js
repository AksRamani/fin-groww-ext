/**
 * FinGroww Trading Extension - Google Sheets Webhook Script (Option A: Master Ledger)
 * 
 * INSTRUCTIONS TO DEPLOY:
 * 1. Open your Google Sheet.
 * 2. Click Extensions > Apps Script.
 * 3. Delete any default code in Code.gs, paste this entire script, and click Save (💾).
 * 4. Click Deploy > New deployment.
 * 5. Select type: "Web app".
 * 6. Description: "FinGroww Daily PnL Sync"
 * 7. Execute as: "Me" (your Google account).
 * 8. Who has access: "Anyone" (allows the extension to post data).
 * 9. Click "Deploy", authorize access, and copy the Web App URL (ends with /exec).
 * 10. Paste that Web App URL in the FinGroww extension popup under "Google Sheet Config".
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "No post data received"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("Daily PnL Ledger");
    
    // Create sheet if it does not exist
    if (!sheet) {
      sheet = ss.insertSheet("Daily PnL Ledger");
    }

    // Set up headers if empty
    if (sheet.getLastRow() === 0) {
      const headers = [
        "Date",
        "Day",
        "Time (IST)",
        "Trader / Profile",
        "Total P&L (₹)",
        "Realized P&L (₹)",
        "Unrealized P&L (₹)",
        "Account Equity (₹)",
        "Trades Count",
        "Session Status",
        "Win Rate / Notes",
        "Last Synced At"
      ];
      sheet.appendRow(headers);
      
      const headerRange = sheet.getRange("A1:L1");
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#0f172a");
      headerRange.setFontColor("#38bdf8");
      headerRange.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
      
      // Auto resize columns
      for (let i = 1; i <= 12; i++) {
        sheet.setColumnWidth(i, i === 4 ? 200 : 130);
      }
    }

    const rows = payload.rows || [];
    if (rows.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "No rows to write",
        count: 0
      })).setMimeType(ContentService.MimeType.JSON);
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
    const nowIst = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    rows.forEach(r => {
      const key = String(r.date).trim() + "_" + String(r.trader).trim();
      const isCombined = String(r.trader).includes("ALL USERS");

      const rowValues = [
        r.date,
        r.dayName || "",
        r.time || "15:30:00",
        r.trader,
        Number(r.totalPnl) || 0,
        Number(r.realizedPnl) || 0,
        Number(r.unrealizedPnl) || 0,
        Number(r.equity) || 100000,
        Number(r.tradesCount) || 0,
        r.status || "RUNNING",
        r.notes || "",
        nowIst
      ];

      if (existingRowMap[key]) {
        // Update existing row
        const rowNum = existingRowMap[key];
        const range = sheet.getRange(rowNum, 1, 1, rowValues.length);
        range.setValues([rowValues]);
        formatRow(sheet, rowNum, isCombined, Number(r.totalPnl) || 0);
        updatedCount++;
      } else {
        // Append new day row
        sheet.appendRow(rowValues);
        const newRowNum = sheet.getLastRow();
        existingRowMap[key] = newRowNum;
        formatRow(sheet, newRowNum, isCombined, Number(r.totalPnl) || 0);
        insertedCount++;
      }
    });

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      updated: updatedCount,
      inserted: insertedCount,
      total: rows.length,
      syncedAt: nowIst
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Formatting helper: highlight combined total rows and color-code P&L
function formatRow(sheet, rowNum, isCombined, pnl) {
  try {
    const rowRange = sheet.getRange(rowNum, 1, 1, 12);
    if (isCombined) {
      rowRange.setBackground("#1e293b");
      rowRange.setFontWeight("bold");
    } else {
      rowRange.setBackground(rowNum % 2 === 0 ? "#f8fafc" : "#ffffff");
      rowRange.setFontWeight("normal");
    }

    // P&L Column (Col 5)
    const pnlCell = sheet.getRange(rowNum, 5);
    pnlCell.setFontWeight("bold");
    if (pnl > 0) {
      pnlCell.setFontColor("#15803d"); // Dark Green
    } else if (pnl < 0) {
      pnlCell.setFontColor("#b91c1c"); // Dark Red
    } else {
      pnlCell.setFontColor("#475569");
    }
    pnlCell.setNumberFormat("₹#,##0.00;[Red](₹#,##0.00);₹0.00");
  } catch (e) {}
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "FinGroww Google Sheets Webhook is active and waiting for POST data."
  })).setMimeType(ContentService.MimeType.JSON);
}
