use crate::height_field::HeightField;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct SlopeBlurParams {
    pub radius: f32,
    pub k: f32,
    pub iterations: u32,
}

#[wasm_bindgen]
impl SlopeBlurParams {
    #[wasm_bindgen(constructor)]
    pub fn new(radius: f32, k: f32, iterations: u32) -> Self {
        Self { radius, k, iterations }
    }
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct DuneParams {
    pub scale: f32,
    pub amplitude: f32,
    pub direction: f32, // radians
}

#[wasm_bindgen]
impl DuneParams {
    #[wasm_bindgen(constructor)]
    pub fn new(scale: f32, amplitude: f32, direction: f32) -> Self {
        Self { scale, amplitude, direction }
    }
}

// Calculate slope at a point
fn slope_at(height_field: &HeightField, x: usize, y: usize) -> f32 {
    let dx = (height_field.get_clamped(x as i32 + 1, y as i32) - 
              height_field.get_clamped(x as i32 - 1, y as i32)) * 0.5;
    let dy = (height_field.get_clamped(x as i32, y as i32 + 1) - 
              height_field.get_clamped(x as i32, y as i32 - 1)) * 0.5;
    (dx * dx + dy * dy).sqrt()
}

#[wasm_bindgen]
pub fn apply_slope_blur(height_field: &mut HeightField, params: &SlopeBlurParams) {
    let n = height_field.size();
    let mut tmp = vec![0.0f32; n * n];
    
    for _it in 0..params.iterations {
        for y in 0..n {
            for x in 0..n {
                let s = slope_at(height_field, x, y);
                let r = (params.radius * (1.0 - params.k * (s * 10.0).min(1.0))).max(1.0) as i32;
                
                let mut sum = 0.0;
                let mut cnt = 0;
                
                for j in -r..=r {
                    let yy = ((y as i32 + j).max(0) as usize).min(n - 1);
                    for i in -r..=r {
                        let xx = ((x as i32 + i).max(0) as usize).min(n - 1);
                        sum += height_field.get(xx, yy);
                        cnt += 1;
                    }
                }
                
                tmp[y * n + x] = sum / cnt as f32;
            }
        }
        
        // Copy back to height field
        let data = height_field.data_mut();
        data.copy_from_slice(&tmp);
    }
}

#[wasm_bindgen]
pub fn apply_ridge_sharpen(height_field: &mut HeightField, strength: f32) {
    let n = height_field.size();
    let mut out = vec![0.0f32; n * n];
    
    for y in 0..n {
        for x in 0..n {
            let c = height_field.get(x, y);
            let left = height_field.get_clamped(x as i32 - 1, y as i32);
            let right = height_field.get_clamped(x as i32 + 1, y as i32);
            let up = height_field.get_clamped(x as i32, y as i32 - 1);
            let down = height_field.get_clamped(x as i32, y as i32 + 1);
            
            let lap = left + right + up + down - 4.0 * c;
            out[y * n + x] = c - strength * lap; // unsharp mask
        }
    }
    
    let data = height_field.data_mut();
    data.copy_from_slice(&out);
}

#[wasm_bindgen]
pub fn apply_dunes(height_field: &mut HeightField, params: &DuneParams) {
    let n = height_field.size();
    let dx = params.direction.cos();
    let dy = params.direction.sin();
    
    for y in 0..n {
        for x in 0..n {
            let u = (x as f32 * dx + y as f32 * dy) / n as f32;
            let w = (u * params.scale * std::f32::consts::PI * 2.0).sin() * params.amplitude;
            let current = height_field.get(x, y);
            height_field.set(x, y, current + w);
        }
    }
}

// Additional optimized filters for WASM

#[wasm_bindgen]
pub fn apply_thermal_erosion(height_field: &mut HeightField, iterations: u32, talus_angle: f32) {
    let n = height_field.size();
    let mut tmp = vec![0.0f32; n * n];
    
    for _iter in 0..iterations {
        // Copy original data
        tmp.copy_from_slice(height_field.data());
        
        for y in 1..n-1 {
            for x in 1..n-1 {
                let height = height_field.get(x, y);
                
                // Check all 8 neighbors
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        if dx == 0 && dy == 0 { continue; }
                        
                        let nx = (x as i32 + dx) as usize;
                        let ny = (y as i32 + dy) as usize;
                        let neighbor_height = height_field.get(nx, ny);
                        let height_diff = height - neighbor_height;
                        
                        if height_diff > talus_angle {
                            // Slope is too steep - erode and deposit
                            let erosion_amount = (height_diff - talus_angle) * 0.1;
                            
                            let idx = y * n + x;
                            let n_idx = ny * n + nx;
                            
                            tmp[idx] -= erosion_amount * 0.5;
                            tmp[n_idx] += erosion_amount * 0.5;
                        }
                    }
                }
            }
        }
        
        // Copy back
        height_field.data_mut().copy_from_slice(&tmp);
    }
}

#[wasm_bindgen]
pub fn apply_smoothing(height_field: &mut HeightField, iterations: u32, strength: f32) {
    let n = height_field.size();
    let mut tmp = vec![0.0f32; n * n];
    
    for _iter in 0..iterations {
        for y in 0..n {
            for x in 0..n {
                let mut sum = 0.0;
                let mut count = 0;
                
                // 3x3 kernel
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        let nx = (x as i32 + dx).max(0).min(n as i32 - 1) as usize;
                        let ny = (y as i32 + dy).max(0).min(n as i32 - 1) as usize;
                        sum += height_field.get(nx, ny);
                        count += 1;
                    }
                }
                
                let avg = sum / count as f32;
                let current = height_field.get(x, y);
                tmp[y * n + x] = current + (avg - current) * strength;
            }
        }
        
        height_field.data_mut().copy_from_slice(&tmp);
    }
}