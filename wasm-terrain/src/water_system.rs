use crate::height_field::HeightField;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone)]
pub struct WaterSystemParams {
    pub sea_level: f32,
    pub river_threshold: f32,
    pub river_width: f32,
    pub river_depth: f32,
    pub coastal_erosion: f32,
    pub beach_width: f32,
}

#[wasm_bindgen]
impl WaterSystemParams {
    #[wasm_bindgen(constructor)]
    pub fn new(
        sea_level: f32,
        river_threshold: f32,
        river_width: f32,
        river_depth: f32,
        coastal_erosion: f32,
        beach_width: f32,
    ) -> Self {
        Self {
            sea_level,
            river_threshold,
            river_width,
            river_depth,
            coastal_erosion,
            beach_width,
        }
    }
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct WaterFeatures {
    water_mask: Vec<f32>,
    river_mask: Vec<f32>,
    beach_mask: Vec<f32>,
    flow_accumulation: Vec<f32>,
    size: usize,
}

#[wasm_bindgen]
impl WaterFeatures {
    pub fn new(size: usize) -> Self {
        let len = size * size;
        Self {
            water_mask: vec![0.0; len],
            river_mask: vec![0.0; len],
            beach_mask: vec![0.0; len],
            flow_accumulation: vec![0.0; len],
            size,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn size(&self) -> usize {
        self.size
    }

    #[wasm_bindgen]
    pub fn get_water_mask(&self) -> js_sys::Float32Array {
        let array = js_sys::Float32Array::new_with_length(self.water_mask.len() as u32);
        array.copy_from(&self.water_mask);
        array
    }

    #[wasm_bindgen]
    pub fn get_river_mask(&self) -> js_sys::Float32Array {
        let array = js_sys::Float32Array::new_with_length(self.river_mask.len() as u32);
        array.copy_from(&self.river_mask);
        array
    }

    #[wasm_bindgen]
    pub fn get_beach_mask(&self) -> js_sys::Float32Array {
        let array = js_sys::Float32Array::new_with_length(self.beach_mask.len() as u32);
        array.copy_from(&self.beach_mask);
        array
    }

    #[wasm_bindgen]
    pub fn get_flow_accumulation(&self) -> js_sys::Float32Array {
        let array = js_sys::Float32Array::new_with_length(self.flow_accumulation.len() as u32);
        array.copy_from(&self.flow_accumulation);
        array
    }

    // Convert to JS object for interop
    pub fn to_js_object(&self) -> js_sys::Object {
        let obj = js_sys::Object::new();
        
        js_sys::Reflect::set(&obj, &"waterMask".into(), &self.get_water_mask()).unwrap();
        js_sys::Reflect::set(&obj, &"riverMask".into(), &self.get_river_mask()).unwrap();
        js_sys::Reflect::set(&obj, &"beachMask".into(), &self.get_beach_mask()).unwrap();
        js_sys::Reflect::set(&obj, &"flowAccumulation".into(), &self.get_flow_accumulation()).unwrap();
        
        obj
    }
}

// D8 flow directions: N, NE, E, SE, S, SW, W, NW
const DX: [i32; 8] = [0, 1, 1, 1, 0, -1, -1, -1];
const DY: [i32; 8] = [-1, -1, 0, 1, 1, 1, 0, -1];

// Calculate flow accumulation using D8 algorithm
fn calculate_flow_accumulation(height_field: &HeightField) -> Vec<f32> {
    let size = height_field.size();
    let data = height_field.data();
    
    if size == 0 || data.is_empty() {
        return vec![0.0; size * size];
    }
    
    let mut flow = vec![1.0f32; size * size]; // Start with 1 unit of flow
    let mut processed = vec![false; size * size];
    
    // Create height-sorted list of points (highest first)
    let mut points: Vec<(usize, usize, f32, usize)> = Vec::new();
    for y in 0..size {
        for x in 0..size {
            let idx = y * size + x;
            points.push((x, y, data[idx], idx));
        }
    }
    points.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
    
    // Process from highest to lowest
    for (x, y, _height, idx) in points {
        if processed[idx] {
            continue;
        }
        
        let mut steepest_slope = 0.0;
        let mut flow_to_idx = None;
        
        // Find steepest downhill neighbor
        for dir in 0..8 {
            let nx = x as i32 + DX[dir];
            let ny = y as i32 + DY[dir];
            
            if nx >= 0 && (nx as usize) < size && ny >= 0 && (ny as usize) < size {
                let n_idx = (ny as usize) * size + (nx as usize);
                let distance = ((DX[dir] * DX[dir] + DY[dir] * DY[dir]) as f32).sqrt();
                let slope = (data[idx] - data[n_idx]) / distance;
                
                if slope > steepest_slope {
                    steepest_slope = slope;
                    flow_to_idx = Some(n_idx);
                }
            }
        }
        
        // Accumulate flow to steepest neighbor
        if let Some(target_idx) = flow_to_idx {
            flow[target_idx] += flow[idx];
        }
        
        processed[idx] = true;
    }
    
    flow
}

// Generate river mask from flow accumulation
fn generate_river_mask(
    height_field: &HeightField,
    flow_accumulation: &[f32],
    threshold: f32,
) -> Vec<f32> {
    let size = height_field.size();
    let mut river_mask = vec![0.0f32; size * size];
    
    // Find maximum flow for normalization
    let max_flow = flow_accumulation.iter().fold(0.0f32, |max, &val| max.max(val));
    
    if max_flow == 0.0 {
        return river_mask;
    }
    
    // Create initial river mask with gradient falloff
    for i in 0..river_mask.len() {
        let normalized_flow = flow_accumulation[i] / max_flow;
        
        if normalized_flow > threshold {
            // Strong rivers get full strength
            river_mask[i] = ((normalized_flow - threshold) / (1.0 - threshold)).min(1.0);
        } else if normalized_flow > threshold * 0.3 {
            // Weak flows create river banks and tributaries
            let bank_strength = (normalized_flow - threshold * 0.3) / (threshold * 0.7);
            river_mask[i] = bank_strength * 0.3; // Reduced strength for banks
        }
    }
    
    // Smooth and expand rivers
    let mut smoothed = river_mask.clone();
    for y in 1..size-1 {
        for x in 1..size-1 {
            let idx = y * size + x;
            
            if river_mask[idx] > 0.5 {
                // Expand main rivers slightly
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        let nx = x as i32 + dx;
                        let ny = y as i32 + dy;
                        
                        if nx >= 0 && (nx as usize) < size && ny >= 0 && (ny as usize) < size {
                            let n_idx = (ny as usize) * size + (nx as usize);
                            let distance = ((dx * dx + dy * dy) as f32).sqrt();
                            
                            if distance <= 1.5 {
                                let expansion = river_mask[idx] * 0.6 * (1.0 - distance / 1.5);
                                smoothed[n_idx] = smoothed[n_idx].max(expansion);
                            }
                        }
                    }
                }
            }
        }
    }
    
