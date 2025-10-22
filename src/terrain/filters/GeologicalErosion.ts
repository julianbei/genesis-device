import { HeightField } from '../HeightField';
import { WaterFeatures, calculateFlowAccumulation, generateRiverMask, generateBeachMask } from './WaterSystem';

export interface ErosionParams {
  timeYears: number;       // Erosion time in years
  seaLevel: number;        // Absolute sea level in meters
  windStrength: number;    // Wind erosion strength
  rainIntensity: number;   // Rainfall intensity
  temperatureCycles: number; // Freeze-thaw cycles per year
}

export interface GeologicalResult {
  heightField: HeightField;
  waterFeatures: WaterFeatures;
  erosionMask: Float32Array;  // Shows erosion intensity
  depositionMask: Float32Array; // Shows sediment deposition
}

// Apply wind erosion (particularly important for exposed ridges and desert)
function applyWindErosion(heightField: HeightField, params: ErosionParams, iterations: number): Float32Array {
  const size = heightField.size;
  const { data } = heightField;
  const erosionMask = new Float32Array(size * size);
  
  // Wind erosion primarily affects exposed, high areas
  for (let i = 0; i < iterations; i++) {
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = y * size + x;
        const height = data[idx];
        
        // Calculate exposure (higher = more exposed to wind)
        let maxNeighborHeight = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = (y + dy) * size + (x + dx);
            maxNeighborHeight = Math.max(maxNeighborHeight, data[nIdx]);
          }
        }
        
        const exposure = Math.max(0, height - maxNeighborHeight + 0.1);
        const windErosion = params.windStrength * exposure * 0.01;
        
        if (windErosion > 0) {
          data[idx] -= windErosion;
          erosionMask[idx] += windErosion;
        }
      }
    }
  }
  
  return erosionMask;
}

// Apply thermal erosion (freeze-thaw, rockfall)
function applyThermalErosion(heightField: HeightField, params: ErosionParams, iterations: number): Float32Array {
  const size = heightField.size;
  const { data } = heightField;
  const erosionMask = new Float32Array(size * size);
  const talusAngle = 0.8; // Maximum stable slope
  
  for (let i = 0; i < iterations; i++) {
    const newData = new Float32Array(data);
    
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = y * size + x;
        const height = data[idx];
        
        // Check all neighbors for unstable slopes
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nIdx = (y + dy) * size + (x + dx);
            const neighborHeight = data[nIdx];
            const heightDiff = height - neighborHeight;
            
            if (heightDiff > talusAngle) {
              // Slope is too steep - erode and deposit
              const erosionAmount = (heightDiff - talusAngle) * params.temperatureCycles * 0.001;
              
              newData[idx] -= erosionAmount * 0.5;
              newData[nIdx] += erosionAmount * 0.5;
              erosionMask[idx] += erosionAmount * 0.5;
            }
          }
        }
      }
    }
    
    // Copy back
    for (let j = 0; j < data.length; j++) {
      data[j] = newData[j];
    }
  }
  
  return erosionMask;
}

// Apply hydraulic erosion (water-based)
function applyHydraulicErosion(
  heightField: HeightField, 
  waterFeatures: WaterFeatures,
  params: ErosionParams, 
  iterations: number
): { erosionMask: Float32Array, depositionMask: Float32Array } {
  const size = heightField.size;
  const { data } = heightField;
  const { riverMask, flowAccumulation } = waterFeatures;
  
  const erosionMask = new Float32Array(size * size);
  const depositionMask = new Float32Array(size * size);
  
  // Find max flow for normalization
  let maxFlow = 0;
  for (let i = 0; i < flowAccumulation.length; i++) {
    maxFlow = Math.max(maxFlow, flowAccumulation[i]);
  }
  
  for (let i = 0; i < iterations; i++) {
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = y * size + x;
        
        // Calculate erosion based on water flow and slope
        const flow = flowAccumulation[idx] / maxFlow;
        const riverStrength = riverMask[idx];
        
        // Calculate local slope
        let totalSlope = 0;
        let slopeCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = (y + dy) * size + (x + dx);
            totalSlope += Math.abs(data[idx] - data[nIdx]);
            slopeCount++;
          }
        }
        const avgSlope = totalSlope / slopeCount;
        
        // Erosion is proportional to flow * slope * rain intensity
        const hydraulicErosion = flow * avgSlope * params.rainIntensity * 0.02;
        const riverErosion = riverStrength * avgSlope * params.rainIntensity * 0.05;
        
        const totalErosion = hydraulicErosion + riverErosion;
        
        if (totalErosion > 0) {
          data[idx] -= totalErosion;
          erosionMask[idx] += totalErosion;
          
          // Deposit sediment downstream (simplified)
          // Find steepest downhill neighbor
          let steepestSlope = 0;
          let depositIdx = -1;
          
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nIdx = (y + dy) * size + (x + dx);
              const slope = data[idx] - data[nIdx];
              
              if (slope > steepestSlope) {
                steepestSlope = slope;
                depositIdx = nIdx;
              }
            }
          }
          
          if (depositIdx >= 0) {
            const depositionAmount = totalErosion * 0.3; // Not all sediment deposits immediately
            data[depositIdx] += depositionAmount;
            depositionMask[depositIdx] += depositionAmount;
          }
        }
      }
    }
  }
  
  return { erosionMask, depositionMask };
}

