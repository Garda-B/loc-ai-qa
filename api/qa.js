import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Best-effort in-memory limiter. Resets when the serverless instance recycles,
// so it's a safety net, not a guarantee — see README note.
const hits = new Map();
const WINDOW_MS = 60_000;   // 1 minute
const MAX_PER_WINDOW = 10;  // requests per IP per window

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, start: now };
  if (now - rec.start > WINDOW_MS) {
    rec.count = 0;
    rec.start = now;
  }
  rec.count++;
  hits.set(ip, rec);
  return rec.count > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  // 1. Shared-secret check: reject anything without the expected token.
  if (req.headers["x-app-token"] !== process.env.APP_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 2. Rate limit by IP (best-effort).
  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests, slow down." });
  }

  const { segments } = req.body;
  if (!Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ error: "No segments provided" });
  }

  // 3. Input cap: don't let one call fan out into a huge LLM batch.
  if (segments.length > 50) {
    return res.status(413).json({ error: "Too many segments (max 50)." });
  }

  const prompt = `You are a localization QA assistant. For each segment, classify the POLITENESS REGISTER of the "target" text as one of: "formal", "informal", or "none" (use "none" if the language has no T-V distinction or it can't be determined).

Return ONLY a JSON object of this exact shape, no prose, no markdown:
{ "results": [ { "id": <segment id>, "register": "formal"|"informal"|"none", "confidence": 0.0-1.0, "note": "<short reason>" } ] }

Segments:
${JSON.stringify(segments, null, 2)}`;

  let parsed;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    parsed = JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    return res.status(502).json({ error: "LLM call or parse failed: " + err.message });
  }

  const valid = ["formal", "informal", "none"];
  const findings = (parsed.results || [])
    .filter((r) => r && typeof r.id !== "undefined" && valid.includes(r.register))
    .map((r) => ({
      id: r.id,
      register: r.register,
      confidence: typeof r.confidence === "number" ? r.confidence : null,
      note: typeof r.note === "string" ? r.note : "",
    }));

  if (findings.length === 0) {
    return res.status(502).json({ error: "Model returned no usable findings." });
  }

  const counts = { formal: 0, informal: 0 };
  for (const f of findings) {
    if (f.register === "formal" || f.register === "informal") counts[f.register]++;
  }
  const dominant = counts.formal >= counts.informal ? "formal" : "informal";

  const results = findings.map((f) => ({
    ...f,
    isDeviation:
      (f.register === "formal" || f.register === "informal") &&
      f.register !== dominant,
  }));

  const deviationCount = results.filter((r) => r.isDeviation).length;

  return res.status(200).json({ dominantRegister: dominant, deviationCount, results });
}