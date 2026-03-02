import * as THREE from "three";
import { VisualStyle } from "@/types/spotify";
import { ModeContext, ModeInstance } from "./types";

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform float uBeat;
  uniform float uMotionSpeed;
  uniform float uEnergy;
  uniform float uBloomIntensity;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec2 uResolution;
  uniform vec2 uCursor;
  uniform float uCursorActive;
  uniform float uProgress;

  varying vec2 vUv;

  // --- Hashing ---
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453);
  }

  // --- Pixelated bitmap symbols (5x5 grid per cell) ---

  // · single center pixel
  float charDot(vec2 uv) {
    vec2 p = floor(uv * 5.0);
    return (p.x == 2.0 && p.y == 2.0) ? 1.0 : 0.0;
  }

  // × diagonal cross
  float charX(vec2 uv) {
    vec2 p = floor(uv * 5.0);
    return (abs(p.x - p.y) < 0.5 || abs(p.x - (4.0 - p.y)) < 0.5) ? 1.0 : 0.0;
  }

  // + pixel cross
  float charPlus(vec2 uv) {
    vec2 p = floor(uv * 5.0);
    return (p.x == 2.0 || p.y == 2.0) ? 1.0 : 0.0;
  }

  // ■ small 3x3 block
  float charBlock(vec2 uv) {
    vec2 p = floor(uv * 5.0);
    return (p.x >= 1.0 && p.x <= 3.0 && p.y >= 1.0 && p.y <= 3.0) ? 1.0 : 0.0;
  }

  // ░ checkerboard
  float charChecker(vec2 uv) {
    vec2 p = floor(uv * 5.0);
    return mod(p.x + p.y, 2.0);
  }

  float getChar(vec2 uv, int idx) {
    if (idx <= 0) return charDot(uv);
    if (idx == 1) return charX(uv);
    if (idx == 2) return charPlus(uv);
    if (idx == 3) return charBlock(uv);
    return charChecker(uv);
  }

  void main() {
    vec2 screenUv = vUv * 2.0 - 1.0;
    screenUv.x *= uResolution.x / uResolution.y;

    // Subtle auto-sway
    float wobble = uMotionSpeed * 0.4 + 0.15;
    screenUv.x += sin(uTime * wobble * 0.6) * 0.035;
    screenUv.y += cos(uTime * wobble * 0.45) * 0.025;

    // Ray into the tunnel (camera at origin, looking -Z)
    vec3 rd = normalize(vec3(screenUv, -2.0));

    // Cursor shifts the tunnel axis — vanishing point follows cursor
    vec2 tunnelCenter = uCursor * 0.8 * uCursorActive;

    // Cylinder intersection with offset center: (x-cx)^2 + (y-cy)^2 = R^2
    float R = 1.3;
    float ox = rd.x - tunnelCenter.x * rd.z / (-2.0);
    float oy = rd.y - tunnelCenter.y * rd.z / (-2.0);
    float dPerp2 = ox * ox + oy * oy;

    // Vanishing point — ray nearly parallel to tunnel axis
    if (dPerp2 < 0.0004) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    float t = R / sqrt(dPerp2);
    vec3 hit = rd * t;
    // Re-center hit relative to tunnel axis
    hit.x -= tunnelCenter.x * (-hit.z) / 2.0;
    hit.y -= tunnelCenter.y * (-hit.z) / 2.0;

    // Surface coordinates
    float angle = atan(hit.y, hit.x);
    float depth = -hit.z;

    // Subtle twist — tunnel spirals slowly
    float twist = depth * 0.015 * (uMotionSpeed * 0.5 + 0.3);
    float ca = cos(twist);
    float sa = sin(twist);
    vec2 rotHit = vec2(hit.x * ca - hit.y * sa, hit.x * sa + hit.y * ca);
    angle = atan(rotHit.y, rotHit.x);

    // Infinite scroll
    float scrollSpeed = uMotionSpeed * 5.0 + 2.0;
    depth += uTime * scrollSpeed;

    // Symbol grid (sparser for more negative space)
    float cols = 28.0;
    float depthScale = 4.5;

    float u = (angle / 6.283185 + 0.5) * cols;
    float v = depth * depthScale;

    vec2 cellId = floor(vec2(u, v));
    vec2 cellUv = fract(vec2(u, v));

    // Per-cell random values
    float h = hash(cellId);
    float h2 = hash2(cellId);

    // Character selection — shifts over time, biased by depth
    float charShift = floor(uTime * 0.35 + h * 10.0);
    float depthFade = clamp(t * 0.04, 0.0, 1.0);
    float maxIdx = mix(5.0, 2.0, depthFade); // far = simpler chars
    int charIdx = int(mod(h * maxIdx + charShift, 5.0));

    // Blank out ~45% of cells for negative space
    float cellVisible = step(0.45, h);

    // Render symbol
    float sym = getChar(cellUv, charIdx) * cellVisible;

    // Progressive reveal — cells appear as uProgress ramps 0→1
    float revealThreshold = hash2(cellId * 1.7 + 0.5);
    float cellReveal = smoothstep(revealThreshold - 0.05, revealThreshold + 0.05, uProgress);
    sym *= cellReveal;

    // Cell borders — wider gaps between symbols
    float bx = smoothstep(0.0, 0.08, cellUv.x) * smoothstep(1.0, 0.92, cellUv.x);
    float by = smoothstep(0.0, 0.08, cellUv.y) * smoothstep(1.0, 0.92, cellUv.y);
    sym *= bx * by;

    // Depth fog — exponential falloff to black vanishing point
    float fog = exp(-t * t * 0.005);

    // Color — blend palette around circumference and along depth
    float cA = sin(angle * 2.0 + uTime * 0.3) * 0.5 + 0.5;
    float cD = sin(depth * 0.08 + uTime * 0.15) * 0.5 + 0.5;
    vec3 color = mix(uColor1, uColor2, cA);
    color = mix(color, uColor3, cD * 0.45);

    // Per-cell color variation
    color *= 0.82 + h2 * 0.36;

    // Beat — brightness pulse + random ring flash
    float beatGlow = 1.0 + uBeat * 0.9;
    float ringFlash = step(0.93, hash(vec2(cellId.y, floor(uTime * 2.5)))) * uBeat * 1.5;

    // Bloom brightness boost
    float bloomMult = 1.0 + uBloomIntensity * 0.35;

    vec3 finalColor = color * sym * fog * beatGlow * bloomMult;
    finalColor += color * ringFlash * fog * sym;

    // Subtle ambient tunnel glow
    finalColor += color * fog * 0.005;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export function setup(ctx: ModeContext, style: VisualStyle): ModeInstance {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uMotionSpeed: { value: style.motion_speed },
      uEnergy: { value: style.energy_level },
      uBloomIntensity: { value: style.bloom_intensity },
      uColor1: { value: new THREE.Color(style.color_palette[0]) },
      uColor2: { value: new THREE.Color(style.color_palette[1]) },
      uColor3: { value: new THREE.Color(style.color_palette[2]) },
      uResolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight),
      },
      uCursor: { value: new THREE.Vector2(0, 0) },
      uCursorActive: { value: 0.0 },
      uProgress: { value: 0.0 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  ctx.scene.add(mesh);

  const smoothCursor = new THREE.Vector2(0, 0);
  let smoothCursorActive = 0;

  return {
    animate({ beat, time, energy, style, cursor }) {
      const tx = cursor.active ? cursor.ndc.x : 0;
      const ty = cursor.active ? cursor.ndc.y : 0;
      smoothCursor.x = THREE.MathUtils.lerp(smoothCursor.x, tx, 0.05);
      smoothCursor.y = THREE.MathUtils.lerp(smoothCursor.y, ty, 0.05);
      smoothCursorActive = THREE.MathUtils.lerp(
        smoothCursorActive,
        cursor.active ? 1.0 : 0.0,
        0.08
      );

      material.uniforms.uTime.value = time;
      material.uniforms.uBeat.value = beat;
      material.uniforms.uProgress.value = Math.min(1, time / 20);
      material.uniforms.uMotionSpeed.value = style.motion_speed;
      material.uniforms.uEnergy.value = energy;
      material.uniforms.uBloomIntensity.value = style.bloom_intensity;
      material.uniforms.uColor1.value.set(style.color_palette[0]);
      material.uniforms.uColor2.value.set(style.color_palette[1]);
      material.uniforms.uColor3.value.set(style.color_palette[2]);
      material.uniforms.uCursor.value.set(smoothCursor.x, smoothCursor.y);
      material.uniforms.uCursorActive.value = smoothCursorActive;
      material.uniforms.uResolution.value.set(
        window.innerWidth,
        window.innerHeight
      );
    },
    dispose() {
      ctx.scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
