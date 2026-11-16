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

// Load persisted caches on startup
chrome.storage.local.get(["fg_profile_caches", "fg_selected_profile"], (res) => {
  if (res) {
    if (res.fg_profile_caches) profileCaches = res.fg_profile_caches;
    if (res.fg_selected_profile) currentProfile = res.fg_selected_profile;
  }
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

    // 3. Save to chrome.storage.local -> triggers chrome.storage.onChanged on EVERY OPEN TAB
    const syncPayload = {
      fg_selected_profile: currentProfile,
      fg_profiles_cache: profilesList,
      fg_profile_caches: profileCaches,
      fg_latest_data: {
        profile: currentProfile,
        account: account,
        positions: activePositions,
        status: engineStatus,
        leaderboard: leaderboard,
        profiles: profilesList,
        is_market_open: isMarketOpen,
        timestamp: Date.now()
      }
    };

    await chrome.storage.local.set(syncPayload);

    // 4. Update Extension Toolbar Badge
    updateBadge(activePositions.length, totalPnl, currentProfile);

  } catch (err) {
    console.error("[FinGroww Background] Master sync error:", err);
  } finally {
    isSyncing = false;
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

      const stored = await chrome.storage.local.get(["fg_latest_data", "fg_profiles_cache"]);
      const prev = stored?.fg_latest_data || {};

      const syncPayload = {
        fg_selected_profile: currentProfile,
        fg_profile_caches: profileCaches,
        fg_latest_data: {
          profile: currentProfile,
          account: account,
          positions: positions,
          status: status,
          leaderboard: prev.leaderboard || [],
          profiles: stored.fg_profiles_cache || prev.profiles || [],
          is_market_open: isIndianMarketOpenNow(),
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
