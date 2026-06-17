import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { segments } = req.body;
  if (!Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ error: "No segments provided" });
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
    // Covers both the API call failing AND the model returning non-JSON.
    return res.status(502).json({ error: "LLM call or parse failed: " + err.message });
  }

  // Validate the shape: we trust nothing the model returns.
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

  // Determine the document's dominant register, ignoring "none".
  const counts = { formal: 0, informal: 0 };
  for (const f of findings) {
    if (f.register === "formal" || f.register === "informal") counts[f.register]++;
  }
  const dominant = counts.formal >= counts.informal ? "formal" : "informal";

  // Flag any segment that deviates from the dominant register.
  const results = findings.map((f) => ({
    ...f,
    isDeviation:
      (f.register === "formal" || f.register === "informal") &&
      f.register !== dominant,
  }));

  const deviationCount = results.filter((r) => r.isDeviation).length;

  return res.status(200).json({
    dominantRegister: dominant,
    deviationCount,
    results,
  });
}