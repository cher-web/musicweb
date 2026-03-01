"use client";

import { useRef, useCallback, useEffect, useState } from "react";

export function usePlayback() {
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const positionRef = useRef(0);
  const timestampRef = useRef(0);
  const playingRef = useRef(false);

  const [isReady, setIsReady] = useState(false);
  const [isPremium, setIsPremium] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initPlayer = () => {
      const player = new window.Spotify.Player({
        name: "Spotify Visualizer",
        getOAuthToken: async (cb) => {
          try {
            const res = await fetch("/api/auth/token");
            const data = await res.json();
            cb(data.access_token);
          } catch {
            console.error("Failed to fetch token for SDK");
          }
        },
        volume: 0.5,
      });

      player.addListener("ready", ({ device_id }) => {
        console.log("Spotify SDK ready, device:", device_id);
        deviceIdRef.current = device_id;
        if (mounted) setIsReady(true);
      });

      player.addListener("not_ready", ({ device_id }) => {
        console.log("Device went offline:", device_id);
        if (mounted) setIsReady(false);
      });

      player.addListener("player_state_changed", (state) => {
        if (!state) return;
        positionRef.current = state.position;
        timestampRef.current = performance.now();
        playingRef.current = !state.paused;
      });

      player.addListener("initialization_error", ({ message }) => {
        console.error("SDK init error:", message);
      });

      player.addListener("authentication_error", ({ message }) => {
        console.error("SDK auth error:", message);
      });

      player.addListener("account_error", ({ message }) => {
        // Fires when account is not Premium
        console.error("SDK account error (Premium required):", message);
        if (mounted) setIsPremium(false);
      });

      player.connect();
      playerRef.current = player;
    };

    // SDK may already be loaded or not yet
    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
    }

    return () => {
      mounted = false;
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, []);

  const play = useCallback(async (trackUri: string) => {
    if (!deviceIdRef.current) return;

    try {
      const tokenRes = await fetch("/api/auth/token");
      const { access_token } = await tokenRes.json();

      await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: [trackUri] }),
        }
      );
    } catch (err) {
      console.error("Playback error:", err);
    }
  }, []);

  const stop = useCallback(async () => {
    if (playerRef.current) {
      await playerRef.current.pause();
    }
    playingRef.current = false;
  }, []);

  const getPosition = useCallback((): number => {
    if (!playingRef.current) return positionRef.current;
    // Interpolate position between SDK state updates
    return positionRef.current + (performance.now() - timestampRef.current);
  }, []);

  return { play, stop, getPosition, isReady, isPremium };
}
