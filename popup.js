/**
 * FinGroww Paper Trading Monitor - Popup Script
 * Real-time synchronization with background service worker & open tabs
 */

let currentProfile = "";
let previousPrices = {};
let cachedAccount = {};
let cachedPositions = [];
let cachedLeaderboard = [];
let cachedProfiles = [];
let cachedDailyHistory = null;
let selectedDailyUser = "ALL";
let activeTab = "positions";

// Currency formatting
function formatInr(val) {
  const num = Number(val) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  return sign + "₹" + abs.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Update popup UI with latest synchronized data (Stale-While-Revalidate)
function updatePopupUi(payload) {
  if (!payload) return;

  const { profile, account, positions, status, leaderboard, profiles } = payload;
  currentProfile = profile || currentProfile;

  if (account && Object.keys(account).length > 0) cachedAccount = account;
  if (leaderboard && Array.isArray(leaderboard) && leaderboard.length > 0) cachedLeaderboard = leaderboard;
  if (profiles && Array.isArray(profiles) && profiles.length > 0) cachedProfiles = profiles;
  if (positions && Array.isArray(positions)) {
    const isSuspectEmpty = positions.length === 0 && (!account || Object.keys(account).length === 0);
    if (!isSuspectEmpty || cachedPositions.length === 0) {
      cachedPositions = positions;
    }
  }

  // 1. Populate Profile Selector
  const sel = document.getElementById("selProfile");
  const profList = cachedProfiles;
  if (sel && profList && profList.length > 0) {
    if (sel.children.length <= 1 || sel.value !== currentProfile) {
      sel.innerHTML = profList.map((p) => {
        const u = typeof p === "string" ? p : p.user_name;
        const style = p.trading_style ? ` (${p.trading_style})` : "";
        const isSel = u === currentProfile ? "selected" : "";
        return `<option value="${u}" ${isSel}>${u}${style}</option>`;
      }).join("");
      sel.value = currentProfile;
    }
  }

  // 2. Leaderboard Rank among Running Profiles
  const rankVal = document.getElementById("rankVal");
  const rankBadge = document.getElementById("rankBadge");
  const lb = cachedLeaderboard || [];
  const total = lb.length;
  const entry = lb.find((p) => p.user_name === currentProfile);

  if (entry && entry.rank) {
    const r = entry.rank;
    rankVal.textContent = `Rank #${r} of ${total} Running`;
    rankBadge.className = "rank-badge" + (r === 1 ? " top-1" : "");
  } else {
    const idx = lb.findIndex((p) => p.user_name === currentProfile);
    if (idx !== -1) {
      const r = idx + 1;
      rankVal.textContent = `Rank #${r} of ${total} Running`;
      rankBadge.className = "rank-badge" + (r === 1 ? " top-1" : "");
    } else {
      rankVal.textContent = `Rank -- of ${total || "--"} Running`;
      rankBadge.className = "rank-badge";
    }
  }

  // 3. Overall Net P&L & Virtual Equity
  const acc = cachedAccount || {};
  const totalPnl = Number(acc.total_pnl) || 0;
  const retPct = Number(acc.overall_return_pct) || 0;
  const pnlEl = document.getElementById("totalPnl");
  const retEl = document.getElementById("returnPct");

  pnlEl.textContent = (totalPnl > 0 ? "+" : "") + formatInr(totalPnl);
  pnlEl.className = "kpi-val " + (totalPnl > 0 ? "val-green" : (totalPnl < 0 ? "val-red" : ""));

  retEl.textContent = `${retPct >= 0 ? "+" : ""}${retPct.toFixed(2)}% Overall Return`;
  retEl.style.color = retPct > 0 ? "var(--green)" : (retPct < 0 ? "var(--red)" : "var(--text-dim)");

  document.getElementById("accountEquity").textContent = formatInr(acc.account_equity || 100000);
  document.getElementById("availableBal").textContent = `Balance: ${formatInr(acc.available_balance || 0)}`;

  // 4. Trading Engine Status Badge
  const st = status || "RUNNING";
  const stBadge = document.getElementById("engineStatusBadge");
  const stText = document.getElementById("engineStatusText");
  stText.textContent = st;
  stBadge.className = `status-badge status-${st.toLowerCase()}`;

  // 5. Open Positions Count & List
  const posList = sortPositions(cachedPositions);
  document.getElementById("posCountBadge").textContent = posList.length;

  const flashMap = {};
  posList.forEach((pos) => {
    const key = pos.trade_id || pos.symbol;
    const prev = previousPrices[key];
    const curr = Number(pos.current_price) || 0;
    if (prev !== undefined && prev !== null) {
      if (curr > prev) flashMap[key] = "up";
      else if (curr < prev) flashMap[key] = "down";
    }
    previousPrices[key] = curr;
  });

  renderPositionsList(posList, flashMap);

  // 6. Last Updated Time
  const now = new Date();
  document.getElementById("lastUpdatedTime").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Sort positions from highest profit to highest loss
function sortPositions(positions) {
  if (!positions || !Array.isArray(positions)) return [];
  return [...positions].sort((a, b) => {
    const pnlA = Number(a.unrealized_pnl) || 0;
    const pnlB = Number(b.unrealized_pnl) || 0;
    if (pnlB !== pnlA) {
      return pnlB - pnlA; // Highest profit first, down to largest loss
    }
    const pctA = Number(a.pnl_pct) || 0;
    const pctB = Number(b.pnl_pct) || 0;
    return pctB - pctA;
  });
}

// Render Positions Cards with Individual Exit Button
function renderPositionsList(positions, flashMap) {
  const container = document.getElementById("positionsList");
  if (!container) return;

  const sortedPositions = sortPositions(positions);

  if (!sortedPositions || sortedPositions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📈</div>
        <div class="empty-text">No open trades for <strong>${currentProfile}</strong></div>
      </div>
    `;
    return;
  }

  container.innerHTML = sortedPositions.map((pos) => {
    const key = pos.trade_id || pos.symbol;
    const isBuy = pos.side === "BUY";
    const pnl = Number(pos.unrealized_pnl) || 0;
    const isProfit = pnl > 0;
    const isLoss = pnl < 0;
    const pnlClass = isProfit ? "val-green" : (isLoss ? "val-red" : "");
    const borderClass = isProfit ? "pos-profit" : (isLoss ? "pos-loss" : "");
    const flashClass = flashMap[key] === "up" ? "flash-up" : (flashMap[key] === "down" ? "flash-down" : "");
    const ltp = (Number(pos.current_price) || 0).toFixed(2);
    const entry = (Number(pos.entry_price) || 0).toFixed(2);

    let pct = Number(pos.pnl_pct);
    if (isNaN(pct) || pct === undefined || pct === null) {
      if (Number(entry) > 0) {
        pct = pos.side === "SELL" 
          ? ((Number(entry) - Number(ltp)) / Number(entry)) * 100 
          : ((Number(ltp) - Number(entry)) / Number(entry)) * 100;
      } else {
        pct = 0;
      }
    }
    const pctSign = pct > 0 ? "+" : "";
    const pctFormatted = `${pctSign}${pct.toFixed(2)}%`;

    return `
      <div class="pos-card ${borderClass}">
        <div class="pos-header">
          <div class="pos-symbol-wrap">
            <span class="side-badge ${isBuy ? "side-buy" : "side-sell"}">${pos.side}</span>
            <span class="pos-symbol">${pos.symbol}</span>
          </div>
          <div class="pos-ltp ${flashClass}">₹${ltp}</div>
        </div>
        <div class="pos-body">
          <div>Entry: ₹${entry} • Qty: ${pos.quantity || 0}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="pos-pnl ${pnlClass}">${pnl > 0 ? "+" : ""}${formatInr(pnl)} (${pctFormatted})</span>
            <button type="button" class="btn-pos-exit" data-trade-id="${pos.trade_id}" data-symbol="${pos.symbol}" title="Close this position">✕ Exit</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Attach Exit Handlers
  const exitBtns = container.querySelectorAll(".btn-pos-exit");
  exitBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const tradeId = btn.getAttribute("data-trade-id");
      const sym = btn.getAttribute("data-symbol");
      btn.textContent = "Exiting...";
      btn.disabled = true;
      chrome.runtime.sendMessage({
        type: "CLOSE_POSITION",
        profile: currentProfile,
        tradeId: tradeId
      });
    });
  });
}

