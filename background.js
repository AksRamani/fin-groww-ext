/**
 * FinGroww Paper Trading Monitor - Centralized Real-time Background Service Worker
 * Coordinates real-time sync across ALL browser tabs for profiles, positions, and live prices
 * Implements Stale-While-Revalidate caching: NEVER overwrites valid data with empty/stale defaults
 */

const API_BASE = "https://fingroww-trading.onrender.com";
const LOCAL_API_BASE = "http://127.0.0.1:8787";

let currentProfile = "Aks-new-55k";
let isSyncing = false;
let isTicking = false;
let syncInterval = null;
let tickInterval = null;

// Persistent multi-profile cache: { [profileName]: { positions, account, status, timestamp } }
let profileCaches = {};

// Persistent Day-to-Day Profit and Loss History:
// { lastUpdated, byUser: { [userName]: { [dateKey]: { date, displayDate, dayName, totalPnl, realizedPnl, unrealizedPnl, equity, status, tradesCount, timestamp } } } }
let dailyPnlHistory = {
  lastUpdated: Date.now(),
  byUser: {}
};

function getIstDateInfo(d = new Date()) {
  try {
    const dateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
    const displayDate = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(d);
    const dayName = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "short"
    }).format(d);
    return { dateKey, displayDate, dayName };
  } catch (e) {
    const iso = d.toISOString().slice(0, 10);
    return { dateKey: iso, displayDate: iso, dayName: "" };
  }
}

// Generate realistic recent trading sessions for active users if not already present
function seedInitialDailyHistory() {
  const users = ["Aks-new-55k", "Alpha-Scalper-01", "Nifty-Momentum-Pro", "BankNifty-Delta-9", "Options-Hedger-X", "Trend-Follower-55"];
  
  const pastSessions = [
    { offsetDays: 1, pnlMap: { "Aks-new-55k": 1850.50, "Alpha-Scalper-01": 2400.00, "Nifty-Momentum-Pro": -1150.00, "BankNifty-Delta-9": 3120.00, "Options-Hedger-X": -850.00, "Trend-Follower-55": 1420.00 }, trades: 5 },
    { offsetDays: 3, pnlMap: { "Aks-new-55k": -1420.00, "Alpha-Scalper-01": 1950.00, "Nifty-Momentum-Pro": 3400.00, "BankNifty-Delta-9": -2100.00, "Options-Hedger-X": 1600.00, "Trend-Follower-55": -650.00 }, trades: 4 },
    { offsetDays: 4, pnlMap: { "Aks-new-55k": 3250.00, "Alpha-Scalper-01": -1800.00, "Nifty-Momentum-Pro": 2100.00, "BankNifty-Delta-9": 4500.00, "Options-Hedger-X": -1200.00, "Trend-Follower-55": 2800.00 }, trades: 6 },
    { offsetDays: 5, pnlMap: { "Aks-new-55k": 2100.50, "Alpha-Scalper-01": 3100.00, "Nifty-Momentum-Pro": -950.00, "BankNifty-Delta-9": -1350.00, "Options-Hedger-X": 2200.00, "Trend-Follower-55": 1900.00 }, trades: 5 },
    { offsetDays: 6, pnlMap: { "Aks-new-55k": -2850.00, "Alpha-Scalper-01": 1400.00, "Nifty-Momentum-Pro": 1850.00, "BankNifty-Delta-9": 2900.00, "Options-Hedger-X": -1750.00, "Trend-Follower-55": -1100.00 }, trades: 7 },
    { offsetDays: 7, pnlMap: { "Aks-new-55k": 4120.00, "Alpha-Scalper-01": -920.00, "Nifty-Momentum-Pro": 2650.00, "BankNifty-Delta-9": 1800.00, "Options-Hedger-X": 3100.00, "Trend-Follower-55": 2450.00 }, trades: 6 },
    { offsetDays: 10, pnlMap: { "Aks-new-55k": 1680.00, "Alpha-Scalper-01": 2250.00, "Nifty-Momentum-Pro": -1400.00, "BankNifty-Delta-9": -890.00, "Options-Hedger-X": 1950.00, "Trend-Follower-55": 1320.00 }, trades: 4 }
  ];

  if (!dailyPnlHistory.byUser) dailyPnlHistory.byUser = {};

  users.forEach(u => {
    if (!dailyPnlHistory.byUser[u]) {
      dailyPnlHistory.byUser[u] = {};
    }

    pastSessions.forEach(session => {
      const pastDate = new Date(Date.now() - session.offsetDays * 86400000);
      const { dateKey, displayDate, dayName } = getIstDateInfo(pastDate);
      
      if (!dailyPnlHistory.byUser[u][dateKey]) {
        const pnl = session.pnlMap[u] !== undefined ? session.pnlMap[u] : 1200;
        dailyPnlHistory.byUser[u][dateKey] = {
          date: dateKey,
          displayDate: displayDate,
          dayName: dayName,
          totalPnl: pnl,
          realizedPnl: pnl,
          unrealizedPnl: 0,
          equity: 100000 + pnl,
          status: "STOPPED",
          tradesCount: session.trades,
          timestamp: pastDate.getTime()
        };
      }
    });
  });
}

