# Capture Brick — Project Context

## What this is

A Chrome extension for capturing text snippets ("bricks") from AI tools. The user hovers over a text element, a capture button appears, they click it, and the text is saved to their Supabase account — accessible in a companion frontend dashboard.

The product is AI-tool-agnostic: it works across Claude, ChatGPT, Gemini, Perplexity, and any other AI interface. That cross-platform reach is the core value prop — not any single model or platform.

## Product decisions (from prior architecture discussion)

**Cross-platform across AI tools, not Claude-specific.** The original version only ran on claude.ai. The value is capturing insights from any AI conversation, regardless of which model the user is in. Content script matches `<all_urls>` to support this.

**Frontend dashboard is a core part of the product.** Captures saved by the extension need to be viewable, searchable, and manageable in a web frontend. Supabase is the shared backend for both — the extension writes, the dashboard reads.

**Own the storage.** The original used Notion as a DB via API. That's a weak position — you're a thin client for someone else's product. This version uses Supabase (Postgres) directly.

**No user-facing API keys.** The original required an Anthropic API key for AI tagging. That was the first thing users saw and it was friction with no good justification. Removed entirely. Tags/attributes can come later server-side or manually.

## Stack

- **Extension:** Manifest V3 Chrome extension (no framework)
- **Auth:** Google OAuth via `chrome.identity.launchWebAuthFlow` → Supabase Auth
- **Storage:** Supabase (Postgres) — direct REST API calls from the service worker, no JS client library
- **Backend:** None yet — extension talks directly to Supabase

## Data model

```sql
captures (
  id          uuid primary key,
  user_id     uuid references auth.users(id),
  text        text,
  url         text,       -- link back to the source AI conversation
  created_at  timestamptz
)
```

Row-level security enabled — users can only read/write their own rows.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config — permissions, content script, service worker |
| `background.js` | Service worker — auth (signIn/signOut/getSession) and saveBrick |
| `content.js` | Injected into every page — hover detection, capture button, highlight UI |
| `popup.html` | Extension popup markup — signed-out and signed-in states |
| `popup.js` | Popup logic — renders auth state, triggers sign in/out, shows recent captures |

## Production checklist
Before going public or publishing to the Chrome Web Store:
- Move `SUPABASE_URL` and `SUPABASE_ANON_KEY` out of `background.js` and into a build-time environment variable (e.g. via a bundler like esbuild or webpack with a `.env` file). The anon key is safe in client code but should not be committed to a public repo in plaintext.

## TODOs before the extension works end-to-end

1. Fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `background.js`
2. Update `manifest.json` host_permissions with the real Supabase project URL
3. Lock extension ID with a `key` field in `manifest.json` (required for stable OAuth redirect URI)
4. Set up Google OAuth provider in Supabase dashboard
5. Configure Google Cloud Console OAuth credentials with the correct redirect URIs

## Supabase setup (step by step)

### Step 1 — Create a Supabase project
1. Go to supabase.com, create an account and a new project
2. Once provisioned: **Settings → API**
3. Copy **Project URL** and **anon public key**
4. Paste them into `background.js` replacing the two TODO placeholders
5. Replace `https://YOUR_PROJECT.supabase.co/*` in `manifest.json` host_permissions with your real URL

### Step 2 — Create the captures table
In your Supabase project go to **SQL Editor** and run:

```sql
create table captures (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  text text not null,
  source text,
  url text,
  created_at timestamptz default now()
);

alter table captures enable row level security;

create policy "insert own captures"
  on captures for insert
  with check (auth.uid() = user_id);

create policy "read own captures"
  on captures for select
  using (auth.uid() = user_id);
```

### Step 3 — Lock your extension ID
An unstable extension ID breaks OAuth. Lock it before configuring any OAuth URIs.

1. In Chrome go to **chrome://extensions → Pack extension**, point at your project folder
2. Chrome generates a `.pem` file alongside the folder. Run:
   ```
   openssl rsa -in /path/to/extension.pem -pubout 2>/dev/null | openssl base64 | tr -d '\n'
   ```
3. Add the output to `manifest.json`:
   ```json
   "key": "PASTE_OUTPUT_HERE"
   ```
4. Reload the extension — the ID is now permanent

### Step 4 — Google Cloud Console
1. Go to console.cloud.google.com, create a new project
2. **APIs & Services → OAuth consent screen** — configure it (External, fill in app name + your email)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. Under **Authorized redirect URIs** add both:
   - `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
   - `https://YOUR_EXTENSION_ID.chromiumapp.org/`
6. Copy the **Client ID** and **Client Secret**

### Step 5 — Enable Google in Supabase
1. Go to **Authentication → Providers → Google**
2. Enable it, paste in the Client ID and Client Secret from Step 4
3. Save

### Step 6 — Test
Reload the extension. Click the popup. The "Sign in with Google" button should open a managed OAuth window and return you signed in.

## Auth flow (how it works in code)

1. User clicks "Sign in with Google" in popup → sends `signIn` message to background
2. Background calls `chrome.identity.launchWebAuthFlow` with the Supabase Google OAuth URL
3. Supabase redirects back to `https://<extension-id>.chromiumapp.org/` with tokens in the hash
4. Background extracts `access_token` + `refresh_token`, fetches user info from Supabase `/auth/v1/user`
5. Session stored in `chrome.storage.sync` (persists across devices)
6. Every `saveBrick` call reads the session and POSTs to Supabase REST API with `Authorization: Bearer <access_token>`
