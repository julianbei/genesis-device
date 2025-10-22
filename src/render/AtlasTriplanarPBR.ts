// src/render/AtlasTriplanarPBR.ts
/**
 * Tri-planar terrain sampling a shared height atlas.
 * Vertex shader displaces using atlas height within a per-tile rect.
 * Includes V flip in atlas mapping to match WebGL texture row order.
 */
import { Scene, ShaderMaterial, Texture, RawTexture, Vector4 } from "@babylonjs/core";

const vs = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;

uniform sampler2D heightTex;     // atlas
uniform vec4 tileRect;           // u0,v0,u1,v1
uniform float heightScale;
uniform vec2 atlasTexel;         // 1/width, 1/height

varying vec2 vUV;                // local 0..1 within tile
varying vec2 vAtlasUV;           // atlas uv
varying float vHeight;

void main(){
  vUV = uv;
  // no V flip - use direct mapping
  vec2 atlasUV = vec2(
    mix(tileRect.x, tileRect.z, uv.x),
    mix(tileRect.y, tileRect.w, uv.y)
  );
  vAtlasUV = atlasUV;
  float h = texture2D(heightTex, atlasUV).r;
  vHeight = h;
  vec3 pos = position + vec3(0.0, h * heightScale, 0.0);
  gl_Position = worldViewProjection * vec4(pos, 1.0);
}
`;

const fs = `
precision highp float;
varying vec2 vUV;
varying vec2 vAtlasUV;
varying float vHeight;

uniform sampler2D heightTex;  // atlas
uniform vec2 atlasTexel;
uniform float heightScale;

uniform sampler2D albedoGrass;
uniform sampler2D albedoRock;
uniform sampler2D albedoSnow;
uniform sampler2D normalGrass;
uniform sampler2D normalRock;
uniform sampler2D normalSnow;

uniform vec4 thresholds; // slopeRock, heightSnow, -, -

vec3 heightNormal(vec2 uv){
  float hC = texture2D(heightTex, uv).r;
  float hX1 = texture2D(heightTex, uv + vec2(atlasTexel.x,0.0)).r;
  float hX0 = texture2D(heightTex, uv - vec2(atlasTexel.x,0.0)).r;
  float hY1 = texture2D(heightTex, uv + vec2(0.0,atlasTexel.y)).r;
  float hY0 = texture2D(heightTex, uv - vec2(0.0,atlasTexel.y)).r;
  float sx = (hX1 - hX0) * heightScale;
  float sy = (hY1 - hY0) * heightScale;
  vec3 n = normalize(vec3(-sx, 2.0*max(atlasTexel.x, atlasTexel.y)*heightScale, -sy));
  return n;
}

vec2 planarUV(vec3 p, int axis, float scale){
  if (axis==0) return p.zy * scale;
  if (axis==1) return p.xz * scale;
  return p.xy * scale;
}

vec3 unpackNormal(vec3 c){ return normalize(c*2.0-1.0); }

vec3 sampleTriPlanar(sampler2D tex, vec3 n, vec3 wpos, float scale){
  vec3 an = abs(n); an /= (an.x+an.y+an.z+1e-5);
  vec3 cX = texture2D(tex, planarUV(wpos,0,scale)).rgb;
  vec3 cY = texture2D(tex, planarUV(wpos,1,scale)).rgb;
  vec3 cZ = texture2D(tex, planarUV(wpos,2,scale)).rgb;
  return cX*an.x + cY*an.y + cZ*an.z;
}
vec3 sampleTriPlanarNormal(sampler2D tex, vec3 n, vec3 wpos, float scale){
  vec3 an = abs(n); an /= (an.x+an.y+an.z+1e-5);
  vec3 nX = unpackNormal(texture2D(tex, planarUV(wpos,0,scale)).rgb);
  vec3 nY = unpackNormal(texture2D(tex, planarUV(wpos,1,scale)).rgb);
  vec3 nZ = unpackNormal(texture2D(tex, planarUV(wpos,2,scale)).rgb);
  return normalize(nX*an.x + nY*an.y + nZ*an.z);
}