    smoothed
}

// Generate beach mask around water areas
fn generate_beach_mask(height_field: &HeightField, sea_level: f32, beach_width: f32) -> Vec<f32> {
    let size = height_field.size();
    let data = height_field.data();
    let mut beach_mask = vec![0.0f32; size * size];
    let mut water_mask = vec![0.0f32; size * size];
    
    // First pass: identify water areas
    for i in 0..data.len() {
        water_mask[i] = if data[i] <= sea_level { 1.0 } else { 0.0 };
    }
    
    // Second pass: expand water areas to create beaches
    let beach_pixels = beach_width.ceil() as i32;
    for y in 0..size {
        for x in 0..size {
            let idx = y * size + x;
            
            if water_mask[idx] > 0.0 {
                beach_mask[idx] = 1.0; // Water areas are also beaches
                continue;
            }
            
            // Check distance to nearest water
            let mut found_water = false;
            for dy in -beach_pixels..=beach_pixels {
                if found_water { break; }
                for dx in -beach_pixels..=beach_pixels {
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    
                    if nx >= 0 && (nx as usize) < size && ny >= 0 && (ny as usize) < size {
                        let n_idx = (ny as usize) * size + (nx as usize);
                        let distance = ((dx * dx + dy * dy) as f32).sqrt();
                        
                        if water_mask[n_idx] > 0.0 && distance <= beach_width {
                            beach_mask[idx] = (1.0 - distance / beach_width).max(0.0);
                            found_water = true;
                            break;
                        }
                    }
                }
            }
        }
    }
    
    beach_mask
}

// Carve river channels into heightfield
fn carve_rivers(
    height_field: &mut HeightField,
    river_mask: &[f32],
    depth: f32,
    _width: f32,
) {
    let size = height_field.size();
    let data = height_field.data_mut();
    
    // Calculate terrain hardness based on slope
    let mut hardness = vec![0.0f32; size * size];
    for y in 0..size {
        for x in 0..size {
            let idx = y * size + x;
            
            // Calculate local slope
            let mut slope = 0.0;
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    if dx == 0 && dy == 0 { continue; }
                    let nx = ((x as i32 + dx).max(0) as usize).min(size - 1);
                    let ny = ((y as i32 + dy).max(0) as usize).min(size - 1);
                    let n_idx = ny * size + nx;
                    slope += (data[idx] - data[n_idx]).abs();
                }
            }
            slope /= 8.0; // Average slope
            
            // Height also affects hardness
            let height_factor = (data[idx] + 0.3).max(0.0);
            
            // Combine slope and height to determine terrain hardness
            hardness[idx] = (slope * 3.0 + height_factor * 0.4).min(1.0);
        }
    }
    
    // Apply river carving
    for i in 0..data.len() {
        if river_mask[i] > 0.0 {
            let river_strength = river_mask[i];
            let terrain_hardness = hardness[i];
            
            // Adjust carving based on terrain hardness
            let carve_depth = if terrain_hardness > 0.7 {
                depth * 2.0 // Hard rock: deep canyons
            } else if terrain_hardness > 0.4 {
                depth * 1.2 // Medium rock: normal rivers
            } else {
                depth * 0.4 // Soft sediment: shallow rivers
            };
            
            let erosion = carve_depth * river_strength * 0.7;
            data[i] = (data[i] - erosion).max(0.0);
        }
    }
}

