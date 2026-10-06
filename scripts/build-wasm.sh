#!/bin/sh
# Rebuilds the WebAssembly programs from their C sources. The .wasm outputs are
# committed, so this is only needed after changing a .c file.
#
# Requires wasi-sdk (https://github.com/WebAssembly/wasi-sdk/releases):
#   WASI_SDK=/path/to/wasi-sdk scripts/build-wasm.sh
set -eu

: "${WASI_SDK:?set WASI_SDK to the wasi-sdk directory}"
CC="$WASI_SDK/bin/clang --target=wasm32-wasip1 -Os -s"
cd "$(dirname "$0")/.."

for src in src/programs/*.c test/fixtures/wasm/*.c; do
    [ -e "$src" ] || continue   # the pattern matched no file
    out="${src%.c}.wasm"
    echo "  $src -> $out"
    $CC -o "$out" "$src"
done
