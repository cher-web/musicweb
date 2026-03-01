import * as THREE from "three";
import { VisualStyle } from "@/types/spotify";

export interface ModeContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export interface ModeInstance {
  animate: (params: AnimateParams) => void;
  dispose: () => void;
}

export interface CursorData {
  ndc: { x: number; y: number };
  world: { x: number; y: number; z: number };
  active: boolean;
}

export interface AnimateParams {
  beat: number;
  time: number;
  energy: number;
  valence: number;
  danceability: number;
  tempo: number;
  loudness: number;
  style: VisualStyle;
  cursor: CursorData;
}
