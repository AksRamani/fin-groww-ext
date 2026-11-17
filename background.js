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

// Clean daily P&L history to ensure ONLY real server profiles and real sessions are kept
function cleanDailyPnlHistory(validProfiles = []) {
  if (!dailyPnlHistory || !dailyPnlHistory.byUser) return;
  const { dateKey: todayKey } = getIstDateInfo();
  const validSet = new Set(
    validProfiles.map(p => typeof p === "string" ? p : p.user_name).filter(Boolean)
  );

  for (const user of Object.keys(dailyPnlHistory.byUser)) {
    // If valid server profiles are provided, ensure the profile exists on server
    if (validSet.size > 0 && !validSet.has(user)) {
      delete dailyPnlHistory.byUser[user];
      continue;
    }

    const userDays = dailyPnlHistory.byUser[user];
    for (const dKey of Object.keys(userDays)) {
      const record = userDays[dKey];
      // Retain only valid sessions with actual trades or booked P&L
      const trades = Number(record.tradesCount) || 0;
      const pnl = Number(record.totalPnl) || 0;
      const realized = Number(record.realizedPnl) || 0;
      if (dKey !== todayKey || !record.isReal || (trades === 0 && pnl === 0 && realized === 0)) {
        delete userDays[dKey];
      }
    }
    if (Object.keys(userDays).length === 0) {
      delete dailyPnlHistory.byUser[user];
    }
  }

  dailyPnlHistory.lastUpdated = Date.now();
  chrome.storage.local.set({ fg_daily_pnl_history: dailyPnlHistory });
}

