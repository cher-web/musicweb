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
  uniform float uTime;
  uniform float uBeat;
  uniform float uEnergy;
  uniform float uDistortion;
  uniform float uMotionSpeed;
  uniform float uPixelSize;
  uniform vec2 uResolution;
  uniform vec2 uCursor;
  uniform float uCursorActive;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  uniform vec3 uColor5;
  uniform float uProgress;
  varying vec2 vUv;

  // Simplex-style noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Fractional Brownian Motion
  float fbm(vec2 p, float turbulence) {
    float f = 0.0;
    float w = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
      f += w * snoise(p * freq);
      freq *= 2.0 + turbulence * 0.3;
      w *= 0.5;
    }
    return f;
  }

  // Curl-like displacement
  vec2 curl(vec2 p, float t) {
    float eps = 0.01;
    float n1 = snoise(p + vec2(eps, 0.0) + t);
    float n2 = snoise(p - vec2(eps, 0.0) + t);
    float n3 = snoise(p + vec2(0.0, eps) + t);
    float n4 = snoise(p - vec2(0.0, eps) + t);
    return vec2((n3 - n4), -(n1 - n2)) / (2.0 * eps);
  }

  void main() {
    // Pixelation: snap UV to low-res grid (larger cells = calmer look)
    float pixelScale = uPixelSize * (1.0 + uDistortion * 1.2);
    vec2 pixelCount = uResolution / max(pixelScale, 1.0);
    vec2 uv = floor(vUv * pixelCount) / pixelCount;

    float speed = uMotionSpeed * 0.8 + 0.2;
    float t = uTime * speed;

    // Curl field displacement (lower scale = larger, calmer swirls), scaled by progress
    vec2 curlOffset = curl(uv * 0.8, t * 0.2) * 0.25 * uDistortion * uProgress;
    vec2 p = uv + curlOffset;

    // Layered noise for blob field (lower freq = larger color regions)
    float n1 = fbm(p * 1.2 + t * 0.15, uDistortion * 0.6) * uProgress;
    float n2 = fbm(p * 2.0 - t * 0.1 + 7.0, uDistortion * 0.6) * uProgress;
    float n3 = snoise(p * 0.6 + t * 0.08 + vec2(3.0, 7.0)) * uProgress;

    // Reaction-diffusion inspired blending; wider range = smoother bands
    float field = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
    field = smoothstep(-0.4, 0.6, field);

    // Beat energy burst: lower freq so it doesn't add fine grain
    float beatPulse = uBeat * uEnergy;
    field += beatPulse * 0.15 * snoise(p * 3.0 + t * 1.5);
    field = clamp(field, 0.0, 1.0);

    // Cursor heat injection
    if (uCursorActive > 0.5) {
      vec2 cursorUV = uCursor * 0.5 + 0.5; // NDC to UV
      float dist = length(uv - cursorUV);
      // Expanding ripple
      float ripple = sin(dist * 20.0 - uTime * 4.0) * 0.5 + 0.5;
      float heat = exp(-dist * dist * 12.0) * ripple;
      field += heat * 0.4;
      field = clamp(field, 0.0, 1.0);
    }

    // 5-color gradient mapping
    vec3 color;
    if (field < 0.25) {
      color = mix(uColor1, uColor2, field / 0.25);
    } else if (field < 0.5) {
      color = mix(uColor2, uColor3, (field - 0.25) / 0.25);
    } else if (field < 0.75) {
      color = mix(uColor3, uColor4, (field - 0.5) / 0.25);
    } else {
      color = mix(uColor4, uColor5, (field - 0.75) / 0.25);
    }

    // Beat flash: spike color temperature
    color += beatPulse * 0.15;

    // Subtle vignette
    vec2 center = vUv - 0.5;
    float vignette = 1.0 - dot(center, center) * 0.8;
    color *= vignette;

    gl_FragColor = vec4(color, 1.0);
  }
`;

function deriveColors(palette: [string, string, string]) {
  const c1 = new THREE.Color(palette[0]);
  const c2 = new THREE.Color(palette[1]);
  const c3 = new THREE.Color(palette[2]);
  // Derive 2 extra colors: darker version of c1, brighter blend of c2+c3
  const c0 = c1.clone().multiplyScalar(0.3);
  const c4 = c2.clone().lerp(c3, 0.5).multiplyScalar(1.4);
  return [c0, c1, c2, c3, c4];
}

export function setup(ctx: ModeContext, style: VisualStyle): ModeInstance {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const [c0, c1, c2, c3, c4] = deriveColors(style.color_palette);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uEnergy: { value: style.energy_level },
      uDistortion: { value: style.distortion_strength },
      uMotionSpeed: { value: style.motion_speed },
      uPixelSize: { value: THREE.MathUtils.lerp(14, 55, style.distortion_strength) },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uCursor: { value: new THREE.Vector2(0, 0) },
      uCursorActive: { value: 0 },
      uProgress: { value: 0.0 },
      uColor1: { value: c0 },
      uColor2: { value: c1 },
      uColor3: { value: c2 },
      uColor4: { value: c3 },
      uColor5: { value: c4 },
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
    animate({ beat, time, style, cursor }) {
      // Smooth cursor
      const tx = cursor.active ? cursor.ndc.x : smoothCursor.x;
      const ty = cursor.active ? cursor.ndc.y : smoothCursor.y;
      smoothCursor.x = THREE.MathUtils.lerp(smoothCursor.x, tx, 0.08);
      smoothCursor.y = THREE.MathUtils.lerp(smoothCursor.y, ty, 0.08);
      smoothCursorActive = THREE.MathUtils.lerp(
        smoothCursorActive,
        cursor.active ? 1 : 0,
        0.05
      );

      // Update colors from style
      const [nc0, nc1, nc2, nc3, nc4] = deriveColors(style.color_palette);

      material.uniforms.uTime.value = time;
      material.uniforms.uBeat.value = beat;
      material.uniforms.uProgress.value = Math.min(1, time / 20);
      material.uniforms.uEnergy.value = style.energy_level;
      material.uniforms.uDistortion.value = style.distortion_strength;
      material.uniforms.uMotionSpeed.value = style.motion_speed;
      material.uniforms.uPixelSize.value = THREE.MathUtils.lerp(
        14, 55, style.distortion_strength
      );
      material.uniforms.uCursor.value.set(smoothCursor.x, smoothCursor.y);
      material.uniforms.uCursorActive.value = smoothCursorActive;
      material.uniforms.uColor1.value.copy(nc0);
      material.uniforms.uColor2.value.copy(nc1);
      material.uniforms.uColor3.value.copy(nc2);
      material.uniforms.uColor4.value.copy(nc3);
      material.uniforms.uColor5.value.copy(nc4);
    },
    dispose() {
      ctx.scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
