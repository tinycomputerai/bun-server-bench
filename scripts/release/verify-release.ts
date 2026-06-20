import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { PatchRecord, SftRecord } from "../../runners/export/types";
import { formatReleaseAssetIssues, checkReleaseAssets } from "./release-assets";
import { DATASET_CARD_FILE } from "./dataset-card";
import { parseReleaseArgs, usage } from "./parse-args";
import {
  FORBIDDEN_DATASET_MARKERS,
  FORBIDDEN_EVAL_SPLITS,
  releaseArtifactNames,
  releaseAssetPaths,
  releaseDir,
  TARBALL_EXCLUDE_DIRS,
} from "./paths";

type JsonlRecord = SftRecord | PatchRecord;

export type DatasetVerificationIssue = {
  file: string;
  line: number;
  reason: string;
};

export function readJsonlRecords(filePath: string): JsonlRecord[] {
  const content = readFileSync(filePath, "utf8").trim();
  if (content.length === 0) {
    return [];
  }

  return content.split("\n").map((line, index) => {
    try {
      return JSON.parse(line) as JsonlRecord;
    } catch {
      throw new Error(`invalid JSON on line ${index + 1} in ${filePath}`);
    }
  });
}

export function verifyDatasetFile(
  filePath: string,
  label: "sft" | "patches",
): DatasetVerificationIssue[] {
  const issues: DatasetVerificationIssue[] = [];

  if (!existsSync(filePath)) {
    issues.push({ file: filePath, line: 0, reason: "file does not exist" });
    return issues;
  }

  const stats = statSync(filePath);
  if (stats.size === 0) {
    issues.push({ file: filePath, line: 0, reason: "file is empty" });
    return issues;
  }

  const records = readJsonlRecords(filePath);
  if (records.length === 0) {
    issues.push({ file: filePath, line: 0, reason: "file contains no JSONL records" });
    return issues;
  }

  records.forEach((record, index) => {
    const line = index + 1;
    const split = recordSplit(record, label);

    if (!split) {
      issues.push({ file: filePath, line, reason: "missing dataset.split metadata" });
      return;
    }

    if (FORBIDDEN_EVAL_SPLITS.has(split)) {
      issues.push({ file: filePath, line, reason: `forbidden eval split exported: ${split}` });
    }

    const patchText = recordPatchText(record, label);
    for (const marker of FORBIDDEN_DATASET_MARKERS) {
      if (patchText.includes(marker)) {
        issues.push({
          file: filePath,
          line,
          reason: `forbidden path marker in patch: ${marker}`,
        });
      }
    }
  });

  return issues;
}

function recordSplit(record: JsonlRecord, label: "sft" | "patches"): string | undefined {
  if (label === "sft" && "messages" in record) {
    return record.metadata.dataset.split;
  }

  if ("patch" in record) {
    return record.dataset.split;
  }

  return undefined;
}

function recordPatchText(record: JsonlRecord, label: "sft" | "patches"): string {
  if (label === "sft" && "messages" in record) {
    const assistant = record.messages.find((message) => message.role === "assistant");
    return assistant?.content ?? "";
  }

  if ("patch" in record) {
    return record.patch;
  }

  return "";
}

export function verifyTarballEntries(entries: string[]): string[] {
  const issues: string[] = [];

  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, "/").replace(/^\.\//, "");
    const topLevel = normalized.split("/")[0];

    if (TARBALL_EXCLUDE_DIRS.has(topLevel)) {
      issues.push(`tarball includes forbidden top-level directory: ${topLevel}`);
      continue;
    }

    for (const excluded of TARBALL_EXCLUDE_DIRS) {
      if (normalized === excluded || normalized.startsWith(`${excluded}/`)) {
        issues.push(`tarball includes forbidden path: ${normalized}`);
      }
    }
  }

  return [...new Set(issues)];
}

function listTarballEntries(tarballPath: string): string[] {
  const proc = Bun.spawnSync(["tar", "-tzf", tarballPath], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (proc.exitCode !== 0) {
    const stderr = proc.stderr.toString().trim();
    throw new Error(`failed to inspect tarball ${tarballPath}: ${stderr}`);
  }

  return proc.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseVerifyFlags(argv: string[]): { datasetsOnly: boolean; remaining: string[] } {
  const remaining: string[] = [];
  let datasetsOnly = false;

  for (const arg of argv) {
    if (arg === "--datasets-only") {
      datasetsOnly = true;
      continue;
    }
    remaining.push(arg);
  }

  return { datasetsOnly, remaining };
}

function main(): void {
  const { datasetsOnly, remaining } = parseVerifyFlags(process.argv.slice(2));
  let options;
  try {
    options = parseReleaseArgs(remaining);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${usage("scripts/release/verify-release.ts")}`);
    process.exit(1);
  }

  const assets = releaseAssetPaths();
  const artifacts = releaseArtifactNames(options.tag);
  const tarballPath = `${releaseDir()}/${artifacts.tarball}`;
  const cardPath = `${releaseDir()}/${DATASET_CARD_FILE}`;

  const assetIssues = checkReleaseAssets();
  const issues: DatasetVerificationIssue[] = assetIssues.map((issue) => ({
    file: issue.path,
    line: 0,
    reason: issue.reason === "missing" ? "file does not exist" : "file is empty",
  }));

  if (assetIssues.length === 0) {
    issues.push(
      ...verifyDatasetFile(assets.sft, "sft"),
      ...verifyDatasetFile(assets.patches, "patches"),
    );
  }

  if (!datasetsOnly) {
    if (!existsSync(tarballPath)) {
      issues.push({
        file: tarballPath,
        line: 0,
        reason: "release tarball has not been built yet",
      });
    } else {
      const tarballIssues = verifyTarballEntries(listTarballEntries(tarballPath));
      for (const reason of tarballIssues) {
        issues.push({ file: basename(tarballPath), line: 0, reason });
      }
    }

    if (!existsSync(cardPath)) {
      issues.push({
        file: cardPath,
        line: 0,
        reason: "Hugging Face dataset card has not been built yet",
      });
    }
  }

  if (issues.length > 0) {
    console.error("[release:verify] failed");
    for (const issue of issues) {
      const location = issue.line > 0 ? `${issue.file}:${issue.line}` : issue.file;
      console.error(`  - ${location}: ${issue.reason}`);
    }
    if (assetIssues.length > 0) {
      console.error("");
      console.error(formatReleaseAssetIssues(assetIssues));
    }
    process.exit(1);
  }

  const sftCount = readJsonlRecords(assets.sft).length;
  const patchCount = readJsonlRecords(assets.patches).length;

  console.log("[release:verify] passed");
  console.log(`  tag: ${options.tag}`);
  console.log(`  sft records: ${sftCount}`);
  console.log(`  patch records: ${patchCount}`);
  console.log(`  tarball: ${artifacts.tarball}`);
}

if (import.meta.main) {
  main();
}
