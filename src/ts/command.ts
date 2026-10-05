import FileSystem, { FsError } from "./fs/filesystem";
import type Shell from "./shell/shell";

export interface Chunk {
    text: string;
    error: boolean;
}

// Collects text written by a command, in order.
export class Output {
    readonly chunks: Chunk[] = [];
    private error: boolean;

    constructor(chunks?: Chunk[], error = false) {
        if (chunks) {
            this.chunks = chunks;
        }
        this.error = error;
    }

    // A view that writes into the same buffer with text marked as errors.
    errors(): Output {
        return new Output(this.chunks, true);
    }

    write(text: string): void {
        if (text !== '') {
            this.chunks.push({ text, error: this.error });
        }
    }

    writeln(text = ''): void {
        this.write(text + '\n');
    }

    toString(): string {
        return this.chunks.map(c => c.text).join('');
    }
}

export interface CommandContext {
    args: string[];
    stdin: string;
    stdout: Output;
    stderr: Output;
    fs: FileSystem;
    shell: Shell;
    // True when stdout goes straight to the terminal (not a pipe or file).
    interactive: boolean;
}

abstract class Command {
    // One-line summary shown by `help`.
    abstract readonly description: string;
    // Argument synopsis, e.g. "[-p] <directory>...".
    readonly usage: string = '';

    // Returns the exit code: 0 for success.
    abstract run(ctx: CommandContext): number;

    // Runs `fn` for each item, reporting filesystem errors without stopping.
    // Returns 1 if any item failed, else 0.
    protected forEach(ctx: CommandContext, name: string, items: string[], fn: (item: string) => void): number {
        let status = 0;
        for (const item of items) {
            try {
                fn(item);
            } catch (error) {
                if (!(error instanceof FsError)) {
                    throw error;
                }
                ctx.stderr.writeln(`${name}: ${error.message}`);
                status = 1;
            }
        }
        return status;
    }

    // Reads the named files, or stdin when none (or "-") are given.
    protected readInputs(ctx: CommandContext, name: string, files: string[], fn: (text: string, file: string) => void): number {
        if (files.length === 0) {
            fn(ctx.stdin, '-');
            return 0;
        }
        return this.forEach(ctx, name, files, file => fn(file === '-' ? ctx.stdin : ctx.fs.readFile(file), file));
    }
}

// Splits text into lines, ignoring the newline that terminates the last one.
export function lines(text: string): string[] {
    if (text === '') {
        return [];
    }
    return text.replace(/\n$/, '').split('\n');
}

// Joins lines back into newline-terminated text.
export function unlines(items: string[]): string {
    return items.map(line => line + '\n').join('');
}

export default Command;
