# Benchmark Suite Execution

Phase 4.5 suite runner for executing a coding agent across multiple bun-bench tasks and producing aggregate results.

## Command

```sh
bun run run:suite \
  --agent claude-code \
  --tasks 'tasks/**'
```

Run up to four tasks at once:

```sh
bun run run:suite \
  --agent claude-code \
  --tasks 'tasks/**' \
  --concurrency 4
```

Run a single task by path:

```sh
bun run run:suite \
  --agent claude-code \
  --tasks tasks/http-apis.todo-health.v1
```

Retry only failed tasks from a previous leaderboard:

```sh
bun run run:suite \
  --agent claude-code \
  --failed-from results/claude-code/leaderboard.json
```

Resume failed and pending tasks after an interrupted run:

```sh
bun run run:suite \
  --agent claude-code \
  --tasks 'tasks/**' \
  --failed-from results/claude-code/leaderboard.json \
  --concurrency 3
```

`--failed-from` alone reruns tasks with score `< 100`. Combine it with `--tasks` to also run tasks that never finished (missing from the leaderboard). Passing tasks from the previous leaderboard are kept; retried results replace failures and fill in pending tasks.

## Lifecycle

1. Discover task directories matching the `--tasks` pattern.
2. Validate each discovered task with `validators/validate-task.ts`.
3. Run tasks with the configured concurrency via the existing `run:agent` implementation.
4. After each task finishes, update `results/<agent-id>/summary.json` and `leaderboard.json`.
5. Write the final aggregate artifacts when the suite completes.

Each task still produces its own run artifact under `runs/<timestamp>-<task-id>/result.json`.

Interrupted runs keep partial progress in `results/<agent-id>/`. Resume with `--tasks` and `--failed-from` to rerun only failed and pending tasks.

## Concurrency

`--concurrency N` controls how many tasks run at the same time. Default is `1`, which preserves the original sequential behavior.

| Flag | Behavior |
| --- | --- |
| omitted / `--concurrency 1` | Sequential execution (one task at a time) |
| `--concurrency N` where `N > 1` | Up to `N` tasks in parallel |

Each parallel task still gets:

- its own run directory under `runs/<timestamp>-<task-id>/`
- its own workspace copy under that run directory
- its own dynamically allocated `PORT` for app startup
- isolated logs under `runs/<timestamp>-<task-id>/logs/`
- its own `result.json`

Hidden tests still run from each task's source directory with `BUN_BENCH_APP_DIR` pointing at that task's workspace. Tasks do not share app ports or run directories.

Progress logs include task start, completion, failure, and active/finished/total counts.

### Guardrails

- `--concurrency` must be an integer `>= 1`; invalid values fail fast with a clear CLI error.
- When `--agent claude-code` and `--concurrency` is greater than `3`, the runner prints a warning that API/tool rate limits may apply.
- Suite execution continues when individual tasks fail.
- Summary and leaderboard ordering remain deterministic: entries are sorted by task id before aggregate output is written; the leaderboard is then sorted by score descending, then task id ascending.

## Task Discovery

The `--tasks` pattern supports:

| Pattern | Behavior |
| --- | --- |
| `tasks/**` | All task directories under `tasks/` containing `task.yaml` |
| `tasks/*` | Same as `tasks/**` |
| `tasks/http-apis.todo-health.v1` | One specific task |

Only structurally valid tasks are included. Invalid directories are skipped silently during discovery.

## Output Layout

```
results/<agent-id>/
  summary.json
  leaderboard.json
```

### summary.json

```json
{
  "agent_id": "claude-code",
  "total_tasks": 10,
  "passed": 8,
  "failed": 2,
  "average_score": 85.0,
  "total_wall_time_ms": 350000,
  "started_at": "2026-06-16T00:00:00.000Z",
  "completed_at": "2026-06-16T00:05:50.000Z"
}
```

| Field | Description |
| --- | --- |
| `total_tasks` | Expected task count for the suite (or completed count when omitted) |
| `passed` | Tasks with `status: "completed"` in the current leaderboard |
| `failed` | Tasks with any other status in the current leaderboard |
| `average_score` | Mean score across leaderboard entries written so far |
| `total_wall_time_ms` | Elapsed wall time since the suite started |

### leaderboard.json

```json
{
  "agent_id": "claude-code",
  "entries": [
    {
      "task_id": "http-apis.todo-health.v1",
      "score": 100,
      "duration_ms": 35277,
      "status": "completed",
      "run_id": "2026-06-15T22-34-32-113Z-http-apis.todo-health.v1"
    }
  ]
}
```

Entries are sorted by score descending, then task id ascending.

| Field | Description |
| --- | --- |
| `task_id` | Task identifier |
| `score` | Task score from the agent run |
| `duration_ms` | Per-task wall time from `result.json` |
| `status` | Final task status |
| `run_id` | Run directory name under `runs/` |

## Pass / Fail Semantics

A task **passes** when its agent run status is `completed` (public and hidden tests both pass).

A task **fails** for any other status, including:

- `failed_agent`
- `failed_install`
- `failed_start`
- `failed_readiness`
- `failed_public_tests`
- `failed_hidden_tests`
- `timed_out`
- `invalid_task`

## Implementation Layout

```
runners/suite/
  run-suite.ts       # CLI entry point
  suite.ts           # Orchestration and parallel execution
  discover-tasks.ts  # Task pattern resolution and validation
  types.ts           # summary.json and leaderboard.json types
```

The suite runner reuses `runAgent()` from `runners/agent/runner.ts` without duplicating agent or validation logic.

## Known Limitations

- No Harbor integration, rollout capture, or RL.
- Task discovery supports simple glob patterns only (`tasks/**`, `tasks/*`, or a single task path).
- High concurrency with `claude-code` may trigger API or tool rate limits.
