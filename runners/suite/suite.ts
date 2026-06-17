import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { validateTaskDirectory } from "../../validators/validate-task";
import { runAgent } from "../agent/runner";
import { discoverTasks } from "./discover-tasks";
import {
  loadLeaderboard,
  mergeLeaderboardEntries,
  selectFailedTaskIds,
  selectRetryTaskIds,
  taskPathFromTaskId,
} from "./load-leaderboard";
import type { LeaderboardEntry, SuiteLeaderboard, SuiteResult, SuiteSummary } from "./types";

const repoRoot = resolve(import.meta.dir, "../..");
const DEFAULT_CONCURRENCY = 1;
const CLAUDE_CODE_CONCURRENCY_WARN_THRESHOLD = 3;

export type RunSuiteOptions = {
  tasksPattern?: string;
  failedFrom?: string;
  concurrency?: number;
};

export async function runSuite(agentId: string, options: RunSuiteOptions): Promise<SuiteResult> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  warnHighConcurrency(agentId, concurrency);

  if (options.failedFrom) {
    return runSuiteRetry(agentId, options.failedFrom, concurrency, options.tasksPattern);
  }

  if (!options.tasksPattern) {
    throw new Error("either --tasks or --failed-from is required");
  }

  const taskPaths = await discoverTasks(options.tasksPattern);
  if (taskPaths.length === 0) {
    throw new Error(`no valid tasks discovered for pattern: ${options.tasksPattern}`);
  }

  const startedAt = new Date().toISOString();
  const suiteStartedMs = Date.now();
  const entries = await runTaskPaths(agentId, taskPaths, concurrency, {
    startedAt,
    suiteStartedMs,
    expectedTotal: taskPaths.length,
    baselineEntries: [],
  });
  const completedAt = new Date().toISOString();

  return writeSuiteResult({
    agentId,
    entries,
    startedAt,
    completedAt,
    wallTimeMs: Date.now() - suiteStartedMs,
    expectedTotal: taskPaths.length,
  });
}

async function runSuiteRetry(
  agentId: string,
  failedFrom: string,
  concurrency: number,
  tasksPattern?: string,
): Promise<SuiteResult> {
  const previous = loadLeaderboard(failedFrom);
  if (previous.agent_id !== agentId) {
    throw new Error(
      `leaderboard agent_id "${previous.agent_id}" does not match --agent "${agentId}"`,
    );
  }

  const retryTaskIds = tasksPattern
    ? selectRetryTaskIds(
        previous,
        (await discoverTasks(tasksPattern)).map((taskPath) => basename(taskPath)),
      )
    : selectFailedTaskIds(previous);

  if (retryTaskIds.length === 0) {
    const message = tasksPattern
      ? `[suite] no failed or pending tasks to resume from ${failedFrom}`
      : `[suite] no tasks with score < 100 in ${failedFrom}`;
    console.log(message);
    const now = new Date().toISOString();
    const expectedTotal = tasksPattern
      ? (await discoverTasks(tasksPattern)).length
      : previous.entries.length;
    return writeSuiteResult({
      agentId,
      entries: previous.entries,
      startedAt: now,
      completedAt: now,
      wallTimeMs: 0,
      expectedTotal,
    });
  }

  const taskPaths = retryTaskIds.map(taskPathFromTaskId);
  for (const taskPath of taskPaths) {
    const validation = await validateTaskDirectory(taskPath);
    if (validation.errors.length > 0) {
      throw new Error(`invalid task ${taskPath}: ${validation.errors.join(", ")}`);
    }
  }

  const failedCount = selectFailedTaskIds(previous).length;
  const pendingCount = retryTaskIds.length - failedCount;
  if (tasksPattern) {
    console.log(
      `[suite] resuming ${retryTaskIds.length} task(s) from ${failedFrom} (${failedCount} failed, ${pendingCount} pending)`,
    );
  } else {
    console.log(`[suite] retrying ${retryTaskIds.length} failed task(s) from ${failedFrom}`);
  }

  const startedAt = new Date().toISOString();
  const suiteStartedMs = Date.now();
  const baselineEntries = previous.entries.filter((entry) => entry.score >= 100);
  const expectedTotal = tasksPattern
    ? (await discoverTasks(tasksPattern)).length
    : previous.entries.length;
  const retriedEntries = await runTaskPaths(agentId, taskPaths, concurrency, {
    startedAt,
    suiteStartedMs,
    expectedTotal,
    baselineEntries,
  });
  const completedAt = new Date().toISOString();
  const entries = mergeLeaderboardEntries(baselineEntries, retriedEntries);

  return writeSuiteResult({
    agentId,
    entries,
    startedAt,
    completedAt,
    wallTimeMs: Date.now() - suiteStartedMs,
    expectedTotal,
  });
}

