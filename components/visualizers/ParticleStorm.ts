import * as THREE from "three";
import { VisualStyle } from "@/types/spotify";
import { ModeContext, ModeInstance } from "./types";
import { applyFadeBehavior } from "./utils";

export function setup(ctx: ModeContext, style: VisualStyle): ModeInstance {
  const count = Math.floor(
    THREE.MathUtils.lerp(800, 5000, style.particle_density)
  );
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const color1 = new THREE.Color(style.color_palette[0]);
  const color2 = new THREE.Color(style.color_palette[1]);
  const color3 = new THREE.Color(style.color_palette[2]);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;

    // Spherical distribution
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 0.5 + Math.random() * 2.5;

    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);

    // Velocity: normalized direction from center
    const len = Math.sqrt(
      positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2
    );
    velocities[i3] = positions[i3] / len;
    velocities[i3 + 1] = positions[i3 + 1] / len;
    velocities[i3 + 2] = positions[i3 + 2] / len;

    // Color gradient by angle
    const t = i / count;
    const c =
      t < 0.33
        ? color1.clone().lerp(color2, t / 0.33)
        : t < 0.66
          ? color2.clone().lerp(color3, (t - 0.33) / 0.33)
          : color3.clone().lerp(color1, (t - 0.66) / 0.34);
    colors[i3] = c.r;
    colors[i3 + 1] = c.g;
    colors[i3 + 2] = c.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // Per-particle reveal thresholds for staggered appearance
  const revealThresholds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    revealThresholds[i] = Math.random();
  }

  const material = new THREE.PointsMaterial({
    size: THREE.MathUtils.lerp(0.02, 0.06, style.energy_level),
    vertexColors: true,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  ctx.scene.add(points);

  // Ambient light for scene
  const ambientLight = new THREE.PointLight(
    new THREE.Color(style.color_palette[0]),
    1.5,
    15
  );
  ctx.scene.add(ambientLight);

  const attractorPos = new THREE.Vector3(0, 0, 0);

  return {
    animate({ beat, time, energy, style, cursor }) {
      // Time progression: ramp 0→1 over 20 seconds
      const progress = Math.min(1, time / 20);

      // Lerp attractor toward cursor (or back to origin when inactive)
      const tx = cursor.active ? cursor.world.x : 0;
      const ty = cursor.active ? cursor.world.y : 0;
      const tz = cursor.active ? cursor.world.z : 0;
      attractorPos.x = THREE.MathUtils.lerp(attractorPos.x, tx, 0.04);
      attractorPos.y = THREE.MathUtils.lerp(attractorPos.y, ty, 0.04);
      attractorPos.z = THREE.MathUtils.lerp(attractorPos.z, tz, 0.04);

      const pos = geometry.attributes.position.array as Float32Array;
      const col = geometry.attributes.color.array as Float32Array;

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;

        // Progressive reveal: each particle fades in at its threshold
        const reveal = Math.max(0, Math.min(1, (progress - revealThresholds[i]) / 0.1));
        col[i3 + 0] = colors[i3] * reveal;
        col[i3 + 1] = colors[i3 + 1] * reveal;
        col[i3 + 2] = colors[i3 + 2] * reveal;

        // Beat explosion: push outward
        const pushForce = beat * style.energy_level * 0.04;
        pos[i3] += velocities[i3] * style.motion_speed * 0.01 + pushForce * velocities[i3];
        pos[i3 + 1] += velocities[i3 + 1] * style.motion_speed * 0.01 + pushForce * velocities[i3 + 1];
        pos[i3 + 2] += velocities[i3 + 2] * style.motion_speed * 0.01 + pushForce * velocities[i3 + 2];

        // Gravity pull toward attractor (follows cursor)
        const dx = pos[i3] - attractorPos.x;
        const dy = pos[i3 + 1] - attractorPos.y;
        const dz = pos[i3 + 2] - attractorPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > 0.01) {
          const pull = Math.max(0, dist - 1.5) * 0.008;
          pos[i3] -= (dx / dist) * pull;
          pos[i3 + 1] -= (dy / dist) * pull;
          pos[i3 + 2] -= (dz / dist) * pull;
        }

        // Swirl motion
        const swirl = style.motion_speed * 0.003;
        const px = pos[i3];
        const pz = pos[i3 + 2];
        pos[i3] = px * Math.cos(swirl) - pz * Math.sin(swirl);
        pos[i3 + 2] = px * Math.sin(swirl) + pz * Math.cos(swirl);
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;

      // Particle size pulse with beat, scaled by progress
      material.size =
        THREE.MathUtils.lerp(0.02, 0.06, energy) * (1 + beat * 0.5) * progress;

      // Opacity from fade behavior, scaled by progress
      material.opacity = progress * applyFadeBehavior(
        style.fade_behavior,
        beat,
        energy,
        time
      );

      // Rotate the whole system slowly
      points.rotation.y += 0.001 * (0.5 + style.motion_speed);
    },
    dispose() {
      ctx.scene.remove(points);
      ctx.scene.remove(ambientLight);
      geometry.dispose();
      material.dispose();
    },
  };
}
