const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Re-inject content script on SPA navigation (e.g. claude.ai navigating to /chat/*)
const CONTENT_PATTERNS = [
  /^https:\/\/claude\.ai\/chat\//,
  /^https:\/\/gemini\.google\.com\/app\//,
  /^https:\/\/chatgpt\.com\/c\//,
];

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const url = changeInfo.url;
  if (!url || !CONTENT_PATTERNS.some(p => p.test(url))) return;
  chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
});

// Keep service worker alive
const keepAlive = () => setInterval(chrome.runtime.getPlatformInfo, 20000);
chrome.runtime.onStartup.addListener(keepAlive);
keepAlive();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "saveBrick") {
    saveBrick(msg).then(sendResponse);
    return true;
  }
  if (msg.action === "signIn") {
    signIn().then(sendResponse);
    return true;
  }
  if (msg.action === "signOut") {
    signOut().then(sendResponse);
    return true;
  }
  if (msg.action === "getSession") {
    getSession().then(sendResponse);
    return true;
  }
  if (msg.action === "openPopup") {
    chrome.action.openPopup().catch(() => {});
    return false;
  }
  if (msg.action === "ping") {
    sendResponse({ pong: true });
    return true;
  }
});

async function getSession() {
  const { session } = await chrome.storage.local.get(["session"]);
  if (!session) return null;
  if (!isTokenExpired(session.accessToken)) return session;
  // refreshSession clears storage itself on auth failure, returns original on transient errors
  return await refreshSession(session);
}

async function signIn() {
  try {
    const redirectUrl = chrome.identity.getRedirectURL();
    const authUrl =
      `${SUPABASE_URL}/auth/v1/authorize?` +
      `provider=google&` +
      `redirect_to=${encodeURIComponent(redirectUrl)}`;

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    // Extract tokens from the hash fragment Supabase returns
    const url = new URL(responseUrl);
    const params = new URLSearchParams(url.hash.replace("#", ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken)
      return { success: false, reason: "No access token returned" };

    // Fetch user info
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    const user = await userRes.json();

    const session = { accessToken, refreshToken, user };
    await chrome.storage.local.set({ session });
    return { success: true, session };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

async function signOut() {
  await chrome.storage.local.remove(["session"]);
  return { success: true };
}

// Single-flight: dedupe concurrent refreshes so only one network call happens.
// Supabase rotates refresh tokens — parallel calls would invalidate each other.
let refreshInFlight = null;

async function refreshSession(session) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      });
      if (res.status === 400 || res.status === 401) {
        // Refresh token rejected — definitive auth failure, clear stored session
        await chrome.storage.local.remove(["session"]);
        return null;
      }
      if (!res.ok) {
        // Transient (5xx, etc.) — keep current session, let caller retry later
        return session;
      }
      const data = await res.json();
      const newSession = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: data.user,
      };
      await chrome.storage.local.set({ session: newSession });
      return newSession;
    } catch {
      // Network error — keep current session
      return session;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now() - 60000; // 60s buffer
  } catch {
    return true;
  }
}

async function saveBrick({ text, url, blocks, source_text }) {
  try {
    let session = await getSession();
    if (!session) return { success: false, reason: "not_authenticated" };

    // Proactively refresh if token is expired or about to expire
    if (isTokenExpired(session.accessToken)) {
      const refreshed = await refreshSession(session);
      if (!refreshed) return { success: false, reason: "not_authenticated" };
      session = refreshed;
    }

    const attempt = async (s) => fetch(`${SUPABASE_URL}/rest/v1/captures`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s.accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: s.user.id,
        text: text || "",
        url: url || null,
        blocks: blocks || null,
        source_text: source_text || null,
      }),
    });

    let res = await attempt(session);

    if (res.status === 401) {
      const refreshed = await refreshSession(session);
      if (!refreshed) return { success: false, reason: "not_authenticated" };
      // If refresh returned the same session, it was a transient failure — don't loop
      if (refreshed === session) return { success: false, reason: "Network issue. Try again." };
      res = await attempt(refreshed);
      // Retry still failed with auth — clear session so UI is truthful
      if (res.status === 401) {
        await chrome.storage.local.remove(["session"]);
        return { success: false, reason: "not_authenticated" };
      }
    }

    if (res.ok) return { success: true };

    const err = await res.json();
    console.error('saveBrick error:', err);
    return { success: false, reason: 'Failed to save capture. Please try again.' };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}
