// src/terrain/tiles/TileStreaming.ts
/**
 * Tile streaming with shared height atlas.
 * - Generates an MxK grid of height tiles.
 * - Each tile is generated at size N with overlap O on all sides.
 * - Atlas stores only the inner region [O .. N-O) per tile to avoid seams.
 * - World-coherent mapping aligns neighbors by the INNER size.
 */
import { HeightField } from "../HeightField";
import { levelSteps } from "../LevelStep";
import { applyFBM } from "../filters/FBMNoise";
import { applySlopeBlur } from "../filters/SlopeBlur";
import { applyRidgeSharpen } from "../filters/RidgeSharpen";
import { applyDunes } from "../filters/Dunes";
import type { BiomeParams } from "../Biomes";

export interface TileGridConfig {
  rows: number;          // tiles on Z
  cols: number;          // tiles on X
  tileSize: number;      // N (e.g. 512)
  overlap: number;       // O (e.g. 32)
  baseSize?: number;     // 64
  steps?: number;        // 4
  worldScale?: number;   // scale for continuous noise lattice
  seed: number;
  blendSeams?: boolean;  // optional averaging over O px at inner borders
}

export interface GeneratedGrid {
  tiles: HeightField[];        // length rows*cols
  innerSize: number;           // N - 2O
  atlas: Float32Array;         // (cols*inner) x (rows*inner)
  atlasSize: number;
  rects: { u0:number; v0:number; u1:number; v1:number; }[]; // per tile
}

function generateTile(
  r: number, c: number,
  cfg: TileGridConfig,
  biome: BiomeParams
): HeightField {
  const N = cfg.tileSize;
  const O = cfg.overlap;
  const inner = N - 2 * O;
  const S = cfg.worldScale ?? 1.0;

  console.log(`Generating tile (${r},${c}): inner=${inner}, overlap=${O}, size=${N}`);

  let h = new HeightField(N);
  const base = cfg.baseSize ?? 64;
  const steps = cfg.steps ?? 4;

  for (const size of levelSteps({ baseSize: base, steps })) {
    h = h.resampleTo(size);

    // Continuous mapping: align tiles on INNER grid
    console.log(`Applying FBM with seed=${cfg.seed}, globalU range: ${c}.000 to ${c+1}.000`);
    applyFBM(h, {
      amplitude: biome.fbm.amplitude / (1 + (cfg.tileSize - size) / 128),
      frequency: biome.fbm.frequency,
      octaves: biome.fbm.octaves,
      lacunarity: biome.fbm.lacunarity,
      gain: biome.fbm.gain,
      warp: biome.fbm.warp,
      seed: cfg.seed, // Use same seed for all tiles for continuity
      worldUV: (x, y) => {
        // Fixed coordinate mapping for perfect tile continuity
        // Map from tile-local coordinates to continuous world coordinates
        
        // For perfect continuity, adjacent tile edges must sample identical coordinates
        // Tile 0 right edge should equal Tile 1 left edge
        
        const localX = x - O;  // Remove overlap offset: 0 to inner-1
        const localY = y - O;
        
        // Map to continuous world space where each tile spans exactly 1.0 unit
        const globalU = (c + localX / (inner - 1)) * S;  // Use (inner-1) for endpoint mapping
        const globalV = (r + localY / (inner - 1)) * S;
        
        // Debug key coordinates
        if (y === Math.floor(N/2)) {
          if (x === O) console.log(`Tile(${r},${c}) LEFT: localX=${localX}, globalU=${globalU.toFixed(6)}`);
          if (x === N-1-O) console.log(`Tile(${r},${c}) RIGHT: localX=${localX}, globalU=${globalU.toFixed(6)}`);
        }
        
        return { u: globalU, v: globalV };
      }
    });

    applySlopeBlur(h, biome.slopeBlur);
    if (biome.dunes && size >= 256) applyDunes(h, biome.dunes);
  }

  applyRidgeSharpen(h, biome.ridgeSharpen);

  // Debug: sample border height values
  const midY = Math.floor(N/2);
  console.log(`Tile(${r},${c}) left border (x=${O}): height=${h.get(O, midY).toFixed(3)}`);
  console.log(`Tile(${r},${c}) right border (x=${N-1-O}): height=${h.get(N-1-O, midY).toFixed(3)}`);

  // DON'T normalize individual tiles - this breaks continuity!
  // normalize 0..1
  // let min = Infinity, max = -Infinity;
  // for (const v of h.data) { if (v < min) min = v; if (v > max) max = v; }
  // const spanH = max - min || 1;
  // for (let i = 0; i < h.data.length; i++) h.data[i] = (h.data[i] - min) / spanH;

  return h;
}

