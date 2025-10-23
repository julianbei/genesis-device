mod utils;
mod height_field;
mod noise;
mod filters;
mod water_system;
mod erosion;
mod biomes;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

#[wasm_bindgen]
pub fn init() {
    utils::set_panic_hook();
    log("🦀 Rust WASM terrain generator initialized!");
}

// Export main public API
pub use height_field::HeightField;
pub use biomes::{BiomeType, BiomeParams};
pub use water_system::{WaterFeatures, WaterSystemParams};

#[wasm_bindgen]
pub struct TerrainGenerationResult {
    height_field: HeightField,
    water_features: Option<WaterFeatures>,
}

#[wasm_bindgen]
impl TerrainGenerationResult {
    #[wasm_bindgen(getter)]
    pub fn height_field(&self) -> HeightField {
        self.height_field.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn water_features(&self) -> Option<WaterFeatures> {
        self.water_features.clone()
    }
}

#[wasm_bindgen]
pub fn generate_terrain(
    base_size: u32,
    steps: u32,
    seed: u32,
    biome_type: BiomeType,
    sea_level: f32,
    erosion_years: f32,
) -> TerrainGenerationResult {
    use web_sys::console;
    
    console::log_1(&format!("🌱 Starting terrain generation: base_size={}, steps={}", base_size, steps).into());
    
    let biome_params = BiomeParams::for_biome(biome_type);
    
    // Generate base terrain
    let mut height_field = height_field::HeightField::new(base_size as usize);
    
    // Apply multi-level generation
    let mut current_size = base_size;
    for step in 0..steps {
        let step_start = js_sys::Date::now();
        
        if current_size > base_size {
            let resample_start = js_sys::Date::now();
            height_field = height_field.resample_to(current_size as usize);
            let resample_time = js_sys::Date::now() - resample_start;
            console::log_1(&format!("  🔄 Step {} resample to {}: {:.2}ms", step, current_size, resample_time).into());
        }
        
        // Apply FBM noise
        let fbm_start = js_sys::Date::now();
        noise::apply_fbm(
            &mut height_field, 
            &biome_params.fbm_params(),
            seed,
            None // Use default world UV mapping
        );
        let fbm_time = js_sys::Date::now() - fbm_start;
        console::log_1(&format!("  🌊 Step {} FBM noise: {:.2}ms", step, fbm_time).into());
        
        // Apply filters
        let filter_start = js_sys::Date::now();
        filters::apply_slope_blur(&mut height_field, &biome_params.slope_blur_params());
        
        if biome_params.has_dunes() && current_size >= 256 {
            filters::apply_dunes(&mut height_field, &biome_params.dunes_params());
        }
        let filter_time = js_sys::Date::now() - filter_start;
        console::log_1(&format!("  🏔️  Step {} filters: {:.2}ms", step, filter_time).into());
        
        current_size *= 2;
        
        let step_time = js_sys::Date::now() - step_start;
        console::log_1(&format!("  ✅ Step {} total: {:.2}ms", step, step_time).into());
    }
    
    // Apply ridge sharpening
    let ridge_start = js_sys::Date::now();
    filters::apply_ridge_sharpen(&mut height_field, biome_params.ridge_sharpen_strength());
    let ridge_time = js_sys::Date::now() - ridge_start;
    console::log_1(&format!("🗻 Ridge sharpening: {:.2}ms", ridge_time).into());
    
    // Apply erosion if specified
    let erosion_start = js_sys::Date::now();
    let water_features = if erosion_years > 0.0 {
        console::log_1(&format!("🌊 Starting erosion simulation: {} years", erosion_years).into());
        let erosion_params = erosion::ErosionParams {
            time_years: erosion_years,
            sea_level,
            wind_strength: biome_params.fbm_params().amplitude * 0.5,
            rain_intensity: 1.0,
            temperature_cycles: match biome_type {
                BiomeType::Alpine => 50.0,
                BiomeType::Desert => 10.0,
                BiomeType::Temperate => 25.0,
            },
        };
        
        Some(erosion::apply_geological_erosion(&mut height_field, &erosion_params))
    } else {
        console::log_1(&"⏭️ Skipping erosion simulation".into());
        None
    };
    let erosion_time = js_sys::Date::now() - erosion_start;
    console::log_1(&format!("🌊 Erosion total: {:.2}ms", erosion_time).into());
    
    TerrainGenerationResult {
        height_field,
        water_features,
    }
}

#[wasm_bindgen]
pub fn generate_continuous_tile_grid(
    rows: u32,
    cols: u32,
    tile_size: u32,
    overlap: u32,
    base_size: u32,
    _steps: u32,
    seed: u32,
    biome_type: BiomeType,
    sea_level: f32,
    erosion_years: f32,
) -> js_sys::Object {
    use web_sys::console;
    
    let start_time = js_sys::Date::now();
    console::log_1(&format!("🦀 Starting WASM terrain generation: {}x{} tiles", rows, cols).into());
    
    let _biome_params = BiomeParams::for_biome(biome_type);
    let inner_size = tile_size - 2 * overlap;
    
    // Calculate total size for atlas
    let atlas_w = (cols * inner_size) as usize;
    let atlas_h = (rows * inner_size) as usize;
    let atlas_size = std::cmp::max(atlas_w, atlas_h);
    
    console::log_1(&format!("📐 Atlas size: {}x{}, max: {}", atlas_w, atlas_h, atlas_size).into());
    
    let terrain_start = js_sys::Date::now();
    
    // Generate terrain directly at the atlas size to avoid expensive resampling
    let terrain_result = generate_terrain(
        base_size,
        // Reduce steps for performance - instead of going step by step, target size directly
        ((atlas_size as f32 / base_size as f32).log2().ceil() as u32 + 1).min(6), // Cap at 6 steps max
        seed,
        biome_type,
        sea_level,
        erosion_years,
    );
    
    let terrain_time = js_sys::Date::now() - terrain_start;
    console::log_1(&format!("⛰️  Core terrain generation: {:.2}ms", terrain_time).into());
    
    let resample_start = js_sys::Date::now();
    
    let atlas_hf = terrain_result.height_field.resample_to(atlas_size);
    
    let resample_time = js_sys::Date::now() - resample_start;
    console::log_1(&format!("🔄 Resampling: {:.2}ms", resample_time).into());
    
    let extraction_start = js_sys::Date::now();

    // Extract tiles directly from the atlas-sized heightfield
    let mut tiles = Vec::with_capacity((rows * cols) as usize);
    for r in 0..rows {
        for c in 0..cols {
            let mut tile = HeightField::new(tile_size as usize);
            
            // Calculate source region in atlas heightfield
            let src_x = c * inner_size;
            let src_y = r * inner_size;
            
            // Copy data from atlas heightfield to tile - use bulk operations where possible
            let tile_data = tile.data_mut();
            let atlas_data = atlas_hf.data();
            let atlas_size_actual = atlas_hf.size();
            
            for y in 0..tile_size {
                for x in 0..tile_size {
                    let src_pixel_x = (src_x + x) as usize;
                    let src_pixel_y = (src_y + y) as usize;
                    let tile_idx = (y * tile_size + x) as usize;
                    
                    if src_pixel_x < atlas_size_actual && src_pixel_y < atlas_size_actual {
                        let src_idx = src_pixel_y * atlas_size_actual + src_pixel_x;
                        tile_data[tile_idx] = atlas_data[src_idx];
                    } else {
                        tile_data[tile_idx] = 0.0;
                    }
                }
            }
            
            tiles.push(tile);
        }
    }
    
    let extraction_time = js_sys::Date::now() - extraction_start;
    console::log_1(&format!("📦 Tile extraction: {:.2}ms", extraction_time).into());
    
    let atlas_build_start = js_sys::Date::now();

    // Create atlas directly from the generated heightfield
    let mut atlas = vec![0.0f32; atlas_w * atlas_h];
    for y in 0..atlas_h {
        for x in 0..atlas_w {
            atlas[y * atlas_w + x] = atlas_hf.get(x, y);
        }
    }
    
    let atlas_build_time = js_sys::Date::now() - atlas_build_start;
    console::log_1(&format!("🖼️  Atlas building: {:.2}ms", atlas_build_time).into());

    // Generate UV rects
    let mut rects = Vec::new();
    for r in 0..rows {
        for c in 0..cols {
            let u0 = (c * inner_size) as f32 / atlas_w as f32;
            let v0 = (r * inner_size) as f32 / atlas_h as f32;
            let u1 = ((c + 1) * inner_size) as f32 / atlas_w as f32;
            let v1 = ((r + 1) * inner_size) as f32 / atlas_h as f32;
            
            let rect = js_sys::Object::new();
            js_sys::Reflect::set(&rect, &"u0".into(), &u0.into()).unwrap();
            js_sys::Reflect::set(&rect, &"v0".into(), &v0.into()).unwrap();
            js_sys::Reflect::set(&rect, &"u1".into(), &u1.into()).unwrap();
            js_sys::Reflect::set(&rect, &"v1".into(), &v1.into()).unwrap();
            rects.push(rect);
        }
    }

    // Convert atlas to Float32Array
    let atlas_array = js_sys::Float32Array::new_with_length(atlas.len() as u32);
    atlas_array.copy_from(&atlas);

    // Convert rects to JS array
    let rects_array = js_sys::Array::new();
    for rect in rects {
        rects_array.push(&rect);
    }

    // Convert tiles to JS array
    let tiles_array = js_sys::Array::new();
    for tile in tiles {
        tiles_array.push(&tile.to_js_object());
    }

    // Create result object
    let result = js_sys::Object::new();
    js_sys::Reflect::set(&result, &"tiles".into(), &tiles_array).unwrap();
    js_sys::Reflect::set(&result, &"innerSize".into(), &(inner_size as f32).into()).unwrap();
    js_sys::Reflect::set(&result, &"atlas".into(), &atlas_array).unwrap();
    js_sys::Reflect::set(&result, &"atlasSize".into(), &(std::cmp::max(atlas_w, atlas_h) as f32).into()).unwrap();
    js_sys::Reflect::set(&result, &"rects".into(), &rects_array).unwrap();

    if let Some(water_features) = terrain_result.water_features {
        js_sys::Reflect::set(&result, &"waterFeatures".into(), &water_features.to_js_object()).unwrap();
    }

    let total_time = js_sys::Date::now() - start_time;
    console::log_1(&format!("🎯 Total WASM time: {:.2}ms", total_time).into());

    result
}