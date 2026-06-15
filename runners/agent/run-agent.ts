#!/usr/bin/env bun

import { SUPPORTED_AGENTS } from "../../agents/registry";
import { runAgent } from "./runner";

function parseArgs(argv: string[]): { taskPath: string; agentId: string } {
  const args = argv.filter((arg) => arg !== "--");
  let taskPath: string | undefined;
  let agentId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--task") {
      taskPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--agent") {
      agentId = args[index + 1];
      index += 1;
      continue;
    }
    if (!taskPath && !arg.startsWith("-")) {
      taskPath = arg;
      continue;
    }
    throw new Error(
      `usage: bun run run:agent --task <task-path> --agent <agent-id>\n\nsupported agents: ${SUPPORTED_AGENTS.join(", ")}`,
    );
  }

  if (!taskPath || !agentId) {
    throw new Error(
      `usage: bun run run:agent --task <task-path> --agent <agent-id>\n\nsupported agents: ${SUPPORTED_AGENTS.join(", ")}`,
    );
  }

  return { taskPath, agentId };
}

async function main(): Promise<void> {
  const { taskPath, agentId } = parseArgs(process.argv.slice(2));
  const result = await runAgent(taskPath, agentId);

  console.log(`run_id: ${result.run_id}`);
  console.log(`agent: ${result.agent_id}`);
  console.log(`status: ${result.status}`);
  console.log(`score: ${result.score}/${result.max_score}`);
  console.log(`result: runs/${result.run_id}/result.json`);

  if (result.error) {
    console.error(result.error);
  }

  if (result.status !== "completed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
