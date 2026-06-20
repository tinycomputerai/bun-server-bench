#!/usr/bin/env bun

/**
 * Regenerates the Harbor dataset manifest (harbor/dataset.toml) so it always
 * matches the exported task packages: a fresh `harbor init` auto-adds every task
 * subdirectory with its current content digest, then `harbor sync` refreshes the
 * digests. Run automatically after a harbor export/sync, or standalone via
 * `bun run harbor:dataset`.
 */

import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

export const DATASET_NAME = "tinycomputerai/bun-server-bench";
export const DATASET_DESCRIPTION =
  "bun-server-bench: a correctness benchmark of 50 production-shaped Bun server engineering tasks for evaluating AI coding agents.";
export const DATASET_AUTHOR = "tincomputer.ai";

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

  // Explicit digest refresh (no-op immediately after init, but guarantees the
  // committed manifest's digests match the packages).
  runHarbor(["sync", datasetToml]);

  console.log(`[harbor] regenerated ${datasetToml} (${DATASET_NAME})`);
  return true;
}

if (import.meta.main) {
  syncDataset();
}
