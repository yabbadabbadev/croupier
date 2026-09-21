import { describe, it, expect } from "vitest";
import { RuleDecisionEngine } from "../../src/arbiter/rules.js";
import type { ClassifySeverityInput } from "../../src/state/types.js";

function input(
  description: string,
  severity: "blocker" | "warning" = "warning"
): ClassifySeverityInput {
  return {
    issue: { file: "src/x.ts", severity, description },
    spec: "spec",
    targetFiles: ["src/x.ts"],
  };
}

describe("RuleDecisionEngine", () => {
  const engine = new RuleDecisionEngine();

  it("mantiene blocker cuando el issue ya llega como blocker", async () => {
    const [result] = await engine.classifyReviewIssueSeverities([
      input("mejora de nombres", "blocker"),
    ]);
    expect(result.severity).toBe("blocker");
    expect(result.engine).toBe("rule");
    expect(result.confidence).toBe(1);
  });

  it("promueve a blocker descripciones con patrones críticos", async () => {
    const critical = [
      "uso de `any` en la firma",
      "fallo de accesibilidad WCAG",
      "posible vulnerabilidad de seguridad",
      "la type-safety se rompe",
    ];
    for (const description of critical) {
      const [result] = await engine.classifyReviewIssueSeverities([input(description)]);
      expect(result.severity).toBe("blocker");
    }
  });

  it("degrada a warning descripciones no críticas", async () => {
    const [result] = await engine.classifyReviewIssueSeverities([
      input("nombre de variable poco claro"),
    ]);
    expect(result.severity).toBe("warning");
  });

  it("devuelve tantos resultados como entradas", async () => {
    const results = await engine.classifyReviewIssueSeverities([
      input("a"),
      input("b"),
      input("c"),
    ]);
    expect(results).toHaveLength(3);
  });
});