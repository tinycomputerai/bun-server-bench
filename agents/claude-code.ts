import { writeFileSync } from "node:fs";
import { appendFileSync, mkdirSync, writeFileSync as writeEmptyLog } from "node:fs";
import { dirname, join } from "node:path";
import type { Agent, AgentContext, AgentRunOutcome } from "./types";

const CLAUDE_BIN = "claude";

export class ClaudeCodeAgent implements Agent {
  readonly id = "claude-code";

  async prepare(context: AgentContext): Promise<void> {
    const proc = Bun.spawn({
      cmd: ["sh", "-c", `command -v ${CLAUDE_BIN}`],
      cwd: context.workspaceDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(
        `${CLAUDE_BIN} CLI not found on PATH; install Claude Code before running this agent`,
      );
    }

    writeFileSync(join(context.logsDir, "agent-prompt.md"), context.prompt);
  }

  async run(context: AgentContext): Promise<AgentRunOutcome> {
    const startedMs = Date.now();
    const timeoutMs = remainingMs(context.deadlineMs, context.task.timeouts.total_seconds * 1000);
    const stdoutPath = join(context.logsDir, "agent.stdout.log");
    const stderrPath = join(context.logsDir, "agent.stderr.log");
    prepareLogFiles(stdoutPath, stderrPath);

    const proc = Bun.spawn({
      cmd: [
        CLAUDE_BIN,
        "-p",
        "--dangerously-skip-permissions",
        "--output-format",
        "json",
      ],
      cwd: context.workspaceDir,
      env: { ...Bun.env },
      stdin: new Blob([context.prompt]),
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdoutDone = pipeToFile(proc.stdout, stdoutPath);
    const stderrDone = pipeToFile(proc.stderr, stderrPath);

    let timedOut = false;
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, timeoutMs)
      : undefined;

    const exitCode = await proc.exited;
    if (timeout) {
      clearTimeout(timeout);
    }

    await Promise.all([stdoutDone, stderrDone]);

    const durationMs = Date.now() - startedMs;
    const metrics = await parseClaudeMetrics(stdoutPath);

    return {
      exitCode: timedOut ? 124 : exitCode,
      timedOut,
      durationMs,
      metrics: {
        wall_time_ms: durationMs,
        ...metrics,
      },
    };
  }

  async cleanup(_context: AgentContext): Promise<void> {
    // Claude Code exits after -p; no persistent resources to release.
  }
}

function remainingMs(deadlineMs: number, phaseTimeoutMs: number): number {
  const remainingTotal = Math.max(0, deadlineMs - Date.now());
  return Math.max(0, Math.min(phaseTimeoutMs, remainingTotal));
}

async function parseClaudeMetrics(stdoutPath: string): Promise<
  Pick<AgentRunOutcome["metrics"], "input_tokens" | "output_tokens" | "tool_calls">
> {
  try {
    const raw = await Bun.file(stdoutPath).text();
    if (!raw.trim()) {
      return {};
    }

    const parsed = JSON.parse(raw) as {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
      num_turns?: number;
    };

    return {
      input_tokens: parsed.usage?.input_tokens,
      output_tokens: parsed.usage?.output_tokens,
      tool_calls: parsed.num_turns,
    };
  } catch {
    return {};
  }
}

function prepareLogFiles(stdoutPath: string, stderrPath: string): void {
  mkdirSync(dirname(stdoutPath), { recursive: true });
  writeEmptyLog(stdoutPath, "");
  writeEmptyLog(stderrPath, "");
}

async function pipeToFile(
  stream: ReadableStream<Uint8Array> | null,
  filePath: string,
): Promise<void> {
  if (!stream) {
    return;
  }

  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    appendFileSync(filePath, decoder.decode(chunk, { stream: true }));
  }
  appendFileSync(filePath, decoder.decode());
}
