import * as THREE from "three";
import { CameraMovement, FadeBehavior } from "@/types/spotify";

export function applyFadeBehavior(
  behavior: FadeBehavior,
  beat: number,
  loudness: number,
  time: number
): number {
  switch (behavior) {
    case "smooth":
      return THREE.MathUtils.lerp(0.1, 1.0, loudness) * (0.5 + beat * 0.5);
    case "pulse":
      return 0.2 + beat * 0.8;
    case "strobe":
      return beat > 0.85 ? 1.0 : 0.1;
    case "swell":
      return 0.3 + 0.7 * Math.abs(Math.sin(time * 0.5)) * (0.5 + beat * 0.5);
    default:
      return 0.5 + beat * 0.5;
  }
}

export function getCameraPosition(
  movement: CameraMovement,
  time: number,
  motionSpeed: number
): { x: number; y: number; z: number } {
  const s = 0.5 + motionSpeed;
  switch (movement) {
    case "static":
      return { x: 0, y: 0, z: 3 };
    case "slow_orbit":
      return {
        x: Math.sin(time * 0.3 * s) * 2,
        y: Math.cos(time * 0.2 * s) * 1,
        z: 3 + Math.sin(time * 0.1 * s) * 0.5,
      };
    case "fast_orbit":
      return {
        x: Math.sin(time * 1.0 * s) * 3,
        y: Math.cos(time * 0.8 * s) * 2,
        z: 3 + Math.sin(time * 0.5 * s) * 1,
      };
    case "drift":
      return {
        x: Math.sin(time * 0.15 * s) * 1.5,
        y: Math.sin(time * 0.1 * s) * 0.5,
        z: 3 + Math.sin(time * 0.05 * s) * 0.3,
      };
  }
}
