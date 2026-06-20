import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { exportPatchDataset, exportSftDataset } from "./export-dataset";
import { parseExportArgs } from "./parse-args";
import { prepareRunForExport, splitExportSkipReason } from "./prepare-run";
import { extractSolutionPatch, matchesReferenceSolution } from "./solution-patch";
import type { DatasetSplit } from "./types";

const repoRoot = resolve(import.meta.dir, "../..");
const fixtureRunDir = join(import.meta.dir, "fixtures/successful-run");
const taskDir = join(repoRoot, "tasks/authentication.bearer-profile.v1");

const defaultExportOptions = {
  minScore: 100,
  allowPublicEval: false,
  allowPrivateEval: false,
};

function createSplitFixture(
  rootDir: string,
  split: DatasetSplit,
  trainable: boolean,
): { tasksRoot: string; runDir: string; taskId: string } {
  const taskId = `export.test.${split}.v1`;
  const tasksRoot = join(rootDir, "tasks");
  const taskPath = join(tasksRoot, taskId);
  const runDir = join(rootDir, "runs", `fixture-${taskId}`);

  mkdirSync(join(taskPath, "src"), { recursive: true });
  mkdirSync(join(runDir, "workspace/src"), { recursive: true });
  mkdirSync(join(runDir, "logs"), { recursive: true });

  writeFileSync(
    join(taskPath, "task.yaml"),
    [
      `id: ${taskId}`,
      "spec_version: 0.1.0",
      "task_version: 1.0.0",
      "title: Export split fixture",
      "description: Fixture task for export split tests.",
      "category: authentication",
      "dataset:",
      `  split: ${split}`,
      `  leakage_group: ${taskId}`,
      `  trainable: ${trainable}`,
      "instruction:",
      "  prompt_file: prompt.md",
    ].join("\n"),
  );
  writeFileSync(join(taskPath, "prompt.md"), "# Export split fixture\n");
  writeFileSync(
    join(taskPath, "src/server.ts"),
    readFileSync(join(taskDir, "src/server.ts"), "utf8"),
  );
  writeFileSync(
    join(taskPath, "package.json"),
    readFileSync(join(taskDir, "package.json"), "utf8"),
  );

  writeFileSync(
    join(runDir, "result.json"),
    JSON.stringify({
      task_id: taskId,
      task_version: "1.0.0",
      spec_version: "0.1.0",
      run_id: `fixture-${taskId}`,
      agent_id: "fixture-agent",
      mode: "agent",
      status: "completed",
      score: 100,
      max_score: 100,
      started_at: "2026-06-17T00:00:00.000Z",
      completed_at: "2026-06-17T00:01:00.000Z",
      durations: { total_ms: 1000 },
      metrics: { wall_time_ms: 1000, input_tokens: 10, output_tokens: 10 },
      error: null,
    }),
  );
  writeFileSync(join(runDir, "logs/agent-prompt.md"), "# Export split fixture\n");
  writeFileSync(
    join(runDir, "workspace/src/server.ts"),
    readFileSync(join(fixtureRunDir, "workspace/src/server.ts"), "utf8"),
  );
  writeFileSync(
    join(runDir, "workspace/package.json"),
    readFileSync(join(fixtureRunDir, "workspace/package.json"), "utf8"),
  );

  return { tasksRoot, runDir, taskId };
}

describe("solution patch extraction", () => {
  test("extracts a unified diff from starter to workspace", () => {
    const patch = extractSolutionPatch(taskDir, join(fixtureRunDir, "workspace"));
    expect(patch).not.toBeNull();
    expect(patch?.files_changed).toContain("src/server.ts");
    expect(patch?.patch).toContain("--- a/src/server.ts");
    expect(patch?.patch).toContain("+const expectedToken");
  });

  test("detects reference solution matches", () => {
    const referenceWorkspace = join(taskDir, "solutions/reference");
    expect(matchesReferenceSolution(taskDir, referenceWorkspace)).toBe(true);
    expect(matchesReferenceSolution(taskDir, join(fixtureRunDir, "workspace"))).toBe(false);
  });
});

