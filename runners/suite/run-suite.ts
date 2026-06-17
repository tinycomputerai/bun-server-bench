#!/usr/bin/env bun

import { parseArgs } from "./cli";
import { runSuite } from "./suite";

async function main(): Promise<void> {
  const { agentId, tasksPattern, failedFrom, concurrency } = parseArgs(process.argv.slice(2));
  const result = await runSuite(agentId, { tasksPattern, failedFrom, concurrency });

  console.log(`\n[suite] complete`);
  console.log(`agent: ${result.summary.agent_id}`);
  console.log(`tasks: ${result.summary.total_tasks}`);
  console.log(`passed: ${result.summary.passed}`);
  console.log(`failed: ${result.summary.failed}`);
  console.log(`average score: ${result.summary.average_score}`);
  console.log(`total wall time: ${result.summary.total_wall_time_ms}ms`);
  console.log(`summary: results/${agentId}/summary.json`);
  console.log(`leaderboard: results/${agentId}/leaderboard.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
