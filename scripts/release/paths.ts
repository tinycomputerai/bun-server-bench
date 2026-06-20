import { join, resolve } from "node:path";
import { releaseVersionFromTag } from "./parse-args";

export const RELEASE_ASSETS_DIR = "release-assets";

export const RELEASE_ASSET_FILES = {
  sft: "bun-server-bench-sft.jsonl",
  patches: "bun-server-bench-patches.jsonl",
} as const;

export const HF_DATASET_REPO = "tinycomputerai/bun-server-bench-trajectories";

export function repoRoot(): string {
  return resolve(import.meta.dir, "../..");
}

export function exportDatasetPaths(root = repoRoot()) {
  return {
    sft: join(root, "datasets/sft/bun-server-bench.jsonl"),
    patches: join(root, "datasets/patches/bun-server-bench.jsonl"),
  };
}

export function releaseAssetsDir(root = repoRoot()): string {
  return join(root, RELEASE_ASSETS_DIR);
}

export function releaseAssetPaths(root = repoRoot()) {
  const assetsDir = releaseAssetsDir(root);
  return {
    sft: join(assetsDir, RELEASE_ASSET_FILES.sft),
    patches: join(assetsDir, RELEASE_ASSET_FILES.patches),
  };
}

export function hfStagingPaths(tag: string) {
  return {
    sft: `staging/${tag}/${RELEASE_ASSET_FILES.sft}`,
    patches: `staging/${tag}/${RELEASE_ASSET_FILES.patches}`,
  };
}

export function releaseDir(root = repoRoot()): string {
  return join(root, "dist/release");
}

export function releaseArtifactNames(tag: string) {
  const version = releaseVersionFromTag(tag);
  return {
    tarball: `bun-server-bench-${tag}.tar.gz`,
    sft: `bun-server-bench-sft-${tag}.jsonl`,
    patches: `bun-server-bench-patches-${tag}.jsonl`,
    manifest: `bun-server-bench-manifest-${tag}.json`,
    version,
  };
}

export const FORBIDDEN_DATASET_MARKERS = [
  "tests/hidden",
  "tests\\hidden",
  "solutions/reference",
  "solutions\\reference",
] as const;

export const FORBIDDEN_EVAL_SPLITS = new Set(["public_eval", "private_eval"]);

export const TARBALL_EXCLUDE_DIRS = new Set([
  "runs",
  "results",
  "jobs",
  "datasets",
  "release-assets",
  "node_modules",
  "dist",
  ".git",
]);

export const TARBALL_INCLUDE_PATHS = [
  "harbor",
  "tasks",
  "schemas",
  "validators",
  "runners",
  "agents",
  "docs",
  "package.json",
  "tsconfig.json",
  "bun.lock",
] as const;
