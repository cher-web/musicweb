import * as THREE from "three";
import { VisualStyle } from "@/types/spotify";
import { ModeContext, ModeInstance } from "./types";
import { applyFadeBehavior } from "./utils";

const boxVertexShader = `
  uniform float uTime;
  uniform float uGlitch;
  uniform float uBeat;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normal;
    vec3 pos = position;

    // Glitch: random offset triggered by beat
    float glitchTrigger = step(0.75, uBeat) * uGlitch;
    float offsetX = sin(uTime * 47.0 + pos.y * 13.0) * glitchTrigger * 0.15;
    float offsetY = cos(uTime * 31.0 + pos.x * 17.0) * glitchTrigger * 0.1;
    pos.x += offsetX;
    pos.y += offsetY;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const boxFragmentShader = `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uTime;
  uniform float uBeat;
  uniform float uGlitch;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    // RGB split based on glitch
    float shift = uGlitch * 0.03 * sin(uTime * 30.0);
    float r = vUv.x + shift;
    float b = vUv.x - shift;

    vec3 color = mix(uColor1, uColor2, clamp(r, 0.0, 1.0));
    color = mix(color, uColor3, clamp(b, 0.0, 1.0) * 0.5);

    // Scanlines
    float scanline = step(0.5, fract(vUv.y * 40.0 + uTime * 4.0));
    color *= 0.85 + 0.15 * scanline;

    // Edge highlight
    float edge = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
    color += edge * 0.2 * uColor3;

    // Beat flash
    color += uBeat * 0.15;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function setup(ctx: ModeContext, style: VisualStyle): ModeInstance {
  const gridSize = Math.floor(
    THREE.MathUtils.lerp(5, 10, style.energy_level)
  );
  const spacing = 0.55;
  const boxSize = 0.35;

  const boxes: THREE.Mesh[] = [];
  const geometries: THREE.BoxGeometry[] = [];
  const materials: THREE.ShaderMaterial[] = [];
  const baseScales: number[] = [];
  const revealThresholds: number[] = [];

  const uniforms = {
    uTime: { value: 0 },
    uBeat: { value: 0 },
    uGlitch: { value: style.glitch_amount },
    uColor1: { value: new THREE.Color(style.color_palette[0]) },
    uColor2: { value: new THREE.Color(style.color_palette[1]) },
    uColor3: { value: new THREE.Color(style.color_palette[2]) },
  };

  const offset = ((gridSize - 1) * spacing) / 2;

  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      const geo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
      const mat = new THREE.ShaderMaterial({
        vertexShader: boxVertexShader,
        fragmentShader: boxFragmentShader,
        uniforms,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        x * spacing - offset,
        y * spacing - offset,
        0
      );

      ctx.scene.add(mesh);
      boxes.push(mesh);
      geometries.push(geo);
      materials.push(mat);
      baseScales.push(0.8 + Math.random() * 0.4);

      // Reveal threshold: center boxes appear first, edges later, with some randomness
      const cx = (x / (gridSize - 1)) * 2 - 1;
      const cy = (y / (gridSize - 1)) * 2 - 1;
      const distFromCenter = Math.sqrt(cx * cx + cy * cy) / 1.414; // 0-1
      revealThresholds.push(distFromCenter * 0.7 + Math.random() * 0.3);
    }
  }

  // Backlight
  const backLight = new THREE.PointLight(
    new THREE.Color(style.color_palette[2]),
    2,
    15
  );
  backLight.position.set(0, 0, -3);
  ctx.scene.add(backLight);

  // Track which boxes are "popping" on beat
  let lastBeatHigh = false;
  const smoothCursor = new THREE.Vector2(0, 0);

  return {
    animate({ beat, time, energy, loudness, style, cursor }) {
      // Smooth cursor
      const tx = cursor.active ? cursor.world.x : 0;
      const ty = cursor.active ? cursor.world.y : 0;
      smoothCursor.x = THREE.MathUtils.lerp(smoothCursor.x, tx, 0.06);
      smoothCursor.y = THREE.MathUtils.lerp(smoothCursor.y, ty, 0.06);

      uniforms.uTime.value = time;
      uniforms.uBeat.value = beat;
      uniforms.uGlitch.value = style.glitch_amount;
      uniforms.uColor1.value.set(style.color_palette[0]);
      uniforms.uColor2.value.set(style.color_palette[1]);
      uniforms.uColor3.value.set(style.color_palette[2]);

      // Detect beat peak for pop triggers — biased toward cursor proximity
      const beatHigh = beat > 0.8;
      if (beatHigh && !lastBeatHigh) {
        const popCount = Math.floor(boxes.length * 0.2 * style.energy_level);

        // Build proximity weights
        const weights: number[] = boxes.map((box) => {
          const dx = box.position.x - smoothCursor.x;
          const dy = box.position.y - smoothCursor.y;
          return 1 / (1 + Math.sqrt(dx * dx + dy * dy));
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0);

        // Weighted random selection
        for (let p = 0; p < popCount; p++) {
          let r = Math.random() * totalWeight;
          for (let idx = 0; idx < boxes.length; idx++) {
            r -= weights[idx];
            if (r <= 0) {
              baseScales[idx] = 1.5 + Math.random() * 0.5;
              break;
            }
          }
        }
      }
      lastBeatHigh = beatHigh;

      // Time progression: ramp 0→1 over 20 seconds
      const progress = Math.min(1, time / 20);

      // Animate boxes
      boxes.forEach((box, i) => {
        // Progressive reveal: scale from 0 based on threshold
        const reveal = Math.max(0, Math.min(1, (progress - revealThresholds[i]) / 0.15));

        // Decay pop scale back to normal
        baseScales[i] = THREE.MathUtils.lerp(baseScales[i], 1.0, 0.05);
        const s = baseScales[i] * (0.9 + beat * 0.1 * style.energy_level) * reveal;
        box.scale.setScalar(s);

        // Subtle rotation
        box.rotation.x += 0.005 * style.motion_speed;
        box.rotation.y += 0.003 * style.motion_speed;

        // Z oscillation + cursor radial ripple
        const row = Math.floor(i / gridSize);
        const col = i % gridSize;
        const baseZ =
          Math.sin(time * style.motion_speed * 2 + row * 0.5 + col * 0.3) *
          0.2 *
          style.distortion_strength;

        const dx = box.position.x - smoothCursor.x;
        const dy = box.position.y - smoothCursor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ripple =
          Math.sin(dist * 4.0 - time * 3.0) *
          0.15 *
          Math.max(0, 1 - dist * 0.3);

        box.position.z = baseZ + ripple;
      });

      // Backlight pulse
      backLight.intensity = applyFadeBehavior(
        style.fade_behavior,
        beat,
        loudness,
        time
      ) * 3;
      backLight.color.set(style.color_palette[2]);
    },
    dispose() {
      boxes.forEach((b) => ctx.scene.remove(b));
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      ctx.scene.remove(backLight);
    },
  };
}