// Check Indian Market Hours (IST 9:00 AM - 3:30 PM, Mon-Fri)
function updateMarketStatusIndicator(isOpenFromServer) {
  const descEl = document.getElementById("marketStatusDesc");
  const textEl = document.getElementById("marketStatusText");
  if (!descEl || !textEl) return;

  let isLocalOpen = false;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour12: false,
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      second: "numeric"
    });
    const parts = formatter.formatToParts(new Date());
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const weekday = map.weekday;
    const isWeekday = weekday !== "Sat" && weekday !== "Sun";
    if (isWeekday) {
      const hour = parseInt(map.hour, 10) % 24;
      const minute = parseInt(map.minute, 10);
      const totalMins = hour * 60 + minute;
      isLocalOpen = totalMins >= 540 && totalMins < 930;
    }
  } catch (e) {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (3600000 * 5.5));
    const day = ist.getDay();
    const totalMins = ist.getHours() * 60 + ist.getMinutes();
    isLocalOpen = (day >= 1 && day <= 5) && (totalMins >= 540 && totalMins < 930);
  }

  // Strictly closed past 3:30 PM IST or weekends; during hours, respect backend closed (holiday)
  const isOpen = isLocalOpen && (isOpenFromServer !== false);

  if (isOpen) {
    descEl.className = "setting-desc market-open";
    textEl.textContent = "Market Open (Closes 3:30 PM IST)";
  } else {
    descEl.className = "setting-desc market-closed";
    textEl.textContent = "Market Closed (Opens 9:00 AM Mon-Fri)";
  }
}

