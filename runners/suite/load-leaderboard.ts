import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SuiteLeaderboard } from "./types";

export function loadLeaderboard(path: string): SuiteLeaderboard {
  const absolute = resolve(process.cwd(), path);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(absolute, "utf8"));
  } catch {
    throw new Error(`failed to read leaderboard: ${path}`);
  }

  if (
    !raw ||
    typeof raw !== "object" ||
    !("agent_id" in raw) ||
    typeof (raw as SuiteLeaderboard).agent_id !== "string" ||
    !("entries" in raw) ||
    !Array.isArray((raw as SuiteLeaderboard).entries)
  ) {
    throw new Error(`invalid leaderboard format: ${path}`);
  }

  return raw as SuiteLeaderboard;
}

export function taskPathFromTaskId(taskId: string): string {
  return `tasks/${taskId}`;
}

export function selectFailedTaskIds(leaderboard: SuiteLeaderboard): string[] {
  return leaderboard.entries
    .filter((entry) => entry.score < 100)
    .map((entry) => entry.task_id)
    .sort((left, right) => left.localeCompare(right));
}

export function selectRetryTaskIds(
  leaderboard: SuiteLeaderboard,
  allTaskIds: string[],
): string[] {
  const failed = selectFailedTaskIds(leaderboard);
  const present = new Set(leaderboard.entries.map((entry) => entry.task_id));
  const pending = allTaskIds.filter((taskId) => !present.has(taskId));
  return [...failed, ...pending].sort((left, right) => left.localeCompare(right));
}

export function mergeLeaderboardEntries(
  previous: SuiteLeaderboard["entries"],
  retried: SuiteLeaderboard["entries"],
): SuiteLeaderboard["entries"] {
  const kept = previous.filter((entry) => entry.score >= 100);
  return [...kept, ...retried].sort(
    (left, right) => right.score - left.score || left.task_id.localeCompare(right.task_id),
  );
}