// Record/update day-to-day P&L for a specific user (100% REAL dynamic server metrics only)
function updateDailyPnlRecord(profileName, accountObj, statusVal, activePositionsCount = 0, stats = {}) {
  if (!profileName) return;

  const { dateKey, displayDate, dayName } = getIstDateInfo();
  const existingRecord = dailyPnlHistory.byUser?.[profileName]?.[dateKey] || {};

  const acc = accountObj || {};
  const totalPnl = Number(acc.total_pnl !== undefined ? acc.total_pnl : (acc.net_pnl !== undefined ? acc.net_pnl : existingRecord.totalPnl)) || 0;
  const realizedPnl = Number(acc.realized_pnl !== undefined ? acc.realized_pnl : existingRecord.realizedPnl) || 0;
  const unrealizedPnl = Number(acc.unrealized_pnl !== undefined ? acc.unrealized_pnl : existingRecord.unrealizedPnl) || 0;
  const equity = Number(acc.account_equity || acc.equity || existingRecord.equity) || 100000;

  // Real trades count resolution from server API:
  let serverTotalTrades = 0;
  if (stats.total_trades !== undefined && stats.total_trades !== null) {
    serverTotalTrades = Number(stats.total_trades);
  } else if (stats.total_closed_trades_count !== undefined && stats.total_closed_trades_count !== null) {
    serverTotalTrades = Number(stats.total_closed_trades_count);
  } else if (acc.total_trades !== undefined && acc.total_trades !== null) {
    serverTotalTrades = Number(acc.total_trades);
  } else if (acc.closed_trades_count !== undefined && acc.closed_trades_count !== null) {
    serverTotalTrades = Number(acc.closed_trades_count);
  } else if (existingRecord.tradesCount !== undefined && existingRecord.tradesCount > activePositionsCount) {
    serverTotalTrades = Number(existingRecord.tradesCount);
  }

  const winningTrades = Number(
    stats.winning_trades !== undefined && stats.winning_trades !== null
      ? stats.winning_trades
      : (acc.winning_trades !== undefined ? acc.winning_trades : (existingRecord.winningTrades || 0))
  ) || 0;

  const losingTrades = Number(
    stats.losing_trades !== undefined && stats.losing_trades !== null
      ? stats.losing_trades
      : (acc.losing_trades !== undefined ? acc.losing_trades : (existingRecord.losingTrades || 0))
  ) || 0;

  const openPositions = Number(
    activePositionsCount !== undefined
      ? activePositionsCount
      : (stats.open_positions_count !== undefined ? stats.open_positions_count : (existingRecord.openPositionsCount || 0))
  ) || 0;

  // When total trades are reported by server (e.g. 196), use it; otherwise sum closed trades + active positions
  const trades = serverTotalTrades > 0 ? serverTotalTrades : (openPositions + (winningTrades + losingTrades));

  let winRate = 0;
  if (stats.win_rate !== undefined && stats.win_rate !== null) {
    winRate = Number(stats.win_rate) || 0;
  } else if (existingRecord.winRate !== undefined) {
    winRate = Number(existingRecord.winRate) || 0;
  } else if ((winningTrades + losingTrades) > 0) {
    winRate = (winningTrades / (winningTrades + losingTrades)) * 100;
  }

  // Only store if this profile has made any trade or booked any profit/loss
  if (trades === 0 && totalPnl === 0 && realizedPnl === 0 && unrealizedPnl === 0) {
    return;
  }

  if (!dailyPnlHistory.byUser) dailyPnlHistory.byUser = {};
  if (!dailyPnlHistory.byUser[profileName]) dailyPnlHistory.byUser[profileName] = {};

  dailyPnlHistory.byUser[profileName][dateKey] = {
    date: dateKey,
    displayDate: displayDate,
    dayName: dayName,
    totalPnl: totalPnl,
    realizedPnl: realizedPnl,
    unrealizedPnl: unrealizedPnl,
    equity: equity,
    status: statusVal || existingRecord.status || "RUNNING",
    tradesCount: trades,
    winningTrades: winningTrades,
    losingTrades: losingTrades,
    winRate: winRate,
    openPositionsCount: openPositions,
    isReal: true,
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
  cleanDailyPnlHistory(res?.fg_profiles_cache || []);
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

    // 2. Fetch Profiles, Leaderboard, Session State, and Market Status concurrently
    const [profilesData, leaderboardData, sessionData, marketData] = await Promise.all([
      apiFetch("/api/paper/profiles", {}, 10000),
      apiFetch("/api/paper/leaderboard", {}, 10000),
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

    // Leaderboard: retain all real traders from server (include RUNNING, PAUSED, IDLE, etc.)
    const rawLb = leaderboardData?.leaderboard || [];
    let runningLeaderboard = rawLb;
    if (runningLeaderboard.length === 0 && previousData?.leaderboard && previousData.leaderboard.length > 0) {
      runningLeaderboard = previousData.leaderboard;
    }
    runningLeaderboard.sort((a, b) => (Number(b.net_pnl) || 0) - (Number(a.net_pnl) || 0));
    let leaderboard = runningLeaderboard.map((p, idx) => ({ ...p, rank: idx + 1 }));

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

    // Find current profile in leaderboard for complete win/loss trade analytics
    const currentLb = (leaderboard || []).find(p => (p.user_name || p.name) === currentProfile);

    // Update daily P&L for current user with full dynamic stats
    updateDailyPnlRecord(
      currentProfile,
      account,
      engineStatus,
      activePositions ? activePositions.length : 0,
      {
        total_trades: currentLb?.total_trades !== undefined ? currentLb.total_trades : sessionData?.total_closed_trades_count,
        total_closed_trades_count: sessionData?.total_closed_trades_count,
        winning_trades: currentLb?.winning_trades,
        losing_trades: currentLb?.losing_trades,
        win_rate: currentLb?.win_rate,
        open_positions_count: activePositions ? activePositions.length : currentLb?.open_positions_count
      }
    );

    // Update daily P&L for all profiles with trading activity from profilesList & leaderboard (including PAUSED)
    const profileMap = new Map();
    if (Array.isArray(profilesList)) {
      profilesList.forEach(p => {
        if (p && p.user_name) profileMap.set(p.user_name, p);
      });
    }
    if (Array.isArray(leaderboard)) {
      leaderboard.forEach(p => {
        const u = p.user_name || p.name;
        if (u) {
          const prev = profileMap.get(u) || {};
          profileMap.set(u, { ...prev, ...p });
        }
      });
    }

    profileMap.forEach((entry, u) => {
      // If this is the currently active profile and we already updated it with fresh sessionData above, skip
      if (u === currentProfile && sessionData && sessionData.account) return;

      const trades = Number(entry.total_trades) || 0;
      const pnl = Number(entry.net_pnl !== undefined ? entry.net_pnl : (entry.total_pnl !== undefined ? entry.total_pnl : entry.realized_pnl)) || 0;
      const realized = Number(entry.realized_pnl) || 0;

      // Include all profiles with trades or P&L
      if (trades > 0 || pnl !== 0 || realized !== 0) {
        updateDailyPnlRecord(
          u,
          {
            total_pnl: pnl,
            realized_pnl: realized,
            unrealized_pnl: entry.unrealized_pnl,
            account_equity: entry.account_equity || entry.equity
          },
          entry.status || "IDLE",
          entry.open_positions_count || 0,
          {
            total_trades: trades,
            winning_trades: entry.winning_trades,
            losing_trades: entry.losing_trades,
            win_rate: entry.win_rate,
            open_positions_count: entry.open_positions_count
          }
        );
      }
    });

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
async function checkEndOfDayAutoSync(force = false) {
  try {
    const stored = await chrome.storage.local.get([
      "fg_gsheet_url",
      "fg_gsheet_autosync",
      "fg_gsheet_eod_synced_date"
    ]);

    if (!stored.fg_gsheet_url || stored.fg_gsheet_autosync === false) {
      return;
    }

    const { dateKey } = getIstDateInfo();
    // Prevent duplicate market close syncs for the same day unless forced
    if (!force && stored.fg_gsheet_eod_synced_date === dateKey) {
      return;
    }

    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (3600000 * 5.5));
    const day = ist.getDay();
    const isWeekday = day >= 1 && day <= 5;
    const totalMins = ist.getHours() * 60 + ist.getMinutes();

    // Trigger after 3:30 PM IST (930 minutes) on a weekday
    if (force || (isWeekday && totalMins >= 930)) {
      console.log(`[FinGroww Background] Triggering 3:30 PM Market Close Google Sheet auto-sync for ${dateKey}...`);
      if (!isSyncing) {
        await performMasterSync();
      }
      const res = await syncDailyPnlToGoogleSheet({ targetDate: dateKey, isEndOfDay: true });
      if (res && res.success) {
        await chrome.storage.local.set({ fg_gsheet_eod_synced_date: dateKey });
      }
    }
  } catch (e) {
    console.warn("[FinGroww Background] End-of-day auto sync check error:", e);
  }
}

// Sync Daily P&L records to Google Sheets Webhook (Profile-by-Profile, ONLY REAL DATA)
async function syncDailyPnlToGoogleSheet(options = {}) {
  try {
    const stored = await chrome.storage.local.get([
      "fg_gsheet_url",
      "fg_gsheet_autosync",
      "fg_gsheet_eod_synced_date",
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
      ? Array.from(new Set(Object.values(historyByUser).flatMap(u => Object.keys(u)))).filter(d => d === todayKey).sort((a, b) => a.localeCompare(b))
      : [targetDate];

    const rows = [];

    for (const dKey of targetDates) {
      for (const [userName, userDays] of Object.entries(historyByUser)) {
        const dayRecord = userDays[dKey];
        if (!dayRecord || !dayRecord.isReal) continue;

        const pnl = Number(dayRecord.totalPnl) || 0;
        const realized = Number(dayRecord.realizedPnl) || 0;
        const unrealized = Number(dayRecord.unrealizedPnl) || 0;
        const eq = Number(dayRecord.equity) || 100000;
        const trades = Number(dayRecord.tradesCount) || 0;
        const wins = Number(dayRecord.winningTrades) || 0;
        const losses = Number(dayRecord.losingTrades) || 0;
        const winRateVal = Number(dayRecord.winRate) || 0;
        const openPos = Number(dayRecord.openPositionsCount) || 0;

        let notesText = `${trades} trades executed`;
        if (wins > 0 || losses > 0) {
          notesText = `${trades} trades (${wins}W / ${losses}L - ${winRateVal.toFixed(1)}% WR)${openPos > 0 ? ` • ${openPos} Open` : ""}`;
        }

        // ONLY include profiles that made any trade or booked any profit/loss
        if (trades > 0 || pnl !== 0 || realized !== 0) {
          rows.push({
            date: dayRecord.displayDate || dKey,
            dayName: dayRecord.dayName || "",
            time: "15:30:00",
            trader: userName,
            totalPnl: pnl,
            realizedPnl: realized,
            unrealizedPnl: unrealized,
            equity: eq,
            tradesCount: trades,
            status: dayRecord.status || (pnl >= 0 ? "PROFIT" : "LOSS"),
            notes: notesText
          });
        }
      }
    }

    if (rows.length === 0) {
      return { success: false, error: "No active trading profiles with trades found to sync." };
    }

    const payloadStr = JSON.stringify({
      action: "sync_daily_pnl",
      source: "FinGroww Chrome Extension",
      rows: rows
    });

    let resultJson = null;
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        redirect: "follow",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: payloadStr
      });
      const resultText = await response.text();
      try {
        resultJson = JSON.parse(resultText);
      } catch (e) {
        resultJson = { raw: resultText };
      }
    } catch (fetchErr) {
      console.warn("[FinGroww Background] Standard fetch redirect failed, using no-cors mode:", fetchErr);
      await fetch(webhookUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: payloadStr
      });
      resultJson = { status: "success", mode: "no-cors" };
    }

    const now = Date.now();
    const updateObj = {
      fg_gsheet_last_sync_date: todayKey,
      fg_gsheet_last_sync_time: now,
      fg_gsheet_last_sync_status: "SUCCESS",
      fg_gsheet_last_sync_msg: `Synced ${rows.length} profile rows to Google Sheet`
    };
    if (options.isEndOfDay) {
      updateObj.fg_gsheet_eod_synced_date = todayKey;
    }
    await chrome.storage.local.set(updateObj);

    return {
      success: true,
      count: rows.length,
      result: resultJson,
      syncedAt: now
    };
  } catch (err) {
    console.error("[FinGroww Background] Google Sheet sync error:", err);
    const errText = err?.message || "Sync failed. Check Google Apps Script URL.";
    await chrome.storage.local.set({
      fg_gsheet_last_sync_status: "ERROR",
      fg_gsheet_last_sync_msg: errText
    });
    return { success: false, error: errText };
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
  chrome.alarms.create("fg_keepalive_alarm", { periodInMinutes: 1 });
  chrome.alarms.create("fg_eod_alarm", { periodInMinutes: 1 });
  startPolling();
  checkEndOfDayAutoSync();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("fg_keepalive_alarm", { periodInMinutes: 1 });
  chrome.alarms.create("fg_eod_alarm", { periodInMinutes: 1 });
  startPolling();
  checkEndOfDayAutoSync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "fg_keepalive_alarm" || alarm.name === "fg_eod_alarm") {
    performMasterSync();
    checkEndOfDayAutoSync();
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

  if (request.type === "CHECK_END_OF_DAY_SYNC") {
    checkEndOfDayAutoSync(request.force === true).then(() => {
      sendResponse({ success: true });
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
checkEndOfDayAutoSync();
