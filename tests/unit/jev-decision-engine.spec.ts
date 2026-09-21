import { describe, it, expect } from "vitest";
import {
  JevDecisionEngine,
  type SystemOneClient,
} from "../../src/arbiter/jev-decision-engine.js";
import type { ClassifySeverityInput } from "../../src/state/types.js";

function input(description: string): ClassifySeverityInput {
  return {
    issue: { file: "src/x.ts", severity: "warning", description },
    spec: "spec atómica",
    targetFiles: ["src/x.ts"],
  };
}

function fakeClient(
  answers: Record<string, { choice: string; confidence: number }>
): { client: SystemOneClient; calls: Array<{ state: unknown; questions: unknown }> } {
  const calls: Array<{ state: unknown; questions: unknown }> = [];
  const client: SystemOneClient = {
    systemOne: async (req) => {
      calls.push(req);
      return { answers };
    },
  };
  return { client, calls };
}

describe("JevDecisionEngine", () => {
  it("mapea choice y confidence a ClassifiedSeverity", async () => {
    const { client } = fakeClient({
      issue_0: { choice: "blocker", confidence: 0.92 },
      issue_1: { choice: "warning", confidence: 0.61 },
    });
    const engine = new JevDecisionEngine({ client, model: "jev-1.13" });

    const results = await engine.classifyReviewIssueSeverities([input("a"), input("b")]);

    expect(results).toEqual([
      { severity: "blocker", confidence: 0.92, engine: "jev" },
      { severity: "warning", confidence: 0.61, engine: "jev" },
    ]);
  });

  it("hace una sola llamada con una pregunta choice por issue", async () => {
    const { client, calls } = fakeClient({
      issue_0: { choice: "warning", confidence: 0.8 },
      issue_1: { choice: "warning", confidence: 0.8 },
    });
    const engine = new JevDecisionEngine({ client, model: "jev-1.13" });

    await engine.classifyReviewIssueSeverities([input("a"), input("b")]);

    expect(calls).toHaveLength(1);
    const questions = calls[0].questions as Record<
      string,
      { type: string; instructions: string }
    >;
    expect(Object.keys(questions)).toEqual(["issue_0", "issue_1"]);
    expect(questions.issue_0.type).toBe("choice");
    expect(questions.issue_0.instructions).toContain("issues[0]");
  });

  it("envía spec, targetFiles e issues en el estado", async () => {
    const { client, calls } = fakeClient({
      issue_0: { choice: "warning", confidence: 0.8 },
    });
    const engine = new JevDecisionEngine({ client, model: "jev-1.13" });

    await engine.classifyReviewIssueSeverities([input("detalle")]);

    const state = calls[0].state as {
      spec: string;
      targetFiles: string[];
      issues: Array<{ description: string }>;
    };
    expect(state.spec).toBe("spec atómica");
    expect(state.targetFiles).toEqual(["src/x.ts"]);
    expect(state.issues[0].description).toBe("detalle");
  });

  it("no llama al cliente si no hay issues", async () => {
    const { client, calls } = fakeClient({});
    const engine = new JevDecisionEngine({ client, model: "jev-1.13" });

    const results = await engine.classifyReviewIssueSeverities([]);

    expect(results).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("lanza si falta la respuesta de un issue", async () => {
    const { client } = fakeClient({
      issue_0: { choice: "warning", confidence: 0.8 },
    });
    const engine = new JevDecisionEngine({ client, model: "jev-1.13" });

    await expect(
      engine.classifyReviewIssueSeverities([input("a"), input("b")])
    ).rejects.toThrow("issue_1");
  });
});