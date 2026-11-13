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
  const posList = cachedPositions;
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

// Render Positions Cards with Individual Exit Button
function renderPositionsList(positions, flashMap) {
  const container = document.getElementById("positionsList");
  if (!container) return;

  if (!positions || positions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📈</div>
        <div class="empty-text">No open trades for <strong>${currentProfile}</strong></div>
      </div>
    `;
    return;
  }

  container.innerHTML = positions.map((pos) => {
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

  let isOpen = false;
  if (typeof isOpenFromServer === "boolean") {
    isOpen = isOpenFromServer;
  } else {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (3600000 * 5.5));
    const day = ist.getDay();
    const totalMins = ist.getHours() * 60 + ist.getMinutes();
    isOpen = (day >= 1 && day <= 5) && (totalMins >= 540 && totalMins < 930);
  }

  if (isOpen) {
    descEl.className = "setting-desc market-open";
    textEl.textContent = "Market Open (Closes 3:30 PM IST)";
  } else {
    descEl.className = "setting-desc market-closed";
    textEl.textContent = "Market Closed (Opens 9:00 AM Mon-Fri)";
  }
}

// Event Listeners & Boot
document.addEventListener("DOMContentLoaded", async () => {
  // Read stored data first for instant render
  try {
    const stored = await chrome.storage.local.get(["fg_latest_data", "fg_selected_profile", "fg_show_after_hours"]);
    if (stored && stored.fg_selected_profile) {
      currentProfile = stored.fg_selected_profile;
    }
    if (stored && stored.fg_latest_data) {
      updatePopupUi(stored.fg_latest_data);
      if (typeof stored.fg_latest_data.is_market_open === "boolean") {
        updateMarketStatusIndicator(stored.fg_latest_data.is_market_open);
      }
    }

    const toggleShow = document.getElementById("toggleShowAfterHours");
    if (toggleShow) {
      toggleShow.checked = stored?.fg_show_after_hours === true;
      toggleShow.addEventListener("change", (e) => {
        chrome.storage.local.set({ fg_show_after_hours: e.target.checked });
      });
    }
  } catch (e) {}

  updateMarketStatusIndicator();

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
      if (changes.fg_latest_data) {
        updatePopupUi(changes.fg_latest_data.newValue);
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
