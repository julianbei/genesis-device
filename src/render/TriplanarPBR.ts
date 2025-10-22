// src/render/TriplanarPBR.ts
/**
 * Tri-planar PBR terrain material with slope+height blending.
 * Computes normals from the height texture in the fragment shader.
 * Inputs:
 *  - heightTex: R32F height in [0..1]
 *  - heightScale: meters
 *  - texelSize: 1.0 / N
 *  - three albedo textures + three normal textures (optional; 1x1 fallback created)
 * Blending:
 *  - Snow by height threshold
 *  - Rock by slope threshold
 *  - Grass otherwise
 */
import { Scene, ShaderMaterial, Texture, RawTexture, Vector4 } from "@babylonjs/core";

const vs = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec3 vPos;
varying vec2 vUV;
void main() {
  vPos = position;
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const fs = `
precision highp float;
varying vec3 vPos;
varying vec2 vUV;

uniform sampler2D heightTex;
uniform float heightScale;
uniform float texelSize;

// tri-planar textures
uniform sampler2D albedoGrass;
uniform sampler2D albedoRock;
uniform sampler2D albedoSnow;
uniform sampler2D normalGrass;
uniform sampler2D normalRock;
uniform sampler2D normalSnow;

uniform vec4 thresholds; // x: slopeRock, y: heightSnow, z: slopeSoft, w: heightSoft

// sample height normal from heightTex using central diff in texture space
vec3 heightNormal(vec2 uv){
  float hC = texture2D(heightTex, uv).r;
  float hX1 = texture2D(heightTex, uv + vec2(texelSize,0.0)).r;
  float hX0 = texture2D(heightTex, uv - vec2(texelSize,0.0)).r;
  float hY1 = texture2D(heightTex, uv + vec2(0.0,texelSize)).r;
  float hY0 = texture2D(heightTex, uv - vec2(0.0,texelSize)).r;
  float sx = (hX1 - hX0) * heightScale;
  float sy = (hY1 - hY0) * heightScale;
  vec3 n = normalize(vec3(-sx, 2.0*texelSize*heightScale, -sy));
  return n;
}

vec2 planarUV(vec3 p, int axis, float scale){
  // axis: 0->X,1->Y,2->Z; compute planar uv
  if (axis==0) return p.zy * scale;
  if (axis==1) return p.xz * scale;
  return p.xy * scale;
}

vec3 sampleTriPlanar(sampler2D tex, vec3 n, vec3 wpos, float scale){
  vec3 an = abs(n);
  an = an / (an.x + an.y + an.z + 1e-5);
  vec3 cX = texture2D(tex, planarUV(wpos, 0, scale)).rgb;
  vec3 cY = texture2D(tex, planarUV(wpos, 1, scale)).rgb;
  vec3 cZ = texture2D(tex, planarUV(wpos, 2, scale)).rgb;
  return cX*an.x + cY*an.y + cZ*an.z;
}

vec3 unpackNormal(vec3 c){
  // assume normal map in tangent space encoded in 0..1
  return normalize(c * 2.0 - 1.0);
}

vec3 sampleTriPlanarNormal(sampler2D tex, vec3 n, vec3 wpos, float scale){
  vec3 an = abs(n);
  an = an / (an.x + an.y + an.z + 1e-5);
  vec3 nX = unpackNormal(texture2D(tex, planarUV(wpos, 0, scale)).rgb);
  vec3 nY = unpackNormal(texture2D(tex, planarUV(wpos, 1, scale)).rgb);
  vec3 nZ = unpackNormal(texture2D(tex, planarUV(wpos, 2, scale)).rgb);
  vec3 tpn = normalize(nX*an.x + nY*an.y + nZ*an.z);
  return tpn;
}

void main(){
  // derive world pos from vPos (already world space in this mesh setup)
  vec2 uv = vUV;
  float h = texture2D(heightTex, uv).r;
  vec3 nH = heightNormal(uv);

  // slope proxy from height normal
  float slope = 1.0 - nH.y; // 0 flat, 1 vertical

  // choose weights
  float rockW = smoothstep(thresholds.x-0.1, thresholds.x+0.1, slope);
  float snowW = smoothstep(thresholds.y-0.05, thresholds.y+0.05, h);
  float grassW = 1.0 - max(rockW, snowW);
  vec3 weights = normalize(vec3(grassW, rockW, snowW) + 1e-5);

  // sample tri-planar albedo and normals
  float scaleG = 0.005; // tiling scale factors
  float scaleR = 0.008;
  float scaleS = 0.004;

  vec3 cGrass = sampleTriPlanar(albedoGrass, nH, vPos, scaleG);
  vec3 cRock  = sampleTriPlanar(albedoRock , nH, vPos, scaleR);
  vec3 cSnow  = sampleTriPlanar(albedoSnow , nH, vPos, scaleS);
  vec3 nGrass = sampleTriPlanarNormal(normalGrass, nH, vPos, scaleG);
  vec3 nRock  = sampleTriPlanarNormal(normalRock , nH, vPos, scaleR);
  vec3 nSnow  = sampleTriPlanarNormal(normalSnow , nH, vPos, scaleS);

  vec3 albedo = normalize(cGrass*weights.x + cRock*weights.y + cSnow*weights.z);
  vec3 nMix   = normalize(nGrass*weights.x + nRock*weights.y + nSnow*weights.z);

  // simple Lambert + AO from slope
  vec3 N = normalize(mix(nH, nMix, 0.6));
  vec3 L = normalize(vec3(0.3, 0.8, 0.4));
  float diff = max(0.0, dot(N, L));
  float ao = 1.0 - slope*0.35;
  vec3 color = albedo * diff * ao + albedo * 0.1; // ambient

  gl_FragColor = vec4(color, 1.0);
}
`;

export interface TriplanarMaterialInputs {
  heightTexture: RawTexture;
  heightScaleMeters: number;
  texelSize: number; // 1.0 / N
  albedoGrass?: Texture; normalGrass?: Texture;
  albedoRock?: Texture;  normalRock?: Texture;
  albedoSnow?: Texture;  normalSnow?: Texture;
  slopeRock?: number;    // default 0.35
  heightSnow?: number;   // default 0.75
}

function solidTexture(scene: Scene, rgb: [number,number,number]): Texture {
  const dt = new RawTexture(new Uint8Array([rgb[0],rgb[1],rgb[2],255]), 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE, Texture.RGBA);
  return dt;
}

export function createTriplanarMaterial(scene: Scene, inp: TriplanarMaterialInputs): ShaderMaterial {
  const mat = new ShaderMaterial("triPBR", scene, { vertexSource: vs, fragmentSource: fs }, {
    attributes: ["position","uv"],
    uniforms: ["worldViewProjection","heightScale","texelSize","thresholds"],
    samplers: ["heightTex","albedoGrass","albedoRock","albedoSnow","normalGrass","normalRock","normalSnow"]
  });

  mat.setTexture("heightTex", inp.heightTexture);
  mat.setFloat("heightScale", inp.heightScaleMeters);
  mat.setFloat("texelSize", inp.texelSize);

  const gA = inp.albedoGrass ?? solidTexture(scene, [60,120,70]);
  const rA = inp.albedoRock  ?? solidTexture(scene, [120,110,100]);
  const sA = inp.albedoSnow  ?? solidTexture(scene, [220,220,225]);
  const gN = inp.normalGrass ?? solidTexture(scene, [127,127,255]);
  const rN = inp.normalRock  ?? solidTexture(scene, [127,127,255]);
  const sN = inp.normalSnow  ?? solidTexture(scene, [127,127,255]);

  mat.setTexture("albedoGrass", gA);
  mat.setTexture("albedoRock",  rA);
  mat.setTexture("albedoSnow",  sA);
  mat.setTexture("normalGrass", gN);
  mat.setTexture("normalRock",  rN);
  mat.setTexture("normalSnow",  sN);

  const slopeRock = inp.slopeRock ?? 0.35;
  const heightSnow = inp.heightSnow ?? 0.75;
  mat.setVector4("thresholds", new Vector4(slopeRock, heightSnow, 0.2, 0.5));

  return mat;
}
