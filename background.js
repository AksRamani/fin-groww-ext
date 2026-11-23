/**
 * FinGroww Paper Trading Monitor - Centralized Real-time Background Service Worker
 * Coordinates real-time sync across ALL browser tabs for profiles, positions, and live prices
 * Implements Stale-While-Revalidate caching: NEVER overwrites valid data with empty/stale defaults
 */

const API_BASE = "https://api.fingroww.tech";
const FALLBACK_API_BASE = "https://fingroww-trading-y3na.onrender.com";
const LOCAL_API_BASE = "http://127.0.0.1:8787";
const LEGACY_API_BASE = "https://fingroww-trading.onrender.com";

const API_HOSTS = [API_BASE, FALLBACK_API_BASE, LOCAL_API_BASE, LEGACY_API_BASE];

let currentProfile = "Aks-new-55k";
let isSyncing = false;
let isTicking = false;
let isGsheetSyncing = false;
let isCsvExporting = false;
let isSyncDailyPnlInProgress = false;
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
  
  let realizedPnl = Number(acc.realized_pnl !== undefined ? acc.realized_pnl : existingRecord.realizedPnl) || 0;
  let unrealizedPnl = Number(acc.unrealized_pnl !== undefined ? acc.unrealized_pnl : existingRecord.unrealizedPnl) || 0;

  // Realized vs Unrealized P&L reconciliation
  if (activePositionsCount === 0 || unrealizedPnl === 0) {
    if (realizedPnl === 0 && totalPnl !== 0) {
      realizedPnl = totalPnl;
    }
    unrealizedPnl = 0;
  } else if (realizedPnl === 0 && unrealizedPnl !== 0 && totalPnl !== 0) {
    realizedPnl = totalPnl - unrealizedPnl;
  }

  const equity = Number(acc.account_equity || acc.equity || existingRecord.equity) || 100000;
  const charges = Number(acc.total_charges !== undefined ? acc.total_charges : (acc.charges !== undefined ? acc.charges : (existingRecord.charges || 0))) || 0;
  const slippage = Number(acc.total_slippage !== undefined ? acc.total_slippage : (existingRecord.slippage || 0)) || 0;

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
    charges: charges,
    netAfterCharges: totalPnl,
    slippage: slippage,
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

