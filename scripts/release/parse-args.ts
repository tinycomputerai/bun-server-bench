export type ReleaseCliOptions = {
  tag: string;
  dryRun: boolean;
};

const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function parseReleaseArgs(argv: string[]): ReleaseCliOptions {
  let version = process.env.RELEASE_VERSION?.trim() ?? "";
  const releaseTag = process.env.RELEASE_TAG?.trim();
  if (!version && releaseTag) {
    version = releaseVersionFromTag(releaseTag);
  }
  let dryRun = process.env.DRY_RUN === "true" || process.env.DRY_RUN === "1";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tag") {
      version = argv[index + 1]?.trim() ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--tag=")) {
      version = arg.slice("--tag=".length).trim();
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
  }

  if (!version) {
    throw new Error("missing required --tag (example: 0.1.0)");
  }

  if (!RELEASE_VERSION_PATTERN.test(version)) {
    throw new Error(
      `invalid release version format: ${version} (expected X.Y.Z, without a leading v)`,
    );
  }

  return { tag: releaseTagFromVersion(version), dryRun };
}

export function releaseTagFromVersion(version: string): string {
  return `v${version}`;
}

export function releaseVersionFromTag(tag: string): string {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

export function usage(scriptName: string): string {
  return [
    `usage: bun ${scriptName} --tag <version> [--dry-run]`,
    "",
    "environment:",
    "  RELEASE_VERSION   release version (example: 0.1.0)",
    "  RELEASE_TAG       derived release git tag (example: v0.1.0)",
    "  DRY_RUN       set to true/1 to print commands without publishing",
  ].join("\n");
}
