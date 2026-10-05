// The WebAssembly programs bundled into /bin. Imported only by the client and
// server entry points, since it relies on esbuild's binary loader.
import hello from '../programs/hello.wasm';
import type { Programs } from './system';

export const programs: Programs = { hello };
