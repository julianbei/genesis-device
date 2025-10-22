// src/render/TerrainMesh.ts
/**
 * Builds a grid mesh and a height RawTexture for GPU displacement and shading.
 * Material is provided externally (e.g., TriPlanar).
 */
import { Scene, Mesh, VertexData, RawTexture, Texture, ShaderMaterial } from "@babylonjs/core";

export function createTerrainGeometry(scene: Scene, size: number, worldSize = 1000): Mesh {
  const N = size;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let y=0;y<N;y++){
    for (let x=0;x<N;x++){
      const px = (x/(N-1)-0.5) * worldSize;
      const pz = (y/(N-1)-0.5) * worldSize;
      positions.push(px, 0, pz);
      uvs.push(x/(N-1), y/(N-1));
    }
  }
  for (let y=0;y<N-1;y++){
    for (let x=0;x<N-1;x++){
      const i = y*N + x;
      indices.push(i, i+1, i+N, i+1, i+N+1, i+N);
    }
  }
  const mesh = new Mesh("terrain", scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.uvs = uvs;
  vd.applyToMesh(mesh);
  return mesh;
}

export function createHeightTexture(scene: Scene, heightData: Float32Array, size: number): RawTexture {
  const tex = RawTexture.CreateRTexture(heightData, size, size, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
  return tex;
}

export function updateHeightTexture(mat: ShaderMaterial, newData: Float32Array) {
  const tex = mat.getTextureByName("heightTex") as RawTexture;
  tex.update(newData);
}
