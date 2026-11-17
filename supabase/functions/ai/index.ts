// Supabase Edge Function: AI writer for Motty Berkowitz Productions.
// Holds the Anthropic key server-side (secret ANTHROPIC_API_KEY); only signed-in users on the
// allowed_emails list can call it. Tasks: proposal (HTML), email ({subject, body}),
// intake (structured project facts from a pasted client inquiry), ping (is it configured?).
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://moishsonn-tech.github.io";
const MODEL = "claude-opus-5-5";
const cors = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function allowedEmail(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;
  const { data: rows } = await admin.from("allowed_emails").select("email");
  return (rows || []).some((r: { email: string }) => r.email.toLowerCase() === email) ? email : null;
}

// Simple per-user limit (per function instance) so a stuck client can't run up the bill.
const hits = new Map<string, number[]>();
function limited(email: string, max = 40, windowMs = 10 * 60_000) {
  const now = Date.now();
  const list = (hits.get(email) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(email, list);
  return list.length > max;
}

const SYSTEM = `You write on behalf of Motty Berkowitz (Motty Berkowitz Productions), a videographer and director based in the New York area who shoots music videos, weddings, bar mitzvahs, corporate films and events.
Match his voice using the style guide and sample writing you are given — that matters more than generic polish.
Never invent facts about the client or the job. Never quote a price that contradicts his price list; when a number or detail isn't known, write a clear placeholder in square brackets such as [confirm date] so Motty can fill it in.
Write in plain, warm, confident English. No emoji unless his samples use them.`;

const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

function styleBlock(style: Record<string, unknown> = {}) {
  return `<style_guide>
<voice>${clip(style.voice, 6000)}</voice>
<price_list>${clip(style.priceList, 6000)}</price_list>
<standard_terms>${clip(style.terms, 6000)}</standard_terms>
<signature>${clip(style.signature, 1000)}</signature>
<sample_writing>${clip(style.samples, 30000)}</sample_writing>
</style_guide>`;
}

const INTAKE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["projectName", "clientName", "clientEmail", "clientPhone", "company", "type", "shootDate", "dueDate", "budget", "brief", "keyDetails"],
  properties: {
    projectName: { type: "string", description: "Short project name, e.g. 'Artist — Song Title MV'" },
    clientName: { type: "string" },
    clientEmail: { type: "string", description: "Empty string if not given" },
    clientPhone: { type: "string", description: "Empty string if not given" },
    company: { type: "string", description: "Label, company or family name; empty if none" },
    type: { type: "string", enum: ["Music Video", "Wedding", "Bar Mitzvah", "Corporate", "Event"] },
    shootDate: { type: "string", description: "YYYY-MM-DD, or empty string if no date was given" },
    dueDate: { type: "string", description: "Requested delivery/release date YYYY-MM-DD, or empty string" },
    budget: { type: "string", description: "Budget as stated, e.g. '$5,000', or empty string" },
    brief: { type: "string", description: "2-5 sentence summary of what the client wants" },
    keyDetails: { type: "array", items: { type: "string" }, description: "Locations, song, vibe, references, guest count, deadlines…" },
  },
};
const EMAIL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: { subject: { type: "string" }, body: { type: "string", description: "Plain-text email body with line breaks" } },
};

async function runClaude(apiKey: string, prompt: string, schema?: Record<string, unknown>) {
  const client = new Anthropic({ apiKey });
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", ...(schema ? { format: { type: "json_schema", schema } } : {}) },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  } as never);
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw Object.assign(new Error("The AI declined this request."), { status: 422 });
  if (msg.stop_reason === "max_tokens") throw Object.assign(new Error("The answer was cut off — try a shorter request."), { status: 422 });
  return msg.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const email = await allowedEmail(req);
  if (!email) return json(401, { error: "not_allowed" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }); }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || "";
  if (body.task === "ping") return json(200, { ok: true, configured: !!apiKey });
  if (!apiKey) return json(503, { error: "not_configured", message: "AI isn't switched on yet — the Anthropic API key hasn't been added." });
  if (limited(email)) return json(429, { error: "rate_limited", message: "Too many AI requests — wait a few minutes." });

  const style = styleBlock((body.style as Record<string, unknown>) || {});
  const facts = clip(JSON.stringify(body.project || {}, null, 2), 20000);
  const extra = clip(body.instructions, 3000);

  try {
    if (body.task === "proposal") {
      const prompt = `${style}
<project_facts>${facts}</project_facts>
<extra_instructions>${extra}</extra_instructions>

Write a client proposal for this project in Motty's voice.
Structure: a title; a short personal opener to the client; the creative vision / approach for this specific job; what's included (deliverables); timeline (key dates — use the facts, placeholders where unknown); investment (a table of line items and total — use the project's invoice items/budget and his price list; never invent conflicting numbers); what we need from you; terms (his standard terms); next steps; his signature.
Return ONLY an HTML fragment — no markdown, no code fences, no <html>/<head>/<style>/<script>, no attributes except colspan — using only these tags: h1 h2 h3 p ul ol li strong em table thead tbody tr th td br hr.`;
      const html = (await runClaude(apiKey, prompt)).replace(/^```(?:html)?\s*|\s*```$/g, "").trim();
      return json(200, { html });
    }
    if (body.task === "email") {
      const prompt = `${style}
<project_facts>${facts}</project_facts>
<purpose>${clip(body.purpose, 500)}</purpose>
<extra_instructions>${extra}</extra_instructions>

Write one email from Motty to the client for the purpose above, in his voice. Keep it short and specific to this project. Sign with his signature.`;
      return json(200, JSON.parse(await runClaude(apiKey, prompt, EMAIL_SCHEMA)));
    }
    if (body.task === "intake") {
      const prompt = `Today is ${clip(body.today, 20)}.
<inquiry>${clip(body.text, 20000)}</inquiry>

This is a new client inquiry (an email, text message or notes from a call). Extract the project facts. Resolve relative dates ("next Sunday", "June 3rd") against today's date. Leave a field as an empty string when the inquiry doesn't say.`;
      return json(200, JSON.parse(await runClaude(apiKey, prompt, INTAKE_SCHEMA)));
    }
    return json(400, { error: "unknown_task" });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json(503, { error: "bad_key", message: "The Anthropic API key was rejected — check it in Supabase secrets." });
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: "rate_limited", message: "The AI is busy — try again in a minute." });
    if (e instanceof Anthropic.APIError) return json(502, { error: "ai_error", message: `AI error ${e.status ?? ""}`.trim() });
    const status = (e as { status?: number }).status || 500;
    return json(status, { error: "failed", message: (e as Error).message });
  }
});
