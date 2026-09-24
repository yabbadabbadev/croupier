import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tool } from "@opencode-ai/plugin";

export interface VerificationResult {
  passed: boolean;
  typeCheckPassed: boolean;
  unitTestsPassed: boolean;
  output: string;
  failedTestNames: string[];
}

interface SummarizeInput {
  typeCheckExitCode: number;
  typeCheckOutput: string;
  testExitCode: number;
  testReport: { testResults?: Array<{ name: string; assertionResults?: Array<{ title?: string; fullName?: string; status: string }> }> } | null;
  testOutput: string;
}

export function summarizeVerification(input: SummarizeInput): VerificationResult {
  const failedTestNames: string[] = [];
  for (const file of input.testReport?.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status === "failed") {
        failedTestNames.push(assertion.fullName ?? assertion.title ?? file.name);
      }
    }
  }
  const typeCheckPassed = input.typeCheckExitCode === 0;
  const unitTestsPassed = input.testExitCode === 0;
  return {
    passed: typeCheckPassed && unitTestsPassed,
    typeCheckPassed,
    unitTestsPassed,
    output: [input.typeCheckOutput, input.testOutput].filter(Boolean).join("\n"),
    failedTestNames,
  };
}

export const verifyTool = tool({
  description: "Ejecuta tsc --noEmit y vitest en el proyecto y devuelve un JSON con el resultado de la verificación.",
  args: {},
  async execute(_args, context) {
    const cwd = context.directory;
    const typeCheck = spawnSync("pnpm", ["exec", "tsc", "--noEmit"], { cwd, encoding: "utf8" });
    const reportPath = join(cwd, ".croupier", "vitest.json");
    const tests = spawnSync(
      "pnpm",
      ["exec", "vitest", "run", "--reporter=json", `--outputFile=${reportPath}`],
      { cwd, encoding: "utf8" }
    );
    let testReport: SummarizeInput["testReport"] = null;
    try {
      testReport = JSON.parse(readFileSync(reportPath, "utf8"));
    } catch {
      testReport = null;
    }
    const result = summarizeVerification({
      typeCheckExitCode: typeCheck.status ?? 1,
      typeCheckOutput: [typeCheck.stdout, typeCheck.stderr].filter(Boolean).join("\n"),
      testExitCode: tests.status ?? 1,
      testReport,
      testOutput: [tests.stdout, tests.stderr].filter(Boolean).join("\n"),
    });
    return JSON.stringify(result, null, 2);
  },
});