import { SUPPORTED_AGENTS } from "../../agents/registry";

export const DEFAULT_CONCURRENCY = 1;

export const USAGE = `usage:
  bun run run:suite --agent <agent-id> --tasks <task-pattern> [--concurrency N]
  bun run run:suite --agent <agent-id> --failed-from <leaderboard.json> [--concurrency N]
  bun run run:suite --agent <agent-id> --tasks <task-pattern> --failed-from <leaderboard.json> [--concurrency N]

examples:
  bun run run:suite --agent claude-code --tasks 'tasks/**'
  bun run run:suite --agent claude-code --tasks 'tasks/**' --concurrency 4
  bun run run:suite --agent claude-code --failed-from results/claude-code/leaderboard.json
  bun run run:suite --agent claude-code --tasks 'tasks/**' --failed-from results/claude-code/leaderboard.json --concurrency 3

supported agents: ${SUPPORTED_AGENTS.join(", ")}`;

export function parseConcurrency(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_CONCURRENCY;
  }

  const concurrency = Number(raw);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`--concurrency must be an integer >= 1, got: ${raw}`);
  }

  return concurrency;
}

export function parseArgs(argv: string[]): {
  agentId: string;
  tasksPattern?: string;
  failedFrom?: string;
  concurrency: number;
} {
  const args = argv.filter((arg) => arg !== "--");
  let agentId: string | undefined;
  let tasksPattern: string | undefined;
  let failedFrom: string | undefined;
  let concurrency = DEFAULT_CONCURRENCY;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--agent") {
      agentId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--tasks") {
      tasksPattern = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--failed-from") {
      failedFrom = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--concurrency") {
      concurrency = parseConcurrency(args[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(USAGE);
  }

  if (!agentId || (!tasksPattern && !failedFrom)) {
    throw new Error(USAGE);
  }

  if (!SUPPORTED_AGENTS.includes(agentId)) {
    throw new Error(`unknown agent: ${agentId}; supported agents: ${SUPPORTED_AGENTS.join(", ")}`);
  }

  return { agentId, tasksPattern, failedFrom, concurrency };
}