// Compute Day-to-Day P&L Summary & Records for selected user or ALL users
function computeDailyPnlSummary(historyByUser, targetUser = "ALL") {
  let records = [];

  if (targetUser === "ALL") {
    const dateMap = {};
    for (const [user, userDays] of Object.entries(historyByUser || {})) {
      for (const [dateKey, dayData] of Object.entries(userDays || {})) {
        if (!dateMap[dateKey]) {
          dateMap[dateKey] = {
            date: dateKey,
            displayDate: dayData.displayDate || dateKey,
            dayName: dayData.dayName || "",
            totalPnl: 0,
            realizedPnl: 0,
            unrealizedPnl: 0,
            tradesCount: 0,
            winningUsers: 0,
            losingUsers: 0,
            userBreakdown: []
          };
        }
        const pnl = Number(dayData.totalPnl) || 0;
        dateMap[dateKey].totalPnl += pnl;
        dateMap[dateKey].realizedPnl += Number(dayData.realizedPnl) || 0;
        dateMap[dateKey].unrealizedPnl += Number(dayData.unrealizedPnl) || 0;
        dateMap[dateKey].tradesCount += Number(dayData.tradesCount) || 0;
        if (pnl > 0) dateMap[dateKey].winningUsers++;
        else if (pnl < 0) dateMap[dateKey].losingUsers++;

        dateMap[dateKey].userBreakdown.push({
          user: user,
          pnl: pnl,
          tradesCount: dayData.tradesCount || 0,
          status: dayData.status || "RUNNING"
        });
      }
    }
    records = Object.values(dateMap);
  } else {
    const userDays = (historyByUser && historyByUser[targetUser]) || {};
    records = Object.values(userDays).map(d => ({
      ...d,
      user: targetUser
    }));
  }

  // Sort descending by date (newest session first)
  records.sort((a, b) => b.date.localeCompare(a.date));

  let totalProfit = 0;
  let totalLoss = 0;
  let netPnl = 0;
  let winDaysCount = 0;
  let lossDaysCount = 0;
  let breakevenDaysCount = 0;

  for (const r of records) {
    const pnl = Number(r.totalPnl) || 0;
    netPnl += pnl;
    if (pnl > 0) {
      totalProfit += pnl;
      winDaysCount++;
    } else if (pnl < 0) {
      totalLoss += Math.abs(pnl);
      lossDaysCount++;
    } else {
      breakevenDaysCount++;
    }
  }

  const totalTradingDays = records.length;
  const winRate = totalTradingDays > 0 ? (winDaysCount / totalTradingDays) * 100 : 0;

  return {
    records,
    totalProfit,
    totalLoss,
    netPnl,
    winDaysCount,
    lossDaysCount,
    breakevenDaysCount,
    totalTradingDays,
    winRate
  };
}

