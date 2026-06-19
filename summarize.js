/**
 * Summarizes a news transcript using Google Gemini 2.0 Flash.
 *
 * FREE tier limits (no credit card needed):
 *   - 15 requests per minute
 *   - 1,500 requests per day
 *   - 1 million tokens per minute
 *
 * Get a free key at: https://aistudio.google.com/apikey
 */

const SYSTEM_PROMPT = `You are a news desk editor reviewing a raw transcript from Citizen TV Kenya.

Your job:
1. Identify all distinct news stories in the order they appeared.
2. Group related sentences into one story.
3. IGNORE: weather forecasts, advertisement breaks, presenter small-talk, and station idents.
4. ONLY include real news content.

Return ONLY valid JSON — no markdown code fences, no explanation before or after. Use exactly this structure:

{
  "story_count": <number>,
  "stories": [
    {
      "headline": "Short headline, maximum 12 words",
      "category": "Politics | Business | County | Sports | International | Health | Security | Other",
      "summary": "2 to 3 plain English sentences summarising the story."
    }
  ]
}`;

export async function summarizeTranscript(transcript, googleApiKey) {
  console.log("Sending transcript to Gemini 2.0 Flash for summarization...");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${googleApiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: `Here is the bulletin transcript:\n\n${transcript}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4000 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts
    ?.map(p => p.text || "")
    .join("\n")
    .trim();

  if (!raw) throw new Error("Gemini returned an empty response.");

  // Strip any accidental markdown fences before parsing
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(cleaned);
  console.log(`Summary done: ${parsed.story_count} stories found.`);
  return parsed;
}
