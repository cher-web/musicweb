"use client";

import { useRef, useCallback, useEffect, useState } from "react";

export type PlaybackMode = "sdk" | "connect" | null;

async function getAccessToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/token");
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export function usePlayback() {
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const positionRef = useRef(0);
  const timestampRef = useRef(0);
  const playingRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeRef = useRef<PlaybackMode>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPremium, setIsPremium] = useState(true);
  const [mode, setMode] = useState<PlaybackMode>(null);
  const [needsDevice, setNeedsDevice] = useState(false);

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch("https://api.spotify.com/v1/me/player", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 204 || !res.ok) return;
        const state = await res.json();
        if (state.progress_ms != null) {
          positionRef.current = state.progress_ms;
          timestampRef.current = performance.now();
          playingRef.current = state.is_playing ?? false;
        }
      } catch {
        // Ignore polling errors
      }
    }, 1500);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let sdkTimeout: ReturnType<typeof setTimeout>;

    const activateConnectMode = () => {
      if (!mounted || modeRef.current === "sdk") return;
      modeRef.current = "connect";
      if (mounted) {
        setMode("connect");
        setIsReady(true);
      }
    };

    const initPlayer = () => {
      try {
        const player = new window.Spotify.Player({
          name: "Spotify Visualizer",
          getOAuthToken: async (cb) => {
            const token = await getAccessToken();
            if (token) cb(token);
          },
          volume: 0.5,
        });

        player.addListener("ready", ({ device_id }) => {
          clearTimeout(sdkTimeout);
          deviceIdRef.current = device_id;
          modeRef.current = "sdk";
          if (mounted) {
            setMode("sdk");
            setIsReady(true);
          }
        });

        player.addListener("not_ready", () => {
          if (mounted) setIsReady(false);
        });

        player.addListener("player_state_changed", (state) => {
          if (!state) return;
          positionRef.current = state.position;
          timestampRef.current = performance.now();
          playingRef.current = !state.paused;
        });

        player.addListener("initialization_error", () => {
          clearTimeout(sdkTimeout);
          activateConnectMode();
        });

        player.addListener("authentication_error", ({ message }) => {
          console.error("SDK auth error:", message);
        });

        player.addListener("account_error", ({ message }) => {
          console.error("SDK account error:", message);
          if (mounted) setIsPremium(false);
        });

        player.connect();
        playerRef.current = player;
      } catch {
        activateConnectMode();
        return;
      }

      // If SDK doesn't fire ready within 4s, fall back to Connect
      sdkTimeout = setTimeout(activateConnectMode, 4000);
    };

    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
      // If SDK script never loads, fall back after 5s
      sdkTimeout = setTimeout(activateConnectMode, 5000);
    }

    return () => {
      mounted = false;
      clearTimeout(sdkTimeout);
      stopPolling();
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, [stopPolling]);

  const play = useCallback(
    async (trackUri: string) => {
      setNeedsDevice(false);

      try {
        const token = await getAccessToken();
        if (!token) return;

        if (modeRef.current === "sdk" && deviceIdRef.current) {
          await fetch(
            `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ uris: [trackUri] }),
            }
          );
        } else {
          // Connect mode: play on the user's active device
          const res = await fetch(
            "https://api.spotify.com/v1/me/player/play",
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ uris: [trackUri] }),
            }
          );

          if (res.status === 404 || res.status === 403) {
            setNeedsDevice(true);
            return;
          }

          positionRef.current = 0;
          timestampRef.current = performance.now();
          playingRef.current = true;
          startPolling();
        }
      } catch (err) {
        console.error("Playback error:", err);
      }
    },
    [startPolling]
  );

  const stop = useCallback(async () => {
    stopPolling();
    playingRef.current = false;

    if (modeRef.current === "sdk" && playerRef.current) {
      await playerRef.current.pause();
    } else {
      try {
        const token = await getAccessToken();
        if (token) {
          await fetch("https://api.spotify.com/v1/me/player/pause", {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch {
        // Ignore
      }
    }
  }, [stopPolling]);

  const getPosition = useCallback((): number => {
    if (!playingRef.current) return positionRef.current;
    return positionRef.current + (performance.now() - timestampRef.current);
  }, []);

  return { play, stop, getPosition, isReady, isPremium, mode, needsDevice };
}
