// src/terrain/types.ts
// Type definitions for terrain generation (implementation now in WASM)

import { HeightField } from './HeightField';

export interface WaterFeatures {
  waterMask: Float32Array;
  riverMask: Float32Array;
  beachMask: Float32Array;
  flowAccumulation: Float32Array;
}

export interface ContinuousGrid {
  tiles: HeightField[];
  innerSize: number;
  atlas: Float32Array;
  atlasSize: number;
  rects: Array<{u0: number; v0: number; u1: number; v1: number}>;
  waterFeatures?: WaterFeatures;
  geologicalResult?: {
    waterFeatures?: WaterFeatures;
  };
}

export interface BiomeParams {
  fbm: { 
    amplitude: number; 
    frequency: number; 
    octaves: number; 
    lacunarity: number; 
    gain: number; 
    warp: number; 
  };
  heightScale: number;
  slopeBlur: { 
    radius: number; 
    k: number; 
    iterations: number; 
  };
  ridgeSharpen: number;
  dunes?: { 
    scale: number; 
    amplitude: number; 
    direction: number 
  };
  water?: {
    seaLevel: number;
    riverThreshold: number;
    riverWidth: number;
    riverDepth: number;
    coastalErosion: number;
    beachWidth: number;
  };
}

export const BIOMES = {
  desert: {
    fbm: { amplitude: 0.15, frequency: 2.0, octaves: 5, lacunarity: 2.0, gain: 0.5, warp: 0.15 },
    slopeBlur: { radius: 2, k: 0.6, iterations: 2 },
    ridgeSharpen: 0.2,
    dunes: { scale: 16, amplitude: 0.03, direction: Math.PI*0.25 },
    heightScale: 600,
    water: {
      seaLevel: 0.1,
      riverThreshold: 0.2,
      riverWidth: 2,
      riverDepth: 0.03,
      coastalErosion: 0.05,
      beachWidth: 8
    }
  } as BiomeParams,
  
  alpine: {
    fbm: { amplitude: 0.35, frequency: 1.3, octaves: 6, lacunarity: 2.0, gain: 0.5, warp: 0.12 },
    slopeBlur: { radius: 1, k: 0.2, iterations: 1 },
    ridgeSharpen: 0.6,
    heightScale: 1800,
    water: {
      seaLevel: 0.05,
      riverThreshold: 0.15,
      riverWidth: 1.5,
      riverDepth: 0.04,
      coastalErosion: 0.03,
      beachWidth: 6
    }
  } as BiomeParams,
  
  temperate: {
    fbm: { amplitude: 0.22, frequency: 1.6, octaves: 5, lacunarity: 2.0, gain: 0.5, warp: 0.1 },
    slopeBlur: { radius: 2, k: 0.4, iterations: 2 },
    ridgeSharpen: 0.35,
    heightScale: 900,
    water: {
      seaLevel: 0.08,
      riverThreshold: 0.12,
      riverWidth: 3,
      riverDepth: 0.025,
      coastalErosion: 0.04,
      beachWidth: 10
    }
  } as BiomeParams
};