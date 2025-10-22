export type Biome = 'desert'|'alpine'|'temperate';

export interface BiomeParams {
  fbm: { amplitude:number; frequency:number; octaves:number; lacunarity:number; gain:number; warp:number; };
  slopeBlur: { radius:number; k:number; iterations:number; };
  ridgeSharpen: number;
  dunes?: { scale:number; amplitude:number; direction:number };
  heightScale: number; // meters displayed per unit
}

export const BIOMES: Record<Biome, BiomeParams> = {
  desert: {
    fbm: { amplitude: 0.15, frequency: 2.0, octaves: 5, lacunarity: 2.0, gain: 0.5, warp: 0.15 },
    slopeBlur: { radius: 2, k: 0.6, iterations: 2 },
    ridgeSharpen: 0.2,
    dunes: { scale: 16, amplitude: 0.03, direction: Math.PI*0.25 },
    heightScale: 600
  },
  alpine: {
    fbm: { amplitude: 0.35, frequency: 1.3, octaves: 6, lacunarity: 2.0, gain: 0.5, warp: 0.12 },
    slopeBlur: { radius: 1, k: 0.2, iterations: 1 },
    ridgeSharpen: 0.6,
    heightScale: 1800
  },
  temperate: {
    fbm: { amplitude: 0.22, frequency: 1.6, octaves: 5, lacunarity: 2.0, gain: 0.5, warp: 0.1 },
    slopeBlur: { radius: 2, k: 0.4, iterations: 2 },
    ridgeSharpen: 0.35,
    heightScale: 900
  }
};
