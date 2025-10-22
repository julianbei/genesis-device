// src/terrain/filters/FBMNoise.ts
// World-coherent FBM with optional worldUV mapping per sample.
export interface FBMParams {
  amplitude: number;
  frequency: number;
  octaves: number;
  lacunarity: number;
  gain: number;
  warp: number;
  seed: number;
  worldUV?: (x: number, y: number, size: number) => { u: number; v: number };
}

function hash(n: number): number {
  // More deterministic hash - round input to avoid precision issues
  const rounded = Math.round(n * 1000000) / 1000000;
  const x = Math.sin(rounded) * 43758.5453123;
  return x - Math.floor(x);
}

function valueNoise2D(x: number, y: number): number {
  // Round coordinates to ensure identical sampling at tile borders
  const px = Math.round(x * 1000000) / 1000000;
  const py = Math.round(y * 1000000) / 1000000;
  
  const xi = Math.floor(px), yi = Math.floor(py);
  const xf = px - xi, yf = py - yi;
  const h = (i: number, j: number) => hash((xi + i) * 15731.0 + (yi + j) * 789221.0);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h(0, 0), b = h(1, 0), c = h(0, 1), d = h(1, 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function applyFBM(height: import('../HeightField').HeightField, p: FBMParams) {
  const N = height.size;
  const { amplitude, frequency, octaves, lacunarity, gain, warp, seed, worldUV } = p;
  
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let u: number, v: number;
      if (worldUV) {
        const w = worldUV(x, y, N);
        u = w.u; v = w.v;
      } else {
        u = x / N; v = y / N;
      }
      // domain warp in world space
      const wx = valueNoise2D((u + seed) * 8.123, (v - seed) * 7.321) * warp;
      const wy = valueNoise2D((u - seed) * 5.551, (v + seed) * 9.173) * warp;
      let amp = 1, freq = frequency, sum = 0;
      for (let o = 0; o < octaves; o++) {
        sum += valueNoise2D((u + wx) * freq + seed * 1.7, (v + wy) * freq - seed * 2.1) * amp;
        freq *= lacunarity;
        amp *= gain;
      }
      height.set(x, y, height.get(x, y) + (sum * 2 - 1) * amplitude);
    }
  }
}
