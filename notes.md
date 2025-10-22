Rivers: run a simple flow-accumulation on the final height, paint a river mask, then subtract a narrow carved channel. Scatter water quads along that mask.

Tile streaming: generate multiple tiles with 32-px overlap. Blend borders or displace vertices in a shared height texture atlas.

Performance: move filters to compute shaders (WebGPU) or fragment passes writing to float textures. Keep the CPU path as fallback.

Replace the solid-color defaults in TriplanarPBR with real tileable textures for best results.

To tile terrain, generate adjacent tiles with 32-px overlap and reuse the same material instance while updating heightTex.