describe("split export policy", () => {
  test("includes train and dev splits by default", () => {
    expect(splitExportSkipReason("train", defaultExportOptions)).toBeNull();
    expect(splitExportSkipReason("dev", defaultExportOptions)).toBeNull();
  });

  test("excludes eval splits unless explicitly allowed", () => {
    expect(splitExportSkipReason("public_eval", defaultExportOptions)).toBe("public_eval_excluded");
    expect(splitExportSkipReason("private_eval", defaultExportOptions)).toBe(
      "private_eval_excluded",
    );
    expect(
      splitExportSkipReason("public_eval", { ...defaultExportOptions, allowPublicEval: true }),
    ).toBeNull();
    expect(
      splitExportSkipReason("private_eval", { ...defaultExportOptions, allowPrivateEval: true }),
    ).toBeNull();
  });
});

describe("run export filters", () => {
  test("exports fixture successful run with dataset metadata", async () => {
    const { prepared, skipReason } = await prepareRunForExport(fixtureRunDir, {
      ...defaultExportOptions,
      tasksRoot: join(repoRoot, "tasks"),
    });

    expect(skipReason).toBeNull();
    expect(prepared?.dataset.split).toBe("dev");
    expect(prepared?.dataset.leakage_group).toBe("authentication.bearer-profile");
    expect(prepared?.prompt).toContain("Bearer Token Profile Endpoint");
    expect(prepared?.filesChanged).toContain("src/server.ts");
  });

  test("exports train split runs by default", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-"));
    try {
      const { tasksRoot, runDir } = createSplitFixture(tempDir, "train", true);
      const { prepared, skipReason } = await prepareRunForExport(runDir, {
        ...defaultExportOptions,
        tasksRoot,
      });

      expect(skipReason).toBeNull();
      expect(prepared?.dataset.split).toBe("train");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("exports dev split runs by default", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-"));
    try {
      const { tasksRoot, runDir } = createSplitFixture(tempDir, "dev", true);
      const { prepared, skipReason } = await prepareRunForExport(runDir, {
        ...defaultExportOptions,
        tasksRoot,
      });

      expect(skipReason).toBeNull();
      expect(prepared?.dataset.split).toBe("dev");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("skips public_eval split runs unless allowed", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-"));
    try {
      const { tasksRoot, runDir } = createSplitFixture(tempDir, "public_eval", false);
      const blocked = await prepareRunForExport(runDir, {
        ...defaultExportOptions,
        tasksRoot,
      });
      const allowedButNotTrainable = await prepareRunForExport(runDir, {
        ...defaultExportOptions,
        allowPublicEval: true,
        tasksRoot,
      });

      expect(blocked.skipReason).toBe("public_eval_excluded");
      expect(allowedButNotTrainable.skipReason).toBe("not_trainable");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("exports public_eval split runs when allowed and trainable", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-"));
    try {
      const { tasksRoot, runDir } = createSplitFixture(tempDir, "public_eval", true);
      const { prepared, skipReason } = await prepareRunForExport(runDir, {
        ...defaultExportOptions,
        allowPublicEval: true,
        tasksRoot,
      });

      expect(skipReason).toBeNull();
      expect(prepared?.dataset.split).toBe("public_eval");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("exports private_eval split runs when allowed and trainable", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-"));
    try {
      const { tasksRoot, runDir } = createSplitFixture(tempDir, "private_eval", true);
      const { prepared, skipReason } = await prepareRunForExport(runDir, {
        ...defaultExportOptions,
        allowPrivateEval: true,
        tasksRoot,
      });

      expect(skipReason).toBeNull();
      expect(prepared?.dataset.split).toBe("private_eval");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("skips private_eval split runs unless allowed", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-"));
    try {
      const { tasksRoot, runDir } = createSplitFixture(tempDir, "private_eval", false);
      const blocked = await prepareRunForExport(runDir, {
        ...defaultExportOptions,
        tasksRoot,
      });
      const allowed = await prepareRunForExport(runDir, {
        ...defaultExportOptions,
        allowPrivateEval: true,
        tasksRoot,
      });

      expect(blocked.skipReason).toBe("private_eval_excluded");
      expect(allowed.skipReason).toBe("not_trainable");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("skips non-agent runs", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-"));
    try {
      writeFileSync(
        join(tempDir, "result.json"),
        JSON.stringify({
          task_id: "authentication.bearer-profile.v1",
          mode: "reference",
          status: "completed",
          score: 100,
        }),
      );

      const { skipReason } = await prepareRunForExport(tempDir, {
        ...defaultExportOptions,
        tasksRoot: join(repoRoot, "tasks"),
      });

      expect(skipReason).toBe("not_agent_run");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("skips below-min-score runs", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-"));
    try {
      writeFileSync(
        join(tempDir, "result.json"),
        JSON.stringify({
          task_id: "authentication.bearer-profile.v1",
          mode: "agent",
          agent_id: "fixture-agent",
          status: "completed",
          score: 75,
        }),
      );

      const { skipReason } = await prepareRunForExport(tempDir, {
        ...defaultExportOptions,
        tasksRoot: join(repoRoot, "tasks"),
      });

      expect(skipReason).toBe("below_min_score");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("export CLI args", () => {
  test("parses eval override flags", () => {
    const options = parseExportArgs([
      "--runs",
      "runs/**",
      "--out",
      "datasets/sft/bun-server-bench.jsonl",
      "--allow-public-eval",
      "--allow-private-eval",
    ]);

    expect(options.allowPublicEval).toBe(true);
    expect(options.allowPrivateEval).toBe(true);
  });
});

describe("dataset export commands", () => {
  test("writes SFT and patch JSONL outputs", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-out-"));
    const runsRoot = join(tempDir, "runs");
    const outRoot = join(tempDir, "out");
    const copiedRunDir = join(runsRoot, "fixture-successful-authentication.bearer-profile.v1");

    try {
      cpSync(fixtureRunDir, copiedRunDir, { recursive: true });

      const sftOut = join(outRoot, "sft.jsonl");
      const patchOut = join(outRoot, "patches.jsonl");

      const sftSummary = await exportSftDataset({
        runsPattern: join(runsRoot, "**"),
        outPath: sftOut,
        minScore: 100,
        allowPublicEval: false,
        allowPrivateEval: false,
        tasksRoot: join(repoRoot, "tasks"),
      });

      const patchSummary = await exportPatchDataset({
        runsPattern: join(runsRoot, "**"),
        outPath: patchOut,
        minScore: 100,
        allowPublicEval: false,
        allowPrivateEval: false,
        tasksRoot: join(repoRoot, "tasks"),
      });

      expect(sftSummary.exported).toBe(1);
      expect(patchSummary.exported).toBe(1);
      expect(existsSync(sftOut)).toBe(true);
      expect(existsSync(patchOut)).toBe(true);

      const sftRecord = JSON.parse(readFileSync(sftOut, "utf8").trim());
      expect(sftRecord.messages).toHaveLength(3);
      expect(sftRecord.metadata.task_id).toBe("authentication.bearer-profile.v1");
      expect(sftRecord.metadata.dataset.leakage_group).toBe("authentication.bearer-profile");
      expect(sftRecord.messages[2].content).toContain("src/server.ts");

      const patchRecord = JSON.parse(readFileSync(patchOut, "utf8").trim());
      expect(patchRecord.files_changed).toContain("src/server.ts");
      expect(patchRecord.dataset.split).toBe("dev");
      expect(patchRecord.prompt).toContain("Bearer Token Profile Endpoint");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
