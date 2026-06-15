import { ClaudeCodeAgent } from "./claude-code";
import type { Agent } from "./types";

const AGENTS: Record<string, () => Agent> = {
  "claude-code": () => new ClaudeCodeAgent(),
};

export const SUPPORTED_AGENTS = Object.keys(AGENTS);

export function createAgent(agentId: string): Agent {
  const factory = AGENTS[agentId];
  if (!factory) {
    throw new Error(
      `unknown agent: ${agentId}; supported agents: ${SUPPORTED_AGENTS.join(", ")}`,
    );
  }
  return factory();
}
