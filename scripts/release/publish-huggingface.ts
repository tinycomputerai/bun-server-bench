import { existsSync } from "node:fs";
import { join } from "node:path";
import { DATASET_CARD_FILE } from "./dataset-card";
import { parseReleaseArgs, usage } from "./parse-args";
import { HF_DATASET_REPO, releaseArtifactNames, releaseDir, repoRoot } from "./paths";

type UploadSpec = {
  localPath: string;
  remotePath: string;
};

function buildUploadSpecs(tag: string): UploadSpec[] {
  const names = releaseArtifactNames(tag);
  const outDir = releaseDir();

  return [
    {
      localPath: join(outDir, DATASET_CARD_FILE),
      remotePath: DATASET_CARD_FILE,
    },
    {
      localPath: join(outDir, names.sft),
      remotePath: `releases/${tag}/${names.sft}`,
    },
    {
      localPath: join(outDir, names.patches),
      remotePath: `releases/${tag}/${names.patches}`,
    },
    {
      localPath: join(outDir, names.manifest),
      remotePath: `releases/${tag}/${names.manifest}`,
    },
    {
      localPath: join(outDir, names.sft),
      remotePath: "data/sft/bun-server-bench.jsonl",
    },
    {
      localPath: join(outDir, names.patches),
      remotePath: "data/patches/bun-server-bench.jsonl",
    },
    {
      localPath: join(outDir, names.manifest),
      remotePath: `manifests/${names.manifest}`,
    },
  ];
}

// Prefer the modern `hf` CLI; fall back to the legacy `huggingface-cli`. Both
// share the same `upload` interface and read HF_TOKEN from the environment.
const HF_CLI_CANDIDATES = ["hf", "huggingface-cli"] as const;

function detectHfCli(): string | null {
  for (const cli of HF_CLI_CANDIDATES) {
    const check = Bun.spawnSync([cli, "--help"], { stdout: "ignore", stderr: "ignore" });
    if (check.exitCode === 0) {
      return cli;
    }
  }
  return null;
}

function buildUploadCommand(spec: UploadSpec, tag: string, cli: string): string[] {
  return [
    cli,
    "upload",
    HF_DATASET_REPO,
    spec.localPath,
    spec.remotePath,
    "--repo-type",
    "dataset",
    "--commit-message",
    `Release ${tag}`,
  ];
}

function ensureHfCli(): string {
  const found = detectHfCli();
  if (found) {
    return found;
  }

  const install = Bun.spawnSync(["python3", "-m", "pip", "install", "--quiet", "huggingface_hub"], {
    stdout: "inherit",
    stderr: "inherit",
  });

  if (install.exitCode !== 0) {
    throw new Error("failed to install huggingface_hub (provides the hf CLI)");
  }

  const installed = detectHfCli();
  if (!installed) {
    throw new Error("hf / huggingface-cli not available after installing huggingface_hub");
  }
  return installed;
}

async function uploadFile(spec: UploadSpec, tag: string, cli: string): Promise<void> {
  const token = process.env.HF_TOKEN?.trim();
  if (!token) {
    throw new Error("HF_TOKEN is required to publish Hugging Face datasets");
  }

  const command = buildUploadCommand(spec, tag, cli);
  const proc = Bun.spawn(command, {
    cwd: repoRoot(),
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      HF_TOKEN: token,
    },
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${cli} upload failed for ${spec.remotePath}`);
  }
}

async function main(): Promise<void> {
  let options;
  try {
    options = parseReleaseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${usage("scripts/release/publish-huggingface.ts")}`);
    process.exit(1);
  }

  const specs = buildUploadSpecs(options.tag);

  for (const spec of specs) {
    if (!existsSync(spec.localPath)) {
      console.error(`[release:huggingface] missing release artifact: ${spec.localPath}`);
      process.exit(1);
    }
  }

  if (options.dryRun) {
    const cli = detectHfCli() ?? HF_CLI_CANDIDATES[0];
    console.log("[release:huggingface] dry run — would run:");
    for (const spec of specs) {
      console.log(
        `  HF_TOKEN=*** ${cli} upload ${HF_DATASET_REPO} ${spec.localPath} ${spec.remotePath} --repo-type dataset --commit-message "Release ${options.tag}"`,
      );
    }
    return;
  }

  const cli = ensureHfCli();

  for (const spec of specs) {
    await uploadFile(spec, options.tag, cli);
  }

  console.log(`[release:huggingface] published dataset ${HF_DATASET_REPO} for ${options.tag}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
