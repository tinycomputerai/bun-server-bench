import type { PhaseOutcome, RunStatus } from "../local/types";
import { computeScore } from "../local/result";
import type { AgentMetrics } from "../../agents/types";

export type AgentRunStatus = RunStatus | "failed_agent";

export type AgentRunResult = {
  task_id: string;
  task_version: string;
  spec_version: string;
  run_id: string;
  agent_id: string;
  mode: "agent";
  status: AgentRunStatus;
  score: number;
  max_score: number;
  started_at: string;
  completed_at: string;
  durations: {
    agent_ms: number;
    install_ms: number;
    start_ms: number;
    readiness_ms: number;
    public_tests_ms: number;
    hidden_tests_ms: number;
    total_ms: number;
  };
  outcome: {
    agent: PhaseOutcome;
    install: PhaseOutcome;
    start: PhaseOutcome;
    readiness: PhaseOutcome;
    public_tests: PhaseOutcome;
    hidden_tests: PhaseOutcome;
  };
  metrics: AgentMetrics;
  artifacts: {
    agent_prompt: string;
    agent_stdout: string;
    agent_stderr: string;
    install_stdout: string;
    install_stderr: string;
    start_stdout: string;
    start_stderr: string;
    public_tests_stdout: string;
    public_tests_stderr: string;
    hidden_tests_stdout: string;
    hidden_tests_stderr: string;
  };
  error: string | null;
};

export function buildAgentResult(options: {
  taskId: string;
  taskVersion: string;
  specVersion: string;
  runId: string;
  agentId: string;
  status: AgentRunStatus;
  maxScore: number;
  startedAt: string;
  completedAt: string;
  durations: AgentRunResult["durations"];
  outcome: AgentRunResult["outcome"];
  metrics: AgentMetrics;
  error: string | null;
}): AgentRunResult {
  return {
    task_id: options.taskId,
    task_version: options.taskVersion,
    spec_version: options.specVersion,
    run_id: options.runId,
    agent_id: options.agentId,
    mode: "agent",
    status: options.status,
    score: computeScore(normalizeStatus(options.status), options.maxScore),
    max_score: options.maxScore,
    started_at: options.startedAt,
    completed_at: options.completedAt,
    durations: options.durations,
    outcome: options.outcome,
    metrics: options.metrics,
    artifacts: {
      agent_prompt: "logs/agent-prompt.md",
      agent_stdout: "logs/agent.stdout.log",
      agent_stderr: "logs/agent.stderr.log",
      install_stdout: "logs/install.stdout.log",
      install_stderr: "logs/install.stderr.log",
      start_stdout: "logs/start.stdout.log",
      start_stderr: "logs/start.stderr.log",
      public_tests_stdout: "logs/public-tests.stdout.log",
      public_tests_stderr: "logs/public-tests.stderr.log",
      hidden_tests_stdout: "logs/hidden-tests.stdout.log",
      hidden_tests_stderr: "logs/hidden-tests.stderr.log",
    },
    error: options.error,
  };
}

export function skippedAgentOutcomes(): AgentRunResult["outcome"] {
  return {
    agent: "skipped",
    install: "skipped",
    start: "skipped",
    readiness: "skipped",
    public_tests: "skipped",
    hidden_tests: "skipped",
  };
}

export function markSkippedAfterAgent(
  outcome: AgentRunResult["outcome"],
  failedPhase: keyof AgentRunResult["outcome"],
): AgentRunResult["outcome"] {
  const order: Array<keyof AgentRunResult["outcome"]> = [
    "agent",
    "install",
    "start",
    "readiness",
    "public_tests",
    "hidden_tests",
  ];
  const failedIndex = order.indexOf(failedPhase);
  const next: AgentRunResult["outcome"] = { ...outcome };

  for (let index = failedIndex + 1; index < order.length; index += 1) {
    next[order[index]] = "skipped";
  }

  return next;
}

function normalizeStatus(status: AgentRunStatus): RunStatus {
  if (status === "failed_agent") {
    return "failed_install";
  }
  return status;
}
