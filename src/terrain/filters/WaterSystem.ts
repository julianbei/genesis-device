import { HeightField } from '../HeightField';

export interface WaterSystemParams {
  seaLevel: number;        // Zero point for water level
  riverThreshold: number;  // Minimum flow accumulation to form rivers
  riverWidth: number;      // Width of carved river channels
  riverDepth: number;      // How deep rivers carve
  coastalErosion: number;  // How much beaches erode inland
  beachWidth: number;      // Width of beach/coastal zone
}

export interface WaterFeatures {
  waterMask: Float32Array;    // 1.0 = water, 0.0 = land
  riverMask: Float32Array;    // 1.0 = river, 0.0 = no river
  beachMask: Float32Array;    // 1.0 = beach, 0.0 = no beach
  flowAccumulation: Float32Array; // Flow values for river generation
}

// Calculate flow accumulation using D8 algorithm
export function calculateFlowAccumulation(heightField: HeightField): Float32Array {
  const size = heightField.size;
  const { data } = heightField;
  
  // Validate input
  if (size <= 0 || !data || data.length !== size * size) {
    console.error('Invalid heightfield for flow accumulation:', { size, dataLength: data?.length });
    return new Float32Array(size * size).fill(0);
  }
  
  const flow = new Float32Array(size * size).fill(1.0); // Start with 1 unit of flow
  const processed = new Array(size * size).fill(false);
  
  // D8 directions: N, NE, E, SE, S, SW, W, NW
  const dx = [0, 1, 1, 1, 0, -1, -1, -1];
  const dy = [-1, -1, 0, 1, 1, 1, 0, -1];
  
  // Create height-sorted list of points (highest first)
  const points: Array<{x: number, y: number, height: number, index: number}> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      points.push({ x, y, height: data[idx], index: idx });
    }
  }
  points.sort((a, b) => b.height - a.height);
  
  // Process from highest to lowest
  for (const point of points) {
    if (processed[point.index]) continue;
    
    const { x, y } = point;
    let steepestSlope = 0;
    let flowToX = -1, flowToY = -1;
    
    // Find steepest downhill neighbor
    for (let dir = 0; dir < 8; dir++) {
      const nx = x + dx[dir];
      const ny = y + dy[dir];
      
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        const nIdx = ny * size + nx;
        const slope = (data[point.index] - data[nIdx]) / 
                     Math.sqrt(dx[dir] * dx[dir] + dy[dir] * dy[dir]);
        
        if (slope > steepestSlope) {
          steepestSlope = slope;
          flowToX = nx;
          flowToY = ny;
        }
      }
    }
    
    // Accumulate flow to steepest neighbor
    if (flowToX >= 0 && flowToY >= 0) {
      const targetIdx = flowToY * size + flowToX;
      flow[targetIdx] += flow[point.index];
    }
    
    processed[point.index] = true;
  }
  
  return flow;
}

// Generate river mask from flow accumulation with smooth gradients
export function generateRiverMask(
  heightField: HeightField, 
  flowAccumulation: Float32Array, 
  threshold: number
): Float32Array {
  const size = heightField.size;
  const riverMask = new Float32Array(size * size);
  
  // Find maximum flow for normalization (avoid stack overflow with large arrays)
  let maxFlow = 0;
  for (let i = 0; i < flowAccumulation.length; i++) {
    if (flowAccumulation[i] > maxFlow) {
      maxFlow = flowAccumulation[i];
    }
  }
  
  if (maxFlow === 0) return riverMask; // No flow found
  
  // Create initial river mask with gradient falloff
  for (let i = 0; i < riverMask.length; i++) {
    const normalizedFlow = flowAccumulation[i] / maxFlow;
    
    if (normalizedFlow > threshold) {
      // Strong rivers get full strength
      riverMask[i] = Math.min(1.0, (normalizedFlow - threshold) / (1.0 - threshold));
    } else if (normalizedFlow > threshold * 0.3) {
      // Weak flows create river banks and tributaries
      const bankStrength = (normalizedFlow - threshold * 0.3) / (threshold * 0.7);
      riverMask[i] = bankStrength * 0.3; // Reduced strength for banks
    }
  }
  
  // Smooth and expand rivers to create natural channels
  const smoothed = new Float32Array(riverMask);
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      
      if (riverMask[idx] > 0.5) {
        // Expand main rivers slightly
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = (y + dy) * size + (x + dx);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= 1.5) {
              const expansion = riverMask[idx] * 0.6 * (1.0 - distance / 1.5);
              smoothed[nIdx] = Math.max(smoothed[nIdx], expansion);
            }
          }
        }
      }
    }
  }
  
  // Copy smoothed values back
  for (let i = 0; i < riverMask.length; i++) {
    riverMask[i] = smoothed[i];
  }
  
  return riverMask;
}