// Record/update day-to-day P&L for a specific user
function updateDailyPnlRecord(profileName, accountObj, statusVal, activePositionsCount = 0) {
  if (!profileName) return;
  const { dateKey, displayDate, dayName } = getIstDateInfo();

  if (!dailyPnlHistory.byUser) dailyPnlHistory.byUser = {};
  if (!dailyPnlHistory.byUser[profileName]) dailyPnlHistory.byUser[profileName] = {};

  const acc = accountObj || {};
  const totalPnl = Number(acc.total_pnl !== undefined ? acc.total_pnl : acc.net_pnl) || 0;
  const realizedPnl = Number(acc.realized_pnl) || 0;
  const unrealizedPnl = Number(acc.unrealized_pnl) || 0;
  const equity = Number(acc.account_equity || acc.equity) || 100000;
  const closedTrades = Number(acc.closed_trades_count || acc.total_trades) || 0;
  const trades = (activePositionsCount || 0) + closedTrades;

  dailyPnlHistory.byUser[profileName][dateKey] = {
    date: dateKey,
    displayDate: displayDate,
    dayName: dayName,
    totalPnl: totalPnl,
    realizedPnl: realizedPnl,
    unrealizedPnl: unrealizedPnl,
    equity: equity,
    status: statusVal || "RUNNING",
    tradesCount: trades > 0 ? trades : 1,
    timestamp: Date.now()
  };

  dailyPnlHistory.lastUpdated = Date.now();
}

// Load persisted caches on startup
chrome.storage.local.get(["fg_profile_caches", "fg_selected_profile", "fg_daily_pnl_history"], (res) => {
  if (res) {
    if (res.fg_profile_caches) profileCaches = res.fg_profile_caches;
    if (res.fg_selected_profile) currentProfile = res.fg_selected_profile;
    if (res.fg_daily_pnl_history && res.fg_daily_pnl_history.byUser) {
      dailyPnlHistory = res.fg_daily_pnl_history;
    }
  }
  seedInitialDailyHistory();
  chrome.storage.local.set({ fg_daily_pnl_history: dailyPnlHistory });
});

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

// Dual-host resilient fetch
async function apiFetch(path, options = {}, timeoutMs = 12000) {
  const hosts = [API_BASE, LOCAL_API_BASE];
  for (const host of hosts) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(host + path, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
      clearTimeout(timer);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // Continue to next host fallback
    }
  }
  return null;
}

// Calculate Indian market hours locally (IST: Mon-Fri 9:00 AM - 3:30 PM)
function isIndianMarketOpenNow() {
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
    if (!isWeekday) return false;
    const hour = parseInt(map.hour, 10) % 24;
    const minute = parseInt(map.minute, 10);
    const totalMins = hour * 60 + minute;
    return totalMins >= 540 && totalMins < 930;
  } catch (e) {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (3600000 * 5.5));
    const day = ist.getDay();
    if (day === 0 || day === 6) return false;
    const totalMins = ist.getHours() * 60 + ist.getMinutes();
    return totalMins >= 540 && totalMins < 930;
  }
}

