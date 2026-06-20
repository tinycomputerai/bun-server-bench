import { join } from "node:path";
import { runShellCommand, startManagedProcess, waitForHttpReadiness } from "../local/exec";
import {
  failedOutcome,
  markSkippedAfter,
  skippedOutcomes,
  statusForFailedPhase,
} from "../local/result";
import type { RunResult, RunStatus, TaskConfig } from "../local/types";

export type ValidationInput = {
  task: TaskConfig;
  taskDir: string;
  workspaceDir: string;
  logsDir: string;
  deadlineMs: number;
};

export type ValidationOutput = {
  status: RunStatus;
  outcome: RunResult["outcome"];
  durations: RunResult["durations"];
  error: string | null;
};

export async function runValidationLifecycle(input: ValidationInput): Promise<ValidationOutput> {
  const { task, taskDir, workspaceDir, logsDir, deadlineMs } = input;
  const durations = emptyDurations();
  const outcome = skippedOutcomes();
  let status: RunStatus = "completed";
  let error: string | null = null;
  let app: Awaited<ReturnType<typeof startManagedProcess>> | undefined;

  const fail = (phase: keyof RunResult["outcome"], message: string) => {
    outcome[phase] = failedOutcome(phase);
    Object.assign(outcome, markSkippedAfter(outcome, phase));
    status = statusForFailedPhase(phase);
    error = message;
  };

  try {
    if (Date.now() >= deadlineMs) {
      return timedOut("run exceeded total timeout before install", outcome, durations);
    }

    const install = await runShellCommand({
      command: task.dependencies.install_command,
      cwd: workspaceDir,
      timeoutMs: remainingMs(deadlineMs, task.timeouts.install_seconds * 1000),
      stdoutPath: join(logsDir, "install.stdout.log"),
      stderrPath: join(logsDir, "install.stderr.log"),
    });
    durations.install_ms = install.durationMs;

    if (install.timedOut || Date.now() >= deadlineMs) {
      return timedOut("install timed out", { ...outcome, install: "failed" }, durations);
    }

    if (install.exitCode !== 0) {
      fail("install", `install exited with status ${install.exitCode}`);
      return { status, outcome, durations, error };
    }
    outcome.install = "passed";

    if (Date.now() >= deadlineMs) {
      return timedOut("run exceeded total timeout before start", outcome, durations);
    }

    const startStartedMs = Date.now();
    app = await startManagedProcess({
      command: task.interfaces.process.start_command,
      cwd: workspaceDir,
      stdoutPath: join(logsDir, "start.stdout.log"),
      stderrPath: join(logsDir, "start.stderr.log"),
    });

    const startWaitMs = remainingMs(deadlineMs, task.timeouts.start_seconds * 1000);
    await sleep(Math.min(startWaitMs, 250));
    durations.start_ms = Date.now() - startStartedMs;

    if (app.proc.exitCode !== null) {
      await app.stop();
      fail("start", `start command exited early with status ${app.proc.exitCode}`);
      return { status, outcome, durations, error };
    }
    outcome.start = "passed";

    const readiness = task.interfaces.process.readiness;
    if (readiness.type !== "http") {
      await app.stop();
      fail("readiness", `unsupported readiness type: ${readiness.type}`);
      return { status, outcome, durations, error };
    }

    const readinessResult = await waitForHttpReadiness({
      port: app.port,
      path: readiness.path ?? "/",
      expectedStatus: readiness.expected_status ?? 200,
      timeoutMs: remainingMs(deadlineMs, task.timeouts.readiness_seconds * 1000),
      process: app,
    });
    durations.readiness_ms = readinessResult.durationMs;

    if (Date.now() >= deadlineMs) {
      await app.stop();
      return timedOut("run exceeded total timeout during readiness", {
        ...outcome,
        readiness: "failed",
      }, durations);
    }

    if (!readinessResult.ok) {
      await app.stop();
      if (readinessResult.reason === "exited") {
        outcome.start = "failed";
        outcome.readiness = "skipped";
        return {
          status: "failed_start",
          outcome,
          durations,
          error: "process exited before readiness check passed",
        };
      }
      fail("readiness", "readiness check did not pass before timeout");
      return { status, outcome, durations, error };
    }
    outcome.readiness = "passed";

    const publicTests = await runShellCommand({
      command: task.tests.public.command,
      cwd: workspaceDir,
      timeoutMs: remainingMs(deadlineMs, task.timeouts.test_seconds * 1000),
      stdoutPath: join(logsDir, "public-tests.stdout.log"),
      stderrPath: join(logsDir, "public-tests.stderr.log"),
    });
    durations.public_tests_ms = publicTests.durationMs;

    if (publicTests.timedOut || Date.now() >= deadlineMs) {
      return timedOut("public tests timed out", { ...outcome, public_tests: "failed" }, durations);
    }

    if (publicTests.exitCode !== 0) {
      fail("public_tests", `public tests exited with status ${publicTests.exitCode}`);
      return { status, outcome, durations, error };
    }
    outcome.public_tests = "passed";

    const hiddenTests = await runShellCommand({
      command: task.tests.hidden.command,
      cwd: taskDir,
      env: { BUN_SERVER_BENCH_APP_DIR: workspaceDir },
      timeoutMs: remainingMs(deadlineMs, task.timeouts.test_seconds * 1000),
      stdoutPath: join(logsDir, "hidden-tests.stdout.log"),
      stderrPath: join(logsDir, "hidden-tests.stderr.log"),
    });
    durations.hidden_tests_ms = hiddenTests.durationMs;

    if (hiddenTests.timedOut || Date.now() >= deadlineMs) {
      return timedOut("hidden tests timed out", { ...outcome, hidden_tests: "failed" }, durations);
    }

    if (hiddenTests.exitCode !== 0) {
      fail("hidden_tests", `hidden tests exited with status ${hiddenTests.exitCode}`);
      return { status, outcome, durations, error };
    }

    outcome.hidden_tests = "passed";
    return { status: "completed", outcome, durations, error: null };
  } catch (runError) {
    return {
      status: "failed_start",
      outcome,
      durations,
      error: runError instanceof Error ? runError.message : String(runError),
    };
  } finally {
    await app?.stop();
  }
}

function timedOut(
  message: string,
  outcome: RunResult["outcome"],
  durations: RunResult["durations"],
): ValidationOutput {
  return {
    status: "timed_out",
    outcome: markSkippedAfter(outcome, firstFailedPhase(outcome) ?? "hidden_tests"),
    durations,
    error: message,
  };
}

function firstFailedPhase(outcome: RunResult["outcome"]): keyof RunResult["outcome"] | undefined {
  for (const phase of ["install", "start", "readiness", "public_tests", "hidden_tests"] as const) {
    if (outcome[phase] === "failed") {
      return phase;
    }
  }
  return undefined;
}

function emptyDurations(): RunResult["durations"] {
  return {
    install_ms: 0,
    start_ms: 0,
    readiness_ms: 0,
    public_tests_ms: 0,
    hidden_tests_ms: 0,
    total_ms: 0,
  };
}

function remainingMs(deadlineMs: number, phaseTimeoutMs: number): number {
  const remainingTotal = Math.max(0, deadlineMs - Date.now());
  return Math.max(0, Math.min(phaseTimeoutMs, remainingTotal));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
