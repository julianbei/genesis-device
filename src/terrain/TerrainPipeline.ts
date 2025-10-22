import { HeightField } from './HeightField';
import { levelSteps } from './LevelStep';
import { applyFBM } from './filters/FBMNoise';
import { applySlopeBlur } from './filters/SlopeBlur';
import { applyRidgeSharpen } from './filters/RidgeSharpen';
import { applyDunes } from './filters/Dunes';
import { applyGeologicalErosion, ErosionParams, GeologicalResult } from './filters/GeologicalErosion';
import type { Biome, BiomeParams } from './Biomes';

export interface PipelineOptions {
  biome: Biome;
  seed: number;
  baseSize?: number; // 64
  steps?: number;    // 4 -> 512
  seaLevel?: number; // Sea level in meters
  erosionYears?: number; // Erosion time in years
}

export interface TerrainResult {
  heightField: HeightField;
  waterFeatures?: any; // Keep for compatibility
  geologicalResult?: GeologicalResult;
}

export function generateTerrain(opts: PipelineOptions, biomeParams: BiomeParams): TerrainResult {
  const base = opts.baseSize ?? 64;
  const steps = opts.steps ?? 4;
  const seaLevel = opts.seaLevel ?? 23; // Default +23m
  const erosionYears = opts.erosionYears ?? 2500; // Default 2500 years
  
  console.log(`Generating base terrain...`);
  
  // STEP 1: Generate base terrain (geological formation)
  let h = new HeightField(base);
  for (const size of levelSteps({ baseSize: base, steps })) {
    // resample current field to new level
    h = h.resampleTo(size);
    // apply filters at this level
    applyFBM(h, { ...biomeParams.fbm, amplitude: biomeParams.fbm.amplitude / (1 + (512 - size)/128), seed: opts.seed });
    applySlopeBlur(h, biomeParams.slopeBlur);
    if (biomeParams.dunes && size >= 256) applyDunes(h, biomeParams.dunes);
  }
  applyRidgeSharpen(h, biomeParams.ridgeSharpen);
  
  console.log(`Base terrain generated, applying ${erosionYears} years of erosion...`);
  
  // STEP 2: Apply geological erosion processes
  const erosionParams: ErosionParams = {
    timeYears: erosionYears,
    seaLevel: seaLevel,
    windStrength: biomeParams.fbm.amplitude * 0.5, // Base wind on terrain roughness
    rainIntensity: 1.0, // Standard rainfall
    temperatureCycles: opts.biome === 'alpine' ? 50 : opts.biome === 'desert' ? 10 : 25 // Climate-dependent
  };
  
  const geologicalResult = applyGeologicalErosion(h, erosionParams);
  
  // DON'T normalize here - will be done globally
  return {
    heightField: h,
    waterFeatures: geologicalResult.waterFeatures, // For compatibility
    geologicalResult
  };
}
