/**
 * Research Agent — powered by Google Gemini 2.0 Flash + Google Search grounding.
 * Both are completely FREE. No credit card. No trial.
 *
 * THREE MODES:
 * ─────────────────────────────────────────────────────────────────────────
 *  topic      Search the web on any topic and produce a structured analysis
 *             with findings from credible sources.
 *
 *  document   Analyse a specific document — paste its URL (PDF, web page,
 *             government bill, manifesto). Gemini fetches it, reads it, and
 *             finds external commentary via Google Search.
 *
 *  research   Search academic databases (ResearchGate, Google Scholar, JSTOR)
 *             for papers on a subject, map what is already known, and
 *             identify specific research gaps with suggested methodologies.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * USAGE EXAMPLES:
 *   node scripts/research-agent.js --mode topic    --input "Finance Bill 2026 Kenya"                          --label "Finance Bill 2026"
 *   node scripts/research-agent.js --mode document --input "https://parliament.go.ke/finance-bill-2026.pdf"  --label "Finance Bill 2026 Full Analysis"
 *   node scripts/research-agent.js --mode research --input "mobile money adoption Kenya smallholder farmers"  --label "Mobile Money Research Gaps"
 *   node scripts/research-agent.js --mode topic    --input "Ruto vs Raila presidential race 2027 manifesto"  --label "2027 Presidential Manifestos"
 *
 * Required environment variable:
 *   GOOGLE_API_KEY — free at https://aistudio.google.com/apikey
 */

import fs from "fs";
import path from "path";

// ── CLI argument parser ─────────────────────────────────────────────────────
function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

const MODE  = getArg("--mode")  || "topic";
const INPUT = getArg("--input");
const LABEL = getArg("--label") || INPUT || "Research Report";

if (!INPUT) {
  console.error('Error: --input is required. Example: --input "Finance Bill 2026 Kenya"');
  process.exit(1);
}

if (!["topic", "document", "research"].includes(MODE)) {
  console.error('Error: --mode must be one of: topic | document | research');
  process.exit(1);
}