// Generate beach mask around water areas
export function generateBeachMask(
  heightField: HeightField,
  seaLevel: number,
  beachWidth: number
): Float32Array {
  const size = heightField.size;
  const { data } = heightField;
  const beachMask = new Float32Array(size * size);
  const waterMask = new Float32Array(size * size);
  
  // First pass: identify water areas
  for (let i = 0; i < data.length; i++) {
    waterMask[i] = data[i] <= seaLevel ? 1.0 : 0.0;
  }
  
  // Second pass: expand water areas to create beaches
  const beachPixels = Math.ceil(beachWidth);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      
      if (waterMask[idx] > 0) {
        beachMask[idx] = 1.0; // Water areas are also beaches
        continue;
      }
      
      // Check distance to nearest water
      let nearWater = false;
      for (let dy = -beachPixels; dy <= beachPixels && !nearWater; dy++) {
        for (let dx = -beachPixels; dx <= beachPixels && !nearWater; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
            const nIdx = ny * size + nx;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (waterMask[nIdx] > 0 && distance <= beachPixels) {
              beachMask[idx] = Math.max(0, 1.0 - distance / beachPixels);
              nearWater = true;
            }
          }
        }
      }
    }
  }
  
  return beachMask;
}

// Carve river channels into heightfield with realistic erosion
export function carveRivers(
  heightField: HeightField,
  riverMask: Float32Array,
  depth: number,
  width: number
): void {
  const size = heightField.size;
  const { data } = heightField;
  
  // Calculate terrain hardness based on slope and height
  const hardness = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      
      // Calculate local slope (steeper = harder rock)
      let slope = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = Math.max(0, Math.min(size - 1, x + dx));
          const ny = Math.max(0, Math.min(size - 1, y + dy));
          const nIdx = ny * size + nx;
          slope += Math.abs(data[idx] - data[nIdx]);
        }
      }
      slope /= 8; // Average slope
      
      // Height also affects hardness (higher = more rock exposed)
      const heightFactor = Math.max(0, data[idx] + 0.3); // Normalize around sea level
      
      // Combine slope and height to determine terrain hardness
      // 0.0 = soft sediment, 1.0 = hard rock
      hardness[idx] = Math.min(1.0, slope * 3.0 + heightFactor * 0.4);
    }
  }
  
  // Apply river carving with terrain-dependent profiles
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      
      if (riverMask[idx] > 0) {
        const riverStrength = riverMask[idx];
        const terrainHardness = hardness[idx];
        
        // Determine river profile based on terrain type
        let carveWidth, carveDepth, profile;
        
        if (terrainHardness > 0.7) {
          // Hard rock: narrow, deep canyons
          carveWidth = width * 0.3;
          carveDepth = depth * 2.0;
          profile = "canyon";
        } else if (terrainHardness > 0.4) {
          // Medium rock: normal rivers
          carveWidth = width * 0.7;
          carveDepth = depth * 1.2;
          profile = "normal";
        } else {
          // Soft sediment: wide, shallow river beds
          carveWidth = width * 1.8;
          carveDepth = depth * 0.4;
          profile = "broad";
        }
        
        const carveRadius = Math.ceil(carveWidth / 2);
        
        // Apply erosion with smooth falloff
        for (let dy = -carveRadius; dy <= carveRadius; dy++) {
          for (let dx = -carveRadius; dx <= carveRadius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
              const nIdx = ny * size + nx;
              const distance = Math.sqrt(dx * dx + dy * dy);
              
              if (distance <= carveRadius) {
                // Create different erosion profiles
                let erosionCurve;
                const normalizedDist = distance / carveRadius;
                
                switch (profile) {
                  case "canyon":
                    // V-shaped profile for canyons
                    erosionCurve = Math.max(0, 1.0 - normalizedDist * normalizedDist);
                    break;
                  case "broad":
                    // U-shaped profile for wide rivers
                    erosionCurve = Math.max(0, Math.cos(normalizedDist * Math.PI / 2));
                    break;
                  default:
                    // Natural river profile (between V and U)
                    erosionCurve = Math.max(0, 1.0 - Math.pow(normalizedDist, 1.5));
                }
                
                // Apply gradual erosion that considers existing terrain
                const maxErosion = carveDepth * riverStrength * erosionCurve;
                const currentHeight = data[nIdx];
                
                // Don't erode below the river's target level
                const riverLevel = data[idx] - carveDepth * riverStrength;
                const targetHeight = Math.max(riverLevel, currentHeight - maxErosion);
                
                // Smooth transition - don't instantly carve, gradually erode
                data[nIdx] = currentHeight + (targetHeight - currentHeight) * 0.7;
              }
            }
          }
        }
      }
    }
  }
  
  // Second pass: smooth river connections and banks
  const smoothed = new Float32Array(data);
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      
      if (riverMask[idx] > 0.5) {
        // Smooth river channels themselves
        let sum = 0;
        let count = 0;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = (y + dy) * size + (x + dx);
            if (riverMask[nIdx] > 0.3) { // Only smooth with nearby river areas
              sum += data[nIdx];
              count++;
            }
          }
        }
        
        if (count > 0) {
          smoothed[idx] = sum / count;
        }
      } else if (riverMask[idx] > 0.1) {
        // Smooth river banks (areas near rivers)
        let sum = 0;
        let count = 0;
        
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = (y + dy) * size + (x + dx);
            sum += data[nIdx];
            count++;
          }
        }
        
        // Blend with smoothed value for natural banks
        const smoothValue = sum / count;
        smoothed[idx] = data[idx] * 0.7 + smoothValue * 0.3;
      }
    }
  }
  
  // Copy smoothed values back
  for (let i = 0; i < data.length; i++) {
    data[i] = smoothed[i];
  }
}