// Multi-host resilient fetch with fast fallback
async function apiFetch(path, options = {}, timeoutMs = 12000) {
  const hosts = API_HOSTS;
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

let showAfterHours = false;
chrome.storage.local.get(["fg_show_after_hours"]).then(res => {
  if (res && res.fg_show_after_hours !== undefined) {
    showAfterHours = res.fg_show_after_hours === true;
  }
}).catch(() => {});

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

// Multi-profile session state synchronization
let lastMultiProfileSyncTime = 0;

async function syncAllProfilesSessionStates(profileNames = []) {
  if (!Array.isArray(profileNames) || profileNames.length === 0) return;

  const validNames = profileNames.filter(u => u && typeof u === "string" && !u.includes("ALL USERS"));
  if (validNames.length === 0) return;

  console.log(`[FinGroww Background] Fetching real session states & charges for ${validNames.length} profiles...`);

  await Promise.all(
    validNames.map(async (u) => {
      try {
        const res = await apiFetch(`/api/paper/session/state?user=${encodeURIComponent(u)}`, {}, 12000);
        if (res && res.account) {
          profileCaches[u] = {
            ...(profileCaches[u] || {}),
            account: res.account,
            status: res.engine_status || res.status || "RUNNING",
            positions: res.active_positions || [],
            timestamp: Date.now()
          };

          const acc = res.account;
          const trades = Number(acc.total_trades || (res.stats && res.stats.total_trades) || 0);
          const pnl = Number(acc.total_pnl !== undefined ? acc.total_pnl : acc.net_pnl) || 0;
          const openPositions = res.active_positions || [];

          let realized = Number(acc.realized_pnl !== undefined ? acc.realized_pnl : 0);
          let unrealized = Number(acc.unrealized_pnl !== undefined ? acc.unrealized_pnl : 0);

          if (openPositions.length === 0 || unrealized === 0) {
            if (realized === 0 && pnl !== 0) realized = pnl;
            unrealized = 0;
          } else if (realized === 0 && unrealized !== 0 && pnl !== 0) {
            realized = pnl - unrealized;
          }

          acc.realized_pnl = realized;
          acc.unrealized_pnl = unrealized;

          if (trades > 0 || pnl !== 0 || realized !== 0) {
            updateDailyPnlRecord(
              u,
              acc,
              res.engine_status || res.status || "RUNNING",
              openPositions.length,
              res.stats || {}
            );
          }
        }
      } catch (err) {
        console.warn(`[FinGroww Background] Failed to fetch session state for ${u}:`, err);
      }
    })
  );

  lastMultiProfileSyncTime = Date.now();
  await chrome.storage.local.set({
    fg_profile_caches: profileCaches,
    fg_daily_pnl_history: dailyPnlHistory
  });
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

    const syncTargetProfile = currentProfile;
    const previousData = stored?.fg_latest_data;

    // 2. Fetch Profiles, Leaderboard, Session State, and Market Status concurrently
    const [profilesData, leaderboardData, sessionData, marketData] = await Promise.all([
      apiFetch("/api/paper/profiles", {}, 10000),
      apiFetch("/api/paper/leaderboard", {}, 10000),
      apiFetch(`/api/paper/session/state?user=${encodeURIComponent(syncTargetProfile)}`, {}, 14000),
      apiFetch("/api/paper/market-status", {}, 8000)
    ]);

    // If profile was changed while fetch was in-flight, discard stale session data
    if (syncTargetProfile && currentProfile && syncTargetProfile !== currentProfile) {
      console.log(`[FinGroww Background] Discarding stale sync for ${syncTargetProfile}, active profile is ${currentProfile}`);
      return;
    }

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
    const rawLb = leaderboardData?.leaderboard || (Array.isArray(leaderboardData) ? leaderboardData : []);

    // If currentProfile is obsolete and no longer in profiles list, auto-switch to an active profile
    const profileNames = profilesList.map(p => typeof p === "string" ? p : (p.user_name || p.name));
    if (profileNames.length > 0 && !profileNames.includes(currentProfile)) {
      const preferred = ["Aks-new-55k", "AKS-IntraDay", "Akshay", "14K Traders", "PARTH 18-Nov"];
      const match = preferred.find(p => profileNames.includes(p)) || profileNames[0];
      if (match) {
        console.log(`[FinGroww Background] Auto-switching obsolete profile [${currentProfile}] -> [${match}]`);
        currentProfile = match;
        chrome.storage.local.set({ fg_selected_profile: match });
      }
    }

    // Ensure any profiles from leaderboard are included in profilesList
    if (Array.isArray(rawLb) && rawLb.length > 0) {
      const knownSet = new Set(profilesList.map(p => typeof p === "string" ? p : p.user_name));
      rawLb.forEach(lbTrader => {
        const name = lbTrader.user_name || lbTrader.name;
        if (name && !knownSet.has(name)) {
          profilesList.push({
            user_name: name,
            trading_style: lbTrader.trading_style || "HIGH_WINRATE",
            net_pnl: lbTrader.net_pnl || 0,
            account_equity: lbTrader.account_equity || 100000,
            total_trades: lbTrader.total_trades || 0
          });
          knownSet.add(name);
        }
      });
    }

    // Filter strictly RUNNING profiles for ranking competition
    const runningProfiles = rawLb.filter(p => {
      const st = (p.status || "").toUpperCase();
      return st === "RUNNING" || st === "STOPPED_NEW_TRADES";
    });
    runningProfiles.sort((a, b) => (Number(b.net_pnl) || 0) - (Number(a.net_pnl) || 0));
    const runningCount = runningProfiles.length;

    // Lookup table for 1-based rank among RUNNING profiles only
    const runningRankMap = new Map();
    runningProfiles.forEach((p, idx) => {
      const name = p.user_name || p.name;
      if (name) runningRankMap.set(name, idx + 1);
    });

    let runningLeaderboard = rawLb;
    if (runningLeaderboard.length === 0 && previousData?.leaderboard && previousData.leaderboard.length > 0) {
      runningLeaderboard = previousData.leaderboard;
    }
    runningLeaderboard.sort((a, b) => (Number(b.net_pnl) || 0) - (Number(a.net_pnl) || 0));

    // Map each profile: running profiles get their rank out of runningCount, non-running get null
    let leaderboard = runningLeaderboard.map((p) => {
      const name = p.user_name || p.name;
      const isRunning = runningRankMap.has(name);
      return {
        ...p,
        rank: isRunning ? runningRankMap.get(name) : null,
        isRunning: isRunning,
        runningRank: isRunning ? runningRankMap.get(name) : null,
        totalRunning: runningCount
      };
    });

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

    let totalPnl = Number(account.total_pnl !== undefined ? account.total_pnl : (account.net_pnl !== undefined ? account.net_pnl : 0)) || 0;

    // Find current profile in leaderboard for complete win/loss trade analytics
    const currentLb = (leaderboard || []).find(p => (p.user_name || p.name) === currentProfile);
    if (totalPnl === 0 && currentLb) {
      totalPnl = Number(currentLb.net_pnl !== undefined ? currentLb.net_pnl : currentLb.total_pnl) || 0;
    }

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
        const profCharges = profileCaches[u]?.account?.total_charges || entry.total_charges || entry.charges || 0;
        const profSlippage = profileCaches[u]?.account?.total_slippage || entry.total_slippage || entry.slippage || 0;
        updateDailyPnlRecord(
          u,
          {
            total_pnl: pnl,
            realized_pnl: realized,
            unrealized_pnl: entry.unrealized_pnl,
            account_equity: entry.account_equity || entry.equity,
            total_charges: profCharges,
            total_slippage: profSlippage
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

    // Periodically refresh full session states and broker charges for all real active profiles
    if (Date.now() - lastMultiProfileSyncTime > 45000) {
      const allActiveProfiles = Array.from(profileMap.keys()).filter(u => !u.includes("ALL USERS"));
      syncAllProfilesSessionStates(allActiveProfiles).catch(() => {});
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

    // Final guard: Ensure user has not switched profile while payload was being constructed
    if (syncTargetProfile && currentProfile && syncTargetProfile !== currentProfile) {
      console.log(`[FinGroww Background] Discarding stale sync result for ${syncTargetProfile}, active profile changed to ${currentProfile}`);
      return;
    }

    await chrome.storage.local.set(syncPayload);

    // 4. Update Extension Toolbar Badge
    updateBadge(activePositions.length, totalPnl, currentProfile);

    // 5. Check if market closed and Google Sheet auto-sync is due
    checkEndOfDayAutoSync();
    checkEndOfDayAutoCsvDownload();

  } catch (err) {
    console.error("[FinGroww Background] Master sync error:", err);
  } finally {
    isSyncing = false;
  }
}

// Auto-sync to Google Sheet at market close (Mon-Fri after 3:30 PM IST)
async function checkEndOfDayAutoSync(force = false) {
  if (isGsheetSyncing) {
    return;
  }
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
      isGsheetSyncing = true;
      // Pre-emptively record date so concurrent alarm or poll ticks do not duplicate
      await chrome.storage.local.set({ fg_gsheet_eod_synced_date: dateKey });

      console.log(`[FinGroww Background] Triggering 3:30 PM Market Close Google Sheet auto-sync for ${dateKey}...`);
      const res = await syncDailyPnlToGoogleSheet({ targetDate: dateKey, isEndOfDay: true });
      if (!res || !res.success) {
        console.warn("[FinGroww Background] Market close Google Sheet auto-sync warning:", res?.error);
      }
    }
  } catch (e) {
    console.warn("[FinGroww Background] End-of-day auto sync check error:", e);
  } finally {
    isGsheetSyncing = false;
  }
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

// Convert UTF-8 string to base64 Data URL for chrome.downloads
function csvStringToDataUrl(csvText) {
  // Add UTF-8 BOM so Excel properly opens rupee symbols and special characters
  const bom = "\uFEFF";
  const bytes = new TextEncoder().encode(bom + csvText);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return "data:text/csv;charset=utf-8;base64," + btoa(binary);
}

// Attempt direct save to D:\Tred CSVs via local helper (port 8787)
async function trySaveCsvToLocalServer(filename, csvContent) {
  try {
    const res = await fetch("http://127.0.0.1:8787/api/save-trades-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: filename,
        csvContent: csvContent,
        targetDir: "D:\\Tred CSVs"
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        console.log(`[FinGroww Background] Saved directly to D:\\Tred CSVs via local server: ${filename}`);
        return true;
      }
    }
  } catch (e) {
    // Local server not running or unreachable
  }
  return false;
}

// Helper to build CSV structure and rows for trade details (closed trades + active positions)
function buildProfileTradesCsv(targetProfile, closedTrades = [], openPositions = []) {
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
    "Signal Rationale"
  ];

  const rawRows = [];

  // 1. Append closed trades
  for (const t of closedTrades) {
    const net = Number(t.net_pnl) || 0;
    const gross = Number(t.gross_pnl) || 0;
    const charges = Number(t.charges) || 0;
    const retPct = Number(t.return_pct) || 0;
    const isWin = t.is_win !== undefined ? t.is_win : net > 0;
    const outcome = isWin ? "WIN" : (net < 0 ? "LOSS" : "BREAKEVEN");
    const exitReason = t.exit_reason || "MANUAL_EXIT";

    rawRows.push([
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
      escapeCsvCell(exitReason),
      escapeCsvCell(t.entry_time || ""),
      escapeCsvCell(t.exit_time || t.closed_at || ""),
      escapeCsvCell(t.holding_duration_str || (t.holding_seconds ? `${t.holding_seconds}s` : "")),
      escapeCsvCell(t.strategy || ""),
      escapeCsvCell(t.trailing_state || ""),
      escapeCsvCell(Number(t.slippage || 0).toFixed(2)),
      escapeCsvCell(Number(t.allocated_margin || t.used_amount || 0).toFixed(2)),
      escapeCsvCell(t.expiry_date || t.expiry_label || ""),
      escapeCsvCell(t.signal_rationale || "")
    ]);
  }

  // 2. Append active open positions
  for (const pos of openPositions) {
    const unPnl = Number(pos.unrealized_pnl) || 0;
    const pnlPct = Number(pos.pnl_pct) || 0;
    const outcome = unPnl > 0 ? "UNREALIZED_WIN" : (unPnl < 0 ? "UNREALIZED_LOSS" : "OPEN");

    rawRows.push([
      escapeCsvCell(pos.trade_id || ""),
      escapeCsvCell(targetProfile),
      escapeCsvCell(pos.symbol || ""),
      escapeCsvCell(pos.name || pos.symbol || ""),
      escapeCsvCell(pos.instrument_type || "STOCK_OPTIONS"),
      escapeCsvCell(pos.side || "BUY"),
      escapeCsvCell("OPEN"),
      escapeCsvCell(pos.quantity || 0),
      escapeCsvCell(Number(pos.entry_price || 0).toFixed(2)),
      escapeCsvCell(Number(pos.current_price || pos.ltp || pos.entry_price || 0).toFixed(2)),
      escapeCsvCell(Number(pos.target_price || 0).toFixed(2)),
      escapeCsvCell(Number(pos.stop_loss || 0).toFixed(2)),
      escapeCsvCell(unPnl.toFixed(2)),
      escapeCsvCell(Number(pos.total_charges || pos.entry_charges || 0).toFixed(2)),
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
      escapeCsvCell(Number(pos.allocated_margin || pos.used_amount || 0).toFixed(2)),
      escapeCsvCell(pos.expiry_date || pos.expiry_label || ""),
      escapeCsvCell(pos.signal_rationale || "")
    ]);
  }

  const csvContent = [headers.join(","), ...rawRows.map(r => r.join(","))].join("\r\n");

  return {
    headers,
    rawRows,
    csvContent,
    totalTradesCount: rawRows.length,
    closedCount: closedTrades.length,
    openCount: openPositions.length
  };
}

