/**
 * FinGroww Trade CSV Direct Exporter & Local Helper
 *
 * Exports all trade details directly to D:\Tred CSVs:
 * 1. Queries live profiles from FinGroww server
 * 2. Identifies all profiles in profit or loss (or with active trades)
 * 3. Fetches all 150+ closed trades and open positions with zero truncation
 * 4. Writes individual CSV files directly to D:\Tred CSVs\FinGroww_Trades_<Profile>_<YYYY-MM-DD>.csv
 * 5. Writes master consolidated CSV to D:\Tred CSVs\FinGroww_Trades_ALL_PROFILES_<YYYY-MM-DD>.csv
 * 6. Can also run as a local server on port 8787 to accept direct CSV write requests from the extension.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const TARGET_DIR = "D:\\Tred CSVs";
const PORT = 8787;

if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      })
      .on("error", reject);
  });
}

function escapeCsvCell(val) {
  if (val === null || val === undefined) return "";
  const s = String(val).replace(/\r?\n/g, " ").trim();
  if (s.includes(",") || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const headers = [
  "Trade ID",
  "Trader Profile",
  "Symbol",
  "Instrument Name",
  "Instrument Type",
  "Side",
  "Status",
  "Quantity",
  "Entry Price (INR)",
  "Exit / Current Price (INR)",
  "Target Price (INR)",
  "Stop Loss (INR)",
  "Gross P&L (INR)",
  "Charges (INR)",
  "Net P&L (INR)",
  "Return %",
  "Outcome",
  "Exit Reason",
  "Entry Time",
  "Exit Time",
  "Holding Duration",
  "Strategy",
  "Trailing State",
  "Slippage (INR)",
  "Allocated Margin (INR)",
  "Expiry Date",
  "Signal Rationale",
];

function buildRows(targetProfile, closedTrades, openPositions) {
  const rows = [];
  for (const t of closedTrades) {
    const net = Number(t.net_pnl) || 0;
    const gross = Number(t.gross_pnl) || 0;
    const charges = Number(t.charges) || 0;
    const retPct = Number(t.return_pct) || 0;
    const outcome = net > 0 ? "WIN" : net < 0 ? "LOSS" : "BREAKEVEN";
    rows.push([
      escapeCsvCell(t.trade_id || ""),
      escapeCsvCell(targetProfile),
      escapeCsvCell(t.symbol || ""),
      escapeCsvCell(t.name || t.symbol || ""),
      escapeCsvCell(t.instrument_type || "STOCK_OPTIONS"),
      escapeCsvCell(t.side || "BUY"),
      escapeCsvCell("CLOSED"),
      escapeCsvCell(t.quantity || 0),
      escapeCsvCell(Number(t.entry_price || 0).toFixed(2)),
      escapeCsvCell(Number(t.exit_price || 0).toFixed(2)),
      escapeCsvCell(Number(t.target_price || 0).toFixed(2)),
      escapeCsvCell(Number(t.stop_loss || 0).toFixed(2)),
      escapeCsvCell(gross.toFixed(2)),
      escapeCsvCell(charges.toFixed(2)),
      escapeCsvCell(net.toFixed(2)),
      escapeCsvCell(retPct.toFixed(2) + "%"),
      escapeCsvCell(outcome),
      escapeCsvCell(t.exit_reason || "MANUAL_EXIT"),
      escapeCsvCell(t.entry_time || ""),
      escapeCsvCell(t.exit_time || t.closed_at || ""),
      escapeCsvCell(
        t.holding_duration_str ||
          (t.holding_seconds ? `${t.holding_seconds}s` : ""),
      ),
      escapeCsvCell(t.strategy || ""),
      escapeCsvCell(t.trailing_state || ""),
      escapeCsvCell(Number(t.slippage || 0).toFixed(2)),
      escapeCsvCell(
        Number(t.allocated_margin || t.used_amount || 0).toFixed(2),
      ),
      escapeCsvCell(t.expiry_date || t.expiry_label || ""),
      escapeCsvCell(t.signal_rationale || ""),
    ]);
  }

  for (const pos of openPositions) {
    const unPnl = Number(pos.unrealized_pnl) || 0;
    const pnlPct = Number(pos.pnl_pct) || 0;
    const outcome =
      unPnl > 0 ? "UNREALIZED_WIN" : unPnl < 0 ? "UNREALIZED_LOSS" : "OPEN";
    rows.push([
      escapeCsvCell(pos.trade_id || ""),
      escapeCsvCell(targetProfile),
      escapeCsvCell(pos.symbol || ""),
      escapeCsvCell(pos.name || pos.symbol || ""),
      escapeCsvCell(pos.instrument_type || "STOCK_OPTIONS"),
      escapeCsvCell(pos.side || "BUY"),
      escapeCsvCell("OPEN"),
      escapeCsvCell(pos.quantity || 0),
      escapeCsvCell(Number(pos.entry_price || 0).toFixed(2)),
      escapeCsvCell(
        Number(pos.current_price || pos.ltp || pos.entry_price || 0).toFixed(2),
      ),
      escapeCsvCell(Number(pos.target_price || 0).toFixed(2)),
      escapeCsvCell(Number(pos.stop_loss || 0).toFixed(2)),
      escapeCsvCell(unPnl.toFixed(2)),
      escapeCsvCell(
        Number(pos.total_charges || pos.entry_charges || 0).toFixed(2),
      ),
      escapeCsvCell(unPnl.toFixed(2)),
      escapeCsvCell(pnlPct.toFixed(2) + "%"),
      escapeCsvCell(outcome),
      escapeCsvCell(pos.exit_reason || "OPEN_POSITION"),
      escapeCsvCell(pos.entry_time || ""),
      escapeCsvCell("-"),
      escapeCsvCell(pos.holding_duration_display || "-"),
      escapeCsvCell(pos.strategy || ""),
      escapeCsvCell(pos.trailing_state || ""),
      escapeCsvCell(Number(pos.slippage || 0).toFixed(2)),
      escapeCsvCell(
        Number(pos.allocated_margin || pos.used_amount || 0).toFixed(2),
      ),
      escapeCsvCell(pos.expiry_date || pos.expiry_label || ""),
      escapeCsvCell(pos.signal_rationale || ""),
    ]);
  }
  return rows;
}

const API_BASE = "https://api.fingroww.tech";
const FALLBACK_API_BASE = "https://fingroww-trading-y3na.onrender.com";

async function fetchFromApi(path) {
  const hosts = [API_BASE, FALLBACK_API_BASE];
  for (const h of hosts) {
    try {
      const data = await fetchJson(`${h}${path}`);
      if (data) return data;
    } catch (e) {}
  }
  return null;
}

async function exportAllTradesToDDrive() {
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  console.log(
    `[FinGroww] Fetching live profiles from server for ${todayKey}...`,
  );
  const pData = await fetchFromApi("/api/paper/profiles");
  const profiles = (pData?.profiles || []).filter((p) => {
    const pnl = Number(p.net_pnl || 0);
    const trades = Number(p.total_trades || 0);
    const u = p.user_name;
    return (
      u && !u.includes("ALL USERS") && (Math.abs(pnl) > 0.001 || trades > 0)
    );
  });

  console.log(
    `[FinGroww] Found ${profiles.length} profiles in profit or loss:`,
  );
  profiles.forEach((p) =>
    console.log(
      `  - ${p.user_name} | Net P&L: ₹${p.net_pnl} | Trades: ${p.total_trades}`,
    ),
  );

  const allMasterRows = [];
  const exportedFiles = [];

  for (const p of profiles) {
    const u = p.user_name;
    const [tRes, sRes] = await Promise.all([
      fetchFromApi(
        `/api/paper/trades?user=${encodeURIComponent(u)}&limit=10000`,
      ),
      fetchFromApi(`/api/paper/session/state?user=${encodeURIComponent(u)}`),
    ]);

    const closed = tRes?.trades || [];
    const open = sRes?.active_positions || [];

    if (closed.length === 0 && open.length === 0) continue;

    const rows = buildRows(u, closed, open);
    rows.forEach((r) => allMasterRows.push(r));

    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const sanitized = u.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `FinGroww_Trades_${sanitized}_${todayKey}.csv`;
    const filePath = path.join(TARGET_DIR, filename);

    fs.writeFileSync(filePath, csvContent, "utf8");
    console.log(`✅ Saved: ${filePath} (${rows.length} trades)`);
    exportedFiles.push(filename);
  }

  if (allMasterRows.length > 0) {
    const masterCsv =
      "\uFEFF" +
      [headers.join(","), ...allMasterRows.map((r) => r.join(","))].join(
        "\r\n",
      );
    const masterFilename = `FinGroww_Trades_ALL_PROFILES_${todayKey}.csv`;
    const masterPath = path.join(TARGET_DIR, masterFilename);
    fs.writeFileSync(masterPath, masterCsv, "utf8");
    console.log(
      `✅ Saved Master Combined CSV: ${masterPath} (${allMasterRows.length} total trades)`,
    );
    exportedFiles.push(masterFilename);
  }

  console.log(
    `\n🎉 Success! All ${exportedFiles.length} files saved directly to ${TARGET_DIR}`,
  );
  return { success: true, count: exportedFiles.length, files: exportedFiles };
}

// Start HTTP server on 8787 if launched directly or as server
function startServer() {
  const server = http.createServer(async (req, res) => {
    // Enable CORS for Chrome Extension
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === "/api/save-trades-csv" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const payload = JSON.parse(body);
          const filename =
            payload.filename || `FinGroww_Trades_${Date.now()}.csv`;
          const content = payload.csvContent || "";
          const targetDir = payload.targetDir || TARGET_DIR;

          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          const bom = content.startsWith("\uFEFF") ? "" : "\uFEFF";
          const filePath = path.join(targetDir, filename);
          fs.writeFileSync(filePath, bom + content, "utf8");
          console.log(`[Server] Saved file from extension to: ${filePath}`);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, path: filePath, filename }));
        } catch (err) {
          console.error("[Server] Error saving file:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    if (
      req.url === "/api/export-now" &&
      (req.method === "GET" || req.method === "POST")
    ) {
      try {
        const result = await exportAllTradesToDDrive();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        server: "FinGroww Local CSV Server",
        targetDir: TARGET_DIR,
      }),
    );
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(
      `FinGroww Local CSV Server listening on http://127.0.0.1:${PORT}`,
    );
    console.log(`Target Directory for CSVs: ${TARGET_DIR}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${PORT} is already in use by another process.`);
    } else {
      console.error("Server error:", err);
    }
  });
}

// If run via command line: execute export immediately
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes("--server")) {
    startServer();
    exportAllTradesToDDrive();
  } else {
    exportAllTradesToDDrive().then(() => {
      if (args.includes("--daemon")) {
        startServer();
      }
    });
  }
}

module.exports = {
  exportAllTradesToDDrive,
  startServer,
  TARGET_DIR,
};
