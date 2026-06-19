import fs from "fs";

/**
 * Transcribes an audio file using Groq's free Whisper API.
 *
 * FREE tier limits (no credit card needed):
 *   - whisper-large-v3: 7,200 seconds of audio per day (~2 hours)
 *   - Our daily usage: 35 min + 70 min = 105 min — well within the limit
 *
 * Get a free key at: https://console.groq.com
 */
export async function transcribeAudio(filePath, groqApiKey) {
  console.log("Sending audio to Groq Whisper for transcription...");

  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer]), "audio.mp3");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "text");
  form.append("language", "en");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqApiKey}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Groq Whisper error ${res.status}: ${await res.text()}`);
  }

  const transcript = await res.text();
  console.log(`Transcript received (${transcript.length} characters).`);
  return transcript;
}