// Export complete trade details for a specific trader profile (supports 150+ trades, profit, loss, exit reason, prices)
async function exportProfileTradesCsv(options = {}) {
  try {
    const stored = await chrome.storage.local.get(["fg_selected_profile"]);
    const targetProfile = options.profile || currentProfile || stored.fg_selected_profile;
    if (!targetProfile) {
      return { success: false, error: "No profile selected for export." };
    }

    console.log(`[FinGroww Background] Fetching all trade details for profile: ${targetProfile}...`);

    // Fetch closed trades (requesting limit 10000 so 150+, 500+ trades are all retrieved)
    // And fetch active positions from session state concurrently
    const [tradesRes, sessionRes] = await Promise.all([
      apiFetch(`/api/paper/trades?user=${encodeURIComponent(targetProfile)}&limit=10000`, {}, 25000).catch(err => {
        console.warn(`[FinGroww Background] apiFetch trades error:`, err);
        return null;
      }),
      apiFetch(`/api/paper/session/state?user=${encodeURIComponent(targetProfile)}`, {}, 20000).catch(err => {
        console.warn(`[FinGroww Background] apiFetch session state error:`, err);
        return null;
      })
    ]);

    const closedTrades = tradesRes && Array.isArray(tradesRes.trades) ? tradesRes.trades : [];
    const openPositions = sessionRes && Array.isArray(sessionRes.active_positions) ? sessionRes.active_positions : [];

    if (closedTrades.length === 0 && openPositions.length === 0) {
      console.warn(`[FinGroww Background] No trades or positions found for profile: ${targetProfile}`);
      return {
        success: false,
        error: `No trades or positions found for "${targetProfile}".`,
        count: 0
      };
    }

    const { dateKey: todayKey } = getIstDateInfo();
    const { csvContent, totalTradesCount, closedCount, openCount } = buildProfileTradesCsv(targetProfile, closedTrades, openPositions);

    const sanitizedProfile = targetProfile.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `FinGroww_Trades_${sanitizedProfile}_${todayKey}.csv`;
    const dataUrl = csvStringToDataUrl(csvContent);

    // 1. Direct write to D:\Tred CSVs if local helper is listening
    await trySaveCsvToLocalServer(filename, csvContent);

    // 2. Trigger Chrome browser download
    let downloadId = null;
    if (typeof chrome.downloads !== "undefined" && chrome.downloads.download) {
      try {
        downloadId = await chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: false,
          conflictAction: "uniquify"
        });
        console.log(`[FinGroww Background] Triggered download id=${downloadId} for ${filename}`);
      } catch (dlErr) {
        console.warn(`[FinGroww Background] chrome.downloads error:`, dlErr);
      }
    }

    const nowStr = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
    const updateObj = {
      fg_eod_csv_last_status: "SUCCESS",
      fg_eod_csv_last_msg: `Downloaded ${totalTradesCount} trades for ${targetProfile}`,
      fg_eod_csv_last_time: nowStr,
      fg_eod_csv_last_filename: filename,
      fg_eod_trades_count: totalTradesCount
    };

    if (options.isAutoEod) {
      updateObj.fg_eod_trades_csv_downloaded_date = todayKey;
    }

    await chrome.storage.local.set(updateObj);

    return {
      success: true,
      count: totalTradesCount,
      closedCount: closedCount,
      openCount: openCount,
      filename: filename,
      downloadId: downloadId,
      csvContent: csvContent
    };
  } catch (err) {
    console.error(`[FinGroww Background] Export profile trades error:`, err);
    await chrome.storage.local.set({
      fg_eod_csv_last_status: "ERROR",
      fg_eod_csv_last_msg: err.message || "Export failed"
    });
    return { success: false, error: err.message || "Failed to export trade details." };
  }
}