void main(){
  vec3 nH = heightNormal(vAtlasUV);
  float slope = 1.0 - nH.y;
  float rockW = smoothstep(thresholds.x-0.1, thresholds.x+0.1, slope);
  float snowW = smoothstep(thresholds.y-0.05, thresholds.y+0.05, vHeight);
  float grassW = 1.0 - max(rockW, snowW);
  vec3 weights = normalize(vec3(grassW, rockW, snowW)+1e-5);

  float scaleG=0.005, scaleR=0.008, scaleS=0.004;
  vec3 wpos = vec3(vUV*1000.0, vHeight*heightScale);

  vec3 cGrass = sampleTriPlanar(albedoGrass, nH, wpos, scaleG);
  vec3 cRock  = sampleTriPlanar(albedoRock , nH, wpos, scaleR);
  vec3 cSnow  = sampleTriPlanar(albedoSnow , nH, wpos, scaleS);
  vec3 nGrass = sampleTriPlanarNormal(normalGrass, nH, wpos, scaleG);
  vec3 nRock  = sampleTriPlanarNormal(normalRock , nH, wpos, scaleR);
  vec3 nSnow  = sampleTriPlanarNormal(normalSnow , nH, wpos, scaleS);

  vec3 albedo = normalize(cGrass*weights.x + cRock*weights.y + cSnow*weights.z);
  vec3 nMix   = normalize(nGrass*weights.x + nRock*weights.y + nSnow*weights.z);

  vec3 N = normalize(mix(nH, nMix, 0.6));
  vec3 L = normalize(vec3(0.3, 0.8, 0.4));
  float diff = max(0.0, dot(N,L));
  float ao = 1.0 - slope*0.35;
  vec3 color = albedo * diff * ao + albedo*0.1;

  gl_FragColor = vec4(color,1.0);
}
`;

function solidTexture(scene: Scene, rgba: [number, number, number, number]): Texture {
  const data = new Uint8Array(rgba);
  const t = new RawTexture(data, 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE, Texture.RGBA);
  return t;
}

export interface AtlasMatInputs {
  heightAtlas: RawTexture;
  atlasWidth: number;
  atlasHeight: number;
  heightScaleMeters: number;
  slopeRock?: number;
  heightSnow?: number;
  albedoGrass?: Texture; normalGrass?: Texture;
  albedoRock?: Texture;  normalRock?: Texture;
  albedoSnow?: Texture;  normalSnow?: Texture;
}

export function createAtlasMaterial(scene: Scene, inp: AtlasMatInputs): ShaderMaterial {
  const mat = new ShaderMaterial("atlasTri", scene, { vertexSource: vs, fragmentSource: fs }, {
    attributes: ["position", "uv"],
    uniforms: ["worldViewProjection", "tileRect", "heightScale", "atlasTexel", "thresholds"],
    samplers: ["heightTex", "albedoGrass", "albedoRock", "albedoSnow", "normalGrass", "normalRock", "normalSnow"]
  });

  mat.setTexture("heightTex", inp.heightAtlas);
  mat.setFloat("heightScale", inp.heightScaleMeters);
  mat.setVector2("atlasTexel", { x: 1 / inp.atlasWidth, y: 1 / inp.atlasHeight } as any);
  mat.setVector4("thresholds", new Vector4(inp.slopeRock ?? 0.35, inp.heightSnow ?? 0.75, 0, 0));
  mat.setVector4("tileRect", new Vector4(0, 0, 1, 1)); // overridden per tile

  const gA = inp.albedoGrass ?? solidTexture(scene, [60, 120, 70, 255]);
  const rA = inp.albedoRock  ?? solidTexture(scene, [120, 110, 100, 255]);
  const sA = inp.albedoSnow  ?? solidTexture(scene, [220, 220, 225, 255]);
  const gN = inp.normalGrass ?? solidTexture(scene, [127, 127, 255, 255]);
  const rN = inp.normalRock  ?? solidTexture(scene, [127, 127, 255, 255]);
  const sN = inp.normalSnow  ?? solidTexture(scene, [127, 127, 255, 255]);

  mat.setTexture("albedoGrass", gA);
  mat.setTexture("albedoRock",  rA);
  mat.setTexture("albedoSnow",  sA);
  mat.setTexture("normalGrass", gN);
  mat.setTexture("normalRock",  rN);
  mat.setTexture("normalSnow",  sN);

  return mat;
}
