import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertReleaseAssets } from "./release-assets";
import { parseReleaseArgs, releaseVersionFromTag, usage } from "./parse-args";
import {
  releaseArtifactNames,
  releaseDir,
  repoRoot,
  TARBALL_EXCLUDE_DIRS,
  TARBALL_INCLUDE_PATHS,
} from "./paths";

type Manifest = {
  name: "bun-server-bench";
  tag: string;
  version: string;
  git_sha: string;
  created_at: string;
  artifacts: {
    tarball: string;
    sft: string;
    patches: string;
    manifest: string;
  };
  counts: {
    sft_records: number;
    patch_records: number;
    harbor_tasks: number;
  };
};

function countJsonlRecords(filePath: string): number {
  if (!existsSync(filePath)) {
    return 0;
  }

  const content = readFileSync(filePath, "utf8").trim();
  if (content.length === 0) {
    return 0;
  }

  return content.split("\n").length;
}

function countHarborTasks(root: string): number {
  const harborRoot = join(root, "harbor");
  if (!existsSync(harborRoot)) {
    return 0;
  }

  return [...new Bun.Glob("*/task.toml").scanSync({ cwd: harborRoot, onlyFiles: true })].length;
}

function resolveGitSha(root: string): string {
  const proc = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (proc.exitCode !== 0) {
    throw new Error("failed to resolve git SHA for release manifest");
  }

  return proc.stdout.toString().trim();
}

async function createTarball(
  root: string,
  outputPath: string,
  includePaths: readonly string[],
): Promise<void> {
  const args = ["-czf", outputPath];

  for (const excluded of TARBALL_EXCLUDE_DIRS) {
    args.push(`--exclude=${excluded}`);
    args.push(`--exclude=./${excluded}`);
    args.push(`--exclude=./${excluded}/*`);
  }

  args.push("-C", root, ...includePaths);

  const proc = Bun.spawn(["tar", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`failed to create release tarball: ${stderr.trim()}`);
  }
}

async function main(): Promise<void> {
  let options;
  try {
    options = parseReleaseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${usage("scripts/release/build-release-artifacts.ts")}`);
    process.exit(1);
  }

  const root = repoRoot();
  let assets;
  try {
    assets = assertReleaseAssets(root);
  } catch (error) {
    console.error("[release:build] failed");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const outDir = releaseDir(root);
  const names = releaseArtifactNames(options.tag);

  mkdirSync(outDir, { recursive: true });

  cpSync(assets.sft, join(outDir, names.sft));
  cpSync(assets.patches, join(outDir, names.patches));

  const tarballPath = join(outDir, names.tarball);
  await createTarball(root, tarballPath, TARBALL_INCLUDE_PATHS);

  const manifest: Manifest = {
    name: "bun-server-bench",
    tag: options.tag,
    version: releaseVersionFromTag(options.tag),
    git_sha: resolveGitSha(root),
    created_at: new Date().toISOString(),
    artifacts: {
      tarball: names.tarball,
      sft: names.sft,
      patches: names.patches,
      manifest: names.manifest,
    },
    counts: {
      sft_records: countJsonlRecords(assets.sft),
      patch_records: countJsonlRecords(assets.patches),
      harbor_tasks: countHarborTasks(root),
    },
  };

  const manifestPath = join(outDir, names.manifest);
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("[release:build] complete");
  console.log(`  output directory: ${outDir}`);
  console.log(`  ${names.tarball}`);
  console.log(`  ${names.sft}`);
  console.log(`  ${names.patches}`);
  console.log(`  ${names.manifest}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
