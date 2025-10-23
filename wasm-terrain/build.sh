#!/bin/bash

# Install wasm-pack if not available
if ! command -v wasm-pack &> /dev/null; then
    echo "Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Build the WASM package
echo "Building WASM package..."
wasm-pack build --target web --out-dir ../pkg

echo "WASM build complete!"