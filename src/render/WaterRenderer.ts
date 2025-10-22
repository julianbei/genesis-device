import { Scene, MeshBuilder, StandardMaterial, Color3, Vector3, Vector2, Texture, DynamicTexture, Mesh } from "@babylonjs/core";
import { WaterMaterial } from "@babylonjs/materials/water";
import { WaterFeatures } from "../terrain/filters/WaterSystem";

export interface WaterRenderOptions {
  waterLevel: number;      // Y position for water plane
  tileSize: number;        // Size of each terrain tile
  rows: number;           // Grid dimensions
  cols: number;
  atlasWidth: number;     // Water mask atlas dimensions  
  atlasHeight: number;
}

export function createWaterTexture(scene: Scene, waterFeatures: WaterFeatures, atlasWidth: number, atlasHeight: number): Texture {
  // Create a dynamic texture for the water mask
  const canvas = document.createElement('canvas');
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;
  const ctx = canvas.getContext('2d')!;
  
  // Create image data from water mask
  const imageData = ctx.createImageData(atlasWidth, atlasHeight);
  const { waterMask, riverMask, beachMask } = waterFeatures;
  
  for (let i = 0; i < waterMask.length; i++) {
    const pixelIndex = i * 4;
    const water = waterMask[i];
    const river = riverMask[i];
    const beach = beachMask[i];
    
    if (water > 0.5) {
      // Deep water - blue
      imageData.data[pixelIndex] = 30;      // R
      imageData.data[pixelIndex + 1] = 100; // G  
      imageData.data[pixelIndex + 2] = 180; // B
      imageData.data[pixelIndex + 3] = 200; // A
    } else if (river > 0.5) {
      // Rivers - lighter blue
      imageData.data[pixelIndex] = 60;      // R
      imageData.data[pixelIndex + 1] = 140; // G
      imageData.data[pixelIndex + 2] = 200; // B
      imageData.data[pixelIndex + 3] = 180; // A
    } else if (beach > 0.2) {
      // Beach/coastal - sandy
      const beachStrength = Math.min(beach, 1.0);
      imageData.data[pixelIndex] = 220 * beachStrength;     // R
      imageData.data[pixelIndex + 1] = 200 * beachStrength; // G
      imageData.data[pixelIndex + 2] = 160 * beachStrength; // B
      imageData.data[pixelIndex + 3] = 100 * beachStrength; // A
    } else {
      // No water
      imageData.data[pixelIndex] = 0;
      imageData.data[pixelIndex + 1] = 0;
      imageData.data[pixelIndex + 2] = 0;
      imageData.data[pixelIndex + 3] = 0;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  // Create Babylon texture from canvas
  const texture = new Texture(`data:${canvas.toDataURL()}`, scene);
  texture.hasAlpha = true;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  
  return texture;
}

export function createWaterPlanes(scene: Scene, waterFeatures: WaterFeatures, options: WaterRenderOptions): Mesh[] {
  const { waterLevel, tileSize, rows, cols, atlasWidth, atlasHeight } = options;
  const waterMeshes: Mesh[] = [];
  
  // Create water texture for rivers and lakes
  const waterTexture = createWaterTexture(scene, waterFeatures, atlasWidth, atlasHeight);
  
  // Create realistic ocean water material using Babylon.js WaterMaterial
  const oceanWaterMaterial = new WaterMaterial("oceanWater", scene);
  oceanWaterMaterial.bumpTexture = waterTexture; // Use our water mask as bump
  oceanWaterMaterial.windForce = -15;
  oceanWaterMaterial.waveHeight = 0.8;
  oceanWaterMaterial.bumpHeight = 0.1;
  oceanWaterMaterial.windDirection = new Vector2(1, 1);
  oceanWaterMaterial.waterColor = new Color3(0.1, 0.3, 0.6);
  oceanWaterMaterial.colorBlendFactor = 0.3;
  oceanWaterMaterial.waveLength = 0.1;
  oceanWaterMaterial.waveSpeed = 25.0;
  
  // Create simpler material for rivers (no waves)
  const riverMaterial = new StandardMaterial("riverMaterial", scene);
  riverMaterial.diffuseTexture = waterTexture;
  riverMaterial.specularColor = new Color3(0.4, 0.6, 0.8);
  riverMaterial.alpha = 0.8;
  riverMaterial.backFaceCulling = false;
  
  // Create water planes for each tile
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Create ocean plane (larger, with waves)
      const oceanPlane = MeshBuilder.CreatePlane(`ocean_${r}_${c}`, {
        width: tileSize * 1.2, // Slightly larger to ensure coverage
        height: tileSize * 1.2
      }, scene);
      
      // Create river plane (smaller, for inland water)
      const riverPlane = MeshBuilder.CreatePlane(`river_${r}_${c}`, {
        width: tileSize,
        height: tileSize
      }, scene);
      
      // Position both planes
      const posX = (c - (cols - 1) * 0.5) * tileSize;
      const posZ = (r - (rows - 1) * 0.5) * tileSize;
      
      oceanPlane.position = new Vector3(posX, waterLevel - 5, posZ); // Slightly below for ocean
      riverPlane.position = new Vector3(posX, waterLevel + 1, posZ); // Slightly above for rivers
      
      oceanPlane.rotation.x = -Math.PI / 2; // Rotate to be horizontal
      riverPlane.rotation.x = -Math.PI / 2;
      
      // Set UV coordinates to match the terrain tile's atlas region
      const u0 = (c * (atlasWidth / cols)) / atlasWidth;
      const v0 = (r * (atlasHeight / rows)) / atlasHeight;
      const u1 = ((c + 1) * (atlasWidth / cols)) / atlasWidth;
      const v1 = ((r + 1) * (atlasHeight / rows)) / atlasHeight;
      
      // Apply UV mapping to both planes
      const uvs = [u0, v1, u1, v1, u1, v0, u0, v0];
      
      oceanPlane.setVerticesData("uv", uvs);
      riverPlane.setVerticesData("uv", uvs);
      
      // Apply materials
      oceanPlane.material = oceanWaterMaterial;
      riverPlane.material = riverMaterial;
      
      // Add terrain meshes as render targets for water reflections
      oceanWaterMaterial.addToRenderList(oceanPlane); // The water can reflect itself
      
      waterMeshes.push(oceanPlane, riverPlane);
    }
  }
  
  return waterMeshes;
}