// Apply coastal erosion
fn apply_coastal_erosion(height_field: &mut HeightField, beach_mask: &[f32], erosion_amount: f32) {
    let data = height_field.data_mut();
    
    for i in 0..data.len() {
        if beach_mask[i] > 0.0 {
            let erosion = erosion_amount * beach_mask[i];
            data[i] = (data[i] - erosion).max(data[i] * 0.3);
        }
    }
}

#[wasm_bindgen]
pub fn apply_water_system(
    height_field: &mut HeightField,
    params: &WaterSystemParams,
) -> WaterFeatures {
    let size = height_field.size();
    
    // Calculate flow accumulation
    let flow_accumulation = calculate_flow_accumulation(height_field);
    
    // Generate masks
    let river_mask = generate_river_mask(height_field, &flow_accumulation, params.river_threshold);
    let beach_mask = generate_beach_mask(height_field, params.sea_level, params.beach_width);
    
    // Apply erosion effects
    carve_rivers(height_field, &river_mask, params.river_depth, params.river_width);
    apply_coastal_erosion(height_field, &beach_mask, params.coastal_erosion);
    
    // Generate final water mask (sea level + rivers)
    let data = height_field.data();
    let mut water_mask = vec![0.0f32; size * size];
    for i in 0..water_mask.len() {
        let below_sea_level = if data[i] <= params.sea_level { 1.0f32 } else { 0.0f32 };
        water_mask[i] = below_sea_level.max(river_mask[i]);
    }
    
    WaterFeatures {
        water_mask,
        river_mask,
        beach_mask,
        flow_accumulation,
        size,
    }
}