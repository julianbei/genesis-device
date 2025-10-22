// src/terrain/erosion/HydroErosion.ts
/**
 * Fast hydraulic-erosion pass.
 * Uses WebGPU compute when available (Babylon ComputeShader, WGSL).
 * Falls back to a cheap CPU thermal+smoothing step when WebGPU is not present.
 *
 * Input/Output: HeightField in [0..1]. Mutates in place.
 */
import { Engine, ComputeShader, RawTexture, Texture } from "@babylonjs/core";
import { HeightField } from "../HeightField";

export interface HydroParams {
  iterations: number;      // 1..200
  rain: number;            // 0..0.02 water per step
  evaporate: number;       // 0..1 fraction per step
  sedimentCapacity: number;// 0..1
  erosion: number;         // 0..1 erosion rate
  deposition: number;      // 0..1 deposition rate
}

const WGSL = /* wgsl */`
struct SimParams {
  size : u32,
  rain : f32,
  evap : f32,
  sedCap : f32,
  erode : f32,
  depo : f32,
  texel : f32,
};
@group(0) @binding(0) var<storage, read_write> height   : array<f32>;
@group(0) @binding(1) var<storage, read_write> water    : array<f32>;
@group(0) @binding(2) var<storage, read_write> sediment : array<f32>;
@group(0) @binding(3) var<uniform> params : SimParams;

fn idx(x:u32,y:u32)->u32{
  let N = params.size;
  return y*N + x;
}
fn clampCoord(v:i32, N:i32)->u32{
  return u32(max(0, min(N-1, v)));
}
fn h(x:i32,y:i32)->f32{
  let N = i32(params.size);
  return height[idx(clampCoord(x,N), clampCoord(y,N))];
}
fn grad(x:i32,y:i32)->vec2<f32>{
  // central differences
  let gx = (h(x+1,y) - h(x-1,y))*0.5;
  let gy = (h(x,y+1) - h(x,y-1))*0.5;
  return vec2<f32>(gx, gy);
}

@compute @workgroup_size(8,8)
fn stepA(@builtin(global_invocation_id) gid: vec3<u32>){
  if (gid.x>=params.size || gid.y>=params.size){ return; }
  let N = i32(params.size);
  let x = i32(gid.x);
  let y = i32(gid.y);
  let id = idx(u32(x),u32(y));

  // rain
  water[id] = water[id] + params.rain;

  // flow to four neighbors proportional to negative gradient
  let cH = height[id] + water[id];
  var flows = array<f32,4>();
  var sumF : f32 = 0.0;
  let nb = array<vec2<i32>,4>(vec2<i32>(1,0), vec2<i32>(-1,0), vec2<i32>(0,1), vec2<i32>(0,-1));
  for(var i:u32=0u; i<4u; i=i+1u){
    let nx = x + nb[i].x;
    let ny = y + nb[i].y;
    let nid = idx(u32(clampCoord(nx,N)), u32(clampCoord(ny,N)));
    let nH = height[nid] + water[nid];
    let dh = cH - nH;
    let f = max(0.0, dh);
    flows[i] = f;
    sumF = sumF + f;
  }
  if (sumF > 1e-6) {
    let W = water[id];
    for(var i:u32=0u; i<4u; i=i+1u){
      let share = min(W, W * (flows[i] / sumF) * 0.5); // CFL safety
      let nx = x + nb[i].x;
      let ny = y + nb[i].y;
      let nid = idx(u32(clampCoord(nx,N)), u32(clampCoord(ny,N)));
      water[id] = water[id] - share;
      water[nid] = water[nid] + share;
      // sediment transport with water
      let sShare = min(sediment[id], share * params.sedCap);
      sediment[id] -= sShare;
      sediment[nid] += sShare;
    }
  }

  // erode or deposit depending on capacity
  let g = length(grad(x,y));
  let capacity = params.sedCap * max(0.001, g);
  if (sediment[id] < capacity) {
    // erode
    let take = params.erode * (capacity - sediment[id]);
    height[id] = max(0.0, height[id] - take);
    sediment[id] = sediment[id] + take;
  } else {
    // deposit
    let put = params.depo * (sediment[id] - capacity);
    height[id] = height[id] + put;
    sediment[id] = max(0.0, sediment[id] - put);
  }

  // evaporation
  water[id] = max(0.0, water[id] * (1.0 - params.evap));
}

`;

