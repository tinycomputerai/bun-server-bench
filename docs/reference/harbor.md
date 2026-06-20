# Harbor

**Harbor is the primary execution engine for bun-server-bench.** Tasks are
authored under `tasks/`, exported into committed packages under `harbor/`, and
run in containers by Harbor. The local runners
([local-runners.md](local-runners.md)) exist only as development smoke tests;
every published evaluation path goes through Harbor.

The division of labor is deliberate:

- `tasks/` is the authored source of truth for task authors and local validation.
- `harbor/` is the committed, diffable, publishable execution package — a pure
  projection of `tasks/`. Regenerate it after editing a task; never hand-edit a
  package.
- Harbor supplies containerized execution, the oracle agent, job outputs, and
  coding-agent integration.

## Package shape

The adapter emits the canonical Harbor (Terminal-Bench-lineage) package:

```text
harbor/<sanitized-id>/
  task.toml                  # Harbor task metadata (schema_version 1.3)
  instruction.md             # Agent-facing prompt (identical to the bun-server-bench prompt)
  README.md                  # Human summary; preserves the true bun-server-bench id
  bun-server-bench.meta.json # Sidecar: full provenance + scoring model
  .gitignore
  environment/
    Dockerfile               # FROM oven/bun:1; bakes the agent-visible workspace
    app/                     # Starter workspace -> /app (the agent edits here)
      package.json
      bun.lock
      src/...                # starter stub
      tests/public/...       # public tests (agent-visible, orientation)
      tests/helpers/...      # test server helper
  tests/                     # Runner-only assets, injected at /tests during verify
    test.sh                  # Verifier: runs public + hidden, writes reward.txt
    public/...               # authoritative copy of the public tests
    hidden/...               # hidden tests (NEVER in the agent image)
    helpers/...
  solution/
    solve.sh                 # Oracle: writes the reference solution into /app
```

### Why the split

- **`environment/app/`** is baked into the image and becomes `/app`, the agent's
  working directory. It carries exactly what an agent sees locally: starter,
  manifest, lockfile, public tests, helper. It deliberately **excludes**
  `task.yaml` (which holds `known_failure_modes` and scoring) and the hidden
  tests.
- **`tests/`** is injected at verification time as `/tests`, outside the agent
  image. `tests/hidden` therefore satisfies the runner-only-assets requirement;
  `tests/public` is duplicated here so the verifier runs an authoritative,
  un-tamperable copy. See [../integrity.md](../integrity.md).
- **`solution/solve.sh`** is run by the `oracle` agent to reproduce a passing
  solution; it embeds the reference `src/` via heredocs and is fully
  self-contained.

## Verifier and reward

`tests/test.sh` runs from `/tests` against the agent's solution at `/app`
(`BUN_SERVER_BENCH_APP_DIR=/app`), spawning the solution's server through the
helper. It writes a float reward to `/logs/verifier/reward.txt`:

| Outcome | `reward.txt` | bun-server-bench score |
| --- | --- | ---: |
| public pass **and** hidden pass | `1.0` | 100 |
| public pass, hidden fail | `0.25` | 25 |
| public fail (or earlier failure) | `0.0` | 0 |

The script exits non-zero unless the reward is `1.0`, so Harbor's pass/fail
aligns with full correctness. This is the live scoring model in full — see
[scoring.md](scoring.md).

## Exporting packages

```sh
# Export one task
bun run harbor:export --task tasks/databases.optimistic-version.v1

# Export many (same glob semantics as the suite runner)
bun run harbor:export-suite --tasks 'tasks/**'
```

Both write to `harbor/<sanitized-id>/` (override with `--out <dir>`). After
changing exports, regenerate and verify the lock:

```sh
bun run harbor:tasks-lock
bun run validate:tasks-lock --tasks 'tasks/**'
```

Harbor *run outputs* (under `jobs/`) are gitignored; the packages themselves are
committed.

## Running a task

The `oracle` agent runs `solution/solve.sh` (the reference) with no LLM, so it
verifies a package end-to-end for free:

```sh
harbor run \
  -p harbor/databases-optimistic-version-v1 \
  --agent oracle \
  -e docker \
  -y \
  -o jobs --job-name bunbench-oracle-verify
```

Requirements: Docker running and Harbor ≥ 0.13. Results land in
`jobs/<job-name>/`. To run a real coding agent, swap `--agent oracle` for e.g.
`--agent claude-code -m <model>` (and grant agent network with
`--allow-agent-host`, since the environment is `no-network`).

### Verified oracle run

A deterministic oracle run of `databases.optimistic-version.v1` (Harbor `0.13.1`,
Docker `29.4.0`, base `oven/bun:1`):

```text
adhoc • oracle
┏━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━┓
┃ Trials ┃ Exceptions ┃  Mean ┃
┡━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━┩
│      1 │          0 │ 1.000 │
└────────┴────────────┴───────┘
Total runtime: 27s

bun-server-bench verifier: public_exit=0 hidden_exit=0 reward=1.0
```

