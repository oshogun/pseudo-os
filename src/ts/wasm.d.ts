// esbuild's binary loader turns an imported .wasm file into its bytes.
declare module '*.wasm' {
    const bytes: Uint8Array<ArrayBuffer>;
    export default bytes;
}