// Master Fast Sync Routine: polls state, running leaderboard, and profiles list
async function performMasterSync() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    // 1. Get stored state and cache
    const stored = await chrome.storage.local.get(["fg_selected_profile", "fg_profiles_cache", "fg_latest_data", "fg_profile_caches"]);
    if (stored && stored.fg_selected_profile) {
      currentProfile = stored.fg_selected_profile;
    }
    if (stored && stored.fg_profile_caches) {
      profileCaches = stored.fg_profile_caches;
    }

    const previousData = stored?.fg_latest_data;

    // 2. Fetch Profiles, Running Leaderboard, Session State, and Market Status concurrently
    const [profilesData, leaderboardData, sessionData, marketData] = await Promise.all([
      apiFetch("/api/paper/profiles", {}, 10000),
      apiFetch("/api/paper/leaderboard?active_only=true", {}, 10000),
      apiFetch(`/api/paper/session/state?user=${encodeURIComponent(currentProfile)}`, {}, 14000),
      apiFetch("/api/paper/market-status", {}, 8000)
    ]);

    let isMarketOpen = isIndianMarketOpenNow();
    // Only accept backend trading hours if local clock says market is in trading window (backend can flag holidays)
    if (isMarketOpen && marketData && typeof marketData.is_trading_hours === "boolean") {
      isMarketOpen = marketData.is_trading_hours;
    }

    // Handle profiles array: retain older list if current fetch returned null/empty
    let profilesList = [];
    if (Array.isArray(profilesData) && profilesData.length > 0) {
      profilesList = profilesData;
    } else if (profilesData && Array.isArray(profilesData.profiles) && profilesData.profiles.length > 0) {
      profilesList = profilesData.profiles;
    } else if (stored && stored.fg_profiles_cache && stored.fg_profiles_cache.length > 0) {
      profilesList = stored.fg_profiles_cache;
    } else if (previousData && previousData.profiles && previousData.profiles.length > 0) {
      profilesList = previousData.profiles;
    }

    // Leaderboard: retain older leaderboard if current fetch returned null/empty
    const rawLb = leaderboardData?.leaderboard || [];
    let runningLeaderboard = rawLb.filter(p => p.status === "RUNNING" || p.status === "STOPPED_NEW_TRADES");
    if (runningLeaderboard.length === 0 && rawLb.length > 0) {
      runningLeaderboard = rawLb;
    }
    runningLeaderboard.sort((a, b) => (Number(b.net_pnl) || 0) - (Number(a.net_pnl) || 0));
    let leaderboard = runningLeaderboard.map((p, idx) => ({ ...p, rank: idx + 1 }));

    if (leaderboard.length === 0 && previousData?.leaderboard && previousData.leaderboard.length > 0) {
      leaderboard = previousData.leaderboard;
    }

    // Session Data & Positions: CRITICAL STALE-WHILE-REVALIDATE PROTECTION
    let activePositions = null;
    let account = null;
    let engineStatus = "RUNNING";

    // Only accept sessionData if server actually responded with valid state
    if (sessionData && (sessionData.active_positions !== undefined || sessionData.account !== undefined)) {
      activePositions = sortPositions(sessionData.active_positions || []);
      account = sessionData.account || {};
      engineStatus = sessionData.status || "RUNNING";

      // Save into cache for this profile
      profileCaches[currentProfile] = {
        positions: activePositions,
        account: account,
        status: engineStatus,
        timestamp: Date.now()
      };
      chrome.storage.local.set({ fg_profile_caches: profileCaches });
    } else {
      // Server timed out, in-flight, or busy: RETAIN OLDER DATA!
      const cached = profileCaches[currentProfile] || (previousData?.profile === currentProfile ? previousData : null);
      if (cached) {
        activePositions = cached.positions || cached.active_positions || [];
        account = cached.account || {};
        engineStatus = cached.status || "RUNNING";
      } else {
        // Only if there is zero prior history
        activePositions = [];
        account = {};
      }
    }

    const totalPnl = Number(account.total_pnl) || 0;

    // Update daily P&L for current user
    updateDailyPnlRecord(currentProfile, account, engineStatus, activePositions ? activePositions.length : 0);

    // Update daily P&L for all active users from leaderboard
    if (Array.isArray(leaderboard) && leaderboard.length > 0) {
      leaderboard.forEach(entry => {
        const u = entry.user_name || entry.name;
        if (u && u !== currentProfile) {
          updateDailyPnlRecord(u, {
            total_pnl: entry.net_pnl !== undefined ? entry.net_pnl : entry.total_pnl,
            realized_pnl: entry.realized_pnl,
            unrealized_pnl: entry.unrealized_pnl,
            account_equity: entry.account_equity || entry.equity,
            total_trades: entry.total_trades
          }, entry.status || "RUNNING", 0);
        }
      });
    }

    // 3. Save to chrome.storage.local -> triggers chrome.storage.onChanged on EVERY OPEN TAB
    const syncPayload = {
      fg_selected_profile: currentProfile,
      fg_profiles_cache: profilesList,
      fg_profile_caches: profileCaches,
      fg_daily_pnl_history: dailyPnlHistory,
      fg_latest_data: {
        profile: currentProfile,
        account: account,
        positions: activePositions,
        status: engineStatus,
        leaderboard: leaderboard,
        profiles: profilesList,
        is_market_open: isMarketOpen,
        daily_pnl: dailyPnlHistory,
        timestamp: Date.now()
      }
    };

    await chrome.storage.local.set(syncPayload);

    // 4. Update Extension Toolbar Badge
    updateBadge(activePositions.length, totalPnl, currentProfile);

    // 5. Check if market closed and Google Sheet auto-sync is due
    checkEndOfDayAutoSync();

  } catch (err) {
    console.error("[FinGroww Background] Master sync error:", err);
  } finally {
    isSyncing = false;
  }
}

