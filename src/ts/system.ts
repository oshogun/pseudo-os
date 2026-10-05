import CommandConfig from "./commandconfig";
import FileSystem from "./fs/filesystem";
import Shell, { SerializedShell } from "./shell/shell";

export const USER = 'user';
export const HOME = `/home/${USER}`;

const motd = `Welcome to pseudo-os!

This is a pretend operating system that lives entirely in your browser.
Type 'help' to see what you can do.
`;

const readme = `Things to try:

  ls -l
  cat notes.txt | grep -n shell
  echo "hello" > greeting.txt && cat greeting.txt
  mkdir -p projects/demo && tree
  history | tail -n 3
  export NAME=world; echo "hello, $NAME"

Your files are saved in this browser, so they survive a page reload.
`;

const notes = `shopping list
  - milk
  - coffee

ideas
  - write a shell
  - write a filesystem
  - make the shell run in a browser
`;

// Builds the filesystem a fresh install starts with.
export function createDefaultFileSystem(commands: string[]): FileSystem {
    const fs = new FileSystem();
    fs.createDirectory('/bin');
    for (const name of commands) {
        fs.writeFile(`/bin/${name}`, `#!pseudo-os builtin: ${name}\n`);
    }
    fs.createDirectory('/etc');
    fs.writeFile('/etc/motd', motd);
    fs.writeFile('/etc/hostname', 'pseudo-os\n');
    fs.createDirectory('/tmp');
    fs.createDirectory(HOME, true);
    fs.writeFile(`${HOME}/README`, readme);
    fs.writeFile(`${HOME}/notes.txt`, notes);
    fs.createDirectory(`${HOME}/documents`);
    fs.changeDirectory(HOME);
    return fs;
}

const defaultEnv = { HOME, USER, HOSTNAME: 'pseudo-os', SHELL: '/bin/pseudo-sh', PATH: '/bin' };

// WebAssembly programs installed in /bin, by name.
export type Programs = { [name: string]: Uint8Array<ArrayBuffer> };

// Writes the bundled programs into /bin, replacing older copies.
function installPrograms(fs: FileSystem, programs: Programs): void {
    if (!fs.isDirectory('/bin')) {
        fs.createDirectory('/bin', true);
    }
    for (const [name, bytes] of Object.entries(programs)) {
        const path = `/bin/${name}`;
        if (!fs.isDirectory(path)) {
            fs.writeFile(path, bytes);
        }
    }
}

// Creates a shell, restoring saved state when given. `programs` are
// (re)installed into /bin either way, so saved systems pick up new versions.
export function createShell(saved?: SerializedShell, programs: Programs = {}): Shell {
    const registry = new CommandConfig().getCommands();
    let shell: Shell;
    if (saved) {
        shell = new Shell(FileSystem.deserialize(saved.fs), registry, saved.env);
        shell.history.push(...saved.history);
    } else {
        shell = new Shell(createDefaultFileSystem(registry.names()), registry, defaultEnv);
    }
    installPrograms(shell.fs, programs);
    shell.factoryReset = () => {
        shell.fs = createDefaultFileSystem(registry.names());
        installPrograms(shell.fs, programs);
        shell.env = new Map(Object.entries(defaultEnv));
        shell.env.set('PWD', shell.fs.cwd);
        shell.history.length = 0;
    };
    return shell;
}

export { motd };
