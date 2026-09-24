import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { summarizeVerification } from "../src/tools/verify.js";
import { diffPngs } from "../src/tools/visual-diff.js";

function solidPng(rgb: [number, number, number]): Buffer {
  const png = new PNG({ width: 4, height: 4 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe("summarizeVerification", () => {
  it("aprueba con typecheck y tests ok", () => {
    const result = summarizeVerification({
      typeCheckExitCode: 0,
      typeCheckOutput: "",
      testExitCode: 0,
      testReport: { testResults: [] },
      testOutput: "",
    });
    expect(result.passed).toBe(true);
  });

  it("recoge tests fallidos", () => {
    const result = summarizeVerification({
      typeCheckExitCode: 0,
      typeCheckOutput: "",
      testExitCode: 1,
      testReport: {
        testResults: [{ name: "a.spec.ts", assertionResults: [{ fullName: "x", status: "failed" }] }],
      },
      testOutput: "",
    });
    expect(result.failedTestNames).toEqual(["x"]);
  });
});

describe("diffPngs", () => {
  it("ratio 0 para idénticas y 1 para opuestas", () => {
    const a = solidPng([255, 0, 0]);
    const b = solidPng([255, 0, 0]);
    const c = solidPng([0, 0, 255]);
    expect(diffPngs(a, b).ratio).toBe(0);
    expect(diffPngs(a, c).ratio).toBe(1);
  });

  it("lanza si difieren las dimensiones", () => {
    const small = solidPng([0, 0, 0]);
    const big = PNG.sync.write(new PNG({ width: 8, height: 4 }));
    expect(() => diffPngs(small, big)).toThrow("dimensions");
  });
});