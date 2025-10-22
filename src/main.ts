// src/main.ts
import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, RawTexture, Texture, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
import "@babylonjs/core/Materials/standardMaterial";
import { BIOMES, BiomeParams } from "./terrain/Biomes";
import { generateContinuousTileGrid, ContinuousGrid } from "./terrain/tiles/ContinuousTileGeneration";
import { createAtlasMaterial } from "./render/AtlasTriplanarPBR";
import { createTileGeometry, setTileRect } from "./render/TerrainTileMeshes";
import { createWaterPlanes, createRiverHighlights } from "./render/WaterRenderer";

const canvas = document.getElementById("app") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

// camera + light
const cam = new ArcRotateCamera("cam", -Math.PI/2, Math.PI/3, 2200, new Vector3(0,0,0), scene);
cam.attachControl(canvas, true);
new HemisphericLight("sun", new Vector3(0.2,1,0.3), scene);

// Progress Modal Management
class ProgressManager {
  private modal: HTMLElement;
  private stepElement: HTMLElement;
  private barElement: HTMLElement;
  private percentageElement: HTMLElement;
  
  constructor() {
    this.modal = document.getElementById("progressModal")!;
    this.stepElement = document.getElementById("progressStep")!;
    this.barElement = document.getElementById("progressBar")!;
    this.percentageElement = document.getElementById("progressPercentage")!;
  }
  
  show() {
    this.modal.classList.add("show");
    this.updateProgress(0, "Initializing...");
  }
  
  hide() {
    this.modal.classList.remove("show");
  }
  
  updateProgress(percentage: number, step: string) {
    this.stepElement.textContent = step;
    this.barElement.style.width = `${percentage}%`;
    this.percentageElement.textContent = `${Math.round(percentage)}%`;
  }
  
