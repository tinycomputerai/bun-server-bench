import { HF_DATASET_REPO } from "./paths";

/** Filename for the Hugging Face dataset card. HF renders the repo-root
 * README.md (with YAML frontmatter) as the dataset's landing page. */
export const DATASET_CARD_FILE = "README.md";

/** The subset of the release manifest the dataset card needs. Structurally
 * compatible with the manifest written by build-release-artifacts.ts. */
export type DatasetCardManifest = {
  tag: string;
  version: string;
  git_sha: string;
  created_at: string;
  counts: {
    sft_records: number;
    patch_records: number;
    harbor_tasks: number;
  };
};

const BENCHMARK_REPO_URL = "https://github.com/tinycomputerai/bun-server-bench";

/**
 * Render the Hugging Face dataset card for a release. The card is uploaded to
 * the repo root as README.md and becomes the dataset's landing page.
 */
export function renderDatasetCard(manifest: DatasetCardManifest): string {
  const { tag, version, git_sha, created_at, counts } = manifest;
  const shortSha = git_sha.slice(0, 12);

  const frontmatter = [
    "---",
    "pretty_name: bun-server-bench trajectories",
    "license: apache-2.0",
    "language:",
    "- en",
    "task_categories:",
    "- text-generation",
    "tags:",
    "- code",
    "- bun",
    "- agents",
    "- coding-agents",
    "- benchmark",
    "- sft",
    "- trajectories",
    "configs:",
    "- config_name: sft",
    "  data_files: data/sft/*.jsonl",
    "- config_name: patches",
    "  data_files: data/patches/*.jsonl",
    "---",
  ].join("\n");

  const body = `# bun-server-bench trajectories

Supervised fine-tuning and patch trajectories exported from [bun-server-bench](${BENCHMARK_REPO_URL}),
a benchmark for evaluating coding agents on real-world Bun server engineering tasks.

Every record comes from an agent run that **passed both the public and hidden tests**
for its task — these are verified solutions, not raw attempts. The benchmark engineers
each task so that a plausible-but-wrong implementation passes the visible tests and
fails the hidden ones, so a passing trajectory reflects a service that satisfies the
contract under tests the agent never saw.

## Release \`${tag}\`

| | |
| --- | ---: |
| Version | \`${version}\` |
| Source commit | \`${shortSha}\` |
| Generated | ${created_at} |
| SFT records | ${counts.sft_records} |
| Patch records | ${counts.patch_records} |
| Tasks in suite | ${counts.harbor_tasks} |

## Configurations

\`\`\`python
from datasets import load_dataset

# Chat-formatted records for supervised fine-tuning
sft = load_dataset("${HF_DATASET_REPO}", "sft")

# Unified-diff patch records (starter → verified solution)
patches = load_dataset("${HF_DATASET_REPO}", "patches")
\`\`\`

- **\`sft\`** — chat records (\`messages\` + \`metadata\`): the exact prompt shown to the
  agent and the resulting solution, with task metadata (task id, split, leakage group,
  score, agent id).
- **\`patches\`** — the starter-to-solution unified diff plus the same metadata.

## Splits and hygiene

Records carry their source task's \`dataset.split\` and \`leakage_group\`. Exports enforce
split hygiene by default: only \`train\` and \`dev\` tasks are included, \`public_eval\` and
\`private_eval\` are excluded, and tasks marked \`trainable: false\` are never exported.
Hidden tests and reference solutions are never included in any record.

## Layout

\`\`\`text
data/sft/bun-server-bench.jsonl        latest SFT export
data/patches/bun-server-bench.jsonl    latest patch export
releases/${tag}/                       tagged, immutable copies + manifest
manifests/                             release manifests (counts, git sha)
\`\`\`

## License

Apache-2.0. Preserve license and provenance metadata when redistributing.

---

*This card is generated at release time. See the [benchmark repository](${BENCHMARK_REPO_URL})
for task definitions, scoring, and integrity guarantees.*
`;

  return `${frontmatter}\n\n${body}`;
}