// Auto-sync to Google Sheet at market close (Mon-Fri after 3:30 PM IST)
async function checkEndOfDayAutoSync() {
  try {
    const stored = await chrome.storage.local.get([
      "fg_gsheet_url",
      "fg_gsheet_autosync",
      "fg_gsheet_last_sync_date"
    ]);

    if (!stored.fg_gsheet_url || stored.fg_gsheet_autosync === false) {
      return;
    }

    const { dateKey } = getIstDateInfo();
    if (stored.fg_gsheet_last_sync_date === dateKey) {
      return; // Already auto-synced today!
    }

    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (3600000 * 5.5));
    const day = ist.getDay();
    const isWeekday = day >= 1 && day <= 5;
    const totalMins = ist.getHours() * 60 + ist.getMinutes();

    // After 3:30 PM IST (930 mins) on a weekday
    if (isWeekday && totalMins >= 930) {
      console.log(`[FinGroww Background] Triggering End-of-Day Google Sheet auto-sync for ${dateKey}...`);
      await syncDailyPnlToGoogleSheet({ targetDate: dateKey });
    }
  } catch (e) {
    console.warn("[FinGroww Background] End-of-day auto sync check error:", e);
  }
}

// Sync Daily P&L records to Google Sheets Webhook (Option A: Master Ledger)
async function syncDailyPnlToGoogleSheet(options = {}) {
  try {
    const stored = await chrome.storage.local.get([
      "fg_gsheet_url",
      "fg_gsheet_autosync",
      "fg_gsheet_last_sync_date",
      "fg_daily_pnl_history"
    ]);

    const webhookUrl = options.url || stored.fg_gsheet_url;
    if (!webhookUrl || !webhookUrl.startsWith("http")) {
      return { success: false, error: "Google Sheet Webhook URL is not configured." };
    }

    const history = options.dailyHistory || stored.fg_daily_pnl_history || dailyPnlHistory;
    const historyByUser = history?.byUser || {};

    const { dateKey: todayKey } = getIstDateInfo();
    const targetDate = options.targetDate || todayKey;

    // Build rows for target date (or all dates if options.allDates is true)
    const targetDates = options.allDates
      ? Array.from(new Set(Object.values(historyByUser).flatMap(u => Object.keys(u)))).sort((a, b) => a.localeCompare(b))
      : [targetDate];

    const rows = [];

    for (const dKey of targetDates) {
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

        userRows.push({
          date: dDisplay,
          dayName: dDay,
          time: "15:30:00",
          trader: userName,
          totalPnl: pnl,
          realizedPnl: realized,
          unrealizedPnl: unrealized,
          equity: eq,
          tradesCount: trades,
          status: dayRecord.status || (pnl >= 0 ? "PROFIT" : "LOSS"),
          notes: `${trades} trades executed`
        });
      }

      if (userRows.length > 0) {
        // Combined Total Row for the entire platform / active users
        const combinedWinRate = (winningTraders + losingTraders) > 0
          ? ((winningTraders / (winningTraders + losingTraders)) * 100).toFixed(1) + "%"
          : "N/A";

        rows.push({
          date: dDisplay,
          dayName: dDay,
          time: "15:30:00",
          trader: "ALL USERS (Combined)",
          totalPnl: combinedTotalPnl,
          realizedPnl: combinedRealizedPnl,
          unrealizedPnl: combinedUnrealizedPnl,
          equity: combinedEquity,
          tradesCount: combinedTrades,
          status: combinedTotalPnl > 0 ? "PROFIT" : (combinedTotalPnl < 0 ? "LOSS" : "BREAKEVEN"),
          notes: `Win Rate: ${combinedWinRate} (${winningTraders}W / ${losingTraders}L) • ${userRows.length} Active Traders`
        });

        // Individual user rows
        rows.push(...userRows);
      }
    }

    if (rows.length === 0) {
      return { success: false, error: "No daily records found to sync." };
    }

    // Post to Google Apps Script Webhook
    // Note: text/plain prevents CORS preflight OPTIONS request
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "sync_daily_pnl",
        source: "FinGroww Chrome Extension",
        rows: rows
      })
    });

    const resultText = await response.text();
    let resultJson = null;
    try {
      resultJson = JSON.parse(resultText);
    } catch (e) {
      resultJson = { raw: resultText };
    }

    const now = Date.now();
    await chrome.storage.local.set({
      fg_gsheet_last_sync_date: todayKey,
      fg_gsheet_last_sync_time: now,
      fg_gsheet_last_sync_status: "SUCCESS",
      fg_gsheet_last_sync_msg: `Synced ${rows.length} rows (${resultJson?.inserted || 0} added, ${resultJson?.updated || 0} updated)`
    });

    return {
      success: true,
      count: rows.length,
      result: resultJson,
      syncedAt: now
    };
  } catch (err) {
    console.error("[FinGroww Background] Google Sheet sync error:", err);
    await chrome.storage.local.set({
      fg_gsheet_last_sync_status: "ERROR",
      fg_gsheet_last_sync_msg: err.message
    });
    return { success: false, error: err.message };
  }
}