  async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Current terrain state
let currentMeshes: any[] = [];
let currentMaterial: any = null;
let tileBorderMeshes: any[] = [];
let waterMeshes: any[] = [];
let riverMeshes: any[] = [];

function createTileBorders(rows: number, cols: number, tileSize: number) {
  // Clear existing borders
  tileBorderMeshes.forEach(mesh => mesh.dispose());
  tileBorderMeshes = [];
  
  // Create red glowing material
  const borderMaterial = new StandardMaterial("tileBorder", scene);
  borderMaterial.emissiveColor = new Color3(1, 0.2, 0.2); // Red glow
  borderMaterial.diffuseColor = new Color3(1, 0, 0);
  borderMaterial.wireframe = false;
  
  const borderHeight = 50; // Height of the border walls
  const borderWidth = 4; // Width of the border lines
  
  // Create horizontal borders
  for (let row = 0; row <= rows; row++) {
    const z = (row - rows/2) * tileSize;
    const border = MeshBuilder.CreateBox(`hBorder_${row}`, {
      width: cols * tileSize + borderWidth,
      height: borderHeight,
      depth: borderWidth
    }, scene);
    border.position = new Vector3(0, borderHeight/2, z);
    border.material = borderMaterial;
    tileBorderMeshes.push(border);
  }
  
  // Create vertical borders
  for (let col = 0; col <= cols; col++) {
    const x = (col - cols/2) * tileSize;
    const border = MeshBuilder.CreateBox(`vBorder_${col}`, {
      width: borderWidth,
      height: borderHeight,
      depth: rows * tileSize + borderWidth
    }, scene);
    border.position = new Vector3(x, borderHeight/2, 0);
    border.material = borderMaterial;
    tileBorderMeshes.push(border);
  }
}

function toggleTileBorders(show: boolean) {
  tileBorderMeshes.forEach(mesh => {
    mesh.setEnabled(show);
  });
}

function toggleWaterFeatures(show: boolean) {
  waterMeshes.forEach(mesh => {
    mesh.setEnabled(show);
  });
  riverMeshes.forEach(mesh => {
    mesh.setEnabled(show);
  });
}

// UI Controls
interface TerrainConfig {
  seed: number;
  rows: number;
  cols: number;
  biome: string;
  showTiles: boolean;
  showWater: boolean;
  amplitude: number;
  frequency: number;
  octaves: number;
  warp: number;
  heightScale: number;
}

function getUIConfig(): TerrainConfig {
  return {
    seed: parseInt((document.getElementById("seed") as HTMLInputElement).value),
    rows: parseInt((document.getElementById("rows") as HTMLInputElement).value),
    cols: parseInt((document.getElementById("cols") as HTMLInputElement).value),
    biome: (document.getElementById("biome") as HTMLSelectElement).value,
    showTiles: (document.getElementById("showTiles") as HTMLInputElement).checked,
    showWater: (document.getElementById("showWater") as HTMLInputElement).checked,
    amplitude: parseFloat((document.getElementById("amplitude") as HTMLInputElement).value),
    frequency: parseFloat((document.getElementById("frequency") as HTMLInputElement).value),
    octaves: parseInt((document.getElementById("octaves") as HTMLInputElement).value),
    warp: parseFloat((document.getElementById("warp") as HTMLInputElement).value),
    heightScale: parseFloat((document.getElementById("height") as HTMLInputElement).value),
  };
}

function getValueLabel(id: string, value: number): string {
  switch(id) {
    case 'amplitude':
      if (value < 0.15) return 'Very Flat';
      if (value < 0.25) return 'Small';
      if (value < 0.4) return 'Medium';
      if (value < 0.6) return 'Large';
      return 'Huge';
    
    case 'frequency':
      if (value < 1.0) return 'Very Smooth';
      if (value < 1.5) return 'Smooth';
      if (value < 2.5) return 'Medium';
      if (value < 3.5) return 'Detailed';
      return 'Very Detailed';
    
    case 'octaves':
      if (value <= 2) return 'Simple';
      if (value <= 4) return 'Medium';
      if (value <= 6) return 'Complex';
      return 'Very Complex';
    
    case 'warp':
      if (value < 0.1) return 'Very Low';
      if (value < 0.2) return 'Low';
      if (value < 0.3) return 'Medium';
      if (value < 0.4) return 'High';
      return 'Very High';
    
    case 'height':
      return `${value}m`;
    
    default:
      return value.toString();
  }
}

function updateValueDisplays() {
  const controls = ['amplitude', 'frequency', 'octaves', 'warp', 'height'];
  controls.forEach(id => {
    const slider = document.getElementById(id) as HTMLInputElement;
    const value = parseFloat(slider.value);
    const label = getValueLabel(id, value);
    document.getElementById(`${id}-value`)!.textContent = label;
  });
}

const progressManager = new ProgressManager();

async function generateTerrain() {
  const config = getUIConfig();
  const generateBtn = document.getElementById("generate") as HTMLButtonElement;
  
  // Show progress modal
  progressManager.show();
  
  // Disable button during generation
  generateBtn.disabled = true;
  generateBtn.textContent = "⏳ Generating...";
  
  try {
    // Step 1: Cleanup
    progressManager.updateProgress(10, "Cleaning up previous terrain...");
    await progressManager.delay(200);
    
    currentMeshes.forEach(mesh => mesh.dispose());
    currentMeshes = [];
    waterMeshes.forEach(mesh => mesh.dispose());
    waterMeshes = [];
    riverMeshes.forEach(mesh => mesh.dispose());
    riverMeshes = [];
    if (currentMaterial) {
      currentMaterial.dispose();
      currentMaterial = null;
    }
    
    // Step 2: Create biome
    progressManager.updateProgress(20, "Configuring terrain parameters...");
    await progressManager.delay(200);
    
    // Use selected biome as base, then override with user parameters
    const baseBiome = BIOMES[config.biome as keyof typeof BIOMES] || BIOMES.temperate;
    const customBiome: BiomeParams = {
      ...baseBiome,
      fbm: { 
        ...baseBiome.fbm,
        amplitude: config.amplitude, 
        frequency: config.frequency, 
        octaves: config.octaves,
        warp: config.warp 
      },
      heightScale: config.heightScale
    };
    
    // Step 3: Generate terrain
    progressManager.updateProgress(30, "Generating continuous heightfield...");
    await progressManager.delay(100);
    
    const tileSize = 512;
    const overlap = 32;
    
    const grid: ContinuousGrid = generateContinuousTileGrid({
      rows: config.rows, 
      cols: config.cols,
      tileSize,
      overlap,
      baseSize: 64,
      steps: 4,
      worldScale: 1.0,
      seed: config.seed,
      blendSeams: false
    }, customBiome);
    
    // Step 4: Create atlas
    progressManager.updateProgress(60, "Building texture atlas...");
    await progressManager.delay(200);
    
    const atlasWidth = config.cols * grid.innerSize;
    const atlasHeight = config.rows * grid.innerSize;
    const heightAtlas = RawTexture.CreateRTexture(grid.atlas, atlasWidth, atlasHeight, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    
    currentMaterial = createAtlasMaterial(scene, {
      heightAtlas,
      atlasWidth,
      atlasHeight,
      heightScaleMeters: customBiome.heightScale,
      slopeRock: 0.32,
      heightSnow: 0.78
    });
    
    // Step 5: Create meshes
    progressManager.updateProgress(80, "Creating terrain meshes...");
    await progressManager.delay(200);
    
    const worldTileSize = 1200;
    const totalTiles = config.rows * config.cols;
    
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        const tileIndex = r * config.cols + c;
        const tileProgress = 80 + (tileIndex / totalTiles) * 15;
        progressManager.updateProgress(tileProgress, `Creating tile ${tileIndex + 1} of ${totalTiles}...`);
        
        const m = createTileGeometry(scene, grid.innerSize, worldTileSize);
        m.material = currentMaterial.clone("tileMat");
        const rect = grid.rects[r * config.cols + c];
        const posX = (c - (config.cols - 1) * 0.5) * worldTileSize;
        const posZ = (r - (config.rows - 1) * 0.5) * worldTileSize;
        
        setTileRect(m.material as any, rect);
        m.position.x = posX;
        m.position.z = posZ;
        currentMeshes.push(m);
        
        await progressManager.delay(50);
      }
    }
    
    // Step 6: Create tile borders
    progressManager.updateProgress(96, "Creating tile borders...");
    await progressManager.delay(100);
    createTileBorders(config.rows, config.cols, worldTileSize);
    toggleTileBorders(config.showTiles);
    
    // Step 7: Create water features
    if (grid.waterFeatures) {
      progressManager.updateProgress(98, "Creating water and rivers...");
      await progressManager.delay(100);
      
      const waterLevel = customBiome.water?.seaLevel ? 
        customBiome.water.seaLevel * customBiome.heightScale : 0;
      
      const waterPlanes = createWaterPlanes(scene, grid.waterFeatures, {
        waterLevel,
        tileSize: worldTileSize,
        rows: config.rows,
        cols: config.cols,
        atlasWidth: grid.innerSize * config.cols,
        atlasHeight: grid.innerSize * config.rows
      });
      
      // Add terrain meshes to water reflection list for realistic reflections
      waterPlanes.forEach(waterPlane => {
        if (waterPlane.material && (waterPlane.material as any).addToRenderList) {
          currentMeshes.forEach(terrainMesh => {
            (waterPlane.material as any).addToRenderList(terrainMesh);
          });
        }
      });
      
      const riverHighlights = createRiverHighlights(scene, grid.waterFeatures, {
        waterLevel,
        tileSize: worldTileSize,
        rows: config.rows,
        cols: config.cols,
        atlasWidth: grid.innerSize * config.cols,
        atlasHeight: grid.innerSize * config.rows
      });
      
      waterMeshes.push(...waterPlanes);
      riverMeshes.push(...riverHighlights);
      
      // Set initial water visibility
      toggleWaterFeatures(config.showWater);
    }
    
    // Step 8: Finalize
    progressManager.updateProgress(100, "Terrain generation complete!");
    await progressManager.delay(500);
    
    console.log(`Generated ${config.rows}x${config.cols} terrain grid with seed ${config.seed}`);
    
  } catch (error) {
    console.error("Error generating terrain:", error);
    progressManager.updateProgress(0, "Error generating terrain!");
    await progressManager.delay(1000);
  } finally {
    // Hide modal and re-enable button
    progressManager.hide();
    generateBtn.disabled = false;
    generateBtn.textContent = "🔄 Generate Terrain";
  }
}

// Set up event listeners
function setupUI() {
  // Update value displays on slider change
  ["amplitude", "frequency", "octaves", "warp", "height"].forEach(id => {
    const slider = document.getElementById(id) as HTMLInputElement;
    slider.addEventListener("input", updateValueDisplays);
  });
  
  // Tile borders checkbox
  const showTilesCheckbox = document.getElementById("showTiles") as HTMLInputElement;
  showTilesCheckbox.addEventListener("change", () => {
    toggleTileBorders(showTilesCheckbox.checked);
  });
  
  // Water features checkbox
  const showWaterCheckbox = document.getElementById("showWater") as HTMLInputElement;
  showWaterCheckbox.addEventListener("change", () => {
    toggleWaterFeatures(showWaterCheckbox.checked);
  });
  
  // Generate button
  document.getElementById("generate")!.addEventListener("click", generateTerrain);
  
  // Initial value display update
  updateValueDisplays();
}

// Initialize
setupUI();
generateTerrain(); // Generate initial terrain

// run
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
