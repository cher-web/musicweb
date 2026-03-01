"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { AudioFeatures, VisualStyle, VisualMode } from "@/types/spotify";
import { useBeatEngine } from "@/hooks/useBeatEngine";
import { createMode } from "./visualizers";
import { getCameraPosition } from "./visualizers/utils";
import { ModeInstance } from "./visualizers/types";

interface Props {
  getPosition: () => number;
  audioFeatures: AudioFeatures | null;
  visualStyle: VisualStyle;
  trackName: string;
  artistName: string;
  onBack: () => void;
}

function normalizeLoudness(loudness: number): number {
  return Math.max(0, Math.min(1, (loudness + 60) / 60));
}

export default function Visualizer({
  getPosition,
  audioFeatures,
  visualStyle,
  trackName,
  artistName,
  onBack,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<AudioFeatures | null>(null);
  const styleRef = useRef<VisualStyle>(visualStyle);
  const cursorRef = useRef({
    ndc: { x: 0, y: 0 },
    world: { x: 0, y: 0, z: 0 },
    active: false,
  });
  const { getBeatIntensity } = useBeatEngine();

  useEffect(() => {
    featuresRef.current = audioFeatures;
  }, [audioFeatures]);

  useEffect(() => {
    styleRef.current = visualStyle;
  }, [visualStyle]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const style = styleRef.current;

    // --- Scene ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(style.background_color);

    // --- Camera ---
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 3;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // --- Mouse tracking ---
    const raycaster = new THREE.Raycaster();
    const ndcVec = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectPoint = new THREE.Vector3();

    const handleMouseMove = (e: MouseEvent) => {
      ndcVec.x = (e.clientX / window.innerWidth) * 2 - 1;
      ndcVec.y = -(e.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(ndcVec, camera);
      raycaster.ray.intersectPlane(groundPlane, intersectPoint);

      cursorRef.current.ndc.x = ndcVec.x;
      cursorRef.current.ndc.y = ndcVec.y;
      cursorRef.current.world.x = intersectPoint.x;
      cursorRef.current.world.y = intersectPoint.y;
      cursorRef.current.world.z = intersectPoint.z;
      cursorRef.current.active = true;
    };

    const handleMouseLeave = () => {
      cursorRef.current.active = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    // --- Base lighting ---
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    // --- Postprocessing ---
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      style.bloom_intensity * 1.2, // 0-1 scaled; kept mild so bloom isn't overwhelming
      0.4,
      0.85
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    // --- Visual mode (LLM-chosen per song) ---
    const ctx = { scene, camera, renderer };
    let mode: ModeInstance | null = null;
    try {
      mode = createMode(style.mode, ctx, style);
    } catch (e) {
      console.error("Failed to create visual mode, falling back:", e);
      mode = createMode(VisualMode.GLITCH_GRID, ctx, style);
    }

    // --- Animation loop ---
    const startTime = performance.now();
    let animationId: number;

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      const features = featuresRef.current;
      const currentStyle = styleRef.current;
      const valence = features?.valence ?? 0.5;
      const energy = features?.energy ?? 0.5;
      const danceability = features?.danceability ?? 0.5;
      const tempo = features?.tempo ?? 120;
      const loudness = normalizeLoudness(features?.loudness ?? -20);

      const positionMs = getPosition();
      const beat = getBeatIntensity(tempo, positionMs);
      const time = (performance.now() - startTime) / 1000;

      // Update bloom
      bloomPass.strength = currentStyle.bloom_intensity * 1.2;

      // Update background
      scene.background = new THREE.Color(currentStyle.background_color);

      // Camera movement (LLM-determined, applies to all modes)
      const camPos = getCameraPosition(
        currentStyle.camera_movement,
        time,
        currentStyle.motion_speed
      );
      camera.position.set(camPos.x, camPos.y, camPos.z);
      camera.lookAt(0, 0, 0);

      // Animate mode
      if (mode) {
        mode.animate({
          beat,
          time,
          energy,
          valence,
          danceability,
          tempo,
          loudness,
          style: currentStyle,
          cursor: cursorRef.current,
        });
      }

      composer.render();
    };

    animate();

    // --- Resize ---
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      if (mode) {
        mode.dispose();
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [getPosition, getBeatIntensity, trackName]);

  return (
    <div className="fixed inset-0 z-50">
      <div
        ref={containerRef}
        className="w-full h-full"
      />

      {/* Track info overlay */}
      <div className="absolute bottom-6 left-6 text-white/80">
        <p className="text-lg font-semibold">{trackName}</p>
        <p className="text-sm text-white/50">{artistName}</p>
        <p className="text-xs text-white/30 mt-1">
          {visualStyle.mood_description}
        </p>
      </div>

      <button
        onClick={onBack}
        className="absolute top-6 left-6 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-sm transition"
      >
        &larr; Back
      </button>
    </div>
  );
}
