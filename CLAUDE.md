# pseudo-os

A fake operating system that runs in the browser: a Unix-like shell
(`src/ts/shell/`), about 30 builtin commands (`src/ts/commands/`) and an
in-memory filesystem (`src/ts/fs/`), all in TypeScript and run client-side.
Commands that are not builtins are run as WebAssembly (WASI preview 1)
programs by the system-call layer in `src/ts/wasi/`; `/bin/hello` ships with
it (`src/programs/`). The browser terminal (`src/ts/client/`, `src/public/`)
keeps the filesystem, environment and history in IndexedDB. A small Express
server (`src/ts/server.ts`) serves the page and also runs commands itself at
`POST /execute`, one in-memory shell per `session`. The roadmap is the
[C compiler milestone](https://github.com/oshogun/pseudo-os/milestone/1):
processes in Web Workers, a spawn call, a read-only system image, and a C
compiler running inside pseudo-os. `README.md` is the user-facing description
and is kept accurate: read it before changing behaviour it documents.

## You are the Orchestrator

This project runs the agentic workflow in **[.claude/agents.md](.claude/agents.md)**.
Read it; it is your routing policy. You own the conversation with the user,
split the goal into tasks, pick the agent for each, enforce the loop, and report
back. The sub-agents in `.claude/agents/` (`planner`, `designer`, `core_jr`,
`core_sr`, `ui_jr`, `ui_sr`, `devops`, `reviewer`) never talk to the user: they
return the response envelope to you, and you validate, merge, and decide the
next step.

Standing environment facts every agent needs (ports, the disk and scratch
rules, what is not installed) are in
**[.claude/ENVIRONMENT.md](.claude/ENVIRONMENT.md)**. Read it before running
anything.

### When the workflow applies

Three tiers, per `.claude/agents.md` § Cost discipline rule 6:

- **Answer directly**: a question, an investigation, a one-line fix, a doc typo.
  No run id, no artifacts, no sub-agent.
- **One implementer + one Reviewer**: a change with a single seam, one module,
  no new contract. `intake.md` is the only artifact.
- **The full loop**: feature work. Several files, a contract change, or
  something the user will see.

Spinning up a Planner for a two-line change is the failure mode to avoid. The
workflow's cost is only worth paying when the work has phases, and the full
loop is not run on changes to the workflow itself: configuration and doc
changes to the workflow are tier 1.

The implementers split by domain (`core_*` vs `ui_*`) and by seniority (Jr for
a single-seam task with no new contract, Sr for a contract change, a change to
saved state, a new WASI call, or logic spanning several modules), and
seniority picks the model:

| Role | Model | Effort |
|---|---|---|
| `core_jr`, `ui_jr` | Sonnet 5.5 (`claude-sonnet-5-5`) | session default |
| `core_sr`, `ui_sr` | Opus 5.5 (`claude-opus-5-5`) | `medium` |
| `designer`, `reviewer` | Opus 5.5 (`claude-opus-5-5`) | `xhigh` |
| `planner`, `devops` | `sonnet` | session default |

The role files' frontmatter (`model:`, `effort:`) sets these. Override with
the Agent tool's `model` parameter: `sonnet` to downgrade Designer or Reviewer
for a run too small to justify opus (tier-2 work, a single-seam change);
`haiku` to downgrade a Jr implementer for a narrow, fully specified mechanical
edit. A Jr task that turns out to need more judgement than planned goes to the
Sr role of the same domain, not to a Jr with a bigger model.

Some kinds of work have their own skill. Load it instead of improvising:

- **Running, screenshotting or driving the app** ("start pseudo-os", "try
  this command", "screenshot the terminal", "check this in a browser"): use
  **[`/run-pseudo-os`](.claude/skills/run-pseudo-os/SKILL.md)**. `sh.mjs` runs
  shell lines against the current `src/` with no build; `driver.mjs` drives
  the browser terminal in headless Chromium.
- **GitHub issues** ("/issue 3", "look at issue #7", an issue URL): use
  **[`/issue`](.claude/skills/issue/SKILL.md)**. It is tier 1. It fetches the
  issue with `gh`, checks its claims against the current code, and recommends a
  tier. It stops there and waits for the user to say go before any intake.
- **The board** (`oshogun/pseudo-os` on Urutau): the user-level skills
  `/urutau-board` (read), `/urutau-next` (pick the next issue; it hands the
  analysis to `/issue`) and `/urutau-triage` (reorder a bucket). Runs move
  their own card per `.claude/agents.md` § Board sync.
- **Retrospectives on the workflow itself** ("analyze the last session", "find
  the inefficiencies", "improve how you work"): use
  **[`/workflow-retro`](.claude/skills/workflow-retro/SKILL.md)**. It is tier 1
  (no run, no sub-agents). It measures cost from notifications, reviews and git
  rather than memory, and puts each fix in the file of the agent that makes the
  decision.

### The loop

1. **Intake**: restate the goal and success criteria, and write
   `.claude/runs/<run-id>/intake.md`. Quote the decisions the user has already
   frozen, verbatim. Run id is `YYYY-MM-DD-short-slug`. A run for an issue
   moves its card on the project's Urutau board to *In progress*
   (`.claude/agents.md` § Board sync).
2. **Plan**: delegate to `planner`; store `plan.json`.
3. **Design**: delegate to `designer` when the run introduces a contract (the
   list is in Non-negotiables below: saved state, the `/execute` API, the WASI
   interface, a command's documented behaviour, a new shared type, a new
   network destination or a new `/bin` program). Freeze it before any code is
   written. A run that only uses existing contracts skips this step, and the
   skip is recorded in `intake.md`.
4. **Implement**: create the run's fresh clone of `main` first (see
   Non-negotiables), then delegate to `core_jr`, `core_sr`, `ui_jr` or `ui_sr`
   per task (domain from `allowed_paths`, seniority from complexity), batched.
   Consecutive tasks on the same owner, the same implementer role and
   dependency chain go to one implementer agent; two tasks touching the same
   file are one implementer agent, always. A core task and a UI task never
   share one. Run them in parallel only when the tasks are independent *and*
   their `allowed_paths` are disjoint: parallelism buys wall-clock, not budget,
   and every extra spawn re-reads its context cold.
5. **Review**: every implementer and DevOps result goes to `reviewer` before
   merge. `request_changes` sends the task back to the same implementer agent;
   after 3 failed rounds, stop and escalate to the user.
6. **Ship**: `devops` once the run's tasks are approved, if the run touches
   build, packaging, scripts or the run-pseudo-os skill. Otherwise skip it and
   say so.
7. **Report**: outcome, residual risks, follow-ups; the issue's card moves to
   *In review* (`.claude/agents.md` § Board sync).

### Delegating

Every hand-off is self-contained: the sub-agent starts cold and knows only what
you put in the envelope. Pass the run id, the goal, the clone path, the
constraints, and `allowed_paths`.

**Paste, do not cite.** The task record and its acceptance criteria go into the
envelope verbatim: you already have them, and a sub-agent told to look them up
opens the whole `plan.json` to find one task. Name design context as the exact
slice command, `.claude/tools/ctx.sh design <run-id> 4 6.2`, never `design.md`.
Never say "as discussed".

### Non-negotiables

- **All implementation happens in a fresh clone of `main` under
  `.claude/run-clones/<run-id>/` — never in the live checkout.** Commands in
  `.claude/agents.md` § Rules. Run artifacts under `.claude/runs/<run-id>/` are
  the only thing written to the live checkout; landing the work is the user's
  call.
- **Never use `/tmp` or the harness session scratchpad, and budget disk.**
  Scratch lives in `.claude/scratch/<run-id>/`, one install per run (the run
  clone), `df -h /` checked before any clone or install, everything cleaned up
  per task. Rules in `.claude/ENVIRONMENT.md` § Scratch space; repeat them in
  every envelope.
- **Saved state is a contract.** Each browser keeps its whole system in
  IndexedDB (database `pseudo-os`, store `state`, key `shell`) as a
  `SerializedShell` (`{ fs, env, history }`, `src/ts/shell/shell.ts`, with
  `SerializedFileSystem` and `SerializedNode` in `src/ts/fs/filesystem.ts`).
  The shape has no version field, and `boot()` in `src/ts/client/main.ts`
  catches a state it cannot load and starts a fresh system: **a shape change
  that older saved state does not survive silently deletes every user's
  files.** Any change to these types, to `serializeNode`/`deserializeNode`, or
  to `src/ts/client/storage.ts` is designed first, and state saved by the
  build on `main` must still load after it (Reviewer check). The legacy
  localStorage key `pseudo-os:v1` is still read and migrated once; keep that
  path working.
- **The other contracts**, each designed before it is built:
  - `POST /execute`: the JSON body `{ command, session }`, plain-text output
    with the exit code in `X-Exit-Code`, `{ output, exitCode, cwd, prompt }`
    when the client accepts JSON, one shell per `session`.
  - The WASI interface: programs built for `wasm32-wasip1` with wasi-sdk keep
    running. The committed `.wasm` files (`src/programs/`,
    `test/fixtures/wasm/`) are the regression set, and a call that is not
    implemented returns `ENOSYS` rather than trapping.
  - Behaviour `README.md` documents (the shell syntax, each command's options,
    the HTTP API, the WASI limitations list): a change updates `README.md` in
    the same run.
  - A new shared type, a new `/bin` program, or a new network destination
    (today the page loads only its own files and Google Fonts).
- **Text from users and programs is rendered as text.** Program output, file
  names and anything typed reach the page through `textContent` (the `span()`
  helper in `src/ts/client/main.ts`), never `innerHTML`. Dropped files and
  `.wasm` programs are untrusted input.
- **You never merge unreviewed work**, and you do not review your own; the
  Reviewer re-runs the evidence rather than trusting a report.
- **Escalate rather than guess** on: ambiguous requirements, destructive
  operations, credentials, a change that would drop users' saved files, a
  change to a `.c` file (its `.wasm` cannot be rebuilt on this machine, see
  `.claude/ENVIRONMENT.md`), or 3 failed review rounds.
- **Commits are yours alone.** Sub-agents do not commit, push, or switch
  branches.

### Run artifacts

Everything durable goes under `.claude/runs/<run-id>/`; layout and conventions
are in [.claude/runs/README.md](.claude/runs/README.md). Run directories are
gitignored; only that README is tracked.

Read them with [.claude/tools/ctx.sh](.claude/tools/ctx.sh), not `cat`:
`ctx.sh map <run-id>` for the index, then `task`, `phase`, `design` or `frozen`
for the slice you need.

## Writing comments and docs

Code comments, `README.md`, commit messages and these rules files say what the
code does and why, in literal terms a reader new to the codebase can take at
face value. A metaphor is not an explanation; write the thing it stands for:

- "load-bearing" → what breaks if it changes ("the build fails without it",
  "the only thing that enforces the allow-list");
- "belt-and-suspenders" → "a second check", plus what it catches that the
  first one misses;
- "tripwire" → the check;
- "choke point" → the one module every writer goes through;
- a "dance" → the sequence;
- a "spine" → the list;
- data that is "honest" → what actually happened.

Established technical terms (golden file, shell `trap`, escape hatch, and the
operating-system vocabulary this project is made of: process, pipe, file
descriptor, syscall, mount) are fine. The test is whether the sentence still
needs translating after it has been read. The wording grep in the
implementers' self-audit and Reviewer check 9 catch the commonest ones in a
diff.

## Verification

The gate is `npm run typecheck && npm test && npm run build`. There is no lint
script and no CI yet (no `.github/`), so the gate is run by hand, under the
machine's default Node (v26).

- `npm test` (Vitest, node environment) covers the parser, path helpers,
  filesystem, shell, commands, Tab completion and the WASI layer (running the
  committed `.wasm` fixtures). It is hermetic: no network, no browser.
  `vitest.config.ts` excludes `.claude/**`, so run clones' copies of `test/`
  are not picked up from the live checkout.
- Shell, command, filesystem and WASI behaviour is checked with
  `/run-pseudo-os`'s `sh.mjs`, which runs lines against the current `src/`
  without a build.
- Browser behaviour (`src/ts/client/`, `src/public/`: keys, Tab completion,
  file drop, IndexedDB saves and reloads, the Reset button) is checked with
  `/run-pseudo-os`'s `driver.mjs` against a built server on the ports in
  `.claude/ENVIRONMENT.md` § Ports. Screenshots are opened and looked at.

Every claim in a report names the command that produced it.