/**
 * Build atlas and UV rects. Writes only each tile's inner region.
 * Optional seam blending averages inner border rings with neighbors over O pixels.
 */
export function generateTileGrid(cfg: TileGridConfig, biome: BiomeParams): GeneratedGrid {
  const { rows, cols, tileSize: N, overlap: O } = cfg;
  if (O <= 0 || O * 2 >= N) throw new Error("overlap must be >0 and < N/2");

  const inner = N - 2 * O;
  const atlasW = cols * inner;
  const atlasH = rows * inner;
  const atlas = new Float32Array(atlasW * atlasH);
  const tiles: HeightField[] = [];

  // generate tiles
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push(generateTile(r, c, cfg, biome));
    }
  }

  // Global normalization across ALL tiles to maintain continuity
  let globalMin = Infinity, globalMax = -Infinity;
  for (const tile of tiles) {
    for (const v of tile.data) {
      if (v < globalMin) globalMin = v;
      if (v > globalMax) globalMax = v;
    }
  }
  const globalSpan = globalMax - globalMin || 1;
  console.log(`Global height range: ${globalMin.toFixed(3)} to ${globalMax.toFixed(3)}`);
  
  // Apply global normalization to all tiles
  for (const tile of tiles) {
    for (let i = 0; i < tile.data.length; i++) {
      tile.data[i] = (tile.data[i] - globalMin) / globalSpan;
    }
  }

  // optional seam blend across neighbor inner borders
  if (cfg.blendSeams) {
    // horizontal seams
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const A = tiles[r * cols + c];
        const B = tiles[r * cols + c + 1];
        for (let y = 0; y < inner; y++) {
          for (let k = 0; k < O; k++) {
            const wA = 1 - k / (O - 1);
            const wB = 1 - wA;
            const aVal = A.get(O + inner - O + k, y + O);
            const bVal = B.get(O - 1 - k + inner, y + O);
            const vMix = aVal * wA + bVal * wB;
            A.set(O + inner - 1 - k, y + O, vMix);
            B.set(O + k,            y + O, vMix);
          }
        }
      }
    }
    // vertical seams
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const A = tiles[r * cols + c];
        const B = tiles[(r + 1) * cols + c];
        for (let x = 0; x < inner; x++) {
          for (let k = 0; k < O; k++) {
            const wA = 1 - k / (O - 1);
            const wB = 1 - wA;
            const aVal = A.get(x + O, O + inner - O + k);
            const bVal = B.get(x + O, O - 1 - k + inner);
            const vMix = aVal * wA + bVal * wB;
            A.set(x + O, O + inner - 1 - k, vMix);
            B.set(x + O, O + k,             vMix);
          }
        }
      }
    }
  }

  // write inner regions to atlas
  const writeInner = (tile: HeightField, r: number, c: number) => {
    const offX = c * inner;
    const offY = r * inner;
    for (let y = 0; y < inner; y++) {
      for (let x = 0; x < inner; x++) {
        const v = tile.get(x + O, y + O);
        const ai = (offY + y) * atlasW + (offX + x);
        atlas[ai] = v;
      }
    }
  };
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      writeInner(tiles[i++], r, c);
    }
  }

  // per-tile rects in atlas (no flip; handled in shader)
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

  return {
    tiles,
    innerSize: inner,
    atlas,
    atlasSize: Math.max(atlasW, atlasH),
    rects
  };
}
