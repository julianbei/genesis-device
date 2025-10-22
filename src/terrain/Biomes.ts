export type Biome = 'desert'|'alpine'|'temperate';

export interface BiomeParams {
  fbm: { amplitude:number; frequency:number; octaves:number; lacunarity:number; gain:number; warp:number; };
  slopeBlur: { radius:number; k:number; iterations:number; };
  ridgeSharpen: number;
  dunes?: { scale:number; amplitude:number; direction:number };
  heightScale: number; // meters displayed per unit
  water?: {
    seaLevel: number;        // Zero point for water level (relative to terrain)
    riverThreshold: number;  // Minimum flow accumulation to form rivers (0-1)
    riverWidth: number;      // Width of carved river channels (pixels)
    riverDepth: number;      // How deep rivers carve (relative to height)
    coastalErosion: number;  // How much beaches erode inland (relative to height)
    beachWidth: number;      // Width of beach/coastal zone (pixels)
  };
}

export const BIOMES: Record<Biome, BiomeParams> = {
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
      riverDepth: 0.03,  // Reduced from 0.08
      coastalErosion: 0.05,
      beachWidth: 8
    }
  },
  alpine: {
    fbm: { amplitude: 0.35, frequency: 1.3, octaves: 6, lacunarity: 2.0, gain: 0.5, warp: 0.12 },
    slopeBlur: { radius: 1, k: 0.2, iterations: 1 },
    ridgeSharpen: 0.6,
    heightScale: 1800,
    water: {
      seaLevel: 0.05,
      riverThreshold: 0.15,
      riverWidth: 1.5,
      riverDepth: 0.04,  // Reduced from 0.12
      coastalErosion: 0.03,
      beachWidth: 6
    }
  },
  temperate: {
    fbm: { amplitude: 0.22, frequency: 1.6, octaves: 5, lacunarity: 2.0, gain: 0.5, warp: 0.1 },
    slopeBlur: { radius: 2, k: 0.4, iterations: 2 },
    ridgeSharpen: 0.35,
    heightScale: 900,
    water: {
      seaLevel: 0.08,
      riverThreshold: 0.12,
      riverWidth: 3,
      riverDepth: 0.025, // Reduced from 0.1
      coastalErosion: 0.04,
      beachWidth: 10
    }
  }
};