// Export individual CSV files after market close for ALL profiles that are in a loss or profit
async function exportAllProfilesTradesCsv(options = {}) {
  try {
    const { dateKey: todayKey } = getIstDateInfo();
    console.log(`[FinGroww Background] Starting End-of-Day Trade Details CSV export for all profiles in loss or profit on ${todayKey}...`);

    // 1. Discover all candidate profiles from server API, cache, leaderboard, and history
    const [profilesRes, leaderboardRes] = await Promise.all([
      apiFetch("/api/paper/profiles", {}, 12000).catch(() => null),
      apiFetch("/api/paper/leaderboard", {}, 12000).catch(() => null)
    ]);

    const stored = await chrome.storage.local.get([
      "fg_profiles_cache",
      "fg_selected_profile",
      "fg_daily_pnl_history",
      "fg_latest_data"
    ]);

    const allProfilesMap = new Map();

    const addProfileCandidate = (name, meta = {}) => {
      if (!name || typeof name !== "string") return;
      const cleanName = name.trim();
      if (!cleanName || cleanName.includes("ALL USERS") || /^[-\d\.,]+$/.test(cleanName)) return;
      const existing = allProfilesMap.get(cleanName) || {};
      allProfilesMap.set(cleanName, { ...existing, ...meta, user_name: cleanName });
    };

    if (Array.isArray(profilesRes)) {
      profilesRes.forEach(p => addProfileCandidate(p.user_name || p.name, p));
    } else if (profilesRes && Array.isArray(profilesRes.profiles)) {
      profilesRes.profiles.forEach(p => addProfileCandidate(p.user_name || p.name, p));
    }

    if (leaderboardRes && Array.isArray(leaderboardRes.leaderboard)) {
      leaderboardRes.leaderboard.forEach(p => addProfileCandidate(p.user_name || p.name, p));
    }

    if (stored.fg_profiles_cache && Array.isArray(stored.fg_profiles_cache)) {
      stored.fg_profiles_cache.forEach(p => addProfileCandidate(typeof p === "string" ? p : p.user_name, p));
    }

    if (stored.fg_daily_pnl_history && stored.fg_daily_pnl_history.byUser) {
      Object.keys(stored.fg_daily_pnl_history.byUser).forEach(u => addProfileCandidate(u));
    }

    if (stored.fg_selected_profile) {
      addProfileCandidate(stored.fg_selected_profile);
    }
    if (currentProfile) {
      addProfileCandidate(currentProfile);
    }

    console.log(`[FinGroww Background] Discovered ${allProfilesMap.size} unique candidate profiles across all sources.`);

    // 2. Filter profiles that are in PROFIT or LOSS (or have trade activity)
    const activeProfitLossProfiles = [];

    for (const [pName, meta] of allProfilesMap.entries()) {
      let isCandidate = false;
      const netPnl = Number(meta.net_pnl !== undefined ? meta.net_pnl : (meta.total_pnl !== undefined ? meta.total_pnl : meta.realized_pnl)) || 0;
      const tradesCount = Number(meta.total_trades || meta.trades_count) || 0;

      // If metadata already indicates profit or loss or trades, mark as candidate
      if (Math.abs(netPnl) > 0.001 || tradesCount > 0) {
        isCandidate = true;
      } else {
        // Check daily history for today
        const userDay = stored.fg_daily_pnl_history?.byUser?.[pName]?.[todayKey];
        if (userDay && (Math.abs(Number(userDay.totalPnl) || 0) > 0.001 || Number(userDay.tradesCount) > 0)) {
          isCandidate = true;
        }
      }

      if (isCandidate) {
        activeProfitLossProfiles.push({ name: pName, pnl: netPnl, trades: tradesCount });
      }
    }

    console.log(`[FinGroww Background] Found ${activeProfitLossProfiles.length} active profit/loss profiles to fetch trade details.`);

    if (activeProfitLossProfiles.length === 0) {
      const msg = "No profiles found in profit or loss with trades today.";
      console.warn(`[FinGroww Background] ${msg}`);
      await chrome.storage.local.set({
        fg_eod_csv_last_status: "WARNING",
        fg_eod_csv_last_msg: msg
      });
      return { success: false, error: msg, count: 0, exportedFiles: [] };
    }

    // 3. For each profile in profit or loss: fetch full trade details and trigger individual CSV download
    const exportedFiles = [];
    const allCombinedRawRows = [];
    let grandTotalTrades = 0;

    for (let i = 0; i < activeProfitLossProfiles.length; i++) {
      const prof = activeProfitLossProfiles[i];
      const pName = prof.name;

      try {
        console.log(`[FinGroww Background] [${i + 1}/${activeProfitLossProfiles.length}] Fetching complete trade details for "${pName}"...`);

        const [tradesRes, sessionRes] = await Promise.all([
          apiFetch(`/api/paper/trades?user=${encodeURIComponent(pName)}&limit=10000`, {}, 25000).catch(err => {
            console.warn(`[FinGroww Background] Trades fetch failed for ${pName}:`, err);
            return null;
          }),
          apiFetch(`/api/paper/session/state?user=${encodeURIComponent(pName)}`, {}, 20000).catch(err => {
            console.warn(`[FinGroww Background] Session fetch failed for ${pName}:`, err);
            return null;
          })
        ]);

        const closedTrades = tradesRes && Array.isArray(tradesRes.trades) ? tradesRes.trades : [];
        const openPositions = sessionRes && Array.isArray(sessionRes.active_positions) ? sessionRes.active_positions : [];

        // If no trades or positions found, verify if profile has recorded PnL
        const sessionAccount = sessionRes?.account || {};
        const sessPnl = Number(sessionAccount.total_pnl !== undefined ? sessionAccount.total_pnl : prof.pnl) || 0;

        if (closedTrades.length === 0 && openPositions.length === 0) {
          console.log(`[FinGroww Background] No trades found for ${pName}, skipping CSV.`);
          continue;
        }

        const { headers, rawRows, csvContent, totalTradesCount } = buildProfileTradesCsv(pName, closedTrades, openPositions);

        // Accumulate for master combined CSV
        rawRows.forEach(r => allCombinedRawRows.push(r));
        grandTotalTrades += totalTradesCount;

        // Individual CSV filename: FinGroww_Trades_<Profile>_<YYYY-MM-DD>.csv
        const sanitizedProfile = pName.replace(/[^a-zA-Z0-9_-]/g, "_");
        const filename = `FinGroww_Trades_${sanitizedProfile}_${todayKey}.csv`;
        const dataUrl = csvStringToDataUrl(csvContent);

        // 1. Direct write to D:\Tred CSVs if local helper is listening
        await trySaveCsvToLocalServer(filename, csvContent);

        // 2. Trigger Chrome browser download
        let dlId = null;
        if (typeof chrome.downloads !== "undefined" && chrome.downloads.download) {
          try {
            dlId = await chrome.downloads.download({
              url: dataUrl,
              filename: filename,
              saveAs: false,
              conflictAction: "uniquify"
            });
            console.log(`[FinGroww Background] Download triggered: id=${dlId} -> ${filename} (${totalTradesCount} trades)`);
          } catch (dlErr) {
            console.warn(`[FinGroww Background] Download failed for ${filename}:`, dlErr);
          }
        }

        exportedFiles.push({
          profile: pName,
          filename: filename,
          tradesCount: totalTradesCount,
          closedCount: closedTrades.length,
          openCount: openPositions.length,
          pnl: sessPnl,
          downloadId: dlId,
          csvContent: csvContent
        });

        // Small delay between downloads so Chrome handles sequential downloads smoothly
        if (i < activeProfitLossProfiles.length - 1) {
          await new Promise(r => setTimeout(r, 400));
        }

      } catch (profErr) {
        console.error(`[FinGroww Background] Error processing profile ${pName}:`, profErr);
      }
    }

    // 4. Also generate and download master consolidated CSV for ALL profiles
    if (exportedFiles.length > 1 && allCombinedRawRows.length > 0) {
      try {
        const dummyBuild = buildProfileTradesCsv("", [], []);
        const combinedHeaders = dummyBuild.headers;
        const combinedCsvContent = [combinedHeaders.join(","), ...allCombinedRawRows.map(r => r.join(","))].join("\r\n");
        const combinedFilename = `FinGroww_Trades_ALL_PROFILES_${todayKey}.csv`;
        const combinedDataUrl = csvStringToDataUrl(combinedCsvContent);

        // 1. Direct write to D:\Tred CSVs if local helper is listening
        await trySaveCsvToLocalServer(combinedFilename, combinedCsvContent);

        let combinedDlId = null;
        if (typeof chrome.downloads !== "undefined" && chrome.downloads.download) {
          try {
            combinedDlId = await chrome.downloads.download({
              url: combinedDataUrl,
              filename: combinedFilename,
              saveAs: false,
              conflictAction: "uniquify"
            });
            console.log(`[FinGroww Background] Master consolidated download triggered: id=${combinedDlId} -> ${combinedFilename} (${allCombinedRawRows.length} total trades)`);
          } catch (combErr) {
            console.warn(`[FinGroww Background] Master combined download error:`, combErr);
          }
        }

        exportedFiles.push({
          profile: "ALL_PROFILES",
          filename: combinedFilename,
          tradesCount: allCombinedRawRows.length,
          downloadId: combinedDlId,
          isCombined: true,
          csvContent: combinedCsvContent
        });
      } catch (combErr) {
        console.warn(`[FinGroww Background] Master CSV generation error:`, combErr);
      }
    }

    const nowStr = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
    const successCount = exportedFiles.filter(f => !f.isCombined).length;
    const msg = `Successfully downloaded ${successCount} individual CSV files (${grandTotalTrades} total trades) for all profiles in profit/loss.`;

    const updateObj = {
      fg_eod_csv_last_status: "SUCCESS",
      fg_eod_csv_last_msg: msg,
      fg_eod_csv_last_time: nowStr,
      fg_eod_csv_exported_count: successCount,
      fg_eod_trades_count: grandTotalTrades,
      fg_eod_csv_files: exportedFiles.map(f => f.filename)
    };

    if (options.isAutoEod) {
      updateObj.fg_eod_trades_csv_downloaded_date = todayKey;
    }

    await chrome.storage.local.set(updateObj);

    return {
      success: true,
      message: msg,
      exportedCount: successCount,
      totalTradesCount: grandTotalTrades,
      exportedFiles: exportedFiles
    };

  } catch (err) {
    console.error(`[FinGroww Background] exportAllProfilesTradesCsv error:`, err);
    await chrome.storage.local.set({
      fg_eod_csv_last_status: "ERROR",
      fg_eod_csv_last_msg: err.message || "Export failed"
    });
    return { success: false, error: err.message || "Failed to export all profiles trade details." };
  }
}

