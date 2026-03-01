import * as THREE from "three";
import { VisualStyle } from "@/types/spotify";
import { ModeContext, ModeInstance } from "./types";
import { applyFadeBehavior } from "./utils";

const vertexShader = `
  uniform float uTime;
  uniform float uBeat;
  uniform float uDistortion;
  uniform float uMotionSpeed;
  uniform vec2 uCursor;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  // Simplex-style noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
      val += amp * snoise(p * freq);
      freq *= 2.1;
      amp *= 0.48;
    }
    return val;
  }

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 pos = position;
    float r = length(pos);
    vec3 dir = normalize(pos);

    // Cursor offset shifts the noise field center
    vec3 noisePos = dir * 2.5 + vec3(uCursor * 0.5, 0.0);

    // Multi-octave displacement
    float speed = uMotionSpeed * 0.6 + 0.2;
    float n1 = fbm(noisePos + uTime * speed * 0.4);
    float n2 = snoise(noisePos * 3.0 + uTime * speed * 0.7) * 0.3;
    float n3 = snoise(noisePos * 6.0 - uTime * speed * 0.5) * 0.15;

    float totalNoise = n1 + n2 + n3;

    // Beat makes displacement spike dramatically
    float beatPush = uBeat * uBeat * 1.2;
    float disp = totalNoise * uDistortion * (0.4 + beatPush);

    pos = dir * (r + disp);
    vPosition = dir; // unit sphere position for color mapping
    vDisplacement = totalNoise;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uTime;
  uniform float uBeat;
  uniform float uFade;
  uniform float uMotionSpeed;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  // Simple noise for color flow
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    float speed = uMotionSpeed * 0.4 + 0.1;

    // Three noise fields flowing at different speeds/scales for color blending
    float n1 = snoise(vPosition * 2.0 + uTime * speed * 0.3) * 0.5 + 0.5;
    float n2 = snoise(vPosition * 3.5 - uTime * speed * 0.5 + 10.0) * 0.5 + 0.5;
    float n3 = snoise(vPosition * 1.5 + uTime * speed * 0.2 + 20.0) * 0.5 + 0.5;

    // Blend weights — all three colors always present, proportions shift
    float w1 = n1;
    float w2 = n2;
    float w3 = n3;
    float wTotal = w1 + w2 + w3;
    w1 /= wTotal;
    w2 /= wTotal;
    w3 /= wTotal;

    vec3 baseColor = uColor1 * w1 + uColor2 * w2 + uColor3 * w3;

    // Displacement-driven brightness variation
    float dispBright = 0.85 + vDisplacement * 0.3;

    // Fresnel rim glow — brighter at edges
    vec3 viewDir = normalize(cameraPosition - vPosition);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
    vec3 rimColor = mix(uColor2, uColor3, fresnel);

    // Emissive glow driven by fade behavior + beat
    float glow = uFade * (0.4 + uBeat * 0.6);

    vec3 color = baseColor * dispBright;
    color += rimColor * fresnel * 0.35;
    color += baseColor * glow * 0.25;

    // Beat flash — subtle so bloom stays under control
    color += uBeat * uBeat * 0.06;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const ORB_BASE_SCALE = 1.0;
const DRIFT_SPEED = 0.15;
const CAMERA_LERP = 0.018;

// Three separate orbital paths (drift-style). Each orb gets its own path; one has larger extent so it can leave view.
function orbPath(
  out: THREE.Vector3,
  t: number,
  phaseX: number,
  phaseY: number,
  phaseZ: number,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  freqX: number,
  freqY: number,
  freqZ: number
): void {
  out.x =
    Math.sin(t * freqX + phaseX) * radiusX +
    Math.sin(t * 0.07 + phaseX * 2) * radiusX * 0.4;
  out.y =
    Math.sin(t * freqY + phaseY) * radiusY +
    Math.sin(t * 0.11 + phaseY) * radiusY * 0.3;
  out.z =
    Math.sin(t * freqZ + phaseZ) * radiusZ +
    Math.sin(t * 0.13 + phaseZ * 1.5) * radiusZ * 0.35;
}

export function setup(ctx: ModeContext, style: VisualStyle): ModeInstance {
  const geometry = new THREE.IcosahedronGeometry(1.8, 6);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uDistortion: { value: style.distortion_strength },
      uMotionSpeed: { value: style.motion_speed },
      uCursor: { value: new THREE.Vector2(0, 0) },
      uColor1: { value: new THREE.Color(style.color_palette[0]) },
      uColor2: { value: new THREE.Color(style.color_palette[1]) },
      uColor3: { value: new THREE.Color(style.color_palette[2]) },
      uFade: { value: 0.5 },
    },
  });

  const mesh1 = new THREE.Mesh(geometry, material);
  const mesh2 = new THREE.Mesh(geometry, material);
  const mesh3 = new THREE.Mesh(geometry, material);
  ctx.scene.add(mesh1);
  ctx.scene.add(mesh2);
  ctx.scene.add(mesh3);

  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < 3; i++) {
    const light = new THREE.PointLight(
      new THREE.Color(style.color_palette[i]),
      2,
      18
    );
    const angle = (i * Math.PI * 2) / 3;
    light.position.set(Math.sin(angle) * 6, Math.cos(angle) * 5, 4);
    ctx.scene.add(light);
    lights.push(light);
  }

  const smoothCursor = new THREE.Vector2(0, 0);
  const cameraTarget = new THREE.Vector3(0, 0, 8);
  const cameraPosition = new THREE.Vector3(0, 0, 8);
  const lookAtTarget = new THREE.Vector3(0, 0, 0);
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const p3 = new THREE.Vector3();

  return {
    animate({ beat, time, energy, danceability, loudness, style, cursor }) {
      const s = (0.5 + style.motion_speed) * (0.7 + danceability * 0.5);
      const t = time * s * DRIFT_SPEED;

      const tx = cursor.active ? cursor.world.x : 0;
      const ty = cursor.active ? cursor.world.y : 0;
      smoothCursor.x = THREE.MathUtils.lerp(smoothCursor.x, tx, 0.05);
      smoothCursor.y = THREE.MathUtils.lerp(smoothCursor.y, ty, 0.05);

      // Orb 1: path near center, moderate extent
      orbPath(p1, t, 0, 0.5, 1, 2, 1.2, 2, 0.15, 0.12, 0.14);
      mesh1.position.copy(p1);

      // Orb 2: different phase and plane
      orbPath(p2, t, 2.1, 1.3, 0.7, 1.8, 1.5, 1.9, 0.11, 0.17, 0.09);
      mesh2.position.copy(p2);

      // Orb 3: larger radius and range — can drift out of view when camera is elsewhere
      orbPath(p3, t, 4, 2, 3, 3.2, 2.2, 3.5, 0.08, 0.06, 0.1);
      mesh3.position.copy(p3);

      const spinSpeed =
        THREE.MathUtils.lerp(0.0006, 0.005, danceability) * (0.5 + style.motion_speed);
      mesh1.rotation.x += spinSpeed + smoothCursor.y * 0.001;
      mesh1.rotation.y += spinSpeed * 0.7 + smoothCursor.x * 0.001;
      mesh2.rotation.x += spinSpeed * 0.9 - smoothCursor.y * 0.001;
      mesh2.rotation.y += spinSpeed * 0.6 - smoothCursor.x * 0.001;
      mesh3.rotation.x += spinSpeed * 0.85 + smoothCursor.y * 0.001;
      mesh3.rotation.y += spinSpeed * 0.55 - smoothCursor.x * 0.001;

      const scaleAmp =
        THREE.MathUtils.lerp(0.12, 0.5, energy) * style.energy_level;
      const scale = ORB_BASE_SCALE * (1 + beat * scaleAmp);
      mesh1.scale.setScalar(scale);
      mesh2.scale.setScalar(scale);
      mesh3.scale.setScalar(scale);

      material.uniforms.uTime.value = time;
      material.uniforms.uBeat.value = beat;
      material.uniforms.uDistortion.value =
        style.distortion_strength * (0.6 + energy * 0.8);
      material.uniforms.uMotionSpeed.value = style.motion_speed;
      material.uniforms.uCursor.value.set(smoothCursor.x, smoothCursor.y);
      material.uniforms.uColor1.value.set(style.color_palette[0]);
      material.uniforms.uColor2.value.set(style.color_palette[1]);
      material.uniforms.uColor3.value.set(style.color_palette[2]);
      material.uniforms.uFade.value = applyFadeBehavior(
        style.fade_behavior,
        beat,
        loudness,
        time
      );

      // Camera: drifts on its own path so it travels between the orbs; sometimes one orb is off-screen
      const ct = time * s * 0.2;
      cameraTarget.x =
        Math.sin(ct * 0.12) * 3.5 +
        Math.sin(ct * 0.07) * 1.8 +
        Math.sin(ct * 0.19) * 1;
      cameraTarget.y =
        Math.sin(ct * 0.09) * 1.8 +
        Math.sin(ct * 0.14) * 0.9;
      cameraTarget.z =
        7 +
        Math.sin(ct * 0.05) * 2.2 +
        Math.sin(ct * 0.11) * 1.2;
      cameraPosition.lerp(cameraTarget, CAMERA_LERP);
      ctx.camera.position.copy(cameraPosition);

      // Look at a point that drifts slowly between the orbs (center of mass with lag)
      lookAtTarget.x = (p1.x + p2.x + p3.x) / 3;
      lookAtTarget.y = (p1.y + p2.y + p3.y) / 3;
      lookAtTarget.z = (p1.z + p2.z + p3.z) / 3;
      ctx.camera.lookAt(lookAtTarget);
      ctx.camera.updateProjectionMatrix();

      lights.forEach((light, i) => {
        const angle = time * 0.25 * style.motion_speed + (i * Math.PI * 2) / 3;
        light.position.x = Math.sin(angle) * 6;
        light.position.y = Math.cos(angle) * 5;
        light.position.z = 4;
        light.intensity = 1.5 + beat * 2;
        light.color.set(style.color_palette[i]);
      });
    },
    dispose() {
      ctx.scene.remove(mesh1);
      ctx.scene.remove(mesh2);
      ctx.scene.remove(mesh3);
      geometry.dispose();
      material.dispose();
      lights.forEach((l) => ctx.scene.remove(l));
    },
  };
}