// Main geological erosion pipeline
export function applyGeologicalErosion(
  heightField: HeightField,
  params: ErosionParams
): GeologicalResult {
  console.log(`Applying ${params.timeYears} years of geological erosion...`);
  
  // Calculate erosion iterations based on time scale
  const windIterations = Math.ceil(params.timeYears / 100); // Wind acts slowly
  const thermalIterations = Math.ceil(params.timeYears / 50); // Thermal more frequent
  const hydraulicIterations = Math.ceil(params.timeYears / 25); // Water most frequent
  
  console.log(`Iterations: Wind=${windIterations}, Thermal=${thermalIterations}, Hydraulic=${hydraulicIterations}`);
  
  // Step 1: Calculate initial water flow patterns on base terrain
  const flowAccumulation = calculateFlowAccumulation(heightField);
  let riverMask = generateRiverMask(heightField, flowAccumulation, 0.08); // Lower threshold for more rivers
  let beachMask = generateBeachMask(heightField, params.seaLevel / 1000, 8); // Convert to heightfield units
  
  let waterFeatures: WaterFeatures = {
    waterMask: new Float32Array(heightField.size * heightField.size),
    riverMask,
    beachMask,
    flowAccumulation
  };
  
  // Generate initial water mask
  for (let i = 0; i < waterFeatures.waterMask.length; i++) {
    const belowSeaLevel = heightField.data[i] <= (params.seaLevel / 1000) ? 1.0 : 0.0;
    waterFeatures.waterMask[i] = Math.max(belowSeaLevel, riverMask[i]);
  }
  
  // Step 2: Apply erosion processes in geological order
  let totalErosionMask = new Float32Array(heightField.size * heightField.size);
  let totalDepositionMask = new Float32Array(heightField.size * heightField.size);
  
  // Wind erosion (affects ridges and exposed areas)
  if (params.windStrength > 0) {
    console.log('Applying wind erosion...');
    const windErosion = applyWindErosion(heightField, params, windIterations);
    for (let i = 0; i < totalErosionMask.length; i++) {
      totalErosionMask[i] += windErosion[i];
    }
  }
  
  // Thermal erosion (freeze-thaw, rockfall)
  if (params.temperatureCycles > 0) {
    console.log('Applying thermal erosion...');
    const thermalErosion = applyThermalErosion(heightField, params, thermalIterations);
    for (let i = 0; i < totalErosionMask.length; i++) {
      totalErosionMask[i] += thermalErosion[i];
    }
  }
  
  // Hydraulic erosion (water-based) - recalculate flow after terrain changes
  if (params.rainIntensity > 0) {
    console.log('Applying hydraulic erosion...');
    
    // Recalculate water flow on modified terrain
    const newFlowAccumulation = calculateFlowAccumulation(heightField);
    const newRiverMask = generateRiverMask(heightField, newFlowAccumulation, 0.08); // Keep lower threshold
    
    waterFeatures = {
      waterMask: waterFeatures.waterMask,
      riverMask: newRiverMask,
      beachMask: generateBeachMask(heightField, params.seaLevel / 1000, 8),
      flowAccumulation: newFlowAccumulation
    };
    
    const { erosionMask, depositionMask } = applyHydraulicErosion(heightField, waterFeatures, params, hydraulicIterations);
    
    for (let i = 0; i < totalErosionMask.length; i++) {
      totalErosionMask[i] += erosionMask[i];
      totalDepositionMask[i] += depositionMask[i];
    }
    
    // Update final water mask
    for (let i = 0; i < waterFeatures.waterMask.length; i++) {
      const belowSeaLevel = heightField.data[i] <= (params.seaLevel / 1000) ? 1.0 : 0.0;
      waterFeatures.waterMask[i] = Math.max(belowSeaLevel, waterFeatures.riverMask[i]);
    }
  }
  
  console.log('Geological erosion complete');
  
  return {
    heightField,
    waterFeatures,
    erosionMask: totalErosionMask,
    depositionMask: totalDepositionMask
  };
}