// Auto-download trade details CSV for ALL profiles in profit/loss at Indian market close (3:30 PM IST)
async function checkEndOfDayAutoCsvDownload(force = false) {
  if (isCsvExporting) {
    return;
  }
  try {
    const stored = await chrome.storage.local.get([
      "fg_auto_download_csv_eod",
      "fg_eod_trades_csv_downloaded_date",
      "fg_selected_profile"
    ]);

    // Enabled by default unless explicitly turned off
    if (stored.fg_auto_download_csv_eod === false) {
      return;
    }

    const { dateKey } = getIstDateInfo();
    // Prevent duplicate auto-download on the same day unless forced
    if (!force && stored.fg_eod_trades_csv_downloaded_date === dateKey) {
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
      isCsvExporting = true;
      // Pre-emptively record date to prevent concurrent triggers
      await chrome.storage.local.set({ fg_eod_trades_csv_downloaded_date: dateKey });

      console.log(`[FinGroww Background] Market closed! Triggering 3:30 PM Trade Details CSV Auto-Download for all profiles in profit/loss on ${dateKey}...`);

      const res = await exportAllProfilesTradesCsv({ isAutoEod: true, force: force });
      if (res && res.success) {
        console.log(`[FinGroww Background] Market close CSV auto-download completed: ${res.exportedCount} individual CSV files (${res.totalTradesCount} trades)`);
      } else {
        console.warn(`[FinGroww Background] Market close CSV auto-download skipped or returned:`, res?.error);
      }
    }
  } catch (e) {
    console.warn("[FinGroww Background] End-of-day auto CSV download check error:", e);
  } finally {
    isCsvExporting = false;
  }
}

