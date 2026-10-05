# Agentic Workflow

**Who reads this file: the Orchestrator.** Sub-agents do not. Each role file in
`.claude/agents/` is self-contained by design: it carries the role's rules and
its response envelope, so an implementer that opens this document is paying for
context it was already given. The only shared file every agent reads is
`.claude/ENVIRONMENT.md`.

Adapted from the workflows in the sibling projects msfslogger and urutau.
Incidents cited below by date happened in those projects unless they name this
repo.

## Overview

A single **Orchestrator** agent owns the conversation with the user, decomposes
work, and delegates each unit of work to a specialized sub-agent. Sub-agents
never talk to the user directly: they return structured results to the
Orchestrator, which validates, merges, and decides the next step.

```
        ┌──────────────┐
  user ─▶│ Orchestrator │◀── final report
        └──────┬───────┘
   ┌───────┬───┴────┬───────────────────────┬──────────┐
   ▼       ▼         ▼                      ▼          ▼
Planner Designer  Implementer            DevOps    Reviewer
                 (core_jr/sr,
                  ui_jr/sr)
```

## Roles

| Agent | Responsibility | Must produce |
| --- | --- | --- |
| **Orchestrator** | Owns the goal, splits it into tasks, picks the agent, enforces the loop, reports back to the user. | Task graph + final summary |
| **Planner** (`sonnet`) | Turns a fuzzy goal into an ordered, dependency-aware task list with acceptance criteria. | `plan.json` (tasks, deps, DoD) |
| **Designer** (Opus 5.5, `xhigh`) | Defines module boundaries, data models, saved-state shapes, the WASI and `/execute` contracts, command behaviour. No implementation. | Design doc + interface stubs |
| **Core Jr** (Sonnet 5.5) | Single-seam logic work: one module or one command, no new contract. Files: the core paths below. | Diff + evidence |
| **Core Sr** (Opus 5.5, `medium`) | Contract-adjacent logic work: a saved-state change with its compatibility path, a new WASI call, a parser or grammar change, logic spanning several core modules. Same files as Core Jr. | Diff + evidence |
| **UI Jr** (Sonnet 5.5) | Single-seam UI work: one key binding, one piece of layout or styling, no new contract. Files: the UI paths below. | Diff + evidence |
| **UI Sr** (Opus 5.5, `medium`) | Cross-cutting UI work: a new interactive mode (a full-screen editor), Web Worker plumbing on the page side, a change to how the terminal consumes the shell. Same files as UI Jr. | Diff + evidence |
| **DevOps** (`sonnet`) | Build, tooling config, `scripts/`, the run-pseudo-os skill, docs at ship time. | Pipeline changes + ship report |
| **Reviewer** (Opus 5.5, `xhigh`) | Reviews diffs against the design and acceptance criteria; checks saved-state compatibility, security, regressions, style. | Verdict `approve` / `request_changes` + findings |

**Domains.** A task's `allowed_paths` sit entirely in one domain:

