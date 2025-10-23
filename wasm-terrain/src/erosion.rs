use crate::height_field::HeightField;
use crate::water_system::{WaterFeatures, apply_water_system, WaterSystemParams};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct ErosionParams {
    pub time_years: f32,
    pub sea_level: f32,
    pub wind_strength: f32,
    pub rain_intensity: f32,
    pub temperature_cycles: f32,
}

#[wasm_bindgen]
impl ErosionParams {
    #[wasm_bindgen(constructor)]
    pub fn new(
        time_years: f32,
        sea_level: f32,
        wind_strength: f32,
        rain_intensity: f32,
        temperature_cycles: f32,
    ) -> Self {
        Self {
            time_years,
            sea_level,
            wind_strength,
            rain_intensity,
            temperature_cycles,
        }
    }
}

// Apply wind erosion (affects exposed ridges and high areas)
fn apply_wind_erosion(height_field: &mut HeightField, params: &ErosionParams, iterations: u32) -> Vec<f32> {
    let size = height_field.size();
    let data = height_field.data_mut();
    let mut erosion_mask = vec![0.0f32; size * size];
    
    for _i in 0..iterations {
        for y in 1..size-1 {
            for x in 1..size-1 {
                let idx = y * size + x;
                let height = data[idx];
                
                // Calculate exposure (higher = more exposed to wind)
                let mut max_neighbor_height = 0.0f32;
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        if dx == 0 && dy == 0 { continue; }
                        let n_idx = ((y as i32 + dy) as usize) * size + ((x as i32 + dx) as usize);
                        max_neighbor_height = max_neighbor_height.max(data[n_idx]);
                    }
                }
                
                let exposure = (height - max_neighbor_height + 0.1).max(0.0);
                let wind_erosion = params.wind_strength * exposure * 0.01;
                
                if wind_erosion > 0.0 {
                    data[idx] -= wind_erosion;
                    erosion_mask[idx] += wind_erosion;
                }
            }
        }
    }
    
    erosion_mask
}

// Apply thermal erosion (freeze-thaw, rockfall)
fn apply_thermal_erosion(height_field: &mut HeightField, params: &ErosionParams, iterations: u32) -> Vec<f32> {
    let size = height_field.size();
    let data = height_field.data_mut();
    let mut erosion_mask = vec![0.0f32; size * size];
    let talus_angle = 0.8; // Maximum stable slope
    
    for _i in 0..iterations {
        let mut new_data = data.to_vec();
        
        for y in 1..size-1 {
            for x in 1..size-1 {
                let idx = y * size + x;
                let height = data[idx];
                
                // Check all neighbors for unstable slopes
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        if dx == 0 && dy == 0 { continue; }
                        
                        let n_idx = ((y as i32 + dy) as usize) * size + ((x as i32 + dx) as usize);
                        let neighbor_height = data[n_idx];
                        let height_diff = height - neighbor_height;
                        
                        if height_diff > talus_angle {
                            // Slope is too steep - erode and deposit
                            let erosion_amount = (height_diff - talus_angle) * params.temperature_cycles * 0.001;
                            
                            new_data[idx] -= erosion_amount * 0.5;
                            new_data[n_idx] += erosion_amount * 0.5;
                            erosion_mask[idx] += erosion_amount * 0.5;
                        }
                    }
                }
            }
        }
        
        // Copy back
        data.copy_from_slice(&new_data);
    }
    
    erosion_mask
}

// Apply hydraulic erosion (water-based)
fn apply_hydraulic_erosion(
    height_field: &mut HeightField,
    water_features: &WaterFeatures,
    params: &ErosionParams,
    iterations: u32,
) -> (Vec<f32>, Vec<f32>) {
    let size = height_field.size();
    let data = height_field.data_mut();
    let river_mask = water_features.get_river_mask();
    let flow_accumulation = water_features.get_flow_accumulation();
    
    let mut erosion_mask = vec![0.0f32; size * size];
    let mut deposition_mask = vec![0.0f32; size * size];
    
    // Find max flow for normalization
    let mut max_flow = 0.0f32;
    for i in 0..flow_accumulation.length() {
        let flow = flow_accumulation.get_index(i);
        if flow > max_flow {
            max_flow = flow;
        }
    }
    
    if max_flow == 0.0 {
        return (erosion_mask, deposition_mask);
    }
    
    for _i in 0..iterations {
        for y in 1..size-1 {
            for x in 1..size-1 {
                let idx = y * size + x;
                
                // Calculate erosion based on water flow and slope
                let flow = flow_accumulation.get_index(idx as u32) / max_flow;
                let river_strength = river_mask.get_index(idx as u32);
                
                // Calculate local slope
                let mut total_slope = 0.0f32;
                let mut slope_count = 0;
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        if dx == 0 && dy == 0 { continue; }
                        let n_idx = ((y as i32 + dy) as usize) * size + ((x as i32 + dx) as usize);
                        total_slope += (data[idx] - data[n_idx]).abs();
                        slope_count += 1;
                    }
                }
                let avg_slope = total_slope / slope_count as f32;
                
                // Erosion is proportional to flow * slope * rain intensity
                let hydraulic_erosion = flow * avg_slope * params.rain_intensity * 0.02;
                let river_erosion = river_strength * avg_slope * params.rain_intensity * 0.05;
                
                let total_erosion = hydraulic_erosion + river_erosion;
                
                if total_erosion > 0.0 {
                    data[idx] -= total_erosion;
                    erosion_mask[idx] += total_erosion;
                    
                    // Deposit sediment downstream (simplified)
                    // Find steepest downhill neighbor
                    let mut steepest_slope = 0.0f32;
                    let mut deposit_idx = None;
                    
                    for dy in -1i32..=1 {
                        for dx in -1i32..=1 {
                            if dx == 0 && dy == 0 { continue; }
                            let n_idx = ((y as i32 + dy) as usize) * size + ((x as i32 + dx) as usize);
                            let slope = data[idx] - data[n_idx];
                            
                            if slope > steepest_slope {
                                steepest_slope = slope;
                                deposit_idx = Some(n_idx);
                            }
                        }
                    }
                    
                    if let Some(dep_idx) = deposit_idx {
                        let deposition_amount = total_erosion * 0.3; // Not all sediment deposits immediately
                        data[dep_idx] += deposition_amount;
                        deposition_mask[dep_idx] += deposition_amount;
                    }
                }
            }
        }
    }
    
    (erosion_mask, deposition_mask)
}