export function createRiverHighlights(scene: Scene, waterFeatures: WaterFeatures, options: WaterRenderOptions): Mesh[] {
  const riverMeshes: Mesh[] = [];
  const { riverMask } = waterFeatures;
  const { atlasWidth, atlasHeight, tileSize, rows, cols } = options;
  
  // Create bright blue material for river highlights
  const riverMaterial = new StandardMaterial("riverMaterial", scene);
  riverMaterial.emissiveColor = new Color3(0.3, 0.7, 1.0);
  riverMaterial.alpha = 0.8;
  
  // Create small quads at river locations
  const tilePixelSize = tileSize / (atlasWidth / cols);
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tileStartX = c * (atlasWidth / cols);
      const tileStartY = r * (atlasHeight / rows);
      const tileEndX = tileStartX + (atlasWidth / cols);
      const tileEndY = tileStartY + (atlasHeight / rows);
      
      // Sample river mask in this tile
      for (let y = tileStartY; y < tileEndY; y += 2) { // Sample every 2 pixels
        for (let x = tileStartX; x < tileEndX; x += 2) {
          const maskIndex = y * atlasWidth + x;
          if (maskIndex < riverMask.length && riverMask[maskIndex] > 0.5) {
            // Create a small river quad
            const riverQuad = MeshBuilder.CreatePlane(`river_${r}_${c}_${x}_${y}`, {
              width: tilePixelSize * 2,
              height: tilePixelSize * 2
            }, scene);
            
            // Position relative to tile
            const relativeX = (x - tileStartX) / (atlasWidth / cols);
            const relativeY = (y - tileStartY) / (atlasHeight / rows);
            
            const worldX = (c - (cols - 1) * 0.5) * tileSize + (relativeX - 0.5) * tileSize;
            const worldZ = (r - (rows - 1) * 0.5) * tileSize + (relativeY - 0.5) * tileSize;
            
            riverQuad.position = new Vector3(worldX, options.waterLevel + 2, worldZ);
            riverQuad.rotation.x = -Math.PI / 2;
            riverQuad.material = riverMaterial;
            
            riverMeshes.push(riverQuad);
          }
        }
      }
    }
  }
  
  return riverMeshes;
}