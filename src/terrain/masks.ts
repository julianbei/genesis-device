import { HeightField } from './HeightField';

export function slopeMask(h: HeightField, threshold: number): Float32Array {
  const N = h.size, m = new Float32Array(N*N);
  const idx = (x:number,y:number)=>y*N+x;
  for (let y=0;y<N;y++){
    for (let x=0;x<N;x++){
      const dx = (h.get(x+1,y)-h.get(x-1,y))*0.5;
      const dy = (h.get(x,y+1)-h.get(x,y-1))*0.5;
      const s = Math.sqrt(dx*dx+dy*dy);
      m[idx(x,y)] = s > threshold ? 1 : 0;
    }
  }
  return m;
}

export function heightBandMask(h: HeightField, min: number, max: number): Float32Array {
  const N = h.size, m = new Float32Array(N*N);
  for (let i=0;i<m.length;i++){
    const v = h.data[i];
    m[i] = v >= min && v <= max ? 1 : 0;
  }
  return m;
}

export function combine(a: Float32Array, b: Float32Array, op: 'and'|'or'|'mul' = 'mul'): Float32Array {
  const out = new Float32Array(a.length);
  for (let i=0;i<a.length;i++){
    out[i] = op==='and' ? (a[i]>0 && b[i]>0 ? 1:0) : op==='or' ? (a[i]>0||b[i]>0?1:0) : (a[i]*b[i]);
  }
  return out;
}