// Apply coastal erosion to create realistic beach profiles
export function applyCoastalErosion(
  heightField: HeightField,
  beachMask: Float32Array,
  erosionAmount: number
): void {
  const { data } = heightField;
  
  for (let i = 0; i < data.length; i++) {
    if (beachMask[i] > 0) {
      // Create gentle slope towards water
      const erosion = erosionAmount * beachMask[i];
      data[i] = Math.max(data[i] - erosion, data[i] * 0.3); // Don't erode below 30% of original
    }
  }
}

// Main water system application
export function applyWaterSystem(
  heightField: HeightField,
  params: WaterSystemParams
): WaterFeatures {
  // Calculate flow accumulation
  const flowAccumulation = calculateFlowAccumulation(heightField);
  
  // Generate masks
  const riverMask = generateRiverMask(heightField, flowAccumulation, params.riverThreshold);
  const beachMask = generateBeachMask(heightField, params.seaLevel, params.beachWidth);
  
  // Apply erosion effects
  carveRivers(heightField, riverMask, params.riverDepth, params.riverWidth);
  applyCoastalErosion(heightField, beachMask, params.coastalErosion);
  
  // Generate final water mask (sea level + rivers)
  const waterMask = new Float32Array(heightField.size * heightField.size);
  for (let i = 0; i < waterMask.length; i++) {
    const belowSeaLevel = heightField.data[i] <= params.seaLevel ? 1.0 : 0.0;
    waterMask[i] = Math.max(belowSeaLevel, riverMask[i]);
  }
  
  return {
    waterMask,
    riverMask,
    beachMask,
    flowAccumulation
  };
}