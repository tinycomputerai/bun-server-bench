import { writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { validateTaskDirectory } from "../../validators/validate-task";
import {
  buildResult,
  skippedOutcomes,
} from "./result";
import type { RunMode, RunResult, TaskConfig } from "./types";
import { createRunDirectory, materializeWorkspace } from "./workspace";
import { runValidationLifecycle } from "../shared/validation";

const repoRoot = resolve(import.meta.dir, "../..");

export async function runTask(taskPath: string, mode: RunMode): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const runStartedMs = Date.now();
  const taskDir = resolve(process.cwd(), taskPath);
  const validationPath = relativeToCwd(taskDir);

  const validation = await validateTaskDirectory(validationPath);
  if (validation.errors.length > 0) {
    const taskId = validation.taskId ?? basename(taskDir);
    const runDir = createRunDirectory(repoRoot, taskId);
    const result = buildResult({
      taskId,
      taskVersion: "unknown",
      specVersion: "unknown",
      runId: basename(runDir),
      mode,
      status: "invalid_task",
      maxScore: 100,
      startedAt,
      completedAt: new Date().toISOString(),
      durations: emptyDurations(Date.now() - runStartedMs),
      outcome: skippedOutcomes(),
      error: validation.errors.join("\n"),
    });
    writeResult(runDir, result);
    return result;
  }

  const task = await loadTaskConfig(taskDir);
  const runDir = createRunDirectory(repoRoot, task.id);
  const runId = basename(runDir);
  const workspaceDir = join(runDir, "workspace");
  const logsDir = join(runDir, "logs");

  const totalTimeoutMs = task.timeouts.total_seconds * 1000;
  const deadlineMs = runStartedMs + totalTimeoutMs;

  materializeWorkspace(taskDir, workspaceDir, mode);

  const validationResult = await runValidationLifecycle({
    task,
    taskDir,
    workspaceDir,
    logsDir,
    deadlineMs,
  });

  const result = buildResult({
    taskId: task.id,
    taskVersion: task.task_version,
    specVersion: task.spec_version,
    runId,
    mode,
    status: validationResult.status,
    maxScore: task.scoring.max_score,
    startedAt,
    completedAt: new Date().toISOString(),
    durations: {
      ...validationResult.durations,
      total_ms: Date.now() - runStartedMs,
    },
    outcome: validationResult.outcome,
    error: validationResult.error,
  });

  writeResult(runDir, result);
  return result;
}

async function loadTaskConfig(taskDir: string): Promise<TaskConfig> {
  const taskYamlPath = join(taskDir, "task.yaml");
  return Bun.YAML.parse(await Bun.file(taskYamlPath).text()) as TaskConfig;
}

function relativeToCwd(absolutePath: string): string {
  const cwd = process.cwd();
  return absolutePath.startsWith(`${cwd}/`) ? absolutePath.slice(cwd.length + 1) : absolutePath;
}

function writeResult(runDir: string, result: RunResult): void {
  writeFileSync(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
}

function emptyDurations(totalMs: number): RunResult["durations"] {
  return {
    install_ms: 0,
    start_ms: 0,
    readiness_ms: 0,
    public_tests_ms: 0,
    hidden_tests_ms: 0,
    total_ms: totalMs,
  };
}
