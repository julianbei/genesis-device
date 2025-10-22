// src/main.ts
import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, RawTexture, Texture } from "@babylonjs/core";
import "@babylonjs/core/Materials/standardMaterial";
import { BIOMES } from "./terrain/Biomes";
import { generateContinuousTileGrid } from "./terrain/tiles/ContinuousTileGeneration";
import { createAtlasMaterial } from "./render/AtlasTriplanarPBR";
import { createTileGeometry, setTileRect } from "./render/TerrainTileMeshes";

const canvas = document.getElementById("app") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

// camera + light
const cam = new ArcRotateCamera("cam", -Math.PI/2, Math.PI/3, 2200, new Vector3(0,0,0), scene);
cam.attachControl(canvas, true);
new HemisphericLight("sun", new Vector3(0.2,1,0.3), scene);

// grid config - back to full grid
const rows = 2, cols = 3;
const tileSize = 512;
const overlap = 32;
const biome = BIOMES.temperate;

// generate grid + atlas using continuous approach
const grid = generateContinuousTileGrid({
  rows, cols,
  tileSize,
  overlap,
  baseSize: 64,
  steps: 4,
  worldScale: 1.0,      // continuous noise across tiles
  seed: 1337,
  blendSeams: false      // not needed with continuous generation
}, biome);

// upload atlas as R32F
const atlasWidth = cols * grid.innerSize;
const atlasHeight = rows * grid.innerSize;
const heightAtlas = RawTexture.CreateRTexture(grid.atlas, atlasWidth, atlasHeight, scene, false, false, Texture.NEAREST_SAMPLINGMODE);

// one shared material
const mat = createAtlasMaterial(scene, {
  heightAtlas,
  atlasWidth,
  atlasHeight,
  heightScaleMeters: biome.heightScale,
  slopeRock: 0.32,
  heightSnow: 0.78
});

// build tile meshes
const worldTileSize = 1200; // meters per tile
const meshes = [];
let idx = 0;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const m = createTileGeometry(scene, grid.innerSize, worldTileSize);
    m.material = mat.clone("tileMat") as any;
    const rect = grid.rects[r * cols + c];
    const posX = (c - (cols - 1) * 0.5) * worldTileSize;
    const posZ = (r - (rows - 1) * 0.5) * worldTileSize;
    
    idx++;
    setTileRect(m.material as any, rect);
    m.position.x = posX;
    m.position.z = posZ;
    meshes.push(m);
  }
}

// run
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
