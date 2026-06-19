/**
 * Main pipeline orchestrator for news bulletin capture.
 * Called by GitHub Actions workflows and npm scripts.
 *
 * Usage:
 *   node scripts/run-pipeline.js "Evening Bulletin" 35 "7:00 - 7:35 PM EAT"
 *   node scripts/run-pipeline.js "Night News"       70 "9:00 - 10:10 PM EAT"
 *
 * Required environment variables:
 *   GROQ_API_KEY   — for Whisper transcription  (free at console.groq.com)
 *   GOOGLE_API_KEY — for Gemini summarization   (free at aistudio.google.com/apikey)
 */

import fs from "fs";
import path from "path";
import { captureAudio } from "./capture-audio.js";
import { transcribeAudio } from "./transcribe.js";
import { summarizeTranscript } from "./summarize.js";

const [, , bulletinLabel, durationMinutesArg, windowLabel] = process.argv;

if (!bulletinLabel || !durationMinutesArg) {
  console.error('Usage: node run-pipeline.js "<Label>" <durationMinutes> "<window>"');
  process.exit(1);
}

if (!process.env.GROQ_API_KEY)   { console.error("Missing: GROQ_API_KEY");   process.exit(1); }
if (!process.env.GOOGLE_API_KEY) { console.error("Missing: GOOGLE_API_KEY"); process.exit(1); }

const durationSeconds = Number(durationMinutesArg) * 60;
const today     = new Date().toISOString().slice(0, 10);          // "2025-06-19"
const slug      = bulletinLabel.replace(/\s+/g, "-").toLowerCase(); // "evening-bulletin"
const audioPath = `/tmp/${slug}-${today}.mp3`;

async function main() {
  // Step 1: Capture audio from the live stream
  captureAudio(audioPath, durationSeconds);

  // Step 2: Transcribe with Groq Whisper (free)
  const transcript = await transcribeAudio(audioPath, process.env.GROQ_API_KEY);

  // Step 3: Summarize with Gemini 2.0 Flash (free)
  const summary = await summarizeTranscript(transcript, process.env.GOOGLE_API_KEY);

  // Step 4: Build the record and save as JSON
  const record = {
    date:          today,
    bulletin:      bulletinLabel,
    window:        windowLabel || "",
    generated_at:  new Date().toISOString(),
    ...summary,
  };

  const outDir   = path.join("data", "summaries");
  const filename = `${today}-${slug}.json`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, filename), JSON.stringify(record, null, 2));

  // Step 5: Update the manifest (keeps most recent 60 entries = ~30 days)
  const manifestPath = path.join(outDir, "index.json");
  let manifest = [];
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  }
  manifest = [filename, ...manifest.filter(f => f !== filename)].slice(0, 60);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Step 6: Clean up the audio file from the runner
  if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

  console.log(`\n✅ Pipeline complete: ${filename} (${record.story_count} stories)`);
}

main().catch(err => { console.error("\n❌ Pipeline failed:", err.message); process.exit(1); });
