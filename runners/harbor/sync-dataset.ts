#!/usr/bin/env bun

/**
 * Regenerates the Harbor dataset manifest (harbor/dataset.toml) so it always
 * matches the exported task packages: a fresh `harbor init` auto-adds every task
 * subdirectory with its current content digest, then `harbor sync` refreshes the
 * digests. Run automatically after a harbor export/sync, or standalone via
 * `bun run harbor:dataset`.
 */

import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const DATASET_NAME = "tinycomputerai/bun-server-bench";
export const DATASET_DESCRIPTION =
  "bun-server-bench: a correctness benchmark of 50 production-shaped Bun server engineering tasks for evaluating AI coding agents.";
export const DATASET_AUTHOR = "tincomputer.ai";

const GITHUB_URL = "https://github.com/tinycomputerai/bun-server-bench";
const HF_URL = "https://huggingface.co/datasets/tinycomputerai/bun-server-bench-trajectories";

// Rich landing-page README for the published Harbor dataset. `harbor init`
// writes only a bare title, so we overwrite it on every regeneration.
const DATASET_README = `# bun-server-bench

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

\`\`\`sh
# the whole suite
harbor run -d ${DATASET_NAME} --agent <your-agent> -e docker

# a single task (oracle = the reference solution)
harbor run -p ${DATASET_NAME}-databases-optimistic-version-v1 --agent oracle -e docker -y
\`\`\`

## Scoring

Each task's verifier writes a gate-based reward to \`reward.txt\`:

| reward | meaning |
| ---: | --- |
| \`1.0\` | public **and** hidden tests pass |
| \`0.25\` | public pass, hidden fail (found the visible path, missed the edge cases) |
| \`0.0\` | public fail, or install / startup / timeout |

A reward of \`0.25\` is the discriminative signal the benchmark is built around.

## Integrity

- Hidden tests are injected only at verification time — never baked into the agent image.
- Tasks run with **zero runtime dependencies** and **networking disabled**, so the agent must implement the capability rather than import it.
- Reference solutions are excluded from the agent workspace.

## Links

- Source, task definitions, and docs: ${GITHUB_URL}
- Trajectory dataset (SFT + patch records): ${HF_URL}

License: Apache-2.0
`;

const DEFAULT_OUT_ROOT = "harbor";

function harborAvailable(): boolean {
  try {
    const check = Bun.spawnSync(["uvx", "harbor", "--version"], { stdout: "ignore", stderr: "ignore" });
    return check.exitCode === 0;
  } catch {
    return false;
  }
}

function runHarbor(args: string[]): void {
  const proc = Bun.spawnSync(["uvx", "harbor", ...args], { stdout: "inherit", stderr: "inherit" });
  if (proc.exitCode !== 0) {
    throw new Error(`uvx harbor ${args[0]} failed (exit ${proc.exitCode})`);
  }
}

/**
 * Regenerate harbor/<outRoot>/dataset.toml from the current task packages.
 * Returns false (without modifying anything) when the harbor CLI is unavailable,
 * so callers can treat it as best-effort.
 */
export function syncDataset(outRoot = DEFAULT_OUT_ROOT): boolean {
  const harborRoot = resolve(process.cwd(), outRoot);
  const datasetToml = join(harborRoot, "dataset.toml");
  const datasetReadme = join(harborRoot, "README.md");

  if (!existsSync(harborRoot)) {
    throw new Error(`harbor export directory not found: ${harborRoot}`);
  }

  if (!harborAvailable()) {
    console.warn(
      "[harbor] dataset.toml not regenerated: harbor CLI (uvx harbor) unavailable. " +
        "Run `bun run harbor:dataset` once uv/harbor is installed.",
    );
    return false;
  }

  // Regenerate deterministically: a fresh init auto-adds every task subdirectory
  // with current digests, so membership and digests always match the packages.
  rmSync(datasetToml, { force: true });
  rmSync(datasetReadme, { force: true });

  runHarbor([
    "init",
    "-d",
    DATASET_NAME,
    "-o",
    harborRoot,
    "--description",
    DATASET_DESCRIPTION,
    "--author",
    DATASET_AUTHOR,
  ]);

  // Replace the bare title README that `harbor init` writes with the rich
  // landing-page README shown on the dataset hub page.
  writeFileSync(datasetReadme, DATASET_README);

  // Explicit digest refresh (no-op immediately after init, but guarantees the
  // committed manifest's digests match the packages).
  runHarbor(["sync", datasetToml]);

  console.log(`[harbor] regenerated ${datasetToml} + README.md (${DATASET_NAME})`);
  return true;
}

if (import.meta.main) {
  syncDataset();
}
