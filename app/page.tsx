"use client";

import { useEffect, useState, useCallback } from "react";
import TrackGrid from "@/components/TrackGrid";
import Visualizer from "@/components/Visualizer";
import { usePlayback } from "@/hooks/usePlayback";
import { generateAudioFeatures } from "@/lib/audio-features";
import { SpotifyTrack, AudioFeatures, VisualStyle } from "@/types/spotify";
import { extractColors } from "@/lib/extract-colors";

type TimeRange = "short_term" | "medium_term" | "long_term";

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  short_term: "Last 4 Weeks",
  medium_term: "Last 6 Months",
  long_term: "All Time",
};

export default function Home() {
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<SpotifyTrack | null>(null);
  const [audioFeatures, setAudioFeatures] = useState<AudioFeatures | null>(
    null
  );
  const [visualStyle, setVisualStyle] = useState<VisualStyle | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("medium_term");
  const { play, stop, getPosition, isReady, isPremium, mode, needsDevice } =
    usePlayback();

  // Fetch top tracks on mount and when time range changes
  useEffect(() => {
    fetch(`/api/spotify/top-tracks?time_range=${timeRange}`)
      .then((res) => {
        if (res.status === 401) {
          setIsAuthenticated(false);
          return null;
        }
        setIsAuthenticated(true);
        return res.json();
      })
      .then((data) => {
        if (data?.items) setTracks(data.items);
      })
      .catch(() => setIsAuthenticated(false));
  }, [timeRange]);

  const handleTrackSelect = useCallback(
    async (track: SpotifyTrack) => {
      setSelectedTrack(track);
      setAudioFeatures(generateAudioFeatures(track.id));
      setVisualStyle(null);

      // Start playback immediately (don't wait for LLM)
      play(track.uri);

      // Extract album art colors (~10-20ms, non-blocking feel)
      const albumColors = await extractColors(
        track.album?.images?.[0]?.url
      ).catch(() => null);

      // Fetch LLM visual style
      fetch("/api/visual-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: track.id,
          track: track.name,
          artist: track.artists.map((a) => a.name).join(", "),
          album: track.album?.name ?? "Unknown",
          release_year: track.album?.release_date?.split("-")[0] ?? "unknown",
          popularity: track.popularity ?? 50,
          albumColors,
        }),
      })
        .then((res) => res.json())
        .then((style: VisualStyle) => setVisualStyle(style))
        .catch((err) => console.error("Visual style fetch failed:", err));
    },
    [play]
  );

  const handleBack = useCallback(() => {
    stop();
    setSelectedTrack(null);
    setAudioFeatures(null);
    setVisualStyle(null);
  }, [stop]);

  // Loading
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/60 text-sm">Loading...</div>
      </div>
    );
  }

  // Not authenticated — show login
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
        <h1 className="text-4xl font-bold text-white">Spotify Visualizer</h1>
        <p className="text-white/50 text-center max-w-md">
          Connect your Spotify account to visualize your top tracks with
          real-time audio-reactive 3D graphics.
        </p>
        <a
          href="/api/auth/login"
          className="px-6 py-3 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-full transition-colors"
        >
          Connect with Spotify
        </a>
      </div>
    );
  }

  // Non-Premium account (SDK mode only — Connect mode doesn't hit this)
  if (!isPremium && mode === "sdk") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
        <h1 className="text-3xl font-bold text-white">Premium Required</h1>
        <p className="text-white/50 text-center max-w-md">
          Spotify Web Playback SDK requires a Spotify Premium account for
          full-track playback.
        </p>
      </div>
    );
  }

  // Visualizer active
  if (selectedTrack) {
    if (!visualStyle) {
      return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Generating visuals...</p>
          <button
            onClick={handleBack}
            className="absolute top-6 left-6 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-sm transition"
          >
            &larr; Back
          </button>
        </div>
      );
    }

    return (
      <Visualizer
        getPosition={getPosition}
        audioFeatures={audioFeatures}
        visualStyle={visualStyle}
        trackName={selectedTrack.name}
        artistName={selectedTrack.artists.map((a) => a.name).join(", ")}
        onBack={handleBack}
      />
    );
  }

  // Track grid
  return (
    <div className="min-h-screen bg-black flex flex-col items-center">
      <div className="pt-12 pb-8 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">Your Top Tracks</h1>
        <p className="text-white/50 text-sm">
          {!isReady
            ? "Connecting to Spotify..."
            : mode === "connect"
              ? "Open Spotify on your device, then tap a track"
              : "Click a track to visualize"}
        </p>
        <div className="flex gap-2 justify-center mt-4">
          {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                timeRange === range
                  ? "bg-white text-black"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {TIME_RANGE_LABELS[range]}
            </button>
          ))}
        </div>
      </div>
      <TrackGrid tracks={tracks} onTrackSelect={handleTrackSelect} />
      {needsDevice && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-white text-lg font-semibold text-center">
            No active Spotify device found
          </p>
          <p className="text-white/50 text-sm text-center max-w-xs">
            Open the Spotify app on your phone and play any song briefly, then
            come back and tap a track.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-5 py-2 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-full transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
