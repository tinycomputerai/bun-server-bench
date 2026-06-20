import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseReleaseArgs, usage } from "./parse-args";
import { repoRoot } from "./paths";

const HARBOR_CREDENTIALS_DIR = join(homedir(), ".harbor");
const HARBOR_CREDENTIALS_PATH = join(HARBOR_CREDENTIALS_DIR, "credentials.json");

function decodeHarborToken(encoded: string): string {
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8").trim();
  } catch {
    throw new Error("HARBOR_TOKEN must be a valid base64-encoded Harbor credentials payload");
  }

  if (decoded.length === 0) {
    throw new Error("HARBOR_TOKEN decoded to an empty string");
  }

  try {
    JSON.parse(decoded);
  } catch {
    throw new Error("HARBOR_TOKEN must decode to Harbor credentials JSON (~/.harbor/credentials.json)");
  }

  return decoded;
}

function installHarborCredentials(credentialsJson: string): void {
  mkdirSync(HARBOR_CREDENTIALS_DIR, { recursive: true });
  writeFileSync(HARBOR_CREDENTIALS_PATH, credentialsJson, { mode: 0o600 });
}

// Task package directories are the subdirectories of harbor/ that contain a
// task.toml. The dataset.toml and README.md at the root are not task packages.
function findTaskDirs(harborRoot: string): string[] {
  return readdirSync(harborRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(harborRoot, entry.name))
    .filter((dir) => existsSync(join(dir, "task.toml")))
    .sort();
}

function buildTasksCommand(tag: string, taskDirs: string[]): string[] {
  return ["uvx", "harbor", "publish", ...taskDirs, "-t", tag, "--public"];
}

function buildDatasetCommand(tag: string, datasetToml: string): string[] {
  return ["uvx", "harbor", "publish", datasetToml, "-t", tag, "--public"];
}

async function run(command: string[], confirm: boolean): Promise<number> {
  const proc = Bun.spawn(command, {
    cwd: repoRoot(),
    // Publishing a dataset as public prompts for confirmation; feed "y".
    stdin: confirm ? Buffer.from("y\n") : "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  return proc.exited;
}

async function main(): Promise<void> {
  let options;
  try {
    options = parseReleaseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${usage("scripts/release/publish-harbor.ts")}`);
    process.exit(1);
  }

  const harborRoot = join(repoRoot(), "harbor");
  if (!existsSync(harborRoot)) {
    console.error(`[release:harbor] harbor export directory not found: ${harborRoot}`);
    process.exit(1);
  }

  const taskDirs = findTaskDirs(harborRoot);
  if (taskDirs.length === 0) {
    console.error(`[release:harbor] no task packages found under ${harborRoot}`);
    process.exit(1);
  }

  const datasetToml = join(harborRoot, "dataset.toml");
  const hasDataset = existsSync(datasetToml);

  // Tasks must be published before the dataset, which references them by digest.
  const tasksCommand = buildTasksCommand(options.tag, taskDirs);
  const datasetCommand = hasDataset ? buildDatasetCommand(options.tag, datasetToml) : null;

  if (options.dryRun) {
    console.log("[release:harbor] dry run — would run:");
    console.log(`  HARBOR_TOKEN=*** ${["uvx", "harbor", "publish", `<${taskDirs.length} task dirs>`, "-t", options.tag, "--public"].join(" ")}`);
    if (datasetCommand) {
      console.log(`  HARBOR_TOKEN=*** ${datasetCommand.join(" ")}  (auto-confirmed)`);
    }
    return;
  }

  const encoded = process.env.HARBOR_TOKEN?.trim();
  if (!encoded) {
    throw new Error("HARBOR_TOKEN is required to publish Harbor packages");
  }
  installHarborCredentials(decodeHarborToken(encoded));

  console.log(`[release:harbor] publishing ${taskDirs.length} task package(s)…`);
  const tasksExit = await run(tasksCommand, false);
  if (tasksExit !== 0) {
    process.exit(tasksExit);
  }

  if (datasetCommand) {
    console.log("[release:harbor] publishing dataset…");
    const datasetExit = await run(datasetCommand, true);
    if (datasetExit !== 0) {
      process.exit(datasetExit);
    }
  }

  console.log(`[release:harbor] published harbor/ with tag ${options.tag}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
