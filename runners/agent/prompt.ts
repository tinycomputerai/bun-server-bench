import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskConfig } from "../local/types";

type InstructionConfig = {
  prompt_file: string;
  summary?: string;
  constraints?: string[];
  allowed_assumptions?: string[];
  disallowed_shortcuts?: string[];
};

export function constructPrompt(taskDir: string, task: TaskConfig & { instruction?: InstructionConfig }): string {
  const promptFile = task.instruction?.prompt_file ?? "prompt.md";
  const promptPath = join(taskDir, promptFile);
  const basePrompt = readFileSync(promptPath, "utf8").trimEnd();

  const sections: string[] = [basePrompt];

  const instruction = task.instruction;
  if (!instruction) {
    return `${sections.join("\n\n")}\n`;
  }

  if (instruction.summary) {
    sections.push(`## Summary\n\n${instruction.summary}`);
  }

  if (instruction.constraints?.length) {
    sections.push(formatBullets("Constraints", instruction.constraints));
  }

  if (instruction.allowed_assumptions?.length) {
    sections.push(formatBullets("Allowed assumptions", instruction.allowed_assumptions));
  }

  if (instruction.disallowed_shortcuts?.length) {
    sections.push(formatBullets("Disallowed shortcuts", instruction.disallowed_shortcuts));
  }

  return `${sections.join("\n\n")}\n`;
}

function formatBullets(title: string, items: string[]): string {
  const lines = items.map((item) => `- ${item}`);
  return `## ${title}\n\n${lines.join("\n")}`;
}
