import * as THREE from "three";
import { VisualStyle } from "@/types/spotify";
import { ModeContext, ModeInstance } from "./types";
import { applyFadeBehavior } from "./utils";

export function setup(ctx: ModeContext, style: VisualStyle): ModeInstance {
  // Central reflective sphere
  const sphereGeo = new THREE.SphereGeometry(0.3, 32, 32);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    metalness: 1.0,
    roughness: 0.05,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  ctx.scene.add(sphere);

  // Thin torus rings
  const rings: THREE.Mesh[] = [];
  const ringMaterials: THREE.MeshStandardMaterial[] = [];
  const ringGeometries: THREE.TorusGeometry[] = [];

  for (let i = 0; i < 3; i++) {
    const geo = new THREE.TorusGeometry(1.0 + i * 0.6, 0.008, 8, 64);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(style.color_palette[i]),
      emissive: new THREE.Color(style.color_palette[i]),
      emissiveIntensity: 0.5,
      metalness: 0.9,
      roughness: 0.1,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = Math.PI * 0.5 + i * 0.3;
    ring.rotation.y = i * 0.5;
    ctx.scene.add(ring);
    rings.push(ring);
    ringMaterials.push(mat);
    ringGeometries.push(geo);
  }

  // Three colored point lights
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < 3; i++) {
    const light = new THREE.PointLight(
      new THREE.Color(style.color_palette[i]),
      2,
      10
    );
    light.position.set(
      Math.sin((i * Math.PI * 2) / 3) * 3,
      Math.cos((i * Math.PI * 2) / 3) * 2,
      1
    );
    ctx.scene.add(light);
    lights.push(light);
  }

  const cursorTarget = new THREE.Vector3(0, 0, 1);

  return {
    animate({ beat, time, energy, loudness, style, cursor }) {
      // Time progression: ramp 0→1 over 20 seconds
      const progress = Math.min(1, time / 20);

      // Smooth-lerp cursor target
      const tx = cursor.active ? cursor.world.x : 0;
      const ty = cursor.active ? cursor.world.y : 0;
      cursorTarget.x = THREE.MathUtils.lerp(cursorTarget.x, tx, 0.04);
      cursorTarget.y = THREE.MathUtils.lerp(cursorTarget.y, ty, 0.04);

      // Rotate rings slowly
      const speed = 0.3 + style.motion_speed * 0.7;
      rings.forEach((ring, i) => {
        ring.rotation.x += 0.002 * speed * (i + 1);
        ring.rotation.z += 0.001 * speed * (3 - i);

        // Staggered ring reveal: ring 0 at 0%, ring 1 at ~20%, ring 2 at ~40%
        const ringReveal = Math.max(0, Math.min(1, (progress - i * 0.2) / 0.3));
        ring.scale.setScalar(ringReveal);
      });

      // Pulse ring emissive on beat, scaled by progress
      const fadeIntensity = applyFadeBehavior(
        style.fade_behavior,
        beat,
        loudness,
        time
      );
      ringMaterials.forEach((mat, i) => {
        mat.emissiveIntensity = fadeIntensity * (0.3 + style.energy_level * 0.7) * progress;
        mat.emissive.set(style.color_palette[i]);
        mat.color.set(style.color_palette[i]);
      });

      // Drift lights — biased toward cursor position, intensity scaled by progress
      lights.forEach((light, i) => {
        const angle = time * speed * 0.3 + (i * Math.PI * 2) / 3;
        const baseX = Math.sin(angle) * (2.5 + Math.sin(time * 0.2) * 0.5);
        const baseY = Math.cos(angle) * (2 + Math.cos(time * 0.15) * 0.3);

        light.position.x = THREE.MathUtils.lerp(baseX, cursorTarget.x * 1.5, 0.35);
        light.position.y = THREE.MathUtils.lerp(baseY, cursorTarget.y * 1.5, 0.35);
        light.position.z = 1 + Math.sin(time * 0.3 + i) * 0.5;

        light.intensity =
          THREE.MathUtils.lerp(0.5, 3, energy) *
          style.energy_level *
          (0.6 + beat * 0.4) *
          progress;
        light.color.set(style.color_palette[i]);
      });

      // Sphere scale: grows from 0 to full, with subtle beat pulse
      const s = progress * (1 + beat * 0.05 * style.energy_level);
      sphere.scale.setScalar(s);
    },
    dispose() {
      ctx.scene.remove(sphere);
      sphereGeo.dispose();
      sphereMat.dispose();
      rings.forEach((ring) => ctx.scene.remove(ring));
      ringGeometries.forEach((g) => g.dispose());
      ringMaterials.forEach((m) => m.dispose());
      lights.forEach((l) => ctx.scene.remove(l));
    },
  };
}
