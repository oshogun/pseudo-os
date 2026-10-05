# pseudo-os
A fake operating system to run on a browser.

pseudo-os is a Unix-like shell and in-memory filesystem written in TypeScript.
The whole thing runs client-side in the browser. It can run real programs
compiled to WebAssembly (WASI), such as C built with wasi-sdk. Your files,
environment variables and command history are saved in the browser
(IndexedDB), so they survive a reload.

```
user@pseudo-os:~$ cat notes.txt | grep -n write
6:  - write a shell
7:  - write a filesystem
user@pseudo-os:~$ mkdir -p projects/demo && echo "hi $USER" > projects/demo/hello.txt
user@pseudo-os:~$ tree projects
projects
└── demo/
    └── hello.txt
```

## Running it

```sh
npm install
npm start          # builds, then serves http://localhost:3000 (PORT to override)
```

Other scripts:

| Script              | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run build`     | Bundles the browser client and the server into `build/` |
| `npm test`          | Runs the test suite (vitest)                         |
| `npm run typecheck` | Type-checks everything with `tsc`                    |

## The shell

- Quoting: `"double"` (expands variables), `'single'` (literal), `back\ slash`
- Pipes `|` pass stdout to the next command's stdin
- Redirects: `>` `>>` `<` `2>` `2>>` `2>&1`
- Command lists: `;`, `&&`, `||`, plus `$?` for the last exit code
- Variables: `$NAME`, `${NAME}`, set with `export NAME=value`
- `~` expands to `$HOME`. `*` and `?` glob against the filesystem; a pattern
  with no matches is passed through as-is, like bash
- `# comments`
- Every command accepts `--help`

In the browser, use ↑/↓ for history, Tab to complete commands and paths,
Ctrl+C to drop the current line and Ctrl+L to clear the screen. Drop files
onto the page to copy them into the current directory.

## Programs (WebAssembly)

A command that isn't a builtin is looked up as a file, by path (`./prog`) or
in `$PATH` (`/bin`), and run as a WASI program. `/bin/hello` is a C hello
world that ships with the system. To run your own:

```sh
$WASI_SDK/bin/clang --target=wasm32-wasip1 -O2 -o prog.wasm prog.c
# then drop prog.wasm onto the terminal and run ./prog.wasm
```

Programs get their arguments, the shell's environment, stdin/stdout/stderr
(so they work in pipes and redirects), the clock, random numbers and the
whole filesystem. Most of `wasi_snapshot_preview1` is implemented in
`src/ts/wasi/wasi.ts`; calls that aren't return `ENOSYS`.

Current limitations:
- Programs run synchronously on the page's main thread, so a long-running
  one freezes the page and can't be interrupted ([#6](https://github.com/oshogun/pseudo-os/issues/6)).
- wasi-libc always reports the working directory as `/`. Relative paths
  still work, but a relative path starting with a top-level directory name
  (e.g. `etc/x` from your home directory) is resolved from `/`.
- Pipes and redirects carry text: binary output through them is decoded as
  UTF-8 and can be corrupted. Files a program writes itself are byte-exact.
- No `fork`/`exec`/`posix_spawn` yet ([#7](https://github.com/oshogun/pseudo-os/issues/7)).

The C sources for `/bin/hello` and the test programs are in `src/programs/`
and `test/fixtures/wasm/`. The compiled `.wasm` files are committed. After
editing a `.c` file, rebuild with `WASI_SDK=/path/to/wasi-sdk scripts/build-wasm.sh`.

### Commands

| Files                              | Text                         | Shell & system                       |
| ---------------------------------- | ---------------------------- | ------------------------------------ |
| `ls [-a] [-l] [-1]`                | `cat [-n]`                   | `help [command]`                     |
| `cd [dir \| -]`, `pwd`             | `echo [-n]`                  | `history [-c] [n]`                   |
| `mkdir [-p]`, `rmdir`              | `grep [-i] [-v] [-n] [-c]`   | `export`, `unset`, `env`             |
| `touch`                            | `wc [-l] [-w] [-c]`          | `clear`                              |
| `rm [-r] [-f]`                     | `head`/`tail [-n N]`         | `reset --yes` (restore the original files) |
| `mv`, `cp [-r]`                    | `sort [-r] [-n] [-u]`        | `which`, `true`, `false`             |
| `tree [-a]`                        | `uniq [-c]`, `tee [-a]`      | `whoami`, `hostname`, `uname`, `date` |

## HTTP API

The server also runs commands itself:

```sh
curl -X POST localhost:3000/execute -H 'Content-Type: application/json' \
     -d '{"command": "ls -l", "session": "alice"}'
```

The response is the plain-text output, with the exit code in the
`X-Exit-Code` header. Send `Accept: application/json` to get
`{ output, exitCode, cwd, prompt }` instead. Each `session` value gets its own
shell. Requests without one share the `default` session. Server sessions live
in memory and are lost when the server restarts.

## How it's built

```
src/ts/
  fs/          File, Directory, FileSystem (path resolution, mv/cp/rm, text or binary files, serialization), path helpers
  wasi/        the WASI system-call layer that runs WebAssembly programs
  shell/       parser.ts (tokenizer + grammar), expand.ts (variables, ~, globs),
               shell.ts (runs pipelines and redirects), complete.ts (Tab completion), options.ts
  commands/    one class per command, registered in commandconfig.ts
  system.ts    the default filesystem and environment, createShell()
  programs.ts  the bundled /bin programs
  client/      the browser terminal and IndexedDB storage
  server.ts    Express: serves the page and POST /execute
src/programs/  C sources and compiled .wasm for bundled programs
src/public/    index.html and style.css
scripts/       build-wasm.sh
test/          vitest suites (test/fixtures/wasm: C test programs)
```

A command extends `Command` and implements `run(ctx)`. `ctx` holds `args`,
`stdin`, `stdout`/`stderr` writers, the filesystem and the shell. `run` returns
an exit code. Throwing an `FsError` or `UsageError` becomes a standard
`name: message` error. To add a command, write the class and register it in
`commandconfig.ts`.

Not supported (yet): background jobs, subshells and `$(...)`, word splitting of
unquoted variables, `if`/`for` and scripts, permissions and multiple users.
The roadmap toward running a C compiler inside pseudo-os is the
[C compiler milestone](https://github.com/oshogun/pseudo-os/milestone/1).
