import { HeightField } from './HeightField';
import { levelSteps } from './LevelStep';
import { applyFBM } from './filters/FBMNoise';
import { applySlopeBlur } from './filters/SlopeBlur';
import { applyRidgeSharpen } from './filters/RidgeSharpen';
import { applyDunes } from './filters/Dunes';
import { applyWaterSystem, WaterFeatures } from './filters/WaterSystem';
import type { Biome, BiomeParams } from './Biomes';

export interface PipelineOptions {
  biome: Biome;
  seed: number;
  baseSize?: number; // 64
  steps?: number;    // 4 -> 512
}

export interface TerrainResult {
  heightField: HeightField;
  waterFeatures?: WaterFeatures;
}

export function generateTerrain(opts: PipelineOptions, biomeParams: BiomeParams): TerrainResult {
  const base = opts.baseSize ?? 64;
  const steps = opts.steps ?? 4;
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
  
  // Apply water system if configured
  let waterFeatures: WaterFeatures | undefined;
  if (biomeParams.water) {
    waterFeatures = applyWaterSystem(h, biomeParams.water);
  }
  
  // DON'T normalize here - will be done globally
  return {
    heightField: h,
    waterFeatures
  };
}
