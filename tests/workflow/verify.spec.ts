import { describe, it, expect } from "vitest";
import { summarizeVerification } from "../../scripts/verify.mjs";

describe("summarizeVerification", () => {
  it("aprueba cuando typecheck y tests pasan", () => {
    const result = summarizeVerification({
      typeCheckExitCode: 0,
      typeCheckOutput: "",
      testExitCode: 0,
      testReport: { testResults: [] },
      testOutput: "Test Files 1 passed",
    });
    expect(result.passed).toBe(true);
    expect(result.typeCheckPassed).toBe(true);
    expect(result.unitTestsPassed).toBe(true);
    expect(result.failedTestNames).toEqual([]);
  });

  it("suspende cuando falla el typecheck", () => {
    const result = summarizeVerification({
      typeCheckExitCode: 2,
      typeCheckOutput: "TS2322: Type error",
      testExitCode: 0,
      testReport: { testResults: [] },
      testOutput: "",
    });
    expect(result.passed).toBe(false);
    expect(result.typeCheckPassed).toBe(false);
    expect(result.output).toContain("TS2322");
  });

  it("recoge los nombres de los tests fallidos", () => {
    const result = summarizeVerification({
      typeCheckExitCode: 0,
      typeCheckOutput: "",
      testExitCode: 1,
      testReport: {
        testResults: [
          {
            name: "tests/button.spec.ts",
            assertionResults: [
              { fullName: "Button renders label", status: "passed" },
              { fullName: "Button handles click", status: "failed" },
            ],
          },
        ],
      },
      testOutput: "",
    });
    expect(result.passed).toBe(false);
    expect(result.failedTestNames).toEqual(["Button handles click"]);
  });

  it("tolera un report ausente", () => {
    const result = summarizeVerification({
      typeCheckExitCode: 0,
      typeCheckOutput: "",
      testExitCode: 1,
      testReport: null,
      testOutput: "boom",
    });
    expect(result.unitTestsPassed).toBe(false);
    expect(result.failedTestNames).toEqual([]);
  });
});