// src/terrain/WasmTerrainGenerator.ts
import init, { 
    HeightField as WasmHeightField, 
    BiomeType,
    generate_continuous_tile_grid,
    init as initWasm 
} from 'genesis-terrain-wasm';

// Import the existing types for compatibility
import type { BiomeParams, ContinuousGrid } from './types';
import { HeightField } from './HeightField';

export class WasmTerrainGenerator {
    private static initialized = false;

    static async initialize(): Promise<void> {
        if (this.initialized) return;
        
        try {
            await init();
            initWasm();
            this.initialized = true;
            console.log('🦀 WASM Terrain Generator initialized');
        } catch (error) {
            console.error('Failed to initialize WASM:', error);
            throw error;
        }
    }

    static biomeToWasmType(biome: string): BiomeType {
        switch (biome) {
            case 'desert': return BiomeType.Desert;
            case 'alpine': return BiomeType.Alpine;
            case 'temperate': return BiomeType.Temperate;
            default: return BiomeType.Temperate;
        }
    }

    static wasmHeightFieldToJS(wasmHF: WasmHeightField): HeightField {
        const size = wasmHF.size;
        const data = wasmHF.get_data();
        
        // Convert Float32Array to regular array for HeightField constructor
        const jsArray = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            jsArray[i] = data[i];
        }
        
        const jsHeightField = new HeightField(size);
        jsHeightField.data.set(jsArray);
        return jsHeightField;
    }

    static async generateContinuousTileGrid(cfg: {
        rows: number;
        cols: number;
        tileSize: number;
        overlap: number;
        baseSize?: number;
        seed: number;
        seaLevel?: number;
        erosionYears?: number;
    }, _biome: BiomeParams, biomeName?: string): Promise<ContinuousGrid> {
        await this.initialize();

        // Determine biome type from the biome name or default to temperate
        const biomeType = this.biomeToWasmType(biomeName || 'temperate');
        
        console.log(`🦀 Using WASM for terrain generation: ${cfg.rows}x${cfg.cols} tiles`);
        
        const startTime = performance.now();
        
        try {
            const result = generate_continuous_tile_grid(
                cfg.rows,
                cfg.cols,
                cfg.tileSize,
                cfg.overlap,
                cfg.baseSize ?? 64,
                4, // steps
                cfg.seed,
                biomeType,
                cfg.seaLevel ?? 0.0,
                cfg.erosionYears ?? 0.0
            ) as any; // Type assertion for JS interop

            const wasmTime = performance.now() - startTime;
            console.log(`⚡ WASM terrain generation took: ${wasmTime.toFixed(2)}ms`);
            
            const conversionStart = performance.now();

            // Convert WASM result to JavaScript format
            const tiles: HeightField[] = [];
            const tilesArray = result.tiles;
            
            for (let i = 0; i < tilesArray.length; i++) {
                const wasmTile = tilesArray[i];
                const jsTile = new HeightField(wasmTile.size);
                const data = wasmTile.data;
                
                // Use set() for fast bulk copy instead of element-by-element
                jsTile.data.set(data);
                
                tiles.push(jsTile);
            }

            // Use the Float32Array directly instead of copying
            const atlasArray = result.atlas;

            // Convert rects array
            const rects: Array<{u0: number; v0: number; u1: number; v1: number}> = [];
            for (let i = 0; i < result.rects.length; i++) {
                const rect = result.rects[i];
                rects.push({
                    u0: rect.u0,
                    v0: rect.v0,
                    u1: rect.u1,
                    v1: rect.v1
                });
            }

            const grid: ContinuousGrid = {
                tiles,
                innerSize: result.innerSize,
                atlas: atlasArray,
                atlasSize: result.atlasSize,
                rects
            };

            // Add water features if available
            if (result.waterFeatures) {
                const wf = result.waterFeatures;
                grid.waterFeatures = {
                    waterMask: wf.waterMask,
                    riverMask: wf.riverMask,
                    beachMask: wf.beachMask,
                    flowAccumulation: wf.flowAccumulation
                };
            }

            console.log(`🦀 WASM terrain generation complete: ${tiles.length} tiles`);
            
            const conversionTime = performance.now() - conversionStart;
            console.log(`🔄 Data conversion took: ${conversionTime.toFixed(2)}ms`);
            console.log(`📊 Total time: ${(wasmTime + conversionTime).toFixed(2)}ms`);
            
            return grid;

        } catch (error) {
            console.error('WASM terrain generation failed:', error);
            throw error;
        }
    }
}