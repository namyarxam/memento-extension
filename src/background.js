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

  // If the token is still valid, return as-is
  if (!isTokenExpired(session.accessToken)) return session;

  // Token expired — try to refresh transparently
  const refreshed = await refreshSession(session);
  if (refreshed) return refreshed;

  // Refresh failed — clear stale session so UI doesn't show signed-in state
  await chrome.storage.local.remove(["session"]);
  return null;
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

async function refreshSession(session) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const newSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user,
    };
    await chrome.storage.local.set({ session: newSession });
    return newSession;
  } catch {
    return null;
  }
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
      res = await attempt(refreshed);
    }

    if (res.ok) return { success: true };

    const err = await res.json();
    console.error('saveBrick error:', err);
    return { success: false, reason: 'Failed to save capture. Please try again.' };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}
