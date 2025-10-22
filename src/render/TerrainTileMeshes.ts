// src/render/TerrainTileMeshes.ts
/**
 * Builds a grid of tile meshes that each sample a sub-rect of the height atlas.
 * Geometry resolution equals the inner visible pixels per tile (innerSize).
 */
import { Mesh, Scene, VertexData, ShaderMaterial, RawTexture, Texture } from "@babylonjs/core";

export function createTileGeometry(scene: Scene, innerSize: number, tileWorldSize: number): Mesh {
  const N = innerSize;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = (x / (N - 1) - 0.5) * tileWorldSize;
      const pz = (y / (N - 1) - 0.5) * tileWorldSize;
      positions.push(px, 0, pz);
      uvs.push(x / (N - 1), y / (N - 1));
    }
  }
  for (let y = 0; y < N - 1; y++) {
    for (let x = 0; x < N - 1; x++) {
      const i = y * N + x;
      indices.push(i, i + 1, i + N, i + 1, i + N + 1, i + N);
    }
  }
  const mesh = new Mesh("tile", scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.uvs = uvs;
  vd.applyToMesh(mesh);
  return mesh;
}

export function setTileRect(mat: ShaderMaterial, rect: { u0: number; v0: number; u1: number; v1: number; }) {
  mat.setVector4("tileRect", { x: rect.u0, y: rect.v0, z: rect.u1, w: rect.v1 } as any);
}