// Sync Daily P&L records to Google Sheets Webhook (Profile-by-Profile, ONLY REAL DATA)
async function syncDailyPnlToGoogleSheet(options = {}) {
  if (isSyncDailyPnlInProgress) {
    console.log("[FinGroww Background] syncDailyPnlToGoogleSheet already in progress, skipping duplicate call.");
    return { success: false, error: "Sync already in progress" };
  }
  isSyncDailyPnlInProgress = true;
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

    // Refresh live session states & broker charges for ALL active profiles before syncing
    const profilesToFetch = Object.keys(historyByUser).filter(u => !u.includes("ALL USERS"));
    if (profilesToFetch.length > 0) {
      await syncAllProfilesSessionStates(profilesToFetch);
    }

    const rows = [];

    for (const dKey of targetDates) {
      for (const [userName, userDays] of Object.entries(historyByUser)) {
        const dayRecord = userDays[dKey];
        if (!dayRecord || !dayRecord.isReal) continue;

        const pnl = Number(dayRecord.totalPnl !== undefined ? dayRecord.totalPnl : profAccount.total_pnl) || 0;
        const profAccount = profileCaches[userName]?.account || {};
        const openPos = Number(dayRecord.openPositionsCount !== undefined ? dayRecord.openPositionsCount : (profileCaches[userName]?.positions?.length || 0));

        const charges = Number(
          dayRecord.charges !== undefined && dayRecord.charges > 0
            ? dayRecord.charges
            : (profAccount.total_charges !== undefined ? profAccount.total_charges : (profAccount.charges || 0))
        ) || 0;
        const netAfterCharges = pnl;

        let realized = 0;
        let unrealized = 0;

        if (profAccount.realized_pnl !== undefined && profAccount.realized_pnl !== null) {
          realized = Number(profAccount.realized_pnl);
        } else if (dayRecord.realizedPnl !== undefined && dayRecord.realizedPnl !== 0) {
          realized = Number(dayRecord.realizedPnl);
        }

        if (profAccount.unrealized_pnl !== undefined && profAccount.unrealized_pnl !== null) {
          unrealized = Number(profAccount.unrealized_pnl);
        } else if (dayRecord.unrealizedPnl !== undefined && dayRecord.unrealizedPnl !== 0) {
          unrealized = Number(dayRecord.unrealizedPnl);
        }

        // Exact reconciliation: Total P&L = Realized P&L + Unrealized P&L
        if (openPos === 0 || unrealized === 0) {
          if (realized === 0 && pnl !== 0) {
            realized = pnl;
          }
          unrealized = 0;
        } else if (realized === 0 && unrealized !== 0 && pnl !== 0) {
          realized = pnl - unrealized;
        }

        const eq = Number(profAccount.account_equity || dayRecord.equity || 100000);
        const trades = Number(dayRecord.tradesCount || profAccount.total_trades || 0);
        const wins = Number(dayRecord.winningTrades) || 0;
        const losses = Number(dayRecord.losingTrades) || 0;
        const winRateVal = Number(dayRecord.winRate) || 0;

        let notesText = `${trades} trades executed`;
        if (wins > 0 || losses > 0) {
          notesText = `${trades} trades (${wins}W / ${losses}L - ${winRateVal.toFixed(1)}% WR)${openPos > 0 ? ` • ${openPos} Open` : ""}`;
        }

        // ONLY include profiles that made any trade or booked any profit/loss
        if (trades > 0 || pnl !== 0 || realized !== 0) {
          rows.push({
            date: dayRecord.displayDate || dKey,
            dateKey: dKey,
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
  } finally {
    isSyncDailyPnlInProgress = false;
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

// Format P&L for Extension Toolbar Badge (e.g. 1k, 0.5k, 1m)
function formatBadgePnl(pnl) {
  const num = Number(pnl);
  if (isNaN(num) || Math.abs(num) < 0.5) return "0";
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);

  if (abs >= 1000000) {
    const m = abs / 1000000;
    const str = m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "");
    return `${sign}${str}m`;
  }
  if (abs >= 1000) {
    const k = abs / 1000;
    const str = k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "");
    return `${sign}${str}k`;
  }
  if (abs >= 100) {
    const str = (abs / 1000).toFixed(1).replace(/\.0$/, "");
    return `${sign}${str}k`;
  }
  return `${sign}${Math.round(abs)}`;
}

// Update Extension Toolbar Icon Badge
function updateBadge(positionsCount, totalPnl, profile) {
  try {
    const isMarketOpen = isIndianMarketOpenNow();
    const shouldDisplay = isMarketOpen || showAfterHours;

    // After 3:30 PM IST (market close), hide toolbar badge unless showAfterHours is enabled
    if (!shouldDisplay) {
      chrome.action.setBadgeText({ text: "" });
      const pnlNum = Number(totalPnl) || 0;
      const pnlSign = pnlNum >= 0 ? "+" : "";
      chrome.action.setTitle({
        title: `FinGroww Status: [${profile || "Default"}] (Market Closed)\nP&L: ${pnlSign}₹${pnlNum.toFixed(2)} | Open: ${positionsCount || 0}`
      });
      return;
    }

    const pnlNum = Number(totalPnl) || 0;
    const badgeText = formatBadgePnl(pnlNum);

    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({
      color: pnlNum > 0 ? "#22c55e" : pnlNum < 0 ? "#ef4444" : "#64748b"
    });

    const pnlSign = pnlNum >= 0 ? "+" : "";
    chrome.action.setTitle({
      title: `FinGroww Status: [${profile || "Default"}]\nP&L: ${pnlSign}₹${pnlNum.toFixed(2)} | Open: ${positionsCount || 0}`
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
  checkEndOfDayAutoCsvDownload();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("fg_keepalive_alarm", { periodInMinutes: 1 });
  chrome.alarms.create("fg_eod_alarm", { periodInMinutes: 1 });
  startPolling();
  checkEndOfDayAutoSync();
  checkEndOfDayAutoCsvDownload();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "fg_keepalive_alarm" || alarm.name === "fg_eod_alarm") {
    performMasterSync();
    checkEndOfDayAutoSync();
    checkEndOfDayAutoCsvDownload();
  }
});

// Listen for messages from content scripts, website, or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "SET_PROFILE") {
    const newProfile = request.profile;
    if (newProfile) {
      currentProfile = newProfile;
      chrome.storage.local.set({ fg_selected_profile: currentProfile });

      // Broadcast switch immediately so UI updates right away
      const cached = profileCaches[currentProfile];
      chrome.storage.local.get(["fg_latest_data", "fg_profiles_cache"]).then(stored => {
        const prev = stored?.fg_latest_data || {};
        chrome.storage.local.set({
          fg_selected_profile: currentProfile,
          fg_latest_data: {
            profile: currentProfile,
            account: cached?.account || {},
            positions: cached?.positions || [],
            status: cached?.status || "RUNNING",
            leaderboard: prev.leaderboard || [],
            profiles: stored.fg_profiles_cache || prev.profiles || [],
            timestamp: Date.now()
          }
        });
      });

      isSyncing = false;
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

  if (request.type === "EXPORT_TRADES_CSV") {
    exportProfileTradesCsv({ profile: request.profile }).then(res => {
      sendResponse(res);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === "EXPORT_ALL_PROFILES_TRADES_CSV") {
    exportAllProfilesTradesCsv({ force: request.force === true }).then(res => {
      sendResponse(res);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === "CHECK_END_OF_DAY_CSV_DOWNLOAD") {
    checkEndOfDayAutoCsvDownload(request.force === true).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// When profile is changed anywhere in storage, immediately sync
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.fg_selected_profile) {
      const newProfile = changes.fg_selected_profile.newValue;
      if (newProfile && newProfile !== currentProfile) {
        currentProfile = newProfile;
        isSyncing = false;
        performMasterSync();
        triggerLiveMarketTick();
      }
    }
    if (changes.fg_show_after_hours !== undefined) {
      showAfterHours = changes.fg_show_after_hours.newValue === true;
      performMasterSync();
    }
  }
});

// Initial boot
startPolling();
checkEndOfDayAutoSync();
checkEndOfDayAutoCsvDownload();
