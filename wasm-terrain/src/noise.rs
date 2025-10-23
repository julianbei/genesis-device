use crate::height_field::HeightField;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct FBMParams {
    pub amplitude: f32,
    pub frequency: f32,
    pub octaves: u32,
    pub lacunarity: f32,
    pub gain: f32,
    pub warp: f32,
    pub seed: u32,
}

#[wasm_bindgen]
impl FBMParams {
    #[wasm_bindgen(constructor)]
    pub fn new(
        amplitude: f32,
        frequency: f32,
        octaves: u32,
        lacunarity: f32,
        gain: f32,
        warp: f32,
        seed: u32,
    ) -> Self {
        Self {
            amplitude,
            frequency,
            octaves,
            lacunarity,
            gain,
            warp,
            seed,
        }
    }
}

// Hash function for deterministic noise
fn hash(n: f32) -> f32 {
    // More deterministic hash - round input to avoid precision issues
    let rounded = (n * 1_000_000.0).round() / 1_000_000.0;
    let x = (rounded.sin()) * 43758.5453123;
    x - x.floor()
}

// 2D value noise implementation
fn value_noise_2d(x: f32, y: f32) -> f32 {
    // Round coordinates to ensure identical sampling at tile borders
    let px = (x * 1_000_000.0).round() / 1_000_000.0;
    let py = (y * 1_000_000.0).round() / 1_000_000.0;
    
    let xi = px.floor();
    let yi = py.floor();
    let xf = px - xi;
    let yf = py - yi;
    
    let h = |i: f32, j: f32| -> f32 {
        hash((xi + i) * 15731.0 + (yi + j) * 789221.0)
    };
    
    let u = xf * xf * (3.0 - 2.0 * xf);
    let v = yf * yf * (3.0 - 2.0 * yf);
    
    let a = h(0.0, 0.0);
    let b = h(1.0, 0.0);
    let c = h(0.0, 1.0);
    let d = h(1.0, 1.0);
    
    a * (1.0 - u) * (1.0 - v) + b * u * (1.0 - v) + c * (1.0 - u) * v + d * u * v
}

// World UV mapping function type
#[allow(dead_code)]
pub type WorldUVFunc = Option<fn(x: usize, y: usize, size: usize) -> (f32, f32)>;

// Default world UV mapping for tile continuity
#[allow(dead_code)]
fn default_world_uv(x: usize, y: usize, size: usize, tile_col: f32, tile_row: f32, world_scale: f32) -> (f32, f32) {
    let n = size as f32;
    let u = x as f32 / n;
    let v = y as f32 / n;
    (
        (tile_col + u) * world_scale,
        (tile_row + v) * world_scale,
    )
}

#[wasm_bindgen]
pub fn apply_fbm(
    height_field: &mut HeightField,
    params: &FBMParams,
    seed: u32,
    world_uv_func: Option<js_sys::Function>,
) {
    let n = height_field.size();
    let FBMParams {
        amplitude,
        frequency,
        octaves,
        lacunarity,
        gain,
        warp,
        seed: _,
    } = *params;
    
    // Limit octaves for performance - cap at 6
    let max_octaves = octaves.min(6);
    
    let seed_f = seed as f32;
    
    for y in 0..n {
        for x in 0..n {
            let (u, v) = if let Some(ref _func) = world_uv_func {
                // For custom world UV mapping via JavaScript function
                // For now, use default mapping
                (x as f32 / n as f32, y as f32 / n as f32)
            } else {
                (x as f32 / n as f32, y as f32 / n as f32)
            };
            
            // Domain warp in world space
            let wx = value_noise_2d((u + seed_f) * 8.123, (v - seed_f) * 7.321) * warp;
            let wy = value_noise_2d((u - seed_f) * 5.551, (v + seed_f) * 9.173) * warp;
            
            let mut amp = 1.0;
            let mut freq = frequency;
            let mut sum = 0.0;
            
            for _o in 0..octaves {
                sum += value_noise_2d(
                    (u + wx) * freq + seed_f * 1.7,
                    (v + wy) * freq - seed_f * 2.1,
                ) * amp;
                freq *= lacunarity;
                amp *= gain;
            }
            
            let current_height = height_field.get(x, y);
            let new_height = current_height + (sum * 2.0 - 1.0) * amplitude;
            height_field.set(x, y, new_height);
        }
    }
}

// Specialized version for tile generation with explicit tile coordinates
#[allow(dead_code)]
pub fn apply_fbm_for_tile(
    height_field: &mut HeightField,
    params: &FBMParams,
    seed: u32,
    tile_row: f32,
    tile_col: f32,
    world_scale: f32,
) {
    let n = height_field.size();
    let FBMParams {
        amplitude,
        frequency,
        octaves,
        lacunarity,
        gain,
        warp,
        seed: _,
    } = *params;
    
    let seed_f = seed as f32;
    
    for y in 0..n {
        for x in 0..n {
            let (u, v) = default_world_uv(x, y, n, tile_col, tile_row, world_scale);
            
            // Domain warp in world space
            let wx = value_noise_2d((u + seed_f) * 8.123, (v - seed_f) * 7.321) * warp;
            let wy = value_noise_2d((u - seed_f) * 5.551, (v + seed_f) * 9.173) * warp;
            
            let mut amp = 1.0;
            let mut freq = frequency;
            let mut sum = 0.0;
            
            for _o in 0..octaves {
                sum += value_noise_2d(
                    (u + wx) * freq + seed_f * 1.7,
                    (v + wy) * freq - seed_f * 2.1,
                ) * amp;
                freq *= lacunarity;
                amp *= gain;
            }
            
            let current_height = height_field.get(x, y);
            let new_height = current_height + (sum * 2.0 - 1.0) * amplitude;
            height_field.set(x, y, new_height);
        }
    }
}