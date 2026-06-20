# bun-server-bench

A correctness benchmark of **50 production-shaped Bun server engineering tasks**
for evaluating AI coding agents.

Each task asks an agent to implement a small but realistic Bun backend service —
HTTP APIs, authentication, SQLite transactions, idempotency, concurrency, rate
limiting, background jobs, observability, WebSockets, and file uploads. Every
task is engineered so that a *plausible-but-wrong* implementation passes the
public tests and fails the hidden ones. The score measures behavioral
correctness under a contract, not runtime speed — a fast server that returns the
wrong status code scores zero.

## Run it

```sh
# the whole suite
harbor run -d tinycomputerai/bun-server-bench --agent <your-agent> -e docker

# a single task (oracle = the reference solution)
harbor run -p tinycomputerai/bun-server-bench-databases-optimistic-version-v1 --agent oracle -e docker -y
```

## Scoring

Each task's verifier writes a gate-based reward to `reward.txt`:

| reward | meaning |
| ---: | --- |
| `1.0` | public **and** hidden tests pass |
| `0.25` | public pass, hidden fail (found the visible path, missed the edge cases) |
| `0.0` | public fail, or install / startup / timeout |

A reward of `0.25` is the discriminative signal the benchmark is built around.

## Integrity

- Hidden tests are injected only at verification time — never baked into the agent image.
- Tasks run with **zero runtime dependencies** and **networking disabled**, so the agent must implement the capability rather than import it.
- Reference solutions are excluded from the agent workspace.

## Links

- Source, task definitions, and docs: https://github.com/tinycomputerai/bun-server-bench
- Trajectory dataset (SFT + patch records): https://huggingface.co/datasets/tinycomputerai/bun-server-bench-trajectories

License: Apache-2.0
