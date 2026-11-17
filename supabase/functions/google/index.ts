// Supabase Edge Function: Google Calendar + Google Meet for Motty Berkowitz Productions.
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (an OAuth "Web application" client whose
// redirect URI is this function's URL). The refresh token lives in the google_tokens table,
// which only the service role can read — it never reaches the browser.
// Deployed with JWT verification OFF because Google's OAuth redirect (GET) carries no Supabase
// token; every POST action checks the caller's token + the allowed_emails list itself.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const SELF_URL = `${SUPABASE_URL}/functions/v1/google`;
const APP_ORIGIN = "https://moishsonn-tech.github.io";
const APP_URL = `${APP_ORIGIN}/motty-berkowitz-productions/`;
const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events";

const cors = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const back = (qs: string) => new Response(null, { status: 302, headers: { Location: `${APP_URL}?${qs}` } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function allowedEmail(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;
  const { data: rows } = await admin.from("allowed_emails").select("email");
  return (rows || []).some((r: { email: string }) => r.email.toLowerCase() === email) ? email : null;
}

// ── Signed OAuth state (HMAC) so the callback only accepts flows this app started ──
const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
async function makeState(email: string) {
  const payload = b64url(enc.encode(JSON.stringify({ e: email, t: Date.now(), n: crypto.randomUUID() })));
  return `${payload}.${await hmac(payload)}`;
}
async function checkState(state: string) {
  const [payload, sig] = state.split(".");
  if (!payload || !sig || sig !== (await hmac(payload))) return null;
  const obj = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  return Date.now() - obj.t < 15 * 60_000 ? obj : null;
}

// ── Tokens ──
let cached: { token: string; exp: number } | null = null;
async function tokenRow() {
  const { data } = await admin.from("google_tokens").select("*").eq("id", "calendar").maybeSingle();
  return data as { email: string; refresh_token: string; calendar_id: string } | null;
}
async function accessToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const row = await tokenRow();
  if (!row?.refresh_token) throw Object.assign(new Error("Google Calendar isn't connected."), { status: 409 });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: row.refresh_token, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error("Google rejected the saved connection — reconnect Google Calendar in Settings."), { status: 409 });
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 };
  return cached.token;
}
async function gcal(path: string, init: RequestInit = {}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (r.status === 204) return {};
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || `Google Calendar error ${r.status}`), { status: 502 });
  return j;
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ── OAuth callback from Google ──
  if (req.method === "GET") {
    const u = new URL(req.url);
    if (u.searchParams.get("error")) return back("google=error&reason=" + encodeURIComponent(u.searchParams.get("error")!));
    const st = await checkState(u.searchParams.get("state") || "").catch(() => null);
    const code = u.searchParams.get("code");
    if (!st || !code) return back("google=error&reason=state");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: SELF_URL, grant_type: "authorization_code" }),
    });
    const tok = await r.json();
    if (!r.ok) return back("google=error&reason=exchange");
    const info = await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
    const existing = await tokenRow();
    const refresh = tok.refresh_token || existing?.refresh_token;
    if (!refresh) return back("google=error&reason=no_refresh_token");
    await admin.from("google_tokens").upsert({ id: "calendar", email: info.email || "", refresh_token: refresh, calendar_id: "primary", connected_at: new Date().toISOString() });
    cached = { token: tok.access_token, exp: Date.now() + (tok.expires_in || 3000) * 1000 };
    return back("google=connected");
  }

  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const email = await allowedEmail(req);
  if (!email) return json(401, { error: "not_allowed" });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }); }

  try {
    switch (body.action) {
      case "status": {
        const row = await tokenRow();
        return json(200, { configured: !!(CLIENT_ID && CLIENT_SECRET), connected: !!row?.refresh_token, email: row?.email || "" });
      }
      case "auth_url": {
        if (!CLIENT_ID || !CLIENT_SECRET) return json(503, { error: "not_configured", message: "Google sign-in isn't set up yet (missing Google OAuth client)." });
        const p = new URLSearchParams({
          client_id: CLIENT_ID, redirect_uri: SELF_URL, response_type: "code", scope: SCOPES,
          access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: await makeState(email),
        });
        return json(200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${p}` });
      }
      case "disconnect": {
        const row = await tokenRow();
        if (row?.refresh_token) await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(row.refresh_token), { method: "POST" }).catch(() => {});
        await admin.from("google_tokens").delete().eq("id", "calendar");
        cached = null;
        return json(200, { ok: true });
      }
      case "create_event": {
        const start = new Date(String(body.startIso));
        const minutes = Math.min(600, Math.max(5, Number(body.durationMin) || 30));
        if (isNaN(start.getTime())) return json(400, { error: "bad_start" });
        const attendees = (Array.isArray(body.attendees) ? body.attendees : [])
          .map((a) => String(a).trim()).filter((a) => EMAIL_RE.test(a)).slice(0, 50).map((email) => ({ email }));
        const tz = clip(body.timeZone, 64) || "America/New_York";
        const ev: Record<string, unknown> = {
          summary: clip(body.summary, 300) || "Meeting",
          description: clip(body.description, 8000),
          location: clip(body.location, 500),
          start: { dateTime: start.toISOString(), timeZone: tz },
          end: { dateTime: new Date(start.getTime() + minutes * 60_000).toISOString(), timeZone: tz },
          attendees,
          reminders: { useDefault: true },
        };
        if (body.meet) ev.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
        const sendUpdates = body.notify === false ? "none" : "all";
        const out = await gcal(`/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${sendUpdates}`, { method: "POST", body: JSON.stringify(ev) });
        const meetLink = out.hangoutLink || (out.conferenceData?.entryPoints || []).find((e: { entryPointType: string }) => e.entryPointType === "video")?.uri || "";
        return json(200, { id: out.id, htmlLink: out.htmlLink, meetLink });
      }
      case "delete_event": {
        const id = clip(body.id, 300);
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) return json(400, { error: "bad_id" });
        await gcal(`/calendars/primary/events/${id}?sendUpdates=${body.notify === false ? "none" : "all"}`, { method: "DELETE" });
        return json(200, { ok: true });
      }
      case "list_events": {
        const min = new Date(String(body.timeMin || new Date().toISOString()));
        const max = new Date(String(body.timeMax || new Date(Date.now() + 60 * 86400_000).toISOString()));
        if (isNaN(min.getTime()) || isNaN(max.getTime())) return json(400, { error: "bad_range" });
        const q = new URLSearchParams({ timeMin: min.toISOString(), timeMax: max.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
        const out = await gcal(`/calendars/primary/events?${q}`);
        const events = (out.items || []).filter((e: { status: string }) => e.status !== "cancelled").map((e: Record<string, any>) => ({
          id: e.id, title: e.summary || "(busy)", start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date,
          allDay: !e.start?.dateTime, link: e.hangoutLink || "", htmlLink: e.htmlLink,
        }));
        return json(200, { events });
      }
      default:
        return json(400, { error: "unknown_action" });
    }
  } catch (e) {
    return json((e as { status?: number }).status || 500, { error: "failed", message: (e as Error).message });
  }
});
