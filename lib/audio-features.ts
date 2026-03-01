import { AudioFeatures } from "@/types/spotify";

/**
 * Generates deterministic audio features from a track ID.
 * Since Spotify deprecated the /audio-features endpoint (403),
 * we derive consistent per-track values using a simple hash.
 * Each track gets unique but stable visual parameters.
 */
export function generateAudioFeatures(trackId: string): AudioFeatures {
  const hash = simpleHash(trackId);

  return {
    // Tempo: 80–160 BPM range
    tempo: 80 + ((hash >>> 0) % 80),
    // Energy: 0.3–0.9
    energy: 0.3 + ((hash >>> 4) % 60) / 100,
    // Valence: 0.1–0.9
    valence: 0.1 + ((hash >>> 8) % 80) / 100,
    // Danceability: 0.3–0.9
    danceability: 0.3 + ((hash >>> 12) % 60) / 100,
    // Loudness: -25 to -5 dB
    loudness: -25 + ((hash >>> 16) % 20),
  };
}

/** Simple string hash (djb2) */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}