function warnHighConcurrency(agentId: string, concurrency: number): void {
  if (agentId === "claude-code" && concurrency > CLAUDE_CODE_CONCURRENCY_WARN_THRESHOLD) {
    console.warn(
      `[suite] warning: concurrency ${concurrency} with agent claude-code may hit API/tool rate limits; consider <= ${CLAUDE_CODE_CONCURRENCY_WARN_THRESHOLD}`,
    );
  }
}

function logSuiteProgress(
  message: string,
  counts: { active: number; finished: number; total: number; concurrency: number },
): void {
  console.log(
    `[suite] ${message} (active ${counts.active}/${counts.concurrency}, finished ${counts.finished}/${counts.total})`,
  );
}

type SuiteRunContext = {
  startedAt: string;
  suiteStartedMs: number;
  expectedTotal: number;
  baselineEntries: LeaderboardEntry[];
};

type IncrementalSuiteWriter = {
  write: (entries: LeaderboardEntry[]) => Promise<void>;
};

function createIncrementalSuiteWriter(
  agentId: string,
  runContext: SuiteRunContext,
): IncrementalSuiteWriter {
  const outputDir = join(repoRoot, "results", agentId);
  mkdirSync(outputDir, { recursive: true });

  let writeChain = Promise.resolve();

  return {
    write(entries: LeaderboardEntry[]) {
      writeChain = writeChain.then(() => {
        writeSuiteArtifacts({
          agentId,
          entries,
          startedAt: runContext.startedAt,
          completedAt: new Date().toISOString(),
          wallTimeMs: Date.now() - runContext.suiteStartedMs,
          expectedTotal: runContext.expectedTotal,
          outputDir,
        });
      });
      return writeChain;
    },
  };
}

function collectCurrentRunEntries(entries: Array<LeaderboardEntry | undefined>): LeaderboardEntry[] {
  return entries.filter((entry): entry is LeaderboardEntry => entry !== undefined);
}

function buildIncrementalEntries(
  baselineEntries: LeaderboardEntry[],
  currentRunEntries: LeaderboardEntry[],
): LeaderboardEntry[] {
  if (baselineEntries.length === 0) {
    return sortEntriesByTaskId(currentRunEntries);
  }

  return mergeLeaderboardEntries(baselineEntries, currentRunEntries);
}