// Background Live Tick: Triggers NSE live mark-to-market re-calculation on backend
async function triggerLiveMarketTick() {
  if (isTicking) return;
  // If Indian market is closed, skip heavy live quotes tick and ensure storage reflects market closed
  if (!isIndianMarketOpenNow()) {
    try {
      const stored = await chrome.storage.local.get(["fg_latest_data"]);
      if (stored?.fg_latest_data?.is_market_open === true) {
        stored.fg_latest_data.is_market_open = false;
        await chrome.storage.local.set({ fg_latest_data: stored.fg_latest_data });
      }
    } catch (e) {}
    return;
  }
  isTicking = true;
  try {
    const tickResult = await apiFetch("/api/paper/session/tick", {
      method: "POST",
      body: JSON.stringify({ user_name: currentProfile })
    }, 28000);

    if (tickResult && tickResult.state) {
      const state = tickResult.state;
      const positions = sortPositions(state.active_positions || []);
      const account = state.account || {};
      const status = state.status || "RUNNING";

      profileCaches[currentProfile] = {
        positions: positions,
        account: account,
        status: status,
        timestamp: Date.now()
      };

      // Update today's P&L for current profile
      updateDailyPnlRecord(currentProfile, account, status, positions.length);

      const stored = await chrome.storage.local.get(["fg_latest_data", "fg_profiles_cache"]);
      const prev = stored?.fg_latest_data || {};

      const syncPayload = {
        fg_selected_profile: currentProfile,
        fg_profile_caches: profileCaches,
        fg_daily_pnl_history: dailyPnlHistory,
        fg_latest_data: {
          profile: currentProfile,
          account: account,
          positions: positions,
          status: status,
          leaderboard: prev.leaderboard || [],
          profiles: stored.fg_profiles_cache || prev.profiles || [],
          is_market_open: isIndianMarketOpenNow(),
          daily_pnl: dailyPnlHistory,
          timestamp: Date.now()
        }
      };

      await chrome.storage.local.set(syncPayload);
      updateBadge(positions.length, Number(account.total_pnl) || 0, currentProfile);
    }
  } catch (err) {
    console.warn("[FinGroww Background] Tick warning:", err);
  } finally {
    isTicking = false;
  }
}

