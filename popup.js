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
let selectedDailyUser = "";
let activeTab = "positions";

function filterRealHistory(history) {
  if (!history || !history.byUser) return { byUser: {} };
  const cleanByUser = {};
  for (const [user, days] of Object.entries(history.byUser)) {
    const cleanDays = {};
    for (const [dateKey, dayRec] of Object.entries(days || {})) {
      if (!dayRec || dayRec.isReal === false) continue;
      const trades = Number(dayRec.tradesCount) || 0;
      const pnl = Number(dayRec.totalPnl) || 0;
      const realized = Number(dayRec.realizedPnl) || 0;
      if (trades > 0 || pnl !== 0 || realized !== 0) {
        cleanDays[dateKey] = dayRec;
      }
    }
    if (Object.keys(cleanDays).length > 0) {
      cleanByUser[user] = cleanDays;
    }
  }
  return { byUser: cleanByUser };
}

// Currency formatting
function formatInr(val) {
  const num = Number(val) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  return (
    sign +
    "₹" +
    abs.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// Update popup UI with latest synchronized data (Stale-While-Revalidate)
function updatePopupUi(payload) {
  if (!payload) return;

  const { profile, account, positions, status, leaderboard, profiles } =
    payload;

  if (leaderboard && Array.isArray(leaderboard) && leaderboard.length > 0)
    cachedLeaderboard = leaderboard;
  if (profiles && Array.isArray(profiles) && profiles.length > 0)
    cachedProfiles = profiles;

  // Reject payloads that belong to a different profile than the currently selected one!
  if (profile && currentProfile && profile !== currentProfile) {
    return;
  }

  if (profile) currentProfile = profile;

  if (account && Object.keys(account).length > 0) cachedAccount = account;
  if (positions && Array.isArray(positions)) {
    cachedPositions = positions;
  }

  // 1. Populate Profile Selector (Merge all real profiles from server)
  const sel = document.getElementById("selProfile");
  const profileMap = new Map();
  if (Array.isArray(cachedProfiles)) {
    cachedProfiles.forEach((p) => {
      const u = typeof p === "string" ? p : p.user_name;
      if (u) profileMap.set(u, p);
    });
  }
  if (Array.isArray(cachedLeaderboard)) {
    cachedLeaderboard.forEach((p) => {
      const u = p.user_name || p.name;
      if (u && !profileMap.has(u)) profileMap.set(u, p);
    });
  }
  const profList = Array.from(profileMap.values());

  if (sel && profList.length > 0) {
    if (
      sel.children.length !== profList.length ||
      sel.value !== currentProfile
    ) {
      sel.innerHTML = profList
        .map((p) => {
          const u = typeof p === "string" ? p : p.user_name;
          const style = p.trading_style ? ` (${p.trading_style})` : "";
          const isSel = u === currentProfile ? "selected" : "";
          return `<option value="${u}" ${isSel}>${u}${style}</option>`;
        })
        .join("");
      sel.value = currentProfile;
    }
  }

  // 2. Leaderboard Rank among Running Profiles Only
  const rankVal = document.getElementById("rankVal");
  const rankBadge = document.getElementById("rankBadge");
  const lb = cachedLeaderboard || [];

  // Filter running profiles only
  const runningList = lb.filter(p => {
    const st = (p.status || "").toUpperCase();
    return st === "RUNNING" || st === "STOPPED_NEW_TRADES";
  });
  const totalRunning = runningList.length || 6;

  const entry = lb.find((p) => (p.user_name || p.name) === currentProfile);
  const isRunning = entry && ((entry.status || "").toUpperCase() === "RUNNING" || (entry.status || "").toUpperCase() === "STOPPED_NEW_TRADES");

  let r = null;
  if (isRunning) {
    if (entry.rank) {
      r = entry.rank;
    } else {
      const idx = runningList.findIndex((p) => (p.user_name || p.name) === currentProfile);
      if (idx !== -1) r = idx + 1;
    }
  }

  if (isRunning && r) {
    rankVal.textContent = `Rank #${r} of ${totalRunning} Running`;
    rankBadge.className = "rank-badge" + (Number(r) === 1 ? " top-1" : "");
    rankBadge.title = `${currentProfile} is Rank #${r} out of ${totalRunning} active running profiles`;
  } else {
    const st = entry?.status || "NOT RUNNING";
    rankVal.textContent = `Rank -- of ${totalRunning} Running`;
    rankBadge.className = "rank-badge";
    rankBadge.title = `${currentProfile} is ${st} (not in running competition)`;
  }

  // 3. Overall Net P&L & Virtual Equity
  const acc = cachedAccount || {};
  const totalPnl = Number(acc.total_pnl !== undefined ? acc.total_pnl : (entry?.net_pnl !== undefined ? entry.net_pnl : (entry?.total_pnl !== undefined ? entry.total_pnl : 0))) || 0;
  const retPct = Number(acc.overall_return_pct !== undefined ? acc.overall_return_pct : (entry?.roi_pct !== undefined ? entry.roi_pct : 0)) || 0;
  const pnlEl = document.getElementById("totalPnl");
  const retEl = document.getElementById("returnPct");

  pnlEl.textContent = (totalPnl > 0 ? "+" : "") + formatInr(totalPnl);
  pnlEl.className =
    "kpi-val " + (totalPnl > 0 ? "val-green" : totalPnl < 0 ? "val-red" : "");

  const charges = Number(acc.total_charges || acc.charges || 0);
  const netAfterCharges = totalPnl - charges;

  retEl.textContent = `${retPct >= 0 ? "+" : ""}${retPct.toFixed(2)}% Overall Return`;
  retEl.style.color =
    retPct > 0 ? "var(--green)" : retPct < 0 ? "var(--red)" : "var(--text-dim)";

  // Update Professional Financial Breakdown Strip (Brokrage & Total Profit)
  const elBrokerage = document.getElementById("kpiBrokerageVal");
  if (elBrokerage) {
    elBrokerage.textContent = formatInr(charges);
  }
  const elTotalProfit = document.getElementById("kpiTotalProfitVal");
  if (elTotalProfit) {
    elTotalProfit.textContent = (netAfterCharges > 0 ? "+" : "") + formatInr(netAfterCharges);
    elTotalProfit.className =
      "strip-value " + (netAfterCharges > 0 ? "val-green" : netAfterCharges < 0 ? "val-red" : "");
  }

  document.getElementById("accountEquity").textContent = formatInr(
    acc.account_equity || entry?.equity || entry?.account_equity || 100000,
  );
  document.getElementById("availableBal").textContent =
    `Balance: ${formatInr(acc.available_balance || (entry?.equity || entry?.account_equity || 100000) - (acc.used_margin || 0))}`;

  // Update Trade Details CSV badge
  const tradesBadge = document.getElementById("tradesExportCountBadge");
  if (tradesBadge) {
    const totalTr =
      entry?.total_trades !== undefined
        ? entry.total_trades
        : acc.closed_trades_count !== undefined
          ? acc.closed_trades_count
          : cachedPositions.length || "--";
    tradesBadge.textContent = `${totalTr} Trades`;
  }

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
  document.getElementById("lastUpdatedTime").textContent =
    now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
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

  container.innerHTML = sortedPositions
    .map((pos) => {
      const key = pos.trade_id || pos.symbol;
      const isBuy = pos.side === "BUY";
      const pnl = Number(pos.unrealized_pnl) || 0;
      const isProfit = pnl > 0;
      const isLoss = pnl < 0;
      const pnlClass = isProfit ? "val-green" : isLoss ? "val-red" : "";
      const borderClass = isProfit ? "pos-profit" : isLoss ? "pos-loss" : "";
      const flashClass =
        flashMap[key] === "up"
          ? "flash-up"
          : flashMap[key] === "down"
            ? "flash-down"
            : "";
      const ltp = (Number(pos.current_price) || 0).toFixed(2);
      const entry = (Number(pos.entry_price) || 0).toFixed(2);

      let pct = Number(pos.pnl_pct);
      if (isNaN(pct) || pct === undefined || pct === null) {
        if (Number(entry) > 0) {
          pct =
            pos.side === "SELL"
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
    })
    .join("");

  // Attach Exit Handlers
  const exitBtns = container.querySelectorAll(".btn-pos-exit");
  exitBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tradeId = btn.getAttribute("data-trade-id");
      const sym = btn.getAttribute("data-symbol");
      btn.textContent = "Exiting...";
      btn.disabled = true;
      chrome.runtime.sendMessage({
        type: "CLOSE_POSITION",
        profile: currentProfile,
        tradeId: tradeId,
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
      second: "numeric",
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
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 3600000 * 5.5);
    const day = ist.getDay();
    const totalMins = ist.getHours() * 60 + ist.getMinutes();
    isLocalOpen = day >= 1 && day <= 5 && totalMins >= 540 && totalMins < 930;
  }

  // Strictly closed past 3:30 PM IST or weekends; during hours, respect backend closed (holiday)
  const isOpen = isLocalOpen && isOpenFromServer !== false;

  if (isOpen) {
    descEl.className = "setting-desc market-open";
    textEl.textContent = "Market Open (Closes 3:30 PM IST)";
  } else {
    descEl.className = "setting-desc market-closed";
    textEl.textContent = "Market Closed (Opens 9:00 AM Mon-Fri)";
  }
}

// Compute Day-to-Day P&L Summary & Records for a specific trader profile or ALL active profiles
function computeDailyPnlSummary(historyByUser, targetUser) {
  let records = [];

  if (targetUser === "ALL") {
    const dateMap = {};
    for (const [user, userDays] of Object.entries(historyByUser || {})) {
      for (const [dateKey, dayData] of Object.entries(userDays || {})) {
        if (!dayData || dayData.isReal === false) continue;
        const pnl = Number(dayData.totalPnl) || 0;
        const trades = Number(dayData.tradesCount) || 0;
        const realized = Number(dayData.realizedPnl) || 0;
        if (trades === 0 && pnl === 0 && realized === 0) continue;

        if (!dateMap[dateKey]) {
          dateMap[dateKey] = {
            date: dateKey,
            displayDate: dayData.displayDate || dateKey,
            dayName: dayData.dayName || "",
            totalPnl: 0,
            charges: 0,
            realizedPnl: 0,
            unrealizedPnl: 0,
            tradesCount: 0,
            winningTrades: 0,
            losingTrades: 0,
            openPositionsCount: 0,
            winningUsers: 0,
            losingUsers: 0,
            userBreakdown: [],
          };
        }

        const dayCharges = Number(dayData.charges) || 0;
        dateMap[dateKey].totalPnl += pnl;
        dateMap[dateKey].charges += dayCharges;
        dateMap[dateKey].realizedPnl += realized;
        dateMap[dateKey].unrealizedPnl += Number(dayData.unrealizedPnl) || 0;
        dateMap[dateKey].tradesCount += trades;
        dateMap[dateKey].winningTrades += Number(dayData.winningTrades) || 0;
        dateMap[dateKey].losingTrades += Number(dayData.losingTrades) || 0;
        dateMap[dateKey].openPositionsCount +=
          Number(dayData.openPositionsCount) || 0;

        if (pnl > 0) dateMap[dateKey].winningUsers++;
        else if (pnl < 0) dateMap[dateKey].losingUsers++;

        dateMap[dateKey].userBreakdown.push({
          user: user,
          pnl: pnl,
          charges: dayCharges,
          netAfterCharges: pnl - dayCharges,
          tradesCount: trades,
          winningTrades: Number(dayData.winningTrades) || 0,
          losingTrades: Number(dayData.losingTrades) || 0,
          winRate: Number(dayData.winRate) || 0,
          status: dayData.status || (pnl >= 0 ? "PROFIT" : "LOSS"),
        });
      }
    }

    // Sort breakdown within each day by P&L descending
    for (const d of Object.values(dateMap)) {
      d.userBreakdown.sort((a, b) => b.pnl - a.pnl);
      const totalDecided = d.winningTrades + d.losingTrades;
      d.winRate = totalDecided > 0 ? (d.winningTrades / totalDecided) * 100 : 0;
    }
    records = Object.values(dateMap);
  } else {
    if (!targetUser) {
      const availableUsers = Object.keys(historyByUser || {});
      targetUser = currentProfile || availableUsers[0] || "";
    }

    const userDays = (historyByUser && historyByUser[targetUser]) || {};
    records = Object.values(userDays)
      .filter((d) => {
        if (!d || d.isReal === false) return false;
        const trades = Number(d.tradesCount) || 0;
        const pnl = Number(d.totalPnl) || 0;
        const realized = Number(d.realizedPnl) || 0;
        return trades > 0 || pnl !== 0 || realized !== 0;
      })
      .map((d) => ({
        ...d,
        user: targetUser,
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
  let totalTradesSum = 0;
  let totalWinsSum = 0;
  let totalLossesSum = 0;

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
    totalTradesSum += Number(r.tradesCount) || 0;
    totalWinsSum += Number(r.winningTrades) || 0;
    totalLossesSum += Number(r.losingTrades) || 0;
  }

  const totalTradingDays = records.length;
  const overallWinRate =
    totalWinsSum + totalLossesSum > 0
      ? (totalWinsSum / (totalWinsSum + totalLossesSum)) * 100
      : totalTradingDays > 0
        ? (winDaysCount / totalTradingDays) * 100
        : 0;

  return {
    records,
    totalProfit,
    totalLoss,
    netPnl,
    winDaysCount,
    lossDaysCount,
    breakevenDaysCount,
    totalTradingDays,
    totalTradesSum,
    totalWinsSum,
    totalLossesSum,
    overallWinRate,
  };
}

// Render Day-to-Day Profit & Loss View (Supporting both ALL Active Profiles and Individual Profile)
function renderDailyPnlView() {
  const cleanHistory = filterRealHistory(cachedDailyHistory);
  cachedDailyHistory = cleanHistory;
  const historyByUser = cleanHistory?.byUser || {};

  // 1. Populate User Filter Dropdown (Strictly Real Server Profiles)
  const selDailyUser = document.getElementById("selDailyUser");
  if (selDailyUser) {
    const userSet = new Set();
    // Prioritize verified profiles from server
    cachedProfiles.forEach((p) => {
      const u = typeof p === "string" ? p : p.user_name;
      if (u) userSet.add(u);
    });
    cachedLeaderboard.forEach((p) => {
      const u = p.user_name || p.name;
      if (u) userSet.add(u);
    });
    // Add any profile from history that has real activity
    Object.keys(historyByUser).forEach((u) => {
      if (userSet.size === 0 || userSet.has(u)) userSet.add(u);
    });

    const userList = Array.from(userSet).sort();
    if (
      !selectedDailyUser ||
      (!userSet.has(selectedDailyUser) && selectedDailyUser !== "ALL")
    ) {
      selectedDailyUser = currentProfile || userList[0] || "ALL";
    }

    let optionsHtml = `<option value="ALL" ${selectedDailyUser === "ALL" ? "selected" : ""}>👥 All Active Profiles</option>`;
    optionsHtml += userList
      .map(
        (u) =>
          `<option value="${u}" ${selectedDailyUser === u ? "selected" : ""}>👤 ${u}</option>`,
      )
      .join("");

    selDailyUser.innerHTML = optionsHtml;
    selDailyUser.value = selectedDailyUser;
  }

  // 2. Compute Summary Metrics for the Selected Profile / All Profiles
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
  if (profitSubEl)
    profitSubEl.textContent = `${summary.winDaysCount} winning day${summary.winDaysCount === 1 ? "" : "s"}`;
  if (lossEl) lossEl.textContent = "-" + formatInr(summary.totalLoss);
  if (lossSubEl)
    lossSubEl.textContent = `${summary.lossDaysCount} losing day${summary.lossDaysCount === 1 ? "" : "s"}`;

  if (netEl) {
    const sign = summary.netPnl > 0 ? "+" : "";
    netEl.textContent = sign + formatInr(summary.netPnl);
    netEl.className =
      "daily-kpi-val " +
      (summary.netPnl > 0 ? "val-green" : summary.netPnl < 0 ? "val-red" : "");
  }

  if (winRateEl) {
    if (summary.totalWinsSum > 0 || summary.totalLossesSum > 0) {
      winRateEl.textContent = `Win Rate: ${summary.overallWinRate.toFixed(1)}% (${summary.totalWinsSum}W - ${summary.totalLossesSum}L)`;
    } else {
      winRateEl.textContent = `Win Rate: ${summary.overallWinRate.toFixed(1)}% (${summary.winDaysCount}W - ${summary.lossDaysCount}L Days)`;
    }
  }
  if (countBadge) countBadge.textContent = `${summary.totalTradingDays} Days`;
  if (syncTimeEl) {
    const now = new Date();
    syncTimeEl.textContent = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // 3. Render Day Cards List
  const listContainer = document.getElementById("dailyPnlList");
  if (!listContainer) return;

  const isAllView = selectedDailyUser === "ALL";

  if (summary.records.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <div class="empty-text">No real trading history logged yet for <strong>${isAllView ? "active profiles" : selectedDailyUser || "this profile"}</strong></div>
      </div>
    `;
    return;
  }

  let todayKey = "";
  try {
    todayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch (e) {
    todayKey = new Date().toISOString().slice(0, 10);
  }

  listContainer.innerHTML = summary.records
    .map((r) => {
      const pnl = Number(r.totalPnl) || 0;
      const isProfit = pnl > 0;
      const isLoss = pnl < 0;
      const isToday = r.date === todayKey;

      const rowClass = isProfit
        ? "is-profit"
        : isLoss
          ? "is-loss"
          : "is-breakeven";
      const pillClass = isProfit
        ? "pill-profit"
        : isLoss
          ? "pill-loss"
          : "pill-neutral";
      const pnlSign = isProfit ? "+" : "";

      // Dynamic trade statistics breakdown
      const trades = Number(r.tradesCount) || 0;
      const wins = Number(r.winningTrades) || 0;
      const losses = Number(r.losingTrades) || 0;
      const openPos = Number(r.openPositionsCount) || 0;
      const wr =
        Number(r.winRate) ||
        (wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0);

      // If viewing ALL profiles, display the multi-trader breakdown list (Image 2 style)
      if (isAllView && Array.isArray(r.userBreakdown)) {
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

          <div class="daily-item-sub">
            <span class="daily-sub-traders">👥 ${r.userBreakdown.length} Trader${r.userBreakdown.length === 1 ? "" : "s"} (${r.winningUsers || 0}W / ${r.losingUsers || 0}L)</span>
            <span class="daily-sub-trades">📊 ${trades} trades</span>
          </div>

          <div class="daily-users-breakdown">
            ${r.userBreakdown
              .map((u) => {
                const uProfit = u.pnl > 0;
                const uLoss = u.pnl < 0;
                const uSign = uProfit ? "+" : "";
                const uColorClass = uProfit
                  ? "val-green"
                  : uLoss
                    ? "val-red"
                    : "";
                return `
                <div class="daily-user-breakdown-row">
                  <span class="user-row-name">👤 ${u.user}</span>
                  <span class="user-row-trades">${u.tradesCount} trade${u.tradesCount === 1 ? "" : "s"}</span>
                  <span class="user-row-pnl ${uColorClass}">
                    ${uSign}${formatInr(u.pnl)}
                  </span>
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      `;
      }

      const chg = Number(r.charges) || 0;
      const totalProfitVal = pnl - chg;

      // Single Profile View: Sleek Segmented Metrics Grid (ZERO text wrapping)
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

        <div class="daily-profile-row">
          <span class="daily-user-tag">👤 ${selectedDailyUser || r.user}</span>
          <span class="daily-status-tag ${isProfit ? "tag-profit" : isLoss ? "tag-loss" : "tag-neutral"}">${r.status || (isProfit ? "PROFIT" : isLoss ? "LOSS" : "BREAKEVEN")}</span>
        </div>

        <div class="daily-metrics-bar">
          <div class="metric-chip" title="Total trades executed">
            <span class="chip-label">TRADES</span>
            <span class="chip-val">${trades}</span>
          </div>
          <div class="metric-chip" title="Brokrage & Taxes">
            <span class="chip-label">BROKRAGE</span>
            <span class="chip-val val-gold">${formatInr(chg)}</span>
          </div>
          <div class="metric-chip" title="Total Profit after Brokrage">
            <span class="chip-label">TOTAL PROFIT</span>
            <span class="chip-val ${totalProfitVal >= 0 ? "val-win" : "val-loss"}">${(totalProfitVal > 0 ? "+" : "") + formatInr(totalProfitVal)}</span>
          </div>
          <div class="metric-chip" title="Winning / Losing trades">
            <span class="chip-label">W / L</span>
            <span class="chip-val"><span class="val-win">${wins}W</span> / <span class="val-loss">${losses}L</span></span>
          </div>
          <div class="metric-chip" title="Session win rate percentage">
            <span class="chip-label">WIN RATE</span>
            <span class="chip-val val-rate">${wr.toFixed(1)}%</span>
          </div>
          <div class="metric-chip" title="Currently open positions">
            <span class="chip-label">OPEN</span>
            <span class="chip-val val-open">${openPos} Open</span>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

// Generate & Download CSV of All Recorded Daily P&L (Strictly Profile-by-Profile, NO COMBINED ROWS)
function exportDailyPnlToCsv() {
  const cleanHistory = filterRealHistory(cachedDailyHistory);
  const historyByUser = cleanHistory?.byUser || {};
  const allDates = Array.from(
    new Set(Object.values(historyByUser).flatMap((u) => Object.keys(u))),
  ).sort((a, b) => b.localeCompare(a));

  if (allDates.length === 0) {
    alert("No real daily P&L records available to export.");
    return;
  }

  const csvRows = [
    [
      "Date",
      "Day",
      "Time (IST)",
      "Trader / Profile",
      "Total P&L (INR)",
      "Brokrage (INR)",
      "Total Profit (INR)",
      "Realized P&L (INR)",
      "Unrealized P&L (INR)",
      "Account Equity (INR)",
      "Trades Count",
      "Session Status",
      "Win Rate / Notes",
    ],
  ];

  for (const dKey of allDates) {
    for (const [userName, userDays] of Object.entries(historyByUser)) {
      const dayRecord = userDays[dKey];
      if (!dayRecord || dayRecord.isReal === false) continue;

      const pnl = Number(dayRecord.totalPnl) || 0;
      const charges = Number(dayRecord.charges !== undefined ? dayRecord.charges : (cachedAccount?.total_charges || 0)) || 0;
      const netAfterCharges = pnl - charges;
      const realized = Number(dayRecord.realizedPnl) || 0;
      const unrealized = Number(dayRecord.unrealizedPnl) || 0;
      const eq = Number(dayRecord.equity) || 100000;
      const trades = Number(dayRecord.tradesCount) || 0;
      const wins = Number(dayRecord.winningTrades) || 0;
      const losses = Number(dayRecord.losingTrades) || 0;
      const wr =
        Number(dayRecord.winRate) ||
        (wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0);
      const openPos = Number(dayRecord.openPositionsCount) || 0;

      let notes = `${trades} trades executed`;
      if (wins > 0 || losses > 0) {
        notes = `${trades} trades (${wins}W / ${losses}L - ${wr.toFixed(1)}% WR)${openPos > 0 ? ` • ${openPos} Open` : ""}`;
      }

      // Only export profiles with actual trading activity
      if (trades > 0 || pnl !== 0 || realized !== 0) {
        csvRows.push([
          `"${dayRecord.displayDate || dKey}"`,
          `"${dayRecord.dayName || ""}"`,
          `"15:30:00"`,
          `"${userName}"`,
          pnl.toFixed(2),
          charges.toFixed(2),
          netAfterCharges.toFixed(2),
          realized.toFixed(2),
          unrealized.toFixed(2),
          eq.toFixed(2),
          trades,
          `"${dayRecord.status || (pnl >= 0 ? "PROFIT" : "LOSS")}"`,
          `"${notes}"`,
        ]);
      }
    }
  }

  if (csvRows.length <= 1) {
    alert("No active trading records found to export.");
    return;
  }

  const csvContent = csvRows.map((e) => e.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const todayIso = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `FinGroww_Daily_PnL_Profiles_${todayIso}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Helper to escape values for CSV
function escapeCsvCell(val) {
  if (val === null || val === undefined) return "";
  const s = String(val).replace(/\r?\n/g, " ").trim();
  if (s.includes(",") || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Download CSV content via browser Blob & <a> element
function triggerBrowserDownload(csvText, filename) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Direct client fetch fallback to export trades CSV if background worker is asleep
async function directFetchAndExportCsv(targetProfile) {
  const alertBox = document.getElementById("tradesExportAlertMsg");
  const hosts = [
    "https://fingroww-trading.onrender.com",
    "http://127.0.0.1:8787",
  ];
  let tradesData = null;
  let sessionData = null;

  for (const host of hosts) {
    try {
      const [tRes, sRes] = await Promise.all([
        fetch(
          `${host}/api/paper/trades?user=${encodeURIComponent(targetProfile)}&limit=10000`,
        ).then((r) => (r.ok ? r.json() : null)),
        fetch(
          `${host}/api/paper/session/state?user=${encodeURIComponent(targetProfile)}`,
        ).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (tRes || sRes) {
        tradesData = tRes;
        sessionData = sRes;
        break;
      }
    } catch (e) {}
  }

  const closedTrades =
    tradesData && Array.isArray(tradesData.trades) ? tradesData.trades : [];
  const openPositions =
    sessionData && Array.isArray(sessionData.active_positions)
      ? sessionData.active_positions
      : [];

  if (closedTrades.length === 0 && openPositions.length === 0) {
    if (alertBox) {
      alertBox.className = "trades-export-msg error";
      alertBox.textContent = `No trade records found for "${targetProfile}".`;
      alertBox.style.display = "block";
    }
    return;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
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

  const rows = [headers.join(",")];
  for (const t of closedTrades) {
    const net = Number(t.net_pnl) || 0;
    const gross = Number(t.gross_pnl) || 0;
    const charges = Number(t.charges) || 0;
    const retPct = Number(t.return_pct) || 0;
    const outcome = net > 0 ? "WIN" : net < 0 ? "LOSS" : "BREAKEVEN";
    rows.push(
      [
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
        escapeCsvCell(t.holding_duration_str || ""),
        escapeCsvCell(t.strategy || ""),
        escapeCsvCell(t.trailing_state || ""),
        escapeCsvCell(Number(t.slippage || 0).toFixed(2)),
        escapeCsvCell(
          Number(t.allocated_margin || t.used_amount || 0).toFixed(2),
        ),
        escapeCsvCell(t.expiry_date || t.expiry_label || ""),
        escapeCsvCell(t.signal_rationale || ""),
      ].join(","),
    );
  }

  for (const pos of openPositions) {
    const unPnl = Number(pos.unrealized_pnl) || 0;
    const pnlPct = Number(pos.pnl_pct) || 0;
    const outcome =
      unPnl > 0 ? "UNREALIZED_WIN" : unPnl < 0 ? "UNREALIZED_LOSS" : "OPEN";
    rows.push(
      [
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
          Number(pos.current_price || pos.ltp || pos.entry_price || 0).toFixed(
            2,
          ),
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
        escapeCsvCell("OPEN_POSITION"),
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
      ].join(","),
    );
  }

  const totalCount = closedTrades.length + openPositions.length;
  const csvContent = rows.join("\r\n");
  const sanitizedProfile = targetProfile.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `FinGroww_Trades_${sanitizedProfile}_${todayIso}.csv`;

  triggerBrowserDownload(csvContent, filename);

  if (alertBox) {
    alertBox.className = "trades-export-msg success";
    alertBox.textContent = `✅ Successfully exported ${totalCount} trades for ${targetProfile} to ${filename}!`;
    alertBox.style.display = "block";
  }
}

// Controller to export selected profile's trades CSV
async function exportSelectedProfileTradesCsv() {
  const btn = document.getElementById("btnExportTradesCsv");
  const btnDaily = document.getElementById("btnExportTradesCsvDaily");
  const alertBox = document.getElementById("tradesExportAlertMsg");
  const targetProfile =
    currentProfile || document.getElementById("selProfile")?.value;

  if (!targetProfile) {
    if (alertBox) {
      alertBox.className = "trades-export-msg error";
      alertBox.textContent = "Please select a trader profile first.";
      alertBox.style.display = "block";
    }
    return;
  }

  const setButtonsLoading = (loading) => {
    if (btn) {
      btn.disabled = loading;
      btn.innerHTML = loading
        ? `<span>⏳</span> Fetching 150+ Trades...`
        : `<span id="exportTradesIcon">📥</span> Export Trade Details CSV`;
    }
    if (btnDaily) {
      btnDaily.disabled = loading;
      btnDaily.innerHTML = loading
        ? `<span>⏳</span> Fetching...`
        : `<span>📑</span> Export Trades CSV`;
    }
  };

  setButtonsLoading(true);
  if (alertBox) {
    alertBox.className = "trades-export-msg";
    alertBox.textContent = `Fetching all trade details for "${targetProfile}" from server...`;
    alertBox.style.display = "block";
  }

  try {
    chrome.runtime.sendMessage(
      { type: "EXPORT_TRADES_CSV", profile: targetProfile },
      (res) => {
        setButtonsLoading(false);
        if (chrome.runtime.lastError) {
          console.warn(
            "[FinGroww Popup] Background error, fallback to direct fetch:",
            chrome.runtime.lastError,
          );
          directFetchAndExportCsv(targetProfile);
          return;
        }

        if (res && res.success) {
          if (alertBox) {
            alertBox.className = "trades-export-msg success";
            alertBox.textContent = `✅ Successfully exported ${res.count} trades for ${targetProfile} to ${res.filename}!`;
            alertBox.style.display = "block";
          }
          // Trigger browser download if background downloadId not created
          if (
            res.csvContent &&
            (!res.downloadId || typeof chrome.downloads === "undefined")
          ) {
            triggerBrowserDownload(res.csvContent, res.filename);
          }
        } else {
          if (alertBox) {
            alertBox.className = "trades-export-msg error";
            alertBox.textContent = `⚠️ ${res?.error || "No trade details found for this profile."}`;
            alertBox.style.display = "block";
          }
        }
      },
    );
  } catch (err) {
    setButtonsLoading(false);
    console.error(
      "[FinGroww Popup] exportSelectedProfileTradesCsv error:",
      err,
    );
    directFetchAndExportCsv(targetProfile);
  }
}

// Trade Details CSV Export UI Controllers
function setupTradesExportControls() {
  const btn = document.getElementById("btnExportTradesCsv");
  const btnDaily = document.getElementById("btnExportTradesCsvDaily");
  const chkAuto = document.getElementById("chkAutoDownloadTradesCsv");
  const lastTime = document.getElementById("tradesLastDownloadTime");

  if (btn) btn.addEventListener("click", exportSelectedProfileTradesCsv);
  if (btnDaily)
    btnDaily.addEventListener("click", exportSelectedProfileTradesCsv);

  if (chkAuto) {
    chrome.storage.local.get(
      [
        "fg_auto_download_csv_eod",
        "fg_eod_csv_last_time",
        "fg_eod_csv_last_msg",
      ],
      (res) => {
        chkAuto.checked = res.fg_auto_download_csv_eod !== false;
        if (lastTime && res.fg_eod_csv_last_time) {
          lastTime.textContent = `Last: ${res.fg_eod_csv_last_time}`;
        }
      },
    );

    chkAuto.addEventListener("change", (e) => {
      chrome.storage.local.set({ fg_auto_download_csv_eod: e.target.checked });
    });
  }
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
  chrome.storage.local.get(
    [
      "fg_gsheet_url",
      "fg_gsheet_autosync",
      "fg_gsheet_last_sync_date",
      "fg_gsheet_last_sync_time",
      "fg_gsheet_last_sync_status",
      "fg_gsheet_last_sync_msg",
    ],
    (res) => {
      if (txtUrl && res.fg_gsheet_url) {
        txtUrl.value = res.fg_gsheet_url;
      }
      if (chkAutoSync && res.fg_gsheet_autosync !== undefined) {
        chkAutoSync.checked = res.fg_gsheet_autosync === true;
      }

      updateGsheetStatusUi(res);
    },
  );

  function updateGsheetStatusUi(state) {
    if (!gsheetBadge) return;
    const url = state?.fg_gsheet_url || txtUrl?.value?.trim();
    const status = state?.fg_gsheet_last_sync_status;
    const lastDate = state?.fg_gsheet_last_sync_date;

    if (!url) {
      gsheetBadge.className = "gsheet-badge gsheet-badge-idle";
      gsheetBadge.textContent = "Not Configured";
      if (gsheetDesc)
        gsheetDesc.textContent = "Click Config to connect Google Sheet";
    } else if (status === "SUCCESS") {
      gsheetBadge.className = "gsheet-badge gsheet-badge-ok";
      gsheetBadge.textContent = lastDate ? `Synced (${lastDate})` : "Connected";
      if (gsheetDesc)
        gsheetDesc.textContent = "Connected • Auto-syncs at 3:30 PM IST";
    } else if (status === "ERROR") {
      gsheetBadge.className = "gsheet-badge gsheet-badge-err";
      gsheetBadge.textContent = "Sync Error";
      if (gsheetDesc)
        gsheetDesc.textContent = "Error during last sync • Check Config";
    } else {
      gsheetBadge.className = "gsheet-badge gsheet-badge-ok";
      gsheetBadge.textContent = "Connected";
      if (gsheetDesc)
        gsheetDesc.textContent = "Connected • Auto-syncs at 3:30 PM IST";
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
      if (!url) {
        alert("Please paste your Google Apps Script Web App URL.");
        return;
      }
      if (url.includes("docs.google.com/spreadsheets")) {
        alert(
          "⚠️ You pasted the Google Sheet document URL!\n\nYou need the Apps Script Web App URL:\n1. In your sheet, click Extensions > Apps Script.\n2. Click Deploy > New deployment.\n3. Choose Web app, set access to 'Anyone', click Deploy.\n4. Copy the Web App URL (ends in /exec) and paste it here.",
        );
        return;
      }
      if (!url.startsWith("http")) {
        alert(
          "Please enter a valid Google Apps Script Web App URL (starts with https://script.google.com/...)",
        );
        return;
      }
      chrome.storage.local.set({ fg_gsheet_url: url }, () => {
        btnSave.textContent = "Saved ✓";
        setTimeout(() => {
          btnSave.textContent = "Save";
        }, 1500);
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

  // Direct sync function that runs right in popup (Strictly Profile-by-Profile, ONLY Real Data)
  async function performDirectSync(webhookUrl) {
    if (webhookUrl.includes("docs.google.com/spreadsheets")) {
      throw new Error(
        "Pasted Google Sheet link instead of Web App URL ending in /exec",
      );
    }

    const cleanHistory = filterRealHistory(cachedDailyHistory);
    const historyByUser = cleanHistory?.byUser || {};
    const allDates = Array.from(
      new Set(Object.values(historyByUser).flatMap((u) => Object.keys(u))),
    ).sort((a, b) => a.localeCompare(b));

    const rows = [];
    for (const dKey of allDates) {
      for (const [userName, userDays] of Object.entries(historyByUser)) {
        const dayRecord = userDays[dKey];
        if (!dayRecord || dayRecord.isReal === false) continue;

        const pnl = Number(dayRecord.totalPnl) || 0;
        const charges = Number(dayRecord.charges !== undefined ? dayRecord.charges : (cachedAccount?.total_charges || 0)) || 0;
        const netAfterCharges = pnl - charges;
        const realized = Number(dayRecord.realizedPnl) || 0;
        const unrealized = Number(dayRecord.unrealizedPnl) || 0;
        const eq = Number(dayRecord.equity) || 100000;
        const trades = Number(dayRecord.tradesCount) || 0;
        const wins = Number(dayRecord.winningTrades) || 0;
        const losses = Number(dayRecord.losingTrades) || 0;
        const wr =
          Number(dayRecord.winRate) ||
          (wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0);
        const openPos = Number(dayRecord.openPositionsCount) || 0;

        let notesText = `${trades} trades executed`;
        if (wins > 0 || losses > 0) {
          notesText = `${trades} trades (${wins}W / ${losses}L - ${wr.toFixed(1)}% WR)${openPos > 0 ? ` • ${openPos} Open` : ""}`;
        }

        // ONLY include profiles that made any trade or booked any profit/loss
        if (trades > 0 || pnl !== 0 || realized !== 0) {
          rows.push({
            date: dayRecord.displayDate || dKey,
            dayName: dayRecord.dayName || "",
            time: "15:30:00",
            trader: userName,
            totalPnl: pnl,
            charges: charges,
            netAfterCharges: netAfterCharges,
            realizedPnl: realized,
            unrealizedPnl: unrealized,
            equity: eq,
            tradesCount: trades,
            status: dayRecord.status || (pnl >= 0 ? "PROFIT" : "LOSS"),
            notes: notesText,
          });
        }
      }
    }

    if (rows.length === 0) {
      throw new Error("No active profile records found to sync today");
    }

    const payload = JSON.stringify({
      action: "sync_daily_pnl",
      source: "FinGroww Chrome Extension",
      rows: rows,
    });

    try {
      // Standard fetch with follow redirect
      const resp = await fetch(webhookUrl, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload,
      });
      const text = await resp.text();
      try {
        const json = JSON.parse(text);
        if (json.status === "error") throw new Error(json.message);
      } catch (e) {}
    } catch (fetchErr) {
      // Fallback: no-cors mode guarantees delivery even if Google 302 redirect has CORS barrier
      await fetch(webhookUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload,
      });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    await chrome.storage.local.set({
      fg_gsheet_last_sync_date: todayIso,
      fg_gsheet_last_sync_time: Date.now(),
      fg_gsheet_last_sync_status: "SUCCESS",
      fg_gsheet_last_sync_msg: `Synced ${rows.length} rows to Google Sheet`,
    });

    return { count: rows.length };
  }

  // Sync to Sheet Now Button
  if (btnSyncNow) {
    btnSyncNow.addEventListener("click", () => {
      chrome.storage.local.get(["fg_gsheet_url"], async (res) => {
        const url = res.fg_gsheet_url || txtUrl?.value?.trim();
        if (!url) {
          if (configBox) configBox.style.display = "block";
          if (btnToggleConfig) btnToggleConfig.textContent = "✕ Close";
          if (txtUrl) {
            txtUrl.focus();
            alert(
              "Please paste your Google Apps Script Webhook URL and click Save first.",
            );
          }
          return;
        }

        if (url.includes("docs.google.com/spreadsheets")) {
          alert(
            "⚠️ You pasted the Google Sheet URL!\n\nPlease deploy the Apps Script Web App and paste the URL ending in /exec (see Config).",
          );
          return;
        }

        btnSyncNow.disabled = true;
        if (syncIcon) syncIcon.textContent = "⏳";
        if (syncMsg) syncMsg.textContent = "Syncing records to Google Sheet...";

        try {
          const result = await performDirectSync(url);
          btnSyncNow.disabled = false;
          if (syncIcon) syncIcon.textContent = "✅";
          if (syncMsg)
            syncMsg.textContent = `Synced ${result.count} rows successfully to Google Sheet!`;
          updateGsheetStatusUi({
            fg_gsheet_url: url,
            fg_gsheet_last_sync_status: "SUCCESS",
            fg_gsheet_last_sync_msg: `Synced ${result.count} rows`,
          });
        } catch (err) {
          btnSyncNow.disabled = false;
          if (syncIcon) syncIcon.textContent = "⚠️";
          const errMsg = err?.message || "Sync failed";
          if (syncMsg) syncMsg.textContent = `Sync failed: ${errMsg}`;
          updateGsheetStatusUi({
            fg_gsheet_url: url,
            fg_gsheet_last_sync_status: "ERROR",
            fg_gsheet_last_sync_msg: errMsg,
          });
        }

        setTimeout(() => {
          if (syncIcon) syncIcon.textContent = "📤";
        }, 3000);
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
      "fg_profiles_cache",
    ]);

    if (stored && stored.fg_selected_profile) {
      currentProfile = stored.fg_selected_profile;
    }
    if (stored && stored.fg_profiles_cache) {
      cachedProfiles = stored.fg_profiles_cache;
    }
    if (stored && stored.fg_daily_pnl_history) {
      cachedDailyHistory = filterRealHistory(stored.fg_daily_pnl_history);
      chrome.storage.local.set({ fg_daily_pnl_history: cachedDailyHistory });
    }
    if (stored && stored.fg_latest_data) {
      updatePopupUi(stored.fg_latest_data);
      if (stored.fg_latest_data.daily_pnl) {
        cachedDailyHistory = filterRealHistory(stored.fg_latest_data.daily_pnl);
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

  // Trigger end-of-day auto sync & CSV download check if after market close
  chrome.runtime.sendMessage({ type: "CHECK_END_OF_DAY_SYNC" });
  chrome.runtime.sendMessage({ type: "CHECK_END_OF_DAY_CSV_DOWNLOAD" });

  updateMarketStatusIndicator();
  setInterval(updateMarketStatusIndicator, 1000);

  // Initialize Trade Details CSV controls & Google Sheet sync
  setupTradesExportControls();
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

  if (tabBtnPositions)
    tabBtnPositions.addEventListener("click", () => switchTab("positions"));
  if (tabBtnDailyPnl)
    tabBtnDailyPnl.addEventListener("click", () => switchTab("dailyPnl"));

  // Daily P&L User Filter Change
  const selDailyUser = document.getElementById("selDailyUser");
  if (selDailyUser) {
    selDailyUser.addEventListener("change", (e) => {
      selectedDailyUser = e.target.value;
      renderDailyPnlView();
    });
  }

  // Fetch live profiles directly from API
  async function fetchLiveProfiles() {
    const hosts = [
      "https://fingroww-trading.onrender.com",
      "http://127.0.0.1:8787",
    ];
    for (const host of hosts) {
      try {
        const res = await fetch(`${host}/api/paper/profiles`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.profiles || [];
          if (list && list.length > 0) {
            cachedProfiles = list;
            chrome.storage.local.set({ fg_profiles_cache: list });
            updatePopupUi({ profiles: list, profile: currentProfile });
            renderDailyPnlView();
            return list;
          }
        }
      } catch (e) {}
    }
  }

  // Directly fetch session data for selected profile from server
  async function fetchAndApplyProfileSession(profileName) {
    if (!profileName) return;
    const hosts = [
      "https://fingroww-trading.onrender.com",
      "http://127.0.0.1:8787",
    ];
    for (const host of hosts) {
      try {
        const res = await fetch(
          `${host}/api/paper/session/state?user=${encodeURIComponent(profileName)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (currentProfile === profileName) {
            updatePopupUi({
              profile: profileName,
              account: data.account || {},
              positions: data.active_positions || [],
              status: data.status || "RUNNING",
              leaderboard: cachedLeaderboard,
              profiles: cachedProfiles,
            });
            return;
          }
        }
      } catch (e) {}
    }
  }

  // Request fresh sync from background
  chrome.runtime.sendMessage({ type: "FORCE_REFRESH" });
  fetchLiveProfiles();

  // Listen for real-time background sync updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.fg_show_after_hours !== undefined) {
        const toggleShow = document.getElementById("toggleShowAfterHours");
        if (toggleShow)
          toggleShow.checked = changes.fg_show_after_hours.newValue === true;
      }
      if (changes.fg_selected_profile) {
        const newProf = changes.fg_selected_profile.newValue;
        if (newProf && newProf !== currentProfile) {
          currentProfile = newProf;
          const selProf = document.getElementById("selProfile");
          if (selProf && selProf.value !== currentProfile) {
            selProf.value = currentProfile;
          }
          fetchAndApplyProfileSession(currentProfile);
        }
      }
      if (
        changes.fg_profiles_cache &&
        Array.isArray(changes.fg_profiles_cache.newValue)
      ) {
        cachedProfiles = changes.fg_profiles_cache.newValue;
        updatePopupUi({ profiles: cachedProfiles, profile: currentProfile });
        renderDailyPnlView();
      }
      if (changes.fg_daily_pnl_history) {
        cachedDailyHistory = filterRealHistory(
          changes.fg_daily_pnl_history.newValue,
        );
        renderDailyPnlView();
      }
      if (changes.fg_latest_data) {
        updatePopupUi(changes.fg_latest_data.newValue);
        if (changes.fg_latest_data.newValue?.daily_pnl) {
          cachedDailyHistory = filterRealHistory(
            changes.fg_latest_data.newValue.daily_pnl,
          );
          renderDailyPnlView();
        }
        if (
          typeof changes.fg_latest_data.newValue?.is_market_open === "boolean"
        ) {
          updateMarketStatusIndicator(
            changes.fg_latest_data.newValue.is_market_open,
          );
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
        cachedAccount = {};
        cachedPositions = [];

        // Visual feedback
        const rankVal = document.getElementById("rankVal");
        if (rankVal) rankVal.textContent = "Loading profile...";
        const pnlVal = document.getElementById("totalPnl");
        if (pnlVal) pnlVal.textContent = "₹...";
        const posBody = document.getElementById("positionsTableBody");
        if (posBody) {
          posBody.innerHTML = `<tr><td colspan="7" class="empty-state">Loading active positions for <strong>${selected}</strong>...</td></tr>`;
        }

        chrome.storage.local.set({ fg_selected_profile: selected });
        chrome.runtime.sendMessage({ type: "SET_PROFILE", profile: selected });
        fetchAndApplyProfileSession(selected);
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
      chrome.tabs.create({
        url: "https://fingroww.tech/ai-auto-paper-trading.html#leaderboardSection",
      });
    });
  }
});
