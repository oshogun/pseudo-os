import { createShell } from '../src/ts/system';

// A fresh shell plus a helper that runs a line and returns its output.
export function setup() {
    const shell = createShell();
    const run = (line: string) => shell.execute(line).output;
    return { shell, run };
}
