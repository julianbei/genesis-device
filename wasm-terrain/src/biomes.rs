use crate::noise::FBMParams;
use crate::filters::{SlopeBlurParams, DuneParams};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy, PartialEq)]
pub enum BiomeType {
    Desert = 0,
    Alpine = 1,
    Temperate = 2,
}

#[wasm_bindgen]
pub struct BiomeParams {
    biome_type: BiomeType,
}

#[wasm_bindgen]
impl BiomeParams {
    #[wasm_bindgen(constructor)]
    pub fn new(biome_type: BiomeType) -> Self {
        Self { biome_type }
    }

    #[wasm_bindgen]
    pub fn for_biome(biome_type: BiomeType) -> Self {
        Self { biome_type }
    }

    #[wasm_bindgen]
    pub fn fbm_params(&self) -> FBMParams {
        match self.biome_type {
            BiomeType::Desert => FBMParams {
                amplitude: 0.15,
                frequency: 2.0,
                octaves: 5,
                lacunarity: 2.0,
                gain: 0.5,
                warp: 0.15,
                seed: 0,
            },
            BiomeType::Alpine => FBMParams {
                amplitude: 0.35,
                frequency: 1.3,
                octaves: 6,
                lacunarity: 2.0,
                gain: 0.5,
                warp: 0.12,
                seed: 0,
            },
            BiomeType::Temperate => FBMParams {
                amplitude: 0.22,
                frequency: 1.6,
                octaves: 5,
                lacunarity: 2.0,
                gain: 0.5,
                warp: 0.1,
                seed: 0,
            },
        }
    }

    #[wasm_bindgen]
    pub fn slope_blur_params(&self) -> SlopeBlurParams {
        match self.biome_type {
            BiomeType::Desert => SlopeBlurParams {
                radius: 2.0,
                k: 0.6,
                iterations: 2,
            },
            BiomeType::Alpine => SlopeBlurParams {
                radius: 1.0,
                k: 0.2,
                iterations: 1,
            },
            BiomeType::Temperate => SlopeBlurParams {
                radius: 2.0,
                k: 0.4,
                iterations: 2,
            },
        }
    }

    #[wasm_bindgen]
    pub fn ridge_sharpen_strength(&self) -> f32 {
        match self.biome_type {
            BiomeType::Desert => 0.2,
            BiomeType::Alpine => 0.6,
            BiomeType::Temperate => 0.35,
        }
    }

    #[wasm_bindgen]
    pub fn has_dunes(&self) -> bool {
        matches!(self.biome_type, BiomeType::Desert)
    }

    #[wasm_bindgen]
    pub fn dunes_params(&self) -> DuneParams {
        match self.biome_type {
            BiomeType::Desert => DuneParams {
                scale: 16.0,
                amplitude: 0.03,
                direction: std::f32::consts::PI * 0.25,
            },
            _ => DuneParams {
                scale: 0.0,
                amplitude: 0.0,
                direction: 0.0,
            },
        }
    }

    #[wasm_bindgen]
    pub fn height_scale(&self) -> f32 {
        match self.biome_type {
            BiomeType::Desert => 600.0,
            BiomeType::Alpine => 1800.0,
            BiomeType::Temperate => 900.0,
        }
    }

    // Water system parameters
    #[wasm_bindgen]
    pub fn sea_level_offset(&self) -> f32 {
        match self.biome_type {
            BiomeType::Desert => 0.1,
            BiomeType::Alpine => 0.05,
            BiomeType::Temperate => 0.08,
        }
    }

    #[wasm_bindgen]
    pub fn river_threshold(&self) -> f32 {
        match self.biome_type {
            BiomeType::Desert => 0.2,
            BiomeType::Alpine => 0.15,
            BiomeType::Temperate => 0.12,
        }
    }

    #[wasm_bindgen]
    pub fn river_width(&self) -> f32 {
        match self.biome_type {
            BiomeType::Desert => 2.0,
            BiomeType::Alpine => 1.5,
            BiomeType::Temperate => 3.0,
        }
    }

    #[wasm_bindgen]
    pub fn river_depth(&self) -> f32 {
        match self.biome_type {
            BiomeType::Desert => 0.03,
            BiomeType::Alpine => 0.04,
            BiomeType::Temperate => 0.025,
        }
    }

    #[wasm_bindgen]
    pub fn coastal_erosion(&self) -> f32 {
        match self.biome_type {
            BiomeType::Desert => 0.05,
            BiomeType::Alpine => 0.03,
            BiomeType::Temperate => 0.04,
        }
    }

    #[wasm_bindgen]
    pub fn beach_width(&self) -> f32 {
        match self.biome_type {
            BiomeType::Desert => 8.0,
            BiomeType::Alpine => 6.0,
            BiomeType::Temperate => 10.0,
        }
    }
}