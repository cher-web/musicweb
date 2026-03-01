export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  popularity: number;
  artists: { name: string }[];
  album: {
    name: string;
    release_date: string;
    images: { url: string; width: number; height: number }[];
  };
}

export interface AudioFeatures {
  valence: number;
  energy: number;
  danceability: number;
  tempo: number;
  loudness: number;
}

// --- Visual Style types ---

export enum VisualMode {
  GLITCH_GRID = "GLITCH_GRID",
  PARTICLE_STORM = "PARTICLE_STORM",
  LIQUID_WAVE = "LIQUID_WAVE",
  MINIMAL_LIGHT = "MINIMAL_LIGHT",
  THERMAL_FIELD = "THERMAL_FIELD",
  DITHER_TUNNEL = "DITHER_TUNNEL",
}

export type CameraMovement = "static" | "slow_orbit" | "fast_orbit" | "drift";
export type FadeBehavior = "smooth" | "pulse" | "strobe" | "swell";

export interface VisualStyle {
  mode: VisualMode;
  energy_level: number;
  motion_speed: number;
  color_palette: [string, string, string];
  bloom_intensity: number;
  distortion_strength: number;
  particle_density: number;
  glitch_amount: number;
  camera_movement: CameraMovement;
  fade_behavior: FadeBehavior;
  background_color: string;
  mood_description: string;
}

// Spotify Web Playback SDK global types
declare global {
  interface Window {
    Spotify: typeof Spotify;
    onSpotifyWebPlaybackSDKReady: () => void;
  }

  namespace Spotify {
    interface Player {
      connect(): Promise<boolean>;
      disconnect(): void;
      addListener(event: "ready", cb: (data: { device_id: string }) => void): void;
      addListener(event: "not_ready", cb: (data: { device_id: string }) => void): void;
      addListener(event: "player_state_changed", cb: (state: PlaybackState | null) => void): void;
      addListener(event: "initialization_error", cb: (data: { message: string }) => void): void;
      addListener(event: "authentication_error", cb: (data: { message: string }) => void): void;
      addListener(event: "account_error", cb: (data: { message: string }) => void): void;
      removeListener(event: string): void;
      pause(): Promise<void>;
      resume(): Promise<void>;
      getCurrentState(): Promise<PlaybackState | null>;
    }

    interface PlaybackState {
      paused: boolean;
      position: number;
      duration: number;
      track_window: {
        current_track: {
          id: string;
          uri: string;
          name: string;
          artists: { name: string }[];
        };
      };
    }

    interface PlayerInit {
      name: string;
      getOAuthToken: (cb: (token: string) => void) => void;
      volume?: number;
    }

    const Player: {
      new (options: PlayerInit): Player;
    };
  }
}
