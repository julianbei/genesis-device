import { HeightField } from '../HeightField';

export interface DuneParams { scale: number; amplitude: number; direction: number /* radians */; }

export function applyDunes(h: HeightField, p: DuneParams) {
  const N = h.size;
  const dx = Math.cos(p.direction), dy = Math.sin(p.direction);
  for (let y=0;y<N;y++){
    for (let x=0;x<N;x++){
      const u = (x*dx + y*dy)/N;
      const w = Math.sin(u * p.scale * Math.PI*2) * p.amplitude;
      h.set(x,y, h.get(x,y)+ w);
    }
  }
}
