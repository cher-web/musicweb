"use client";

import { useCallback } from "react";

/**
 * Deterministic beat engine: converts tempo + playback position into a
 * smooth 0–1 pulse intensity using sine-squared envelope.
 */
export function useBeatEngine() {
  const getBeatIntensity = useCallback(
    (tempo: number, positionMs: number): number => {
      if (tempo <= 0 || positionMs <= 0) return 0;

      const beatDurationMs = 60000 / tempo;
      const beatPhase = (positionMs % beatDurationMs) / beatDurationMs;

      // Sine-squared envelope: smooth pulse peaking once per beat
      return Math.pow(Math.sin(beatPhase * Math.PI), 2);
    },
    []
  );

  return { getBeatIntensity };
}
