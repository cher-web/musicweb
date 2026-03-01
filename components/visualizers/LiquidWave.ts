import * as THREE from "three";
import { VisualStyle } from "@/types/spotify";
import { ModeContext, ModeInstance } from "./types";

const vertexShader = `
  uniform float uTime;
  uniform float uBeat;
  uniform float uDistortion;
  uniform float uMotionSpeed;
  uniform float uProgress;
  uniform vec2 uCursor;
  varying float vHeight;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    vec2 waveOrigin = pos.xy - uCursor * 2.0;

    float speed = uMotionSpeed * 2.0 + 0.5;
    float wave1 = sin(waveOrigin.x * 2.0 + uTime * speed * 1.5) * 0.35;
    float wave2 = cos(waveOrigin.y * 3.0 + uTime * speed * 1.2) * 0.25;
    float wave3 = sin((waveOrigin.x + waveOrigin.y) * 1.5 + uTime * speed * 2.0) * 0.2;
    float wave4 = cos(waveOrigin.x * 4.0 - waveOrigin.y * 2.0 + uTime * speed * 0.8) * 0.1;

    float displacement = (wave1 + wave2 + wave3 + wave4) * uDistortion * (0.6 + uBeat * 0.8) * uProgress;
    pos.z += displacement;
    vHeight = displacement;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uBeat;
  uniform float uTime;
  uniform float uProgress;
  varying float vHeight;
  varying vec2 vUv;

  void main() {
    float t = smoothstep(-0.6, 0.6, vHeight);
    vec3 color = mix(uColor1, uColor2, t);
    color = mix(color, uColor3, smoothstep(0.3, 0.8, t));

    // Subtle shimmer
    float shimmer = sin(vUv.x * 20.0 + uTime * 3.0) * cos(vUv.y * 20.0 + uTime * 2.0) * 0.05;
    color += shimmer;

    // Beat glow
    color += uBeat * 0.15;

    // Progressive fade-in
    color *= uProgress;

    gl_FragColor = vec4(color, 0.92 * uProgress);
  }
`;

export function setup(ctx: ModeContext, style: VisualStyle): ModeInstance {
  const geometry = new THREE.PlaneGeometry(7, 7, 128, 128);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uDistortion: { value: style.distortion_strength },
      uMotionSpeed: { value: style.motion_speed },
      uProgress: { value: 0.0 },
      uCursor: { value: new THREE.Vector2(0, 0) },
      uColor1: { value: new THREE.Color(style.color_palette[0]) },
      uColor2: { value: new THREE.Color(style.color_palette[1]) },
      uColor3: { value: new THREE.Color(style.color_palette[2]) },
    },
    transparent: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI * 0.35;
  mesh.position.y = -0.5;
  ctx.scene.add(mesh);

  // Add a subtle point light above the wave
  const light = new THREE.PointLight(
    new THREE.Color(style.color_palette[1]),
    2,
    12
  );
  light.position.set(0, 3, 2);
  ctx.scene.add(light);

  const smoothCursor = new THREE.Vector2(0, 0);

  return {
    animate({ beat, time, style, cursor }) {
      // Smooth lerp cursor for shader (NDC maps well to plane space)
      const tx = cursor.active ? cursor.ndc.x : 0;
      const ty = cursor.active ? cursor.ndc.y : 0;
      smoothCursor.x = THREE.MathUtils.lerp(smoothCursor.x, tx, 0.06);
      smoothCursor.y = THREE.MathUtils.lerp(smoothCursor.y, ty, 0.06);

      material.uniforms.uTime.value = time;
      material.uniforms.uBeat.value = beat;
      material.uniforms.uProgress.value = Math.min(1, time / 20);
      material.uniforms.uDistortion.value = style.distortion_strength;
      material.uniforms.uMotionSpeed.value = style.motion_speed;
      material.uniforms.uCursor.value.set(smoothCursor.x, smoothCursor.y);
      material.uniforms.uColor1.value.set(style.color_palette[0]);
      material.uniforms.uColor2.value.set(style.color_palette[1]);
      material.uniforms.uColor3.value.set(style.color_palette[2]);

      // Gentle tilt based on motion
      mesh.rotation.z = Math.sin(time * 0.2) * 0.05;

      // Light follows wave peak
      light.position.x = Math.sin(time * 0.5) * 2;
      light.intensity = 1.5 + beat * 1.5;
    },
    dispose() {
      ctx.scene.remove(mesh);
      ctx.scene.remove(light);
      geometry.dispose();
      material.dispose();
    },
  };
}