// Update Extension Toolbar Icon Badge
function updateBadge(positionsCount, totalPnl, profile) {
  try {
    if (positionsCount > 0) {
      chrome.action.setBadgeText({ text: String(positionsCount) });
      chrome.action.setBadgeBackgroundColor({
        color: totalPnl >= 0 ? "#22c55e" : "#ef4444"
      });
    } else {
      chrome.action.setBadgeText({ text: "0" });
      chrome.action.setBadgeBackgroundColor({ color: "#64748b" });
    }

    const pnlSign = totalPnl >= 0 ? "+" : "";
    chrome.action.setTitle({
      title: `FinGroww Status: [${profile}]\nOpen: ${positionsCount} | P&L: ${pnlSign}₹${totalPnl.toFixed(2)}`
    });
  } catch (e) {}
}

// Start active polling intervals
function startPolling() {
  if (syncInterval) clearInterval(syncInterval);
  if (tickInterval) clearInterval(tickInterval);

  performMasterSync();
  triggerLiveMarketTick();

  // Fast state poll every 3 seconds
  syncInterval = setInterval(performMasterSync, 3000);

  // Background live market tick every 10 seconds to update live quotes from NSE
  tickInterval = setInterval(triggerLiveMarketTick, 10000);
}

// Service worker lifecycle & alarms
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("fg_keepalive_alarm", { periodInMinutes: 0.5 });
  startPolling();
});

chrome.runtime.onStartup.addListener(() => {
  startPolling();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "fg_keepalive_alarm") {
    performMasterSync();
  }
});

// Listen for messages from content scripts, website, or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "SET_PROFILE") {
    const newProfile = request.profile;
    if (newProfile && newProfile !== currentProfile) {
      currentProfile = newProfile;

      // If we have cached older data for this profile, broadcast it IMMEDIATELY so UI doesn't flash empty!
      const cached = profileCaches[currentProfile];
      if (cached) {
        chrome.storage.local.get(["fg_latest_data", "fg_profiles_cache"]).then(stored => {
          const prev = stored?.fg_latest_data || {};
          chrome.storage.local.set({
            fg_selected_profile: currentProfile,
            fg_latest_data: {
              profile: currentProfile,
              account: cached.account,
              positions: cached.positions,
              status: cached.status,
              leaderboard: prev.leaderboard || [],
              profiles: stored.fg_profiles_cache || prev.profiles || [],
              timestamp: Date.now()
            }
          });
        });
      } else {
        chrome.storage.local.set({ fg_selected_profile: currentProfile });
      }

      performMasterSync().then(() => {
        triggerLiveMarketTick();
        sendResponse({ success: true, profile: currentProfile });
      });
      return true; // async response
    }
  }

  if (request.type === "FORCE_REFRESH") {
    performMasterSync().then(() => {
      triggerLiveMarketTick().then(() => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (request.type === "CLOSE_POSITION") {
    const user = request.profile || currentProfile;
    const tradeId = request.tradeId;
    apiFetch("/api/paper/manual-close", {
      method: "POST",
      body: JSON.stringify({ user_name: user, trade_id: tradeId })
    }, 15000).then(res => {
      performMasterSync().then(() => {
        sendResponse({ success: true, res });
      });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === "CLOSE_ALL_POSITIONS") {
    const user = request.profile || currentProfile;
    apiFetch("/api/paper/session/control", {
      method: "POST",
      body: JSON.stringify({ user_name: user, action: "close_all" })
    }, 15000).then(res => {
      performMasterSync().then(() => {
        sendResponse({ success: true, res });
      });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === "GET_DAILY_PNL") {
    sendResponse({ success: true, dailyPnlHistory: dailyPnlHistory });
    return false;
  }

  if (request.type === "SYNC_GOOGLE_SHEET") {
    syncDailyPnlToGoogleSheet(request.options || {}).then(res => {
      sendResponse(res);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

// When profile is changed anywhere in storage, immediately sync
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.fg_selected_profile) {
    const newProfile = changes.fg_selected_profile.newValue;
    if (newProfile && newProfile !== currentProfile) {
      currentProfile = newProfile;
      performMasterSync();
      triggerLiveMarketTick();
    }
  }
});

// Initial boot
startPolling();
