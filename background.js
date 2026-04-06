// TODO: Replace with your Supabase project values
const SUPABASE_URL = "https://qzuqjnawcwvrhfafeypu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6dXFqbmF3Y3d2cmhmYWZleXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTI0MTIsImV4cCI6MjA5MTA4ODQxMn0.Kl8AoKNXW_ovcUOsS3441rYUKSc9dZHogYDrjTuOfKE";

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
  if (msg.action === "ping") {
    sendResponse({ pong: true });
    return true;
  }
});

async function getSession() {
  const { session } = await chrome.storage.sync.get(["session"]);
  return session || null;
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
    await chrome.storage.sync.set({ session });
    return { success: true, session };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}

async function signOut() {
  await chrome.storage.sync.remove(["session"]);
  return { success: true };
}

async function saveBrick({ text, url }) {
  try {
    const session = await getSession();
    if (!session) return { success: false, reason: "not_authenticated" };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/captures`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        text: text || "",
        url: url || null,
      }),
    });

    if (res.ok) return { success: true };

    const err = await res.json();
    return { success: false, reason: JSON.stringify(err) };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}
