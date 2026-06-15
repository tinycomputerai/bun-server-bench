import { writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createAgent } from "../../agents/registry";
import { validateTaskDirectory } from "../../validators/validate-task";
import { createRunDirectory, materializeWorkspace } from "../local/workspace";
import type { TaskConfig } from "../local/types";
import { runValidationLifecycle } from "../shared/validation";
import { constructPrompt } from "./prompt";
import {
  buildAgentResult,
  markSkippedAfterAgent,
  skippedAgentOutcomes,
  type AgentRunResult,
  type AgentRunStatus,
} from "./result";

const repoRoot = resolve(import.meta.dir, "../..");

export async function runAgent(taskPath: string, agentId: string): Promise<AgentRunResult> {
  const startedAt = new Date().toISOString();
  const runStartedMs = Date.now();
  const taskDir = resolve(process.cwd(), taskPath);
  const validationPath = relativeToCwd(taskDir);

  const validation = await validateTaskDirectory(validationPath);
  if (validation.errors.length > 0) {
    const taskId = validation.taskId ?? basename(taskDir);
    const runDir = createRunDirectory(repoRoot, taskId);
    const result = buildAgentResult({
      taskId,
      taskVersion: "unknown",
      specVersion: "unknown",
      runId: basename(runDir),
      agentId,
      status: "invalid_task",
      maxScore: 100,
      startedAt,
      completedAt: new Date().toISOString(),
      durations: emptyDurations(Date.now() - runStartedMs),
      outcome: skippedAgentOutcomes(),
      metrics: { wall_time_ms: 0 },
      error: validation.errors.join("\n"),
    });
    writeResult(runDir, result);
    return result;
  }

  const task = await loadTaskConfig(taskDir);
  const agent = createAgent(agentId);
  const runDir = createRunDirectory(repoRoot, task.id);
  const runId = basename(runDir);
  const workspaceDir = join(runDir, "workspace");
  const logsDir = join(runDir, "logs");

  const totalTimeoutMs = task.timeouts.total_seconds * 1000;
  const deadlineMs = runStartedMs + totalTimeoutMs;

  let status: AgentRunStatus = "completed";
  let error: string | null = null;
  let agentDurationMs = 0;
  let metrics = { wall_time_ms: 0 };
  const outcome = skippedAgentOutcomes();

  const prompt = constructPrompt(taskDir, task);
  const context = {
    agentId: agent.id,
    taskDir,
    workspaceDir,
    runDir,
    logsDir,
    prompt,
    task,
    deadlineMs,
  };

  let validationDurations = emptyValidationDurations();

  try {
    materializeWorkspace(taskDir, workspaceDir, "starter");

    if (Date.now() >= deadlineMs) {
      status = "timed_out";
      error = "run exceeded total timeout before agent";
    } else {
      await agent.prepare(context);

      const agentResult = await agent.run(context);
      agentDurationMs = agentResult.durationMs;
      metrics = agentResult.metrics;

      if (agentResult.timedOut || Date.now() >= deadlineMs) {
        status = "timed_out";
        error = "agent timed out";
        outcome.agent = "failed";
        Object.assign(outcome, markSkippedAfterAgent(outcome, "agent"));
      } else if (agentResult.exitCode !== 0) {
        status = "failed_agent";
        error = `agent exited with status ${agentResult.exitCode}`;
        outcome.agent = "failed";
        Object.assign(outcome, markSkippedAfterAgent(outcome, "agent"));
      } else {
        outcome.agent = "passed";

        const validationResult = await runValidationLifecycle({
          task,
          taskDir,
          workspaceDir,
          logsDir,
          deadlineMs,
        });

        status = validationResult.status;
        error = validationResult.error;
        validationDurations = validationResult.durations;
        Object.assign(outcome, validationResult.outcome);
      }
    }
  } catch (runError) {
    status = "failed_agent";
    error = runError instanceof Error ? runError.message : String(runError);
    outcome.agent = "failed";
    Object.assign(outcome, markSkippedAfterAgent(outcome, "agent"));
  } finally {
    await agent.cleanup(context);
  }

  const result = buildAgentResult({
    taskId: task.id,
    taskVersion: task.task_version,
    specVersion: task.spec_version,
    runId,
    agentId: agent.id,
    status,
    maxScore: task.scoring.max_score,
    startedAt,
    completedAt: new Date().toISOString(),
    durations: {
      agent_ms: agentDurationMs,
      install_ms: validationDurations.install_ms,
      start_ms: validationDurations.start_ms,
      readiness_ms: validationDurations.readiness_ms,
      public_tests_ms: validationDurations.public_tests_ms,
      hidden_tests_ms: validationDurations.hidden_tests_ms,
      total_ms: Date.now() - runStartedMs,
    },
    outcome,
    metrics,
    error,
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

function writeResult(runDir: string, result: AgentRunResult): void {
  writeFileSync(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
}

function emptyDurations(totalMs: number): AgentRunResult["durations"] {
  return {
    agent_ms: 0,
    install_ms: 0,
    start_ms: 0,
    readiness_ms: 0,
    public_tests_ms: 0,
    hidden_tests_ms: 0,
    total_ms: totalMs,
  };
}

function emptyValidationDurations(): Omit<AgentRunResult["durations"], "agent_ms" | "total_ms"> {
  return {
    install_ms: 0,
    start_ms: 0,
    readiness_ms: 0,
    public_tests_ms: 0,
    hidden_tests_ms: 0,
  };
}
