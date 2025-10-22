// src/terrain/tiles/ContinuousTileGeneration.ts
/**
 * Alternative approach: Generate one large continuous heightfield,
 * then extract tiles from it. This guarantees perfect continuity.
 */
import { HeightField } from "../HeightField";
import { generateTerrain } from "../TerrainPipeline";
import type { BiomeParams } from "../Biomes";
import type { WaterFeatures } from "../filters/WaterSystem";
import type { TileGridConfig, GeneratedGrid } from "./TileStreaming";

export interface ContinuousGrid extends GeneratedGrid {
  waterFeatures?: WaterFeatures;
}

export function generateContinuousTileGrid(cfg: TileGridConfig, biome: BiomeParams): ContinuousGrid {
  const { rows, cols, tileSize: N, overlap: O } = cfg;
  const inner = N - 2 * O;
  
  // Calculate total size needed for continuous generation
  const totalWidth = cols * inner + 2 * O;  // Add overlap on edges
  const totalHeight = rows * inner + 2 * O;
  
  console.log(`Generating continuous heightfield: ${totalWidth}x${totalHeight}`);
  
  // Generate one large continuous heightfield
  const terrainResult = generateTerrain({
    baseSize: cfg.baseSize ?? 64,
    steps: Math.ceil(Math.log2(Math.max(totalWidth, totalHeight) / (cfg.baseSize ?? 64))) + 1,
    seed: cfg.seed,
    biome: 'temperate' as any
  }, biome);
  
  // Resample to exact size we need
  const continuous = terrainResult.heightField.resampleTo(Math.max(totalWidth, totalHeight));
  
  // Extract tiles from the continuous field
  const tiles: HeightField[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = new HeightField(N);
      
      // Calculate source region in continuous field
      const srcX = c * inner;
      const srcY = r * inner;
      
      // Copy data from continuous field to tile
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const srcPixelX = srcX + x;
          const srcPixelY = srcY + y;
          const height = continuous.get(srcPixelX, srcPixelY);
          tile.set(x, y, height);
        }
      }
      
      tiles.push(tile);
    }
  }
  
  // Build atlas from extracted tiles
  const atlasW = cols * inner;
  const atlasH = rows * inner;
  const atlas = new Float32Array(atlasW * atlasH);
  
  // Write inner regions to atlas
  let tileIdx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = tiles[tileIdx++];
      const offX = c * inner;
      const offY = r * inner;
      
      for (let y = 0; y < inner; y++) {
        for (let x = 0; x < inner; x++) {
          const v = tile.get(x + O, y + O);
          const ai = (offY + y) * atlasW + (offX + x);
          atlas[ai] = v;
        }
      }
    }
  }
  
  // Generate UV rects
  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = (c * inner) / atlasW;
      const v0 = (r * inner) / atlasH;
      const u1 = ((c + 1) * inner) / atlasW;
      const v1 = ((r + 1) * inner) / atlasH;
      rects.push({ u0, v0, u1, v1 });
    }
  }
  
  console.log(`Continuous generation complete: ${tiles.length} tiles`);
  
  return {
    tiles,
    innerSize: inner,
    atlas,
    atlasSize: Math.max(atlasW, atlasH),
    rects,
    waterFeatures: terrainResult.waterFeatures
  };
}