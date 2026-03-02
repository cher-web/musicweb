import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  VisualStyle,
  VisualMode,
  CameraMovement,
  FadeBehavior,
} from "@/types/spotify";

export const runtime = "edge";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

// In-memory cache: trackId → validated VisualStyle
// Note: on edge/serverless, this cache only lives per isolate instance
const cache = new Map<string, VisualStyle>();

const DEFAULT_STYLE: VisualStyle = {
  mode: VisualMode.GLITCH_GRID,
  energy_level: 0.5,
  motion_speed: 0.5,
  color_palette: ["#4a90d9", "#7c3aed", "#06b6d4"],
  bloom_intensity: 0.4,
  distortion_strength: 0.3,
  particle_density: 0.5,
  glitch_amount: 0.0,
  camera_movement: "slow_orbit",
  fade_behavior: "smooth",
  background_color: "#000000",
  mood_description: "default ambient visualization",
};

const SYSTEM_PROMPT = `You are a visual engine controller for a real-time Three.js music visualization system.

Analyze the track identity based only on provided metadata.

Select ONE visual mode from: GLITCH_GRID, PARTICLE_STORM, LIQUID_WAVE, MINIMAL_LIGHT, THERMAL_FIELD, DITHER_TUNNEL.

Return valid JSON only matching this exact schema:
{
  "mode": "GLITCH_GRID" | "PARTICLE_STORM" | "LIQUID_WAVE" | "MINIMAL_LIGHT" | "THERMAL_FIELD" | "DITHER_TUNNEL",
  "energy_level": number (0-1),
  "motion_speed": number (0-1),
  "color_palette": [exactly 3 hex color strings like "#ff0000"],
  "bloom_intensity": number (0-1),
  "distortion_strength": number (0-1),
  "particle_density": number (0-1),
  "glitch_amount": number (0-1),
  "camera_movement": "static" | "slow_orbit" | "fast_orbit" | "drift",
  "fade_behavior": "smooth" | "pulse" | "strobe" | "swell",
  "mood_description": short 5-10 word description of the visual mood
}

Prefer:
- Calm/acoustic music → LIQUID_WAVE or THERMAL_FIELD, low energy, slow drift, muted tones
- High energy/pop/rock → PARTICLE_STORM or GLITCH_GRID, high energy, fast orbit, vibrant colors
- Electronic/EDM → GLITCH_GRID, high glitch_amount, neon colors, strobe fade
- Cinematic/orchestral → PARTICLE_STORM, medium energy, deep colors, swell fade
- Experimental/ambient → THERMAL_FIELD or MINIMAL_LIGHT, low motion, unusual colors
- R&B/soul → DITHER_TUNNEL, warm colors, smooth fade, medium energy
- Hip-hop/rap → PARTICLE_STORM, high energy, bold colors, pulse fade
- Psychedelic/funk/groove → THERMAL_FIELD, warm lava colors, high distortion, swell fade
- Lo-fi/chill/downtempo → THERMAL_FIELD, muted warm tones, low energy, smooth fade
- Synthwave/retrowave/80s → PARTICLE_STORM, neon colors, high bloom, medium-fast motion
- Industrial/darkwave/techno → DITHER_TUNNEL, cold colors, high energy, strobe fade

If album art dominant colors are provided, use them as the basis for color_palette — adjust for visual harmony but stay close to the album's color identity.

Do not include explanations. Do not include markdown. Return ONLY the JSON object.`;

const VALID_MODES = Object.values(VisualMode);
const VALID_CAMERA: CameraMovement[] = [
  "static",
  "slow_orbit",
  "fast_orbit",
  "drift",
];
const VALID_FADE: FadeBehavior[] = ["smooth", "pulse", "strobe", "swell"];

function clamp01(v: unknown): number {
  const n = Number(v);
  if (isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function isHexColor(s: unknown): s is string {
  return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
}

function validateVisualStyle(raw: Record<string, unknown>): VisualStyle {
  let color_palette = DEFAULT_STYLE.color_palette;
  if (Array.isArray(raw.color_palette)) {
    const valid = raw.color_palette.filter(isHexColor);
    if (valid.length >= 3) {
      color_palette = [valid[0], valid[1], valid[2]] as [
        string,
        string,
        string,
      ];
    }
  }

  return {
    mode: VALID_MODES.includes(raw.mode as VisualMode)
      ? (raw.mode as VisualMode)
      : DEFAULT_STYLE.mode,
    energy_level: clamp01(raw.energy_level),
    motion_speed: clamp01(raw.motion_speed),
    color_palette,
    bloom_intensity: clamp01(raw.bloom_intensity),
    distortion_strength: clamp01(raw.distortion_strength),
    particle_density: clamp01(raw.particle_density),
    glitch_amount: clamp01(raw.glitch_amount),
    camera_movement: VALID_CAMERA.includes(raw.camera_movement as CameraMovement)
      ? (raw.camera_movement as CameraMovement)
      : DEFAULT_STYLE.camera_movement,
    fade_behavior: VALID_FADE.includes(raw.fade_behavior as FadeBehavior)
      ? (raw.fade_behavior as FadeBehavior)
      : DEFAULT_STYLE.fade_behavior,
    background_color: "#000000",
    mood_description:
      typeof raw.mood_description === "string"
        ? raw.mood_description.slice(0, 100)
        : DEFAULT_STYLE.mood_description,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { trackId, track, artist, album, release_year, popularity, albumColors } = body;

    if (trackId && cache.has(trackId)) {
      return NextResponse.json(cache.get(trackId));
    }

    let userContent = `Track: "${track}" by ${artist}\nAlbum: ${album} (${release_year})\nPopularity: ${popularity}/100`;
    if (Array.isArray(albumColors) && albumColors.length === 3) {
      userContent += `\nAlbum art dominant colors: ${albumColors.join(", ")}`;
    }

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty LLM response");

    const parsed = JSON.parse(raw);
    const validated = validateVisualStyle(parsed);

    if (trackId) {
      cache.set(trackId, validated);
    }

    return NextResponse.json(validated);
  } catch (err) {
    console.error("Visual style generation failed:", err);
    return NextResponse.json(DEFAULT_STYLE);
  }
}