// Render Day-to-Day Profit & Loss View (User-Wise & All Active Users)
function renderDailyPnlView() {
  const historyByUser = cachedDailyHistory?.byUser || {};

  // 1. Populate User Filter Dropdown
  const selDailyUser = document.getElementById("selDailyUser");
  if (selDailyUser) {
    // Gather unique users from history, profiles, and leaderboard
    const userSet = new Set();
    Object.keys(historyByUser).forEach(u => userSet.add(u));
    cachedProfiles.forEach(p => {
      const u = typeof p === "string" ? p : p.user_name;
      if (u) userSet.add(u);
    });
    cachedLeaderboard.forEach(p => {
      const u = p.user_name || p.name;
      if (u) userSet.add(u);
    });

    const userList = Array.from(userSet).sort();
    const currentVal = selectedDailyUser || "ALL";

    selDailyUser.innerHTML = `
      <option value="ALL" ${currentVal === "ALL" ? "selected" : ""}>👥 All Active Users (Combined)</option>
      ${userList.map(u => `<option value="${u}" ${currentVal === u ? "selected" : ""}>👤 ${u}</option>`).join("")}
    `;
    selDailyUser.value = currentVal;
  }

  // 2. Compute Summary Metrics
  const summary = computeDailyPnlSummary(historyByUser, selectedDailyUser);

  const profitEl = document.getElementById("dailyTotalProfit");
  const profitSubEl = document.getElementById("dailyProfitDaysCount");
  const lossEl = document.getElementById("dailyTotalLoss");
  const lossSubEl = document.getElementById("dailyLossDaysCount");
  const netEl = document.getElementById("dailyNetPnl");
  const winRateEl = document.getElementById("dailyWinRate");
  const countBadge = document.getElementById("dailyDaysCountBadge");
  const syncTimeEl = document.getElementById("dailySyncTime");

  if (profitEl) profitEl.textContent = "+" + formatInr(summary.totalProfit);
  if (profitSubEl) profitSubEl.textContent = `${summary.winDaysCount} winning day${summary.winDaysCount === 1 ? "" : "s"}`;
  if (lossEl) lossEl.textContent = "-" + formatInr(summary.totalLoss);
  if (lossSubEl) lossSubEl.textContent = `${summary.lossDaysCount} losing day${summary.lossDaysCount === 1 ? "" : "s"}`;

  if (netEl) {
    const sign = summary.netPnl > 0 ? "+" : "";
    netEl.textContent = sign + formatInr(summary.netPnl);
    netEl.className = "daily-kpi-val " + (summary.netPnl > 0 ? "val-green" : (summary.netPnl < 0 ? "val-red" : ""));
  }

  if (winRateEl) {
    winRateEl.textContent = `Win Rate: ${summary.winRate.toFixed(1)}% (${summary.winDaysCount}W - ${summary.lossDaysCount}L)`;
  }
  if (countBadge) countBadge.textContent = `${summary.totalTradingDays} Days`;
  if (syncTimeEl) {
    const now = new Date();
    syncTimeEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // 3. Render Day Cards List
  const listContainer = document.getElementById("dailyPnlList");
  if (!listContainer) return;

  if (summary.records.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <div class="empty-text">No daily history recorded for <strong>${selectedDailyUser === "ALL" ? "active users" : selectedDailyUser}</strong></div>
      </div>
    `;
    return;
  }

  let todayKey = "";
  try {
    todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch (e) {
    todayKey = new Date().toISOString().slice(0, 10);
  }

  listContainer.innerHTML = summary.records.map((r, idx) => {
    const pnl = Number(r.totalPnl) || 0;
    const isProfit = pnl > 0;
    const isLoss = pnl < 0;
    const isToday = r.date === todayKey;

    const rowClass = isProfit ? "is-profit" : (isLoss ? "is-loss" : "is-breakeven");
    const pillClass = isProfit ? "pill-profit" : (isLoss ? "pill-loss" : "pill-neutral");
    const pnlSign = isProfit ? "+" : "";

    const userLabel = selectedDailyUser === "ALL" 
      ? `👥 ${r.userBreakdown?.length || 0} Traders (${r.winningUsers || 0}W / ${r.losingUsers || 0}L)`
      : `👤 ${r.user || selectedDailyUser}`;

    const tradesLabel = `${r.tradesCount || 0} trade${r.tradesCount === 1 ? "" : "s"}`;

    const breakdownHtml = (selectedDailyUser === "ALL" && r.userBreakdown && r.userBreakdown.length > 0)
      ? `
        <div class="daily-users-breakdown" id="breakdown-${idx}">
          ${r.userBreakdown.map(ub => {
            const uPnl = Number(ub.pnl) || 0;
            const uSign = uPnl > 0 ? "+" : "";
            const uColor = uPnl > 0 ? "val-green" : (uPnl < 0 ? "val-red" : "");
            return `
              <div class="daily-user-breakdown-row">
                <span style="font-weight:600;color:#c9d1d9;">${ub.user}</span>
                <span style="color:#8b949e;">${ub.tradesCount || 0} trades</span>
                <span class="${uColor}" style="font-weight:700;font-family:var(--font-mono);">${uSign}${formatInr(uPnl)}</span>
              </div>
            `;
          }).join("")}
        </div>
      `
      : "";

    return `
      <div class="daily-pnl-item ${rowClass}">
        <div class="daily-item-top">
          <div class="daily-date-group">
            <span class="daily-date-title">${r.displayDate || r.date}</span>
            <span class="daily-day-badge">${r.dayName || ""}</span>
            ${isToday ? `<span class="daily-today-badge">Today</span>` : ""}
          </div>
          <span class="daily-pnl-pill ${pillClass}">
            ${pnlSign}${formatInr(pnl)}
          </span>
        </div>

        <div class="daily-item-bottom">
          <span class="daily-user-tag">${userLabel}</span>
          <span class="daily-trades-tag">📊 ${tradesLabel}</span>
        </div>

        ${breakdownHtml}
      </div>
    `;
  }).join("");
}

// Generate & Download CSV of All Recorded Daily P&L (Option A: Master Ledger)
function exportDailyPnlToCsv() {
  const historyByUser = cachedDailyHistory?.byUser || {};
  const allDates = Array.from(new Set(Object.values(historyByUser).flatMap(u => Object.keys(u)))).sort((a, b) => b.localeCompare(a));

  if (allDates.length === 0) {
    alert("No daily P&L records available to export.");
    return;
  }

  const csvRows = [
    ["Date", "Day", "Time (IST)", "Trader / Profile", "Total P&L (INR)", "Realized P&L (INR)", "Unrealized P&L (INR)", "Account Equity (INR)", "Trades Count", "Session Status", "Win Rate / Notes"]
  ];

  for (const dKey of allDates) {
    let combinedTotalPnl = 0;
    let combinedRealizedPnl = 0;
    let combinedUnrealizedPnl = 0;
    let combinedEquity = 0;
    let combinedTrades = 0;
    let winningTraders = 0;
    let losingTraders = 0;
    let dDisplay = dKey;
    let dDay = "";

    const userRows = [];

    for (const [userName, userDays] of Object.entries(historyByUser)) {
      const dayRecord = userDays[dKey];
      if (!dayRecord) continue;

      dDisplay = dayRecord.displayDate || dKey;
      dDay = dayRecord.dayName || "";

      const pnl = Number(dayRecord.totalPnl) || 0;
      const realized = Number(dayRecord.realizedPnl) || 0;
      const unrealized = Number(dayRecord.unrealizedPnl) || 0;
      const eq = Number(dayRecord.equity) || 100000;
      const trades = Number(dayRecord.tradesCount) || 0;

      combinedTotalPnl += pnl;
      combinedRealizedPnl += realized;
      combinedUnrealizedPnl += unrealized;
      combinedEquity += eq;
      combinedTrades += trades;
      if (pnl > 0) winningTraders++;
      else if (pnl < 0) losingTraders++;

      userRows.push([
        `"${dDisplay}"`,
        `"${dDay}"`,
        `"15:30:00"`,
        `"${userName}"`,
        pnl.toFixed(2),
        realized.toFixed(2),
        unrealized.toFixed(2),
        eq.toFixed(2),
        trades,
        `"${dayRecord.status || (pnl >= 0 ? "PROFIT" : "LOSS")}"`,
        `"${trades} trades executed"`
      ]);
    }

    if (userRows.length > 0) {
      const combinedWinRate = (winningTraders + losingTraders) > 0
        ? ((winningTraders / (winningTraders + losingTraders)) * 100).toFixed(1) + "%"
        : "N/A";

      // Combined Row first
      csvRows.push([
        `"${dDisplay}"`,
        `"${dDay}"`,
        `"15:30:00"`,
        `"ALL USERS (Combined)"`,
        combinedTotalPnl.toFixed(2),
        combinedRealizedPnl.toFixed(2),
        combinedUnrealizedPnl.toFixed(2),
        combinedEquity.toFixed(2),
        combinedTrades,
        `"${combinedTotalPnl > 0 ? "PROFIT" : (combinedTotalPnl < 0 ? "LOSS" : "BREAKEVEN")}"`,
        `"Win Rate: ${combinedWinRate} (${winningTraders}W / ${losingTraders}L)"`
      ]);

      // User Rows
      userRows.forEach(ur => csvRows.push(ur));
    }
  }

  const csvContent = csvRows.map(e => e.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const todayIso = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `FinGroww_Daily_PnL_Ledger_${todayIso}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Google Sheet Sync & Webhook UI Controllers
function setupGsheetSyncControls() {
  const gsheetBadge = document.getElementById("gsheetStatusBadge");
  const gsheetDesc = document.getElementById("gsheetStatusDesc");
  const btnToggleConfig = document.getElementById("btnToggleGsheetConfig");
  const configBox = document.getElementById("gsheetConfigBox");
  const txtUrl = document.getElementById("txtGsheetUrl");
  const btnSave = document.getElementById("btnSaveGsheetUrl");
  const chkAutoSync = document.getElementById("chkGsheetAutoSync");
  const btnSyncNow = document.getElementById("btnSyncGsheetNow");
  const btnExportCsv = document.getElementById("btnExportCsv");
  const syncIcon = document.getElementById("gsheetSyncIcon");
  const syncMsg = document.getElementById("gsheetLastSyncMsg");

  // Read stored Google Sheet config
  chrome.storage.local.get([
    "fg_gsheet_url",
    "fg_gsheet_autosync",
    "fg_gsheet_last_sync_date",
    "fg_gsheet_last_sync_time",
    "fg_gsheet_last_sync_status",
    "fg_gsheet_last_sync_msg"
  ], (res) => {
    if (txtUrl && res.fg_gsheet_url) {
      txtUrl.value = res.fg_gsheet_url;
    }
    if (chkAutoSync && res.fg_gsheet_autosync !== undefined) {
      chkAutoSync.checked = res.fg_gsheet_autosync === true;
    }

    updateGsheetStatusUi(res);
  });

  function updateGsheetStatusUi(state) {
    if (!gsheetBadge) return;
    const url = state?.fg_gsheet_url || txtUrl?.value?.trim();
    const status = state?.fg_gsheet_last_sync_status;
    const lastDate = state?.fg_gsheet_last_sync_date;

    if (!url) {
      gsheetBadge.className = "gsheet-badge gsheet-badge-idle";
      gsheetBadge.textContent = "Not Configured";
      if (gsheetDesc) gsheetDesc.textContent = "Click Config to connect Google Sheet";
    } else if (status === "SUCCESS") {
      gsheetBadge.className = "gsheet-badge gsheet-badge-ok";
      gsheetBadge.textContent = lastDate ? `Synced (${lastDate})` : "Connected";
      if (gsheetDesc) gsheetDesc.textContent = "Connected • Auto-syncs at 3:30 PM IST";
    } else if (status === "ERROR") {
      gsheetBadge.className = "gsheet-badge gsheet-badge-err";
      gsheetBadge.textContent = "Sync Error";
      if (gsheetDesc) gsheetDesc.textContent = "Error during last sync • Check Config";
    } else {
      gsheetBadge.className = "gsheet-badge gsheet-badge-ok";
      gsheetBadge.textContent = "Connected";
      if (gsheetDesc) gsheetDesc.textContent = "Connected • Auto-syncs at 3:30 PM IST";
    }

    if (syncMsg && state?.fg_gsheet_last_sync_msg) {
      syncMsg.textContent = state.fg_gsheet_last_sync_msg;
    }
  }

  // Toggle Config Drawer
  if (btnToggleConfig && configBox) {
    btnToggleConfig.addEventListener("click", () => {
      const isHidden = configBox.style.display === "none";
      configBox.style.display = isHidden ? "block" : "none";
      btnToggleConfig.textContent = isHidden ? "✕ Close" : "⚙️ Config";
      if (isHidden && txtUrl) txtUrl.focus();
    });
  }

  // Save Webhook URL
  if (btnSave && txtUrl) {
    btnSave.addEventListener("click", () => {
      const url = txtUrl.value.trim();
      if (url && !url.startsWith("http")) {
        alert("Please enter a valid Google Apps Script Web App URL (starts with https://script.google.com/...)");
        return;
      }
      chrome.storage.local.set({ fg_gsheet_url: url }, () => {
        btnSave.textContent = "Saved ✓";
        setTimeout(() => { btnSave.textContent = "Save"; }, 1500);
        updateGsheetStatusUi({ fg_gsheet_url: url });
      });
    });
  }

  // Auto-sync Checkbox
  if (chkAutoSync) {
    chkAutoSync.addEventListener("change", (e) => {
      chrome.storage.local.set({ fg_gsheet_autosync: e.target.checked });
    });
  }

  // Sync to Sheet Now Button
  if (btnSyncNow) {
    btnSyncNow.addEventListener("click", () => {
      chrome.storage.local.get(["fg_gsheet_url"], (res) => {
        const url = res.fg_gsheet_url || txtUrl?.value?.trim();
        if (!url) {
          if (configBox) configBox.style.display = "block";
          if (btnToggleConfig) btnToggleConfig.textContent = "✕ Close";
          if (txtUrl) {
            txtUrl.focus();
            alert("Please paste your Google Apps Script Webhook URL and click Save first.");
          }
          return;
        }

        btnSyncNow.disabled = true;
        if (syncIcon) syncIcon.textContent = "⏳";
        if (syncMsg) syncMsg.textContent = "Syncing records to Google Sheet...";

        chrome.runtime.sendMessage({
          type: "SYNC_GOOGLE_SHEET",
          options: { allDates: true } // Sync all historical and current day records!
        }, (response) => {
          btnSyncNow.disabled = false;
          if (response && response.success) {
            if (syncIcon) syncIcon.textContent = "✅";
            if (syncMsg) syncMsg.textContent = `Synced ${response.count} rows successfully to Google Sheet!`;
            updateGsheetStatusUi({ fg_gsheet_url: url, fg_gsheet_last_sync_status: "SUCCESS" });
          } else {
            if (syncIcon) syncIcon.textContent = "⚠️";
            const err = response?.error || "Unknown sync error";
            if (syncMsg) syncMsg.textContent = `Sync failed: ${err}`;
            updateGsheetStatusUi({ fg_gsheet_url: url, fg_gsheet_last_sync_status: "ERROR", fg_gsheet_last_sync_msg: err });
          }

          setTimeout(() => {
            if (syncIcon) syncIcon.textContent = "📤";
          }, 3000);
        });
      });
    });
  }

  // Export CSV Button
  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", exportDailyPnlToCsv);
  }
}

// Event Listeners & Boot
document.addEventListener("DOMContentLoaded", async () => {
  // Read stored data first for instant render
  try {
    const stored = await chrome.storage.local.get([
      "fg_latest_data",
      "fg_selected_profile",
      "fg_show_after_hours",
      "fg_daily_pnl_history",
      "fg_profiles_cache"
    ]);

    if (stored && stored.fg_selected_profile) {
      currentProfile = stored.fg_selected_profile;
    }
    if (stored && stored.fg_profiles_cache) {
      cachedProfiles = stored.fg_profiles_cache;
    }
    if (stored && stored.fg_daily_pnl_history) {
      cachedDailyHistory = stored.fg_daily_pnl_history;
    }
    if (stored && stored.fg_latest_data) {
      updatePopupUi(stored.fg_latest_data);
      if (stored.fg_latest_data.daily_pnl) {
        cachedDailyHistory = stored.fg_latest_data.daily_pnl;
      }
      if (typeof stored.fg_latest_data.is_market_open === "boolean") {
        updateMarketStatusIndicator(stored.fg_latest_data.is_market_open);
      }
    }

    renderDailyPnlView();

    const toggleShow = document.getElementById("toggleShowAfterHours");
    if (toggleShow) {
      toggleShow.checked = stored?.fg_show_after_hours === true;
      toggleShow.addEventListener("change", (e) => {
        chrome.storage.local.set({ fg_show_after_hours: e.target.checked });
      });
    }
  } catch (e) {}

  updateMarketStatusIndicator();
  setInterval(updateMarketStatusIndicator, 1000);

  // Initialize Google Sheet sync & CSV export controls
  setupGsheetSyncControls();

  // Tab Navigation Handling
  const tabBtnPositions = document.getElementById("tabBtnPositions");
  const tabBtnDailyPnl = document.getElementById("tabBtnDailyPnl");
  const panelPositions = document.getElementById("panelPositions");
  const panelDailyPnl = document.getElementById("panelDailyPnl");

  function switchTab(tab) {
    activeTab = tab;
    if (tab === "positions") {
      tabBtnPositions.classList.add("active");
      tabBtnPositions.setAttribute("aria-selected", "true");
      tabBtnDailyPnl.classList.remove("active");
      tabBtnDailyPnl.setAttribute("aria-selected", "false");
      if (panelPositions) panelPositions.style.display = "block";
      if (panelDailyPnl) panelDailyPnl.style.display = "none";
    } else {
      tabBtnDailyPnl.classList.add("active");
      tabBtnDailyPnl.setAttribute("aria-selected", "true");
      tabBtnPositions.classList.remove("active");
      tabBtnPositions.setAttribute("aria-selected", "false");
      if (panelDailyPnl) panelDailyPnl.style.display = "block";
      if (panelPositions) panelPositions.style.display = "none";
      renderDailyPnlView();
    }
  }

  if (tabBtnPositions) tabBtnPositions.addEventListener("click", () => switchTab("positions"));
  if (tabBtnDailyPnl) tabBtnDailyPnl.addEventListener("click", () => switchTab("dailyPnl"));

  // Daily P&L User Filter Change
  const selDailyUser = document.getElementById("selDailyUser");
  if (selDailyUser) {
    selDailyUser.addEventListener("change", (e) => {
      selectedDailyUser = e.target.value;
      renderDailyPnlView();
    });
  }

  // Request fresh sync from background
  chrome.runtime.sendMessage({ type: "FORCE_REFRESH" });

  // Listen for real-time background sync updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.fg_show_after_hours !== undefined) {
        const toggleShow = document.getElementById("toggleShowAfterHours");
        if (toggleShow) toggleShow.checked = changes.fg_show_after_hours.newValue === true;
      }
      if (changes.fg_selected_profile) {
        currentProfile = changes.fg_selected_profile.newValue || currentProfile;
      }
      if (changes.fg_daily_pnl_history) {
        cachedDailyHistory = changes.fg_daily_pnl_history.newValue;
        renderDailyPnlView();
      }
      if (changes.fg_latest_data) {
        updatePopupUi(changes.fg_latest_data.newValue);
        if (changes.fg_latest_data.newValue?.daily_pnl) {
          cachedDailyHistory = changes.fg_latest_data.newValue.daily_pnl;
          renderDailyPnlView();
        }
        if (typeof changes.fg_latest_data.newValue?.is_market_open === "boolean") {
          updateMarketStatusIndicator(changes.fg_latest_data.newValue.is_market_open);
        }
      }
    }
  });

  // Profile Selector Change
  const sel = document.getElementById("selProfile");
  if (sel) {
    sel.addEventListener("change", (e) => {
      const selected = e.target.value;
      if (selected && selected !== currentProfile) {
        currentProfile = selected;
        chrome.runtime.sendMessage({ type: "SET_PROFILE", profile: selected });
      }
    });
  }

  // Refresh Button
  const btnRefresh = document.getElementById("btnRefresh");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      const icon = document.getElementById("refreshIcon");
      if (icon) icon.classList.add("spinning");
      chrome.runtime.sendMessage({ type: "FORCE_REFRESH" }, () => {
        setTimeout(() => {
          if (icon) icon.classList.remove("spinning");
        }, 600);
      });
    });
  }

  // Leaderboard Link
  const btnLeaderboard = document.getElementById("btnOpenLeaderboard");
  if (btnLeaderboard) {
    btnLeaderboard.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://fingroww.tech/ai-auto-paper-trading.html#leaderboardSection" });
    });
  }
});