Job artifacts:

```text
jobs/bunbench-oracle-verify/
  result.json                                   # job-level stats (mean reward 1.0)
  config.json
  databases-optimistic-version-v1__<id>/
    result.json                                 # trial result
    agent/oracle.txt
    verifier/reward.txt                         # 1.0
    verifier/public.log
    verifier/hidden.log
    verifier/test-stdout.txt
```

Reward `1.0` → score `100`, status `completed` — matching the local runner's
score for the same reference solution.

## Mapping: `task.yaml` → Harbor

| bun-server-bench field | Harbor destination | Notes |
| --- | --- | --- |
| `id` | `task.name` = `tinycomputerai/bun-server-bench-<sanitized-id>`; `keywords` `id:<id>`; README; sidecar | Published under the `tinycomputerai` org as part of the `tinycomputerai/bun-server-bench` dataset. Harbor names are slugs, so dots → hyphens; the true id is preserved verbatim. |
| `task_version`, `spec_version` | `keywords`; sidecar | Harbor versions packages via its registry; bun-server-bench versions ride as metadata. |
| `title` | README; sidecar | |
| `description` | `task.description` | Whitespace-collapsed. |
| `category` | `keywords` `category:<c>`; `metadata.tags[0]`; sidecar | `metadata.category` is Harbor's `software_engineering`. |
| `tags` | `metadata.tags` (deduped with category) | |
| `difficulty.level` | `metadata.difficulty` (1–2→easy, 3→medium, 4–5→hard); `keywords`; sidecar | Numeric level preserved. |
| `instruction` (prompt + appended constraints/assumptions/disallowed-shortcuts) | `instruction.md` | Built by the same `constructPrompt()` the local agent runner uses, so the prompt is identical. |
| `tests.public` | `environment/app/tests/public` (visible) **and** `tests/public` (verifier) | |
| `tests.hidden` | `tests/hidden` (runner-only) | Never baked into the agent image. |
| `tests.helpers` | `environment/app/tests/helpers` **and** `tests/helpers` | |
| `timeouts.test_seconds` | `verifier.timeout_sec` = `max(300, test_seconds*2+60)` | Verifier runs both suites sequentially. |
| `timeouts.total_seconds` | `agent.timeout_sec` | |
| `timeouts.install_seconds` | `environment.build_timeout_sec` = `max(600, install_seconds)` | |
| `environment.network` | `environment.network_mode` (`disabled`→`no-network`, else `public`) | |
| `dependencies` (zero-dep) | implicit | Bun ships in `oven/bun:1`; no install step emitted. Dependency-having tasks would add `RUN bun install`. |
| `scoring` | sidecar + enforced by `test.sh` reward model | Gate scoring is realized as the reward; weights live in the sidecar (see [scoring.md](scoring.md)). |
| `success_criteria` | sidecar | Reference/maintainer metadata. |
| `solutions/reference/src/*` | `solution/solve.sh` (embedded heredocs) | Used by the `oracle` agent. |

## Unsupported / lossy fields

Harbor's `task.toml` has no native slot for several fields. These are **preserved
out-of-band** in `keywords` + `bun-server-bench.meta.json` rather than dropped,
but Harbor itself does not interpret them:

- `task_version`, `spec_version` — carried in keywords + sidecar.
- `scoring.weights` / `scoring.gates` — Harbor scores via a single reward; the
  gate model collapses into `0.0 / 0.25 / 1.0` in `test.sh`, and the weights stay
  in the sidecar.
- `difficulty.rationale` / `expected_*` / `expected_concepts` — sidecar only.
- `curriculum`, `dataset` (split / leakage / trainable), `rollout_capture`,
  `benchmarking`, `provenance`, `known_failure_modes` — not exported into the
  package. `known_failure_modes` is intentionally withheld from the agent; the
  rest are dataset-management concerns Harbor does not model and remain in the
  source `task.yaml`.
- `interfaces.process.readiness` — Harbor has no separate readiness gate; the
  verifier starts the server via the helper, so readiness is implicit.
- Per-task security sandbox flags — superseded by Harbor's environment
  (`network_mode`, container isolation).

The `task.yaml` remains the source of truth; the export is a projection, and the
sidecar lets a consumer recover the non-Harbor fields.

## Result normalization (planned)

Harbor emits its own per-trial results under `jobs/<job-name>/`. To keep
continuity with the bun-server-bench `result.json` schema and leaderboards, a
read-only `runners/harbor/normalize.ts` would derive `result.json` from a job
directory: `score = reward * 100`, status from reward + Harbor trial state, and
metrics from Harbor usage records when the agent reports them. This is a pure
post-processing reader (no new execution engine) and is intentionally not
implemented yet. Until it exists, Harbor's native results are authoritative and
the reward → score mapping above is the contract.
