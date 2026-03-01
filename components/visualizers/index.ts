import { VisualMode, VisualStyle } from "@/types/spotify";
import { ModeContext, ModeInstance } from "./types";
import { setup as setupGlitchGrid } from "./GlitchGrid";
import { setup as setupParticleStorm } from "./ParticleStorm";
import { setup as setupLiquidWave } from "./LiquidWave";
import { setup as setupMinimalLight } from "./MinimalLight";
import { setup as setupThermalField } from "./ThermalField";
import { setup as setupDitherTunnel } from "./DitherTunnel";

const modeSetupMap: Record<
  VisualMode,
  (ctx: ModeContext, style: VisualStyle) => ModeInstance
> = {
  [VisualMode.GLITCH_GRID]: setupGlitchGrid,
  [VisualMode.PARTICLE_STORM]: setupParticleStorm,
  [VisualMode.LIQUID_WAVE]: setupLiquidWave,
  [VisualMode.MINIMAL_LIGHT]: setupMinimalLight,
  [VisualMode.THERMAL_FIELD]: setupThermalField,
  [VisualMode.DITHER_TUNNEL]: setupDitherTunnel,
};

export function createMode(
  mode: VisualMode,
  ctx: ModeContext,
  style: VisualStyle
): ModeInstance {
  return modeSetupMap[mode](ctx, style);
}