export class HydroErosion {
  private cs?: ComputeShader;
  private heightTex?: RawTexture;
  private waterBuf?: Float32Array;
  private sedBuf?: Float32Array;

  /**
   * Run erosion in place. WebGPU when available else CPU fallback.
   */
  async run(engine: Engine, hf: HeightField, p: HydroParams): Promise<void> {
    if (ComputeShader.IsSupported(engine)) {
      await this.runGPU(engine, hf, p);
    } else {
      this.runCPU(hf, p);
    }
  }

  private async runGPU(engine: Engine, hf: HeightField, p: HydroParams) {
    const N = hf.size;
    if (!this.waterBuf || this.waterBuf.length !== N*N) this.waterBuf = new Float32Array(N*N);
    if (!this.sedBuf || this.sedBuf.length !== N*N) this.sedBuf = new Float32Array(N*N);
    this.waterBuf.fill(0);
    this.sedBuf.fill(0);

    // Storage buffers as RawTexture substitute using StorageBuffers via ComputeShader API
    // Babylon's ComputeShader maps JS arrays to storage buffers by variable name in setBuffer
    this.cs = new ComputeShader("hydro", engine, { computeSource: WGSL }, {
      bindingsMapping: {
        height: { group: 0, binding: 0 },
        water: { group: 0, binding: 1 },
        sediment: { group: 0, binding: 2 },
        params: { group: 0, binding: 3 },
      }
    });

    this.cs.setBuffer("height", hf.data);
    this.cs.setBuffer("water", this.waterBuf);
    this.cs.setBuffer("sediment", this.sedBuf);

    const ubo = new Float32Array([
      N,            // as u32 in WGSL but we pack in f32 UBO; Babylon handles layout
      p.rain,
      p.evaporate,
      p.sedimentCapacity,
      p.erosion,
      p.deposition,
      1.0 / N
    ]);
    this.cs.setUniform("params", ubo);

    const groups = Math.ceil(N / 8);
    for (let i = 0; i < p.iterations; i++) {
      this.cs.dispatch(groups, groups, 1);
      await this.cs.flushAsync(); // ensure completion per iteration
    }
    // height buffer mutated in place
  }

  private runCPU(h: HeightField, p: HydroParams) {
    // Thermal + blur fallback. Cheap and stable.
    const N = h.size;
    const tmp = new Float32Array(N*N);
    const idx = (x:number,y:number)=> y*N+x;
    for (let it=0; it<p.iterations; it++) {
      // thermal creep
      for (let y=0;y<N;y++){
        for (let x=0;x<N;x++){
          const c = h.get(x,y);
          let sum = 0, cnt = 0;
          for (let j=-1;j<=1;j++){
            for (let i=-1;i<=1;i++){
              if (i===0 && j===0) continue;
              const n = h.get(x+i,y+j);
              const dh = c - n;
              if (dh > 0.002) { // talus angle proxy
                const move = dh * 0.25 * p.erosion;
                sum -= move;
                tmp[idx(x+i,y+j)] = (tmp[idx(x+i,y+j)] || 0) + move;
              }
              cnt++;
            }
          }
          tmp[idx(x,y)] = (tmp[idx(x,y)] || 0) + c + sum;
        }
      }
      // write back + light blur
      for (let k=0;k<tmp.length;k++) tmp[k] = Math.max(0, tmp[k]);
      h.data.set(tmp);
      // box blur once
      for (let y=0;y<N;y++){
        for (let x=0;x<N;x++){
          let s=0,c=0;
          for (let j=-1;j<=1;j++){
            for (let i=-1;i<=1;i++){
              s+=h.get(x+i,y+j); c++;
            }
          }
          tmp[idx(x,y)] = s/c;
        }
      }
      h.data.set(tmp);
      tmp.fill(0);
    }
    // normalize 0..1
    let min=Infinity, max=-Infinity;
    for (const v of h.data){ if (v<min) min=v; if (v>max) max=v; }
    const span = max-min || 1;
    for (let i=0;i<h.data.length;i++) h.data[i] = (h.data[i]-min)/span;
  }
}
