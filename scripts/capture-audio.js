import { execSync } from "child_process";

// Citizen TV Kenya's persistent YouTube live handle.
// This always resolves to whatever they are currently broadcasting live.
const CHANNEL_LIVE_URL = "https://www.youtube.com/@kenyacitizentv/live";

function getLiveStreamUrl() {
  console.log("Resolving Citizen TV live stream URL...");
  const raw = execSync(
    `yt-dlp -g -f "bestaudio" "${CHANNEL_LIVE_URL}"`,
    { encoding: "utf-8", maxBuffer: 1024 * 1024 * 10 }
  );
  const url = raw.trim().split("\n")[0];
  if (!url) throw new Error("Could not resolve live stream. Is Citizen TV currently live?");
  console.log("Live stream URL resolved.");
  return url;
}

/**
 * Records `durationSeconds` of audio to `outputPath`.
 * Encoded mono / 16 kHz / 32 kbps so a 70-minute clip stays well under
 * Groq Whisper's 25 MB file limit.
 */
export function captureAudio(outputPath, durationSeconds) {
  const streamUrl = getLiveStreamUrl();
  console.log(`Recording ${Math.round(durationSeconds / 60)} minutes of audio...`);
  execSync(
    `ffmpeg -y -i "${streamUrl}" -t ${durationSeconds} -vn -ac 1 -ar 16000 -ab 32k "${outputPath}"`,
    { stdio: "inherit", maxBuffer: 1024 * 1024 * 100 }
  );
  console.log(`Audio saved to ${outputPath}`);
  return outputPath;
}
