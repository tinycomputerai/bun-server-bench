import { describe, expect, test } from "bun:test";
import { parseConcurrency } from "./cli";
import {
  mergeLeaderboardEntries,
  selectFailedTaskIds,
  selectRetryTaskIds,
  taskPathFromTaskId,
} from "./load-leaderboard";
import { sortEntriesByTaskId, buildSummary } from "./suite";
import type { LeaderboardEntry, SuiteLeaderboard } from "./types";

function entry(taskId: string, score: number): LeaderboardEntry {
  return {
    task_id: taskId,
    score,
    duration_ms: 1000,
    status: score === 100 ? "completed" : "failed_hidden_tests",
    run_id: `run-${taskId}`,
  };
}

describe("suite retry helpers", () => {
  test("maps task ids to task paths", () => {
    expect(taskPathFromTaskId("authentication.jwt-verify.v1")).toBe(
      "tasks/authentication.jwt-verify.v1",
    );
  });

  test("selects only tasks with score below 100", () => {
    const leaderboard: SuiteLeaderboard = {
      agent_id: "claude-code",
      entries: [
        entry("alpha.v1", 100),
        entry("beta.v1", 25),
        entry("gamma.v1", 0),
        entry("delta.v1", 100),
      ],
    };

    expect(selectFailedTaskIds(leaderboard)).toEqual(["beta.v1", "gamma.v1"]);
  });

  test("selects failed and pending tasks for resume", () => {
    const leaderboard: SuiteLeaderboard = {
      agent_id: "claude-code",
      entries: [
        entry("alpha.v1", 100),
        entry("beta.v1", 25),
        entry("gamma.v1", 100),
      ],
    };

    expect(
      selectRetryTaskIds(leaderboard, ["alpha.v1", "beta.v1", "gamma.v1", "delta.v1", "echo.v1"]),
    ).toEqual(["beta.v1", "delta.v1", "echo.v1"]);
  });

  test("merges retried results while keeping passing tasks", () => {
    const previous = [
      entry("alpha.v1", 100),
      entry("beta.v1", 25),
      entry("gamma.v1", 0),
    ];
    const retried = [entry("beta.v1", 100), entry("gamma.v1", 25)];

    expect(mergeLeaderboardEntries(previous, retried)).toEqual([
      entry("alpha.v1", 100),
      entry("beta.v1", 100),
      entry("gamma.v1", 25),
    ]);
  });
});

describe("suite concurrency", () => {
  test("defaults concurrency to 1", () => {
    expect(parseConcurrency(undefined)).toBe(1);
  });

  test("accepts positive integer concurrency", () => {
    expect(parseConcurrency("4")).toBe(4);
  });

  test("rejects concurrency below 1", () => {
    expect(() => parseConcurrency("0")).toThrow("--concurrency must be an integer >= 1");
    expect(() => parseConcurrency("-1")).toThrow("--concurrency must be an integer >= 1");
  });

  test("rejects non-integer concurrency", () => {
    expect(() => parseConcurrency("2.5")).toThrow("--concurrency must be an integer >= 1");
    expect(() => parseConcurrency("nope")).toThrow("--concurrency must be an integer >= 1");
  });
});

describe("suite ordering", () => {
  test("sorts entries by task id", () => {
    const entries = [
      entry("zulu.v1", 100),
      entry("alpha.v1", 50),
      entry("mike.v1", 75),
    ];

    expect(sortEntriesByTaskId(entries).map((item) => item.task_id)).toEqual([
      "alpha.v1",
      "mike.v1",
      "zulu.v1",
    ]);
  });
});

describe("suite summary", () => {
  test("uses expected total while a run is still in progress", () => {
    const summary = buildSummary(
      "claude-code",
      [entry("alpha.v1", 100), entry("beta.v1", 25)],
      120000,
      "2026-06-18T00:00:00.000Z",
      "2026-06-18T00:02:00.000Z",
      50,
    );

    expect(summary.total_tasks).toBe(50);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.average_score).toBe(62.5);
  });
});