// ── System prompts ──────────────────────────────────────────────────────────
const SYSTEM_PROMPTS = {

  topic: `You are an expert Kenyan research analyst. The user gives you a topic.

Your task:
1. Use Google Search to find at least 5 credible sources (government sites, reputable Kenyan news outlets like Nation, Standard, Business Daily; academic institutions, NGOs, international bodies like World Bank or IMF when relevant).
2. Cross-reference and verify key facts across multiple sources.
3. Produce a structured, balanced, objective analysis.

Return ONLY valid JSON — no markdown fences, no preamble. Use this exact structure:
{
  "title": "A descriptive report title",
  "executive_summary": "3 to 4 sentence overview of the topic and key conclusions.",
  "key_findings": [
    { "point": "A specific finding or fact", "source": "Name of source or URL" }
  ],
  "analysis": "3 to 5 paragraphs of structured analysis covering different angles of the topic.",
  "sources_used": ["https://url1.com", "https://url2.com"],
  "credibility_note": "A brief note on the quality and range of sources found."
}`,

  document: `You are a senior policy analyst. The user gives you a URL to a document (a PDF, web page, government bill, presidential manifesto, NGO report, etc.).

Your task:
1. Use Google Search to fetch and read the document at the given URL.
2. Identify the document's purpose, key provisions or claims, and intended impact.
3. Use Google Search to find credible external commentary, criticism, or analysis of this document.
4. Produce a thorough, balanced assessment.

Return ONLY valid JSON — no markdown fences, no preamble. Use this exact structure:
{
  "title": "The full title of the document",
  "document_type": "Bill | Manifesto | Report | Policy | Other",
  "executive_summary": "3 to 4 sentences summarising what the document is and its main thrust.",
  "key_provisions": [
    { "title": "Name of the provision or section", "detail": "What it proposes or states." }
  ],
  "potential_impact": [
    { "sector": "Name of affected sector", "impact": "How this document affects that sector." }
  ],
  "controversies_or_gaps": [
    "A controversy, critique, or identified gap in the document."
  ],
  "external_commentary": [
    { "source": "Source name", "stance": "supportive | critical | neutral", "summary": "What they said." }
  ],
  "overall_assessment": "2 to 3 paragraphs giving a balanced overall assessment of the document."
}`,

  research: `You are an academic research analyst specialising in East African studies. The user gives you a research topic.

Your task:
1. Use Google Search to find 6 to 10 peer-reviewed papers or credible academic sources. Search specifically on: ResearchGate, Google Scholar, JSTOR, university repositories, and African Journals Online (AJOL).
2. Map out what the existing literature already covers — themes, methodologies, populations studied, findings.
3. Critically and specifically identify GENUINE RESEARCH GAPS: questions not yet answered, populations not yet studied, methodologies not yet applied, contradictions in the literature not yet resolved, or geographic areas not yet covered.
4. For each gap, explain WHY it is a gap (what the literature shows is missing) and HOW it could be studied.

Return ONLY valid JSON — no markdown fences, no preamble. Use this exact structure:
{
  "topic": "The research topic as stated by the user",
  "literature_summary": "3 to 4 paragraphs summarising what existing research covers, key themes, and dominant methodologies.",
  "papers_found": [
    {
      "title": "Full paper title",
      "authors": "Author names",
      "year": "Publication year",
      "source": "ResearchGate | Google Scholar | JSTOR | AJOL | Other",
      "url": "Direct URL to paper",
      "focus": "One sentence describing what this paper specifically studies."
    }
  ],
  "themes_covered": [
    "A theme that is well-covered in the existing literature."
  ],
  "research_gaps": [
    {
      "gap": "A specific, concrete area that has NOT been studied",
      "justification": "Why this is a gap — what the reviewed papers show is missing or contradictory.",
      "suggested_methodology": "A specific research method that could fill this gap."
    }
  ],
  "recommended_next_study": "A single concrete research question, framed as an academic study title, that addresses the most critical identified gap."
}`

};

// ── User messages per mode ───────────────────────────────────────────────────
const USER_MESSAGES = {
  topic:    `Research this topic thoroughly using Google Search: "${INPUT}"`,
  document: `Analyse this document thoroughly. Fetch it via Google Search and find external commentary: ${INPUT}`,
  research: `Search for academic literature on this topic and identify specific research gaps: "${INPUT}"`
};

// ── Call Gemini 2.0 Flash with Google Search grounding ──────────────────────
async function runAgent(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPTS[MODE] }] },
      contents: [{ parts: [{ text: USER_MESSAGES[MODE] }] }],
      tools: [{ googleSearch: {} }],   // Google Search grounding — free, built into Gemini
      generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    .map(p => p.text)
    .join("\n")
    .trim();

  if (!raw) throw new Error("Gemini returned an empty response. Check your GOOGLE_API_KEY.");

  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
  return JSON.parse(cleaned);
}

// ── Save output to data/research/ and update manifest ───────────────────────
async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.error("Missing: GOOGLE_API_KEY"); process.exit(1); }

  console.log(`\n🔬 Research Agent [${MODE.toUpperCase()}]`);
  console.log(`   Input : ${INPUT}`);
  console.log(`   Label : ${LABEL}\n`);

  const result = await runAgent(apiKey);

  const today    = new Date().toISOString().slice(0, 10);
  const slug     = LABEL.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 50);
  const filename = `${today}-${slug}.json`;

  const record = {
    date: today, mode: MODE, label: LABEL, input: INPUT,
    generated_at: new Date().toISOString(),
    ...result,
  };

  const outDir = path.join("data", "research");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, filename), JSON.stringify(record, null, 2));

  const manifestPath = path.join(outDir, "index.json");
  let manifest = [];
  if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  manifest = [filename, ...manifest.filter(f => f !== filename)].slice(0, 100);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n✅ Research report saved: data/research/${filename}`);
}

main().catch(err => { console.error("\n❌ Research agent failed:", err.message); process.exit(1); });