#[wasm_bindgen]
pub fn apply_geological_erosion(
    height_field: &mut HeightField,
    params: &ErosionParams,
) -> WaterFeatures {
    crate::utils::console_log!("Applying {} years of geological erosion...", params.time_years);
    
    // Early exit for very small time scales to save performance
    if params.time_years < 10.0 {
        crate::utils::console_log!("Skipping erosion (time too small), generating basic water features...");
        return apply_water_system(height_field, &WaterSystemParams::new(
            params.sea_level / 1000.0,
            0.1, 8.0, 0.05, 0.04, 8.0
        ));
    }
    
    // Calculate erosion iterations based on time scale with limits for performance
    let wind_iterations = ((params.time_years / 100.0).ceil() as u32).min(20); // Cap at 20 iterations
    let thermal_iterations = ((params.time_years / 50.0).ceil() as u32).min(40); // Cap at 40 iterations  
    let hydraulic_iterations = ((params.time_years / 25.0).ceil() as u32).min(80); // Cap at 80 iterations
    
    crate::utils::console_log!(
        "Iterations: Wind={}, Thermal={}, Hydraulic={}",
        wind_iterations, thermal_iterations, hydraulic_iterations
    );
    
    // Step 1: Calculate initial water flow patterns on base terrain
    let water_params = WaterSystemParams::new(
        params.sea_level / 1000.0, // Convert to heightfield units
        0.08, // Lower threshold for more rivers
        8.0,  // River width
        0.05, // River depth
        0.04, // Coastal erosion
        8.0,  // Beach width
    );
    
    let mut water_features = apply_water_system(height_field, &water_params);
    
    // Step 2: Apply erosion processes in geological order
    let mut _total_erosion_mask = vec![0.0f32; height_field.size() * height_field.size()];
    let mut _total_deposition_mask = vec![0.0f32; height_field.size() * height_field.size()];
    
    // Wind erosion (affects ridges and exposed areas)
    if params.wind_strength > 0.0 {
        crate::utils::console_log!("Applying wind erosion...");
        let wind_erosion = apply_wind_erosion(height_field, params, wind_iterations);
        for i in 0.._total_erosion_mask.len() {
            _total_erosion_mask[i] += wind_erosion[i];
        }
    }
    
    // Thermal erosion (freeze-thaw, rockfall)
    if params.temperature_cycles > 0.0 {
        crate::utils::console_log!("Applying thermal erosion...");
        let thermal_erosion = apply_thermal_erosion(height_field, params, thermal_iterations);
        for i in 0.._total_erosion_mask.len() {
            _total_erosion_mask[i] += thermal_erosion[i];
        }
    }
    
    // Hydraulic erosion (water-based) - recalculate flow after terrain changes
    if params.rain_intensity > 0.0 {
        crate::utils::console_log!("Applying hydraulic erosion...");
        
        // Recalculate water flow on modified terrain
        water_features = apply_water_system(height_field, &water_params);
        
        let (erosion_mask, deposition_mask) = apply_hydraulic_erosion(
            height_field, 
            &water_features, 
            params, 
            hydraulic_iterations
        );
        
        for i in 0.._total_erosion_mask.len() {
            _total_erosion_mask[i] += erosion_mask[i];
            _total_deposition_mask[i] += deposition_mask[i];
        }
        
        // Update final water mask
        water_features = apply_water_system(height_field, &water_params);
    }
    
    crate::utils::console_log!("Geological erosion complete");
    
    water_features
}