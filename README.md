# Localization AI QA

An AI-powered quality-assurance tool for localization that detects **politeness-register inconsistencies** (T–V distinction) across translated UI strings — a class of error that rule-based QA tools structurally cannot catch, because it requires understanding meaning rather than matching patterns.

Upload an XLIFF file, run the check, and the tool flags any segment whose register (formal vs. informal) deviates from the rest of the document.

**Live demo:** https://loc-ai-qa-hlqb.vercel.app/



## Why this exists

Most automated localization QA (e.g. ApSIC Xbench, custom validators) checks things that can be verified mechanically: placeholder integrity, tag matching, number consistency, untranslated segments. It cannot judge whether a translation is *consistently formal*, because politeness register is a semantic property, not a syntactic one.

This is exactly where an LLM earns its place in a localization workflow. The tool uses a language model to classify the register of each target segment, then applies deterministic logic on top to find the document's dominant register and flag deviations from it.

Example: in a Hungarian file that consistently uses the formal *Ön* address, a segment translating "How are you?" as the informal *"Hogy vagy?"* is flagged — with a per-segment explanation.

## How it works

```
Browser (React)
   │  upload XLIFF → parse to segments → POST /api/qa
   ▼
Serverless function (Vercel)   ← holds the API key, never exposed to the browser
   │  calls the LLM, validates the response, computes dominant register
   ▼
LLM (OpenAI)  → structured JSON register classification per segment
```

1. **Parse** — XLIFF 1.2 is parsed in the browser into a format-agnostic list of `{ id, source, target }` segments.
2. **Classify** — segments are sent to a serverless function that asks the LLM to classify each target's register as `formal`, `informal`, or `none`, returning strict JSON.
3. **Validate** — the function does not trust the model's output: every finding is shape-checked, and any item with a missing id or an out-of-vocabulary register is discarded.
4. **Detect** — the document's dominant register is computed by majority, and any segment that deviates is flagged.
5. **Report** — the React UI renders the results in a table, highlighting deviations with the model's reasoning.

## Design decisions & known limitations

This was built deliberately as an *honest* demonstration of AI in localization, including its constraints:

- **LLM output is non-deterministic.** Findings are treated as *suggestions for human review*, not ground truth. The function validates the structure of every response and degrades gracefully (clear error states) when the model returns malformed JSON. The intended use is to surface candidates for a linguist to confirm — not to auto-correct.
- **Rate limiting is best-effort, not production-grade.** The limiter keeps per-IP counts in memory. Because serverless functions are stateless and ephemeral, that state resets when an instance recycles and is not shared across parallel instances. A production system would use an external store (e.g. Redis / Vercel KV) for a global, durable limit. The in-memory version is a pragmatic guard for a demo, chosen knowingly.
- **API-key safety.** The key lives only in the serverless function's environment, never in client code or the repo. `.env` is gitignored; required variables are documented in `.env.example`.

## Tech stack

- **Frontend:** React + Vite
- **Backend:** Vercel serverless function (Node)
- **AI:** OpenAI API (structured JSON output)
- **Input format:** XLIFF 1.2

## Running locally

You'll need your own OpenAI API key.

```bash
git clone https://github.com/Garda-B/loc-ai-qa.git
cd loc-ai-qa
npm install

# create a .env file (see .env.example) with:
#   OPENAI_API_KEY=sk-...
#   APP_TOKEN=any-random-string
#   VITE_APP_TOKEN=any-random-string   (same value as APP_TOKEN)

npm install -g vercel
vercel dev
```

Then open the local URL, upload `sample.xlf`, and click **Run QA**.

## Roadmap

- Second check: **singular *they* → forced gender** — flag where an English source left gender open but the target committed to one (for review, since avoiding gender is not always possible in the target language).
- JSON / i18next input support alongside XLIFF.
- XLIFF 2.0 support.
- Pseudolocalization mode for catching i18n bugs before translation.

---

Built as a portfolio project exploring LLM-based quality estimation in localization workflows.
