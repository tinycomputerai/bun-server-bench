import { existsSync, statSync } from "node:fs";
import { releaseAssetPaths, repoRoot } from "./paths";

export const RELEASE_ASSETS_HINT = [
  "Stage release assets locally before tagging:",
  "  bun run release:stage",
  "  bun run release:upload-staging -- --tag <version>",
  "Then tag the release and run the Release workflow.",
  "See docs/RELEASING.md.",
].join("\n");

export type ReleaseAssetIssue = {
  path: string;
  reason: "missing" | "empty";
};

export function checkReleaseAssets(root = repoRoot()): ReleaseAssetIssue[] {
  const paths = releaseAssetPaths(root);
  const issues: ReleaseAssetIssue[] = [];

  for (const path of [paths.sft, paths.patches]) {
    if (!existsSync(path)) {
      issues.push({ path, reason: "missing" });
      continue;
    }

    if (statSync(path).size === 0) {
      issues.push({ path, reason: "empty" });
    }
  }

  return issues;
}

export function formatReleaseAssetIssues(issues: ReleaseAssetIssue[]): string {
  const lines = issues.map((issue) => {
    if (issue.reason === "missing") {
      return `  - ${issue.path}: file does not exist`;
    }
    return `  - ${issue.path}: file is empty`;
  });

  return ["Required release assets are missing or empty:", ...lines, "", RELEASE_ASSETS_HINT].join("\n");
}

export function assertReleaseAssets(root = repoRoot()): { sft: string; patches: string } {
  const issues = checkReleaseAssets(root);
  if (issues.length > 0) {
    throw new Error(formatReleaseAssetIssues(issues));
  }

  return releaseAssetPaths(root);
}
