import { Chunk, CommandContext, Output } from "../command";
import CommandRegistry from "../commandregistry";
import FileSystem, { FsError, SerializedFileSystem } from "../fs/filesystem";
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

        for (const redirect of command.redirects) {
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
        const stderr = redirectErr ? new Output() : terminal.errors();
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
        if (redirectErr) {
            flush(redirectErr, stderr.toString());
        }
        return exitCode;
    }

    private invoke(argv: string[], stdin: string, stdout: Output, stderr: Output, interactive: boolean): number {
        const [name, ...args] = argv;
        const command = this.registry.getCommand(name);
        if (!command) {
            stderr.writeln(`${name}: command not found`);
            return 127;
        }
        if (args[0] === '--help') {
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

    serialize(): SerializedShell {
        return { fs: this.fs.serialize(), env: Object.fromEntries(this.env), history: [...this.history] };
    }
}

export default Shell;
