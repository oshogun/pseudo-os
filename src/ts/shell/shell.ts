import { Chunk, CommandContext, Output } from "../command";
import CommandRegistry from "../commandregistry";
import Directory from "../fs/directory";
import File from "../fs/file";
import FileSystem, { FsError, SerializedFileSystem } from "../fs/filesystem";
import Wasi from "../wasi/wasi";
import { expandWord } from "./expand";
import { UsageError } from "./options";
import { ListItem, ParseError, parse, SimpleCommand, Word } from "./parser";

export interface ExecResult {
    // Everything written to the terminal (stdout and stderr, interleaved).
    output: string;
    // The same text, split into pieces tagged as normal output or errors.
    chunks: Chunk[];
    exitCode: number;
    // Set when a command such as `clear` asked the terminal to wipe the screen.
    clear: boolean;
}

export interface SerializedShell {
    fs: SerializedFileSystem;
    env: { [name: string]: string };
    history: string[];
}

const MAX_HISTORY = 500;

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

// Compiled modules, reused while the file is unchanged.
const moduleCache = new WeakMap<File, { modified: number; module: WebAssembly.Module }>();

class Shell {
    fs: FileSystem;
    registry: CommandRegistry;
    env: Map<string, string>;
    history: string[];
    lastExitCode = 0;
    private clearRequested = false;

    constructor(fs: FileSystem, registry: CommandRegistry, env: { [name: string]: string } = {}) {
        this.fs = fs;
        this.registry = registry;
        this.env = new Map(Object.entries(env));
        this.history = [];
        this.env.set('PWD', fs.cwd);
    }

    get home(): string {
        return this.env.get('HOME') ?? '/';
    }

    // The prompt's directory part, with $HOME shortened to '~'.
    get displayCwd(): string {
        const cwd = this.fs.cwd;
        const home = this.home;
        if (home !== '/' && (cwd === home || cwd.startsWith(home + '/'))) {
            return '~' + cwd.slice(home.length);
        }
        return cwd;
    }

    get prompt(): string {
        return `${this.env.get('USER') ?? 'user'}@${this.env.get('HOSTNAME') ?? 'pseudo-os'}:${this.displayCwd}$ `;
    }

    // Puts the filesystem, environment and history back to how a fresh shell
    // starts. Set by whoever creates the shell (see system.ts).
    factoryReset: (() => void) | null = null;

    requestClear(): void {
        this.clearRequested = true;
    }

    variable(name: string): string {
        if (name === '?') {
            return String(this.lastExitCode);
        }
        return this.env.get(name) ?? '';
    }

    changeDirectory(path: string): void {
        const previous = this.fs.cwd;
        this.fs.changeDirectory(path);
        this.env.set('OLDPWD', previous);
        this.env.set('PWD', this.fs.cwd);
    }

    // Runs one line of input and returns what it printed.
    execute(line: string): ExecResult {
        const terminal = new Output();
        this.clearRequested = false;

        if (line.trim() !== '') {
            if (this.history[this.history.length - 1] !== line) {
                this.history.push(line);
                if (this.history.length > MAX_HISTORY) {
                    this.history.shift();
                }
            }
            let list: ListItem[] = [];
            try {
                list = parse(line);
            } catch (error) {
                if (!(error instanceof ParseError)) {
                    throw error;
                }
                terminal.errors().writeln(`pseudo-sh: ${error.message}`);
                this.lastExitCode = 2;
            }
            for (const item of list) {
                if (item.connector === '&&' && this.lastExitCode !== 0) {
                    continue;
                }
                if (item.connector === '||' && this.lastExitCode === 0) {
                    continue;
                }
                this.lastExitCode = this.runPipeline(item.pipeline, terminal);
                // rm -r can move the filesystem out of a deleted directory.
                if (this.env.get('PWD') !== this.fs.cwd) {
                    this.env.set('PWD', this.fs.cwd);
                }
            }
        }

        return { output: terminal.toString(), chunks: terminal.chunks, exitCode: this.lastExitCode, clear: this.clearRequested };
    }

    private expand(word: Word): string[] {
        return expandWord(word, { fs: this.fs, variable: name => this.variable(name) });
    }

    private runPipeline(pipeline: SimpleCommand[], terminal: Output): number {
        let stdin = '';
        let exitCode = 0;
        pipeline.forEach((command, index) => {
            const last = index === pipeline.length - 1;
            // The last stage writes straight to the terminal so its stdout and
            // stderr stay interleaved; earlier stages feed the next one's stdin.
            const stdout = last ? terminal : new Output();
            exitCode = this.runCommand(command, stdin, stdout, terminal, last);
            stdin = stdout.toString();
        });
        return exitCode;
    }

