#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { discoverTasks } from "../suite/discover-tasks";
import { pruneStaleHarborExports } from "./prune-stale";
import { syncDataset } from "./sync-dataset";
import { writeTasksLock } from "./tasks-lock";
import { exportTask, sanitizeName } from "./export";

const DEFAULT_OUT_ROOT = "harbor";

function parseArgs(argv: string[]): { tasksPattern: string; outRoot: string } {
  const args = argv.filter((arg) => arg !== "--");
  let tasksPattern: string | undefined;
  let outRoot = DEFAULT_OUT_ROOT;

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
    throw new Error(usage());
  }

  if (!tasksPattern) {
    throw new Error(usage());
  }
  return { tasksPattern, outRoot };
}

function usage(): string {
  return "usage: bun run harbor:export-suite --tasks '<pattern>' [--out <out-root>]\n\nexample: bun run harbor:export-suite --tasks 'tasks/**'";
}

async function main(): Promise<void> {
  const { tasksPattern, outRoot } = parseArgs(process.argv.slice(2));
  const taskPaths = await discoverTasks(tasksPattern);
  if (taskPaths.length === 0) {
    throw new Error(`no valid tasks discovered for pattern: ${tasksPattern}`);
  }

  let exported = 0;
  let failed = 0;
  const activeSlugs = new Set<string>();
  for (const taskPath of taskPaths) {
    try {
      const result = await exportTask(taskPath, outRoot);
      activeSlugs.add(sanitizeName(result.id));
      exported += 1;
      console.log(`ok    ${result.id} -> ${result.outDir}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL  ${taskPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failed === 0) {
    const removed = pruneStaleHarborExports(resolve(process.cwd(), outRoot), activeSlugs);
    for (const slug of removed) {
      console.log(`[harbor] removed stale export ${slug}`);
    }
    const lockPath = writeTasksLock(resolve(process.cwd(), outRoot));
    console.log(`[harbor] wrote tasks lock to ${lockPath}`);
    syncDataset(outRoot);
  }

  console.log(`\n[harbor] exported ${exported}/${taskPaths.length} task(s) to ${outRoot}`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
