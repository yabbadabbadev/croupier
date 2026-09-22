#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function summarizeVerification({
  typeCheckExitCode,
  typeCheckOutput,
  testExitCode,
  testReport,
  testOutput,
}) {
  const failedTestNames = [];
  const results = testReport?.testResults ?? [];
  for (const file of results) {
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status === "failed") {
        failedTestNames.push(assertion.fullName ?? assertion.title ?? file.name);
      }
    }
  }

  const typeCheckPassed = typeCheckExitCode === 0;
  const unitTestsPassed = testExitCode === 0;

  return {
    passed: typeCheckPassed && unitTestsPassed,
    typeCheckPassed,
    unitTestsPassed,
    output: [typeCheckOutput, testOutput].filter(Boolean).join("\n"),
    failedTestNames,
  };
}

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8" });
}

function main() {
  const typeCheck = run("pnpm", ["exec", "tsc", "--noEmit"]);
  const reportPath = ".croupier/vitest.json";
  const tests = run("pnpm", [
    "exec",
    "vitest",
    "run",
    "--reporter=json",
    `--outputFile=${reportPath}`,
  ]);

  let testReport = null;
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

  process.stdout.write(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}