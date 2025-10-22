// Cheap erosion-like smoothing stronger on gentle slopes, weaker on steep slopes.
import { HeightField } from '../HeightField';

export interface SlopeBlurParams {
  radius: number;       // pixels at current level
  k: number;            // slope sensitivity 0..1
  iterations: number;   // 1..5
}

export function applySlopeBlur(h: HeightField, p: SlopeBlurParams) {
  const N = h.size;
  const tmp = new Float32Array(N * N);
  const idx = (x:number,y:number)=> y*N+x;

  const slopeAt = (x:number,y:number): number => {
    const c = h.get(x,y);
    const dx = (h.get(x+1,y) - h.get(x-1,y)) * 0.5;
    const dy = (h.get(x,y+1) - h.get(x,y-1)) * 0.5;
    return Math.sqrt(dx*dx + dy*dy);
  };

  for (let it = 0; it < p.iterations; it++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const s = slopeAt(x,y);
        const r = Math.max(1, Math.round(p.radius * (1 - p.k * Math.min(1, s * 10))));
        let sum = 0, cnt = 0;
        for (let j = -r; j <= r; j++) {
          const yy = Math.min(N-1, Math.max(0, y+j));
          for (let i = -r; i <= r; i++) {
            const xx = Math.min(N-1, Math.max(0, x+i));
            sum += h.get(xx, yy);
            cnt++;
          }
        }
        tmp[idx(x,y)] = sum / cnt;
      }
    }
    h.data.set(tmp);
  }
}