    private runCommand(command: SimpleCommand, stdin: string, stdout: Output, terminal: Output, interactive: boolean): number {
        const argv = command.words.flatMap(word => this.expand(word));
        // Redirect targets; '>' and '2>' truncate up front, so output is always appended.
        let redirectOut: string | null = null;
        let redirectErr: string | null = null;
        // 2>&1 sends stderr wherever stdout goes, wherever it appears in the command.
        let errToOut = false;

        for (const redirect of command.redirects) {
            if (redirect.op === '2>&1') {
                errToOut = true;
                continue;
            }
            const targets = this.expand(redirect.target);
            if (targets.length !== 1) {
                terminal.errors().writeln(`pseudo-sh: ${redirect.target.map(p => p.text).join('')}: ambiguous redirect`);
                return 1;
            }
            const path = targets[0];
            try {
                if (redirect.op === '<') {
                    stdin = this.fs.readFile(path);
                } else if (redirect.op === '>' || redirect.op === '>>') {
                    redirectOut = path;
                    if (redirect.op === '>') {
                        this.fs.writeFile(path, '');
                    }
                } else {
                    redirectErr = path;
                    if (redirect.op === '2>') {
                        this.fs.writeFile(path, '');
                    }
                }
            } catch (error) {
                if (error instanceof FsError) {
                    terminal.errors().writeln(`pseudo-sh: ${error.message}`);
                    return 1;
                }
                throw error;
            }
        }

        let exitCode = 0;
        const out = redirectOut ? new Output() : stdout;
        const stderr = errToOut ? out : redirectErr ? new Output() : terminal.errors();
        if (argv.length > 0) {
            exitCode = this.invoke(argv, stdin, out, stderr, interactive && !redirectOut);
        }

        const flush = (path: string, text: string) => {
            try {
                this.fs.appendFile(path, text);
            } catch (error) {
                if (!(error instanceof FsError)) {
                    throw error;
                }
                terminal.errors().writeln(`pseudo-sh: ${error.message}`);
                exitCode = 1;
            }
        };
        if (redirectOut) {
            flush(redirectOut, out.toString());
        }
        if (redirectErr && !errToOut) {
            flush(redirectErr, stderr.toString());
        }
        return exitCode;
    }

    private invoke(argv: string[], stdin: string, stdout: Output, stderr: Output, interactive: boolean): number {
        const [name, ...args] = argv;
        const command = name.includes('/') ? undefined : this.registry.getCommand(name);
        if (!command) {
            const program = this.findProgram(name);
            if (!program) {
                stderr.writeln(name.includes('/') ? `pseudo-sh: ${name}: No such file or directory` : `${name}: command not found`);
                return 127;
            }
            return this.exec(name, program, args, stdin, stdout, stderr);
        }
        if (args[0] === '--help' && name !== 'echo') {
            stdout.writeln(`usage: ${name} ${command.usage}`.trimEnd());
            stdout.writeln(command.description);
            return 0;
        }
        const ctx: CommandContext = { args, stdin, stdout, stderr, fs: this.fs, shell: this, interactive };
        try {
            return command.run(ctx);
        } catch (error) {
            if (error instanceof FsError) {
                stderr.writeln(`${name}: ${error.message}`);
                return 1;
            }
            if (error instanceof UsageError) {
                stderr.writeln(`${name}: ${error.message}`);
                stderr.writeln(`usage: ${name} ${command.usage}`.trimEnd());
                return 2;
            }
            throw error;
        }
    }

    // Builtins plus programs found in $PATH, sorted and without duplicates.
    commandNames(): string[] {
        const names = new Set(this.registry.names());
        for (const dir of this.variable('PATH').split(':').filter(d => d !== '')) {
            const node = this.fs.find(dir);
            if (node instanceof Directory) {
                node.list().filter(name => !(node.getFile(name) instanceof Directory)).forEach(name => names.add(name));
            }
        }
        return [...names].sort();
    }

    // Finds the file a command name refers to: a path if it contains '/',
    // otherwise the first match in $PATH.
    findProgram(name: string): File | undefined {
        if (name.includes('/')) {
            return this.fs.find(name);
        }
        for (const dir of this.variable('PATH').split(':').filter(d => d !== '')) {
            const node = this.fs.find(`${dir}/${name}`);
            if (node && !(node instanceof Directory)) {
                return node;
            }
        }
        return undefined;
    }

    // Runs a program file. Only WebAssembly (WASI) programs can be executed.
    private exec(name: string, program: File, args: string[], stdin: string, stdout: Output, stderr: Output): number {
        if (program instanceof Directory) {
            stderr.writeln(`pseudo-sh: ${name}: Is a directory`);
            return 126;
        }
        const bytes = program.bytes;
        if (bytes.length < 4 || WASM_MAGIC.some((b, i) => bytes[i] !== b)) {
            stderr.writeln(`pseudo-sh: ${name}: cannot execute: Exec format error`);
            return 126;
        }

        const decode = (decoder: TextDecoder, out: Output) => (chunk: Uint8Array) => out.write(decoder.decode(chunk, { stream: true }));
        const outDecoder = new TextDecoder();
        const errDecoder = new TextDecoder();
        const wasi = new Wasi({
            fs: this.fs,
            args: [name, ...args],
            env: Object.fromEntries(this.env),
            stdin: new TextEncoder().encode(stdin),
            stdout: decode(outDecoder, stdout),
            stderr: decode(errDecoder, stderr),
        });

        try {
            let cached = moduleCache.get(program);
            if (!cached || cached.modified !== program.modified) {
                cached = { modified: program.modified, module: new WebAssembly.Module(bytes) };
                moduleCache.set(program, cached);
            }
            return wasi.run(cached.module);
        } catch (error) {
            if (error instanceof WebAssembly.CompileError || error instanceof WebAssembly.LinkError) {
                stderr.writeln(`pseudo-sh: ${name}: cannot execute: ${error.message}`);
                return 126;
            }
            if (error instanceof WebAssembly.RuntimeError) {
                stderr.writeln(`${name}: crashed: ${error.message}`);
                return 134;
            }
            // Anything else is a bug in pseudo-os (e.g. in the WASI layer), not in the program.
            stderr.writeln(`pseudo-sh: ${name}: internal error: ${error instanceof Error ? error.message : String(error)}`);
            return 70;
        } finally {
            stdout.write(outDecoder.decode());
            stderr.write(errDecoder.decode());
        }
    }

    serialize(): SerializedShell {
        return { fs: this.fs.serialize(), env: Object.fromEntries(this.env), history: [...this.history] };
    }
}

export default Shell;