async function runTaskPaths(
  agentId: string,
  taskPaths: string[],
  concurrency: number,
  runContext: SuiteRunContext,
): Promise<LeaderboardEntry[]> {
  const total = taskPaths.length;
  const entries: Array<LeaderboardEntry | undefined> = new Array(total);
  const pathToIndex = new Map(taskPaths.map((taskPath, index) => [taskPath, index]));
  const writer = createIncrementalSuiteWriter(agentId, runContext);
  let nextTaskIndex = 0;
  let active = 0;
  let finished = 0;

  await writer.write(buildIncrementalEntries(runContext.baselineEntries, []));

  const runOne = async (taskPath: string): Promise<void> => {
    const taskId = basename(taskPath);
    const entryIndex = pathToIndex.get(taskPath);
    if (entryIndex === undefined) {
      throw new Error(`unknown task path: ${taskPath}`);
    }

    active += 1;
    logSuiteProgress(`task started: ${taskId}`, { active, finished, total, concurrency });

    let completionMessage: string | undefined;

    try {
      const result = await runAgent(taskPath, agentId);
      entries[entryIndex] = {
        task_id: result.task_id,
        score: result.score,
        duration_ms: result.durations.total_ms,
        status: result.status,
        run_id: result.run_id,
      };

      if (result.status === "completed") {
        completionMessage = `task completed: ${result.task_id} (${result.score}/${result.max_score}, ${result.durations.total_ms}ms)`;
      } else {
        completionMessage = `task failed: ${result.task_id} — ${result.status} (${result.score}/${result.max_score}, ${result.durations.total_ms}ms)`;
      }
    } catch (runError) {
      const errorMessage = runError instanceof Error ? runError.message : String(runError);
      entries[entryIndex] = {
        task_id: taskId,
        score: 0,
        duration_ms: 0,
        status: "failed_agent",
        run_id: "unknown",
      };
      completionMessage = `task failed: ${taskId} — unexpected error: ${errorMessage}`;
    } finally {
      active -= 1;
      finished += 1;
      if (completionMessage) {
        logSuiteProgress(completionMessage, { active, finished, total, concurrency });
      }

      await writer.write(
        buildIncrementalEntries(runContext.baselineEntries, collectCurrentRunEntries(entries)),
      );
    }
  };

  const worker = async (): Promise<void> => {
    while (true) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      if (taskIndex >= taskPaths.length) {
        return;
      }

      await runOne(taskPaths[taskIndex]!);
    }
  };

  const workerCount = Math.min(concurrency, taskPaths.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return buildIncrementalEntries(runContext.baselineEntries, collectCurrentRunEntries(entries));
}

export function sortEntriesByTaskId(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((left, right) => left.task_id.localeCompare(right.task_id));
}

function writeSuiteResult(input: {
  agentId: string;
  entries: LeaderboardEntry[];
  startedAt: string;
  completedAt: string;
  wallTimeMs: number;
  expectedTotal?: number;
}): SuiteResult {
  const outputDir = join(repoRoot, "results", input.agentId);
  return writeSuiteArtifacts({ ...input, outputDir });
}

function writeSuiteArtifacts(input: {
  agentId: string;
  entries: LeaderboardEntry[];
  startedAt: string;
  completedAt: string;
  wallTimeMs: number;
  expectedTotal?: number;
  outputDir: string;
}): SuiteResult {
  const summary = buildSummary(
    input.agentId,
    input.entries,
    input.wallTimeMs,
    input.startedAt,
    input.completedAt,
    input.expectedTotal,
  );

  const leaderboard: SuiteLeaderboard = {
    agent_id: input.agentId,
    entries: sortLeaderboardEntries(input.entries),
  };

  mkdirSync(input.outputDir, { recursive: true });
  writeFileSync(join(input.outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(input.outputDir, "leaderboard.json"), `${JSON.stringify(leaderboard, null, 2)}\n`);

  return { summary, leaderboard, outputDir: input.outputDir };
}

export function sortLeaderboardEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort(
    (left, right) => right.score - left.score || left.task_id.localeCompare(right.task_id),
  );
}

export function buildSummary(
  agentId: string,
  entries: LeaderboardEntry[],
  wallTimeMs: number,
  startedAt: string,
  completedAt: string,
  expectedTotal?: number,
): SuiteSummary {
  const passed = entries.filter((entry) => entry.status === "completed").length;
  const failed = entries.filter((entry) => entry.status !== "completed").length;
  const averageScore =
    entries.length === 0 ? 0 : entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length;

  return {
    agent_id: agentId,
    total_tasks: expectedTotal ?? entries.length,
    passed,
    failed,
    average_score: roundScore(averageScore),
    total_wall_time_ms: wallTimeMs,
    started_at: startedAt,
    completed_at: completedAt,
  };
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}
