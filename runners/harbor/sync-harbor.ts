#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { discoverTasks } from "../suite/discover-tasks";
import { exportTask } from "./export";
import { pruneStaleHarborExports } from "./prune-stale";
import { syncDataset } from "./sync-dataset";
import { writeTasksLock } from "./tasks-lock";
import {
  findChangedTaskPaths,
  slugForTaskPath,
  validateTasksLock,
  type TasksLockValidationResult,
} from "./validate-tasks-lock";

const DEFAULT_OUT_ROOT = "harbor";

type SyncOptions = {
  tasksPattern: string;
  outRoot: string;
  changedSince?: string;
};

function parseArgs(argv: string[]): SyncOptions {
  const args = argv.filter((arg) => arg !== "--");
  let tasksPattern: string | undefined;
  let outRoot = DEFAULT_OUT_ROOT;
  let changedSince: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--tasks") {
      tasksPattern = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--out") {
      outRoot = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--changed-since") {
      changedSince = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(usage());
  }

  if (!tasksPattern) {
    throw new Error(usage());
  }

  return { tasksPattern, outRoot, changedSince };
}

function usage(): string {
  return [
    "usage: bun run harbor:sync --tasks '<pattern>' [--out <out-root>] [--changed-since <git-ref>]",
    "",
    "example: bun run harbor:sync --tasks 'tasks/**' --changed-since ${{ github.event.before }}",
  ].join("\n");
}

function logValidation(result: TasksLockValidationResult): void {
  if (result.lock === null) {
    console.log("[harbor:sync] tasks-lock.json is missing");
  } else if (result.isValid) {
    console.log("[harbor:sync] tasks-lock.json matches harbor exports");
    return;
  }

  for (const issue of result.issues) {
    switch (issue.kind) {
      case "missing_export":
        console.log(`[harbor:sync] missing export for ${issue.taskPath} (${issue.slug})`);
        break;
      case "checksum_mismatch":
        console.log(
          `[harbor:sync] checksum mismatch for ${issue.taskPath} (${issue.slug}): expected ${issue.expected}, actual ${issue.actual}`,
        );
        break;
      case "source_changed":
        console.log(`[harbor:sync] source changed for ${issue.taskPath} (${issue.slug})`);
        break;
      case "stale_export":
        console.log(`[harbor:sync] stale export ${issue.slug}`);
        break;
      case "aggregate_checksum_mismatch":
        console.log(
          `[harbor:sync] aggregate checksum mismatch: expected ${issue.expected}, actual ${issue.actual}`,
        );
        break;
    }
  }
}

async function main(): Promise<void> {
  const { tasksPattern, outRoot, changedSince } = parseArgs(process.argv.slice(2));
  const harborRoot = resolve(process.cwd(), outRoot);
  if (!existsSync(harborRoot)) {
    throw new Error(`harbor export directory not found: ${harborRoot}`);
  }

  const taskPaths = await discoverTasks(tasksPattern);
  if (taskPaths.length === 0) {
    throw new Error(`no valid tasks discovered for pattern: ${tasksPattern}`);
  }

  const changedTaskPaths = findChangedTaskPaths(taskPaths, changedSince);
  const validation = validateTasksLock(harborRoot, taskPaths, { changedTaskPaths });
  logValidation(validation);

  if (validation.isValid) {
    return;
  }

  let exported = 0;
  let failed = 0;
  for (const taskPath of validation.tasksToExport) {
    try {
      const result = await exportTask(taskPath, outRoot);
      exported += 1;
      console.log(`[harbor:sync] exported ${result.id} -> ${result.outDir}`);
    } catch (error) {
      failed += 1;
      console.error(`[harbor:sync] FAIL ${taskPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
    return;
  }

  const activeSlugs = new Set(taskPaths.map(slugForTaskPath));
  const removed = pruneStaleHarborExports(harborRoot, activeSlugs);
  for (const slug of removed) {
    console.log(`[harbor:sync] removed stale export ${slug}`);
  }

  const lockPath = writeTasksLock(harborRoot);
  console.log(`[harbor:sync] wrote tasks lock to ${lockPath}`);
  syncDataset(outRoot);
  console.log(
    `[harbor:sync] synced ${exported} task export(s), removed ${removed.length} stale export(s)`,
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