| Domain | Paths |
| --- | --- |
| core | `src/ts/fs/**`, `src/ts/shell/**`, `src/ts/commands/**`, `src/ts/wasi/**`, `src/ts/command.ts`, `src/ts/commandconfig.ts`, `src/ts/commandregistry.ts`, `src/ts/system.ts`, `src/ts/programs.ts`, `src/ts/server.ts`, `src/ts/wasm.d.ts`, `src/ts/client/storage.ts` (it is the saved-state contract), `src/programs/**`, `test/**` |
| ui | `src/ts/client/**` except `storage.ts`, `src/public/**` |
| devops | `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `scripts/**`, `.github/**`, `.claude/skills/run-pseudo-os/**` |

Core and UI never share a task. The Planner (or the Orchestrator, for tier-2
work) picks the matching agent: Jr by default, Sr when the task is a contract
change, a saved-state change, a new WASI call, a parser change, cross-module
reasoning, or otherwise ambiguous enough to be worth a second pair of
judgement. Naming the agent by domain and seniority, rather than routing
through a generic dispatcher, makes token usage groupable by role straight
from the Agent tool's own invocation record, with no extra spawn spent
classifying the task.

`README.md` belongs to no implementer. A run that changes documented behaviour
gives the doc edit to DevOps (its ship step) or to the Orchestrator directly
when it is a few lines.

## Cost discipline

A sub-agent starts cold. Everything it knows, it re-read, and it re-reads it on
every spawn. In msfslogger's `2026-09-07-manual-mark-flown` run, `plan.json`
and `design.md` together came to 131 KB; an implementer that opened both spent
roughly 30k tokens before writing a line, and ten spawns spent it ten times.
These rules exist to stop that, and they bind the Orchestrator first because it
is the Orchestrator that fills the envelope.

**1. Pass slices, never whole artifacts.** `.claude/tools/ctx.sh` extracts them:

```
ctx.sh map    <run-id>                  index: goal, phases, task ids, design headings
ctx.sh task   <run-id> T-004            one task record
ctx.sh phase  <run-id> 1                a phase and its tasks
ctx.sh design <run-id> 3 5.2 must-not-change   named sections
ctx.sh frozen <run-id>                  frozen_decisions, verbatim
```

The Orchestrator **pastes the task record verbatim into the envelope** (it
already has it) and names design sections by number. An agent told to read
`design.md` reads all of it; an agent told `ctx.sh design <run> 3 5` reads two
sections.

**2. One spawn is the unit of cost, so spawn fewer.** Batch consecutive tasks
that share an owner, an implementer role, and a dependency chain into one
implementer agent when their `allowed_paths` do not collide with a parallel
task. Two tasks on the same file in the same phase are one agent, always. A
core task and a UI task never batch into one spawn, even if sequential:
different domain means a different agent. Reserve parallel spawns for work that
is genuinely independent; parallelism buys wall-clock, not budget, and each
extra agent re-reads its whole context from scratch.

**3. Skip the steps a run does not need.** Design is for runs that introduce a
contract: a change to saved state (`SerializedShell` and what it contains, or
`storage.ts`), the `/execute` API, the WASI interface (a new or changed
`wasi_snapshot_preview1` call, how programs are found and started), a change
to or removal of behaviour `README.md` documents (the shell syntax, what an
existing command or option does), a new shared type, a new `/bin` program, or
a new network destination. A run that adds a command or an option, using
existing helpers, does not need a freeze (it updates `README.md` in the same
run), and DevOps is for runs that touch build,
scripts, packaging or the run-pseudo-os skill. Skipping a step is a decision
the Orchestrator records in `intake.md`, not something it does silently.

**4. Evidence is quoted, not pasted.** Reports and reviews cite the command and
the lines of output that decide the question: a `tsc` run that passes is one
line, not eighty. Cap a report at ~150 lines; if the raw output matters, leave
it in a file under `reports/` and cite the path. (A 41 KB review in msfslogger
is the artifact this rule is aimed at.)

**5. The Reviewer does not read the report it is checking.** Its own doctrine is
that the implementer's report is not evidence, and reading 30 KB it is required
to distrust is the worst line item in a run. It reads the diff, the criteria and
the report's `risks` list, nothing else.

**6. Tier the work.** Not everything is a run:

| Work | Path |
| --- | --- |
| Question, investigation, one-line fix, doc typo | Orchestrator answers directly. No run id, no artifacts. |
| A change with one seam: one module or command, no new contract | One implementer (Jr) + one Reviewer. `intake.md` only. |
| Feature work: several files, a contract change, something the user sees | The full loop below. |

Spinning up a Planner for a two-line change is the failure mode. So is running
the full loop on the workflow's own config.

## Delegation contract

Every hand-off uses the same envelope.

**Request (Orchestrator → agent)**

```json
{
  "task_id": "T-004",
  "role": "core_sr",
  "goal": "Add fd_readdir cookies so programs can list large directories",
  "task_record": { "…the task object from plan.json, pasted verbatim…" },
  "clone": "/home/guilherme/pseudo-os/.claude/run-clones/<run-id>/tree",
  "context": ["ctx.sh design <run-id> 2.1 must-not-change", "src/ts/wasi/wasi.ts"],
  "constraints": ["no new runtime deps", "the committed .wasm fixtures keep passing"],
  "acceptance_criteria": ["…verbatim from the task record…"],
  "allowed_paths": ["src/ts/wasi/**", "test/wasi.test.ts"]
}
```

`task_record` and `acceptance_criteria` are pasted in full so the agent never
opens `plan.json`. `context` lists exact commands or paths, never a bare
document name, and never "as discussed". Every envelope repeats the scratch
rules from `.claude/ENVIRONMENT.md` § Scratch space and the run-clone ports from
§ Ports.

**Response (agent → Orchestrator)**

```json
{
  "task_id": "T-004",
  "status": "done | blocked | needs_input",
  "artifacts": ["src/ts/wasi/wasi.ts"],
  "summary": "…",
  "risks": ["…"],
  "next_suggested_role": "reviewer"
}
```

## Standard loop

For tier-3 work only; see Cost discipline rule 6.

1. **Intake**: Orchestrator restates the goal and success criteria, and records
   which steps this run skips and why. A run for an issue moves its card to
   *In progress* (§ Board sync).
2. **Plan**: delegate to Planner; store `plan.json`.
3. **Design**: delegate to Designer *if the run introduces a contract*; freeze
   before code is written.
4. **Implement**: first create the run's fresh clone of `main` (Rules § "All
   implementation happens in a fresh clone"), then delegate to the implementer
   agents (`core_jr`, `core_sr`, `ui_jr`, `ui_sr`), batched per rule 2. Nothing
   is written to the live repo.
5. **Review**: every implementer and DevOps result goes to Reviewer before
   merge, at phase granularity. `request_changes` sends the task back to the
   same implementer agent (max 3 rounds, then escalate to the user).
6. **Ship**: delegate to DevOps *if the run touches build, scripts, packaging
   or the run-pseudo-os skill*, and for the `README.md` update when documented
   behaviour changed and the edit is more than a few lines.
7. **Report**: Orchestrator summarizes outcome, residual risks, follow-ups,
   and moves the issue's card to *In review* (§ Board sync).

## Board sync

`oshogun/pseudo-os` has a board on the user's Urutau server, which the
Orchestrator reads and changes through the `urutau` MCP server
(`mcp__urutau__get_board`, `mcp__urutau__move_card`). Its buckets are
`backlog`, `todo`, `in-progress`, `in-review` and `done` (checked with
`get_board` on 2026-10-05). It applies to tier-2 and tier-3 runs that
implement a GitHub issue of `oshogun/pseudo-os`; other runs leave the board
alone. Sub-agents never touch the board.

- **At intake**, once the user has said go: move the card to *In progress*,
  top (`/urutau-next` § 3: bucket ids come from `get_board`, pass
  `expectedVersion`). Record the move, or why it did not happen, in
  `intake.md`.
- **At report**, when the run's work is approved and waiting for the user's
  commit: move the card to *In review*, top. A run that stops on an escalation
  leaves the card where it is and says so.
- **Nothing more.** Closing the issue on GitHub puts the card in *Done*, the
  bucket that collects closed issues, so the board needs no move for it. Never
  reorder a bucket, and never move another issue's card, without the user
  asking (`/urutau-triage`).
- **The board never blocks a run.** If the harness denies the write, the MCP
  server is unreachable, or the answer is an error other than `stale-board`
  (re-read and retry once), say which move was not made and carry on.

## Rules

- One task, one agent, one owner at a time.
- **Nothing is frozen until it has been executed.** Before a command or
  standing rule goes into `intake.md`, `design.md`, `plan.json`,
  `ENVIRONMENT.md`, a skill or a user-facing report, run it or dry-run it. If it
  runs a script, read that script. Write the proving command next to it. In
  msfslogger's `2026-09-23-carbon-migration` run, three unexecuted items slipped
  through:
  - a deploy note carried verbatim through the plan and three reviews could
    never work, because the script it called lived elsewhere and installed
    nothing;
  - a new `TMPDIR` rule broke an end-to-end test, because Chrome's socket path
    has a 107-character limit, and a reviewer lost time diagnosing it;
  - a restart command stopped the live server before building, so the user
    watched it be down for the whole build.

  A reviewer who sees a user-facing command in a report checks it the same way
  (see `agents/reviewer.md`).
- **Non-blocking findings are folded in, not given their own round.** The
  Reviewer tags each non-blocking finding `fold` or `follow-up`:
  - `fold`: the change stays inside files the run already touches, is under
    about 30 lines, and needs no design decision.
  - `follow-up`: anything else.

  The Orchestrator appends `fold` items verbatim to the envelope of the next
  task already planned for the same implementer role, and that task's review
  checks them. When no such task remains, all outstanding `fold` items become
  one fix task. Its review re-runs only the suites that cover the changed
  files, plus the diff. The final review is the one place where full suites
  run twice. `follow-up` items go to the run report. (In msfslogger, a
  dedicated fix task plus a full re-review for six test findings cost about
  250k tokens and 33 minutes; four of the six were test weakenings that the
  implementers' self-audit now catches before hand-back.)
- **Seniority picks the model; judgement roles get the most effort.** The
  role files' frontmatter (`model:`, `effort:`) sets the defaults; override
  the model with the Agent tool's `model` parameter:
  - Opus 5.5 (`claude-opus-5-5`), effort `xhigh`: Designer and Reviewer. They
    run once per run or gate every merge, and decide what the implementers do
    or catch a bad diff before it merges. The Orchestrator (this
    conversation) may also run on opus; that is the user's session choice.
  - Opus 5.5 (`claude-opus-5-5`), effort `medium`: Core Sr and UI Sr.
  - Sonnet 5.5 (`claude-sonnet-5-5`): Core Jr and UI Jr. A Jr task that needs
    more judgement than planned goes to the Sr role of its domain.
  - `sonnet`: Planner and DevOps.
  - `haiku`: override a Jr implementer down for a narrow, fully specified
    mechanical edit with no judgement in it.
  - Downgrade Designer or Reviewer to `sonnet` for a run too small to justify
    opus (tier-2 work, a single-seam change).
- Agents only read/write inside their `allowed_paths`.
- **All implementation happens in a fresh clone, never in the live repo.** At
  the start of the Implement step the Orchestrator creates the run's working
  tree, once per run, and every implementer, DevOps and Reviewer command runs
  there (checked on 2026-10-05 with a throwaway run id):

  ```
  df -h /    # at least 8 GB available, see ENVIRONMENT.md § Scratch space
  RUN_DIR=/home/guilherme/pseudo-os/.claude/run-clones/<run-id>
  mkdir -p "$RUN_DIR"
  git clone --local --branch main /home/guilherme/pseudo-os "$RUN_DIR/tree"
  git -C "$RUN_DIR/tree" switch -c run/<run-id>
  cd "$RUN_DIR/tree" && npm install && npm run build
  mkdir -p /home/guilherme/pseudo-os/.claude/scratch/<run-id>
  cp -r build /home/guilherme/pseudo-os/.claude/scratch/<run-id>/build-main
  ```

  `build-main` is `main`'s build, kept before anyone edits the clone: the
  Reviewer serves it to save state in the browser, then serves the clone's
  build on the same port to check that state still loads (`reviewer.md`
  check 3). Copied there, `server.js` finds its `public/` next to it and
  `express` in the live checkout's `node_modules` (checked 2026-10-05).

  `.claude/run-clones/` is gitignored but lives inside the project, not in
  `/tmp` or the session scratchpad: in msfslogger, a disk-cleanup pass deleted
  an entire unmerged run's clone from a temp directory on 2026-09-23, and the
  work was unrecoverable.

  - **The run clone is the only install per run, and nothing goes in `/tmp`.**
    Details in `.claude/ENVIRONMENT.md` § Scratch space; every envelope repeats
    them.
  - The clone is of **committed `main`**. Uncommitted or untracked files in the
    live checkout (`.claude/runs/**`, `node_modules`, `build/`) are
    deliberately absent. `package-lock.json` is gitignored in this repo, so the
    clone installs with `npm install`, not `npm ci` (`npm ci` fails with
    `EUSAGE`). Run it before anything else: until the clone has its own
    `node_modules`, Node resolves packages from the live checkout's
    `node_modules` two directories up, and commands appear to work against
    the wrong dependencies.
  - `allowed_paths` are relative to `$RUN_DIR/tree`. The envelope names the
    absolute tree path; an agent that finds itself editing under
    `/home/guilherme/pseudo-os` (outside `.claude/runs/<run-id>/` and
    `.claude/scratch/`) has made the mistake this rule exists to stop, and
    returns `blocked`.
  - Reading the live repo is fine (`ctx.sh` against the run's plan and design,
    which are untracked and so not in the clone). Writing to it is not, with
    one exception: run artifacts under `.claude/runs/<run-id>/` (intake, plan,
    design, reviews, reports) live in the live repo, are written there by the
    Orchestrator, Planner, Designer and Reviewer, and are not implementation.
  - The Orchestrator commits on the `run/<run-id>` branch **in the clone** (the
    only commits in the run). Landing the work in the live repo is the user's
    call: the Orchestrator reports the clone path and the branch, and offers
    the exact commands for the user to run in `/home/guilherme/pseudo-os` on
    `main`, which were checked between two throwaway clones on 2026-10-05:

    ```
    git fetch /home/guilherme/pseudo-os/.claude/run-clones/<run-id>/tree run/<run-id>
    git merge --ff-only FETCH_HEAD
    ```

    It does not merge into the live checkout itself.
  - The clone is throwaway. Delete `$RUN_DIR` only after the user has taken
    the branch, or say where it was left.
- No agent may skip Review; Orchestrator never merges unreviewed work.
- Any agent may return `blocked` with a concrete question instead of guessing.
- Orchestrator escalates to the user on: ambiguous requirements, destructive
  operations, credentials/secrets, a change that drops users' saved files, or
  3 failed review rounds.
- Keep every hand-off self-contained: context is passed explicitly, never
  assumed, and passed as slices, never as whole documents.
