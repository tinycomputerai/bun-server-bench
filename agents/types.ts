import type { TaskConfig } from "../runners/local/types";

export type AgentContext = {
  agentId: string;
  taskDir: string;
  workspaceDir: string;
  runDir: string;
  logsDir: string;
  prompt: string;
  task: TaskConfig;
  deadlineMs: number;
};

export type AgentMetrics = {
  wall_time_ms: number;
  input_tokens?: number;
  output_tokens?: number;
  tool_calls?: number;
};

export type AgentRunOutcome = {
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  metrics: AgentMetrics;
};

export interface Agent {
  readonly id: string;

  /** Verify the agent binary is available and prepare run artifacts. */
  prepare(context: AgentContext): Promise<void>;

  /** Execute the agent against the materialized workspace. */
  run(context: AgentContext): Promise<AgentRunOutcome>;

  /** Release resources after the run (always called, even on failure). */
  cleanup(context: AgentContext): Promise<void>;
}
