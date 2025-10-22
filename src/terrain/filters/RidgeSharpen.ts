import { HeightField } from '../HeightField';

export function applyRidgeSharpen(h: HeightField, strength = 0.5) {
  const N = h.size;
  const out = new Float32Array(h.data.length);
  const g = (x:number,y:number)=> h.get(x,y);
  for (let y=0;y<N;y++){
    for (let x=0;x<N;x++){
      const c=g(x,y);
      const lap = (g(x-1,y)+g(x+1,y)+g(x,y-1)+g(x,y+1) - 4*c);
      out[y*N+x] = c - strength * lap; // unsharp mask
    }
  }
  h.data.set(out);
}
