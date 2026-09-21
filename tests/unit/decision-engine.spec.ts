import { describe, it, expect } from "vitest";
import {
  createDecisionEngine,
  resolveDecisionConfig,
} from "../../src/arbiter/decision-engine.js";
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

import { classifyReviewIssues } from "../../src/arbiter/decision-engine.js";
import type {
  ClassifiedSeverity,
  DecisionEngine,
} from "../../src/state/types.js";

class FakeEngine implements DecisionEngine {
  constructor(private readonly outcome: ClassifiedSeverity[] | Error) {}

  async classifyReviewIssueSeverities(): Promise<ClassifiedSeverity[]> {
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

const rule = new RuleDecisionEngine();

describe("classifyReviewIssues", () => {
  it("usa el primario cuando la confianza alcanza el umbral", async () => {
    const primary = new FakeEngine([
      { severity: "blocker", confidence: 0.9, engine: "jev" },
    ]);
    const result = await classifyReviewIssues(primary, rule, [input("x")], 0.8);
    expect(result.issues[0].severity).toBe("blocker");
    expect(result.audit[0]).toMatchObject({ engine: "jev", usedFallback: false });
  });

  it("cae al fallback por issue cuando la confianza es baja", async () => {
    const primary = new FakeEngine([
      { severity: "warning", confidence: 0.5, engine: "jev" },
    ]);
    const result = await classifyReviewIssues(
      primary,
      rule,
      [input("uso de `any`")],
      0.8
    );
    expect(result.issues[0].severity).toBe("blocker");
    expect(result.audit[0]).toMatchObject({
      engine: "rule",
      selected: "blocker",
      confidence: 1,
      usedFallback: true,
    });
  });

  it("cae al fallback total cuando el primario lanza", async () => {
    const primary = new FakeEngine(new Error("network down"));
    const result = await classifyReviewIssues(
      primary,
      rule,
      [input("nombre poco claro")],
      0.8
    );
    expect(result.issues[0].severity).toBe("warning");
    expect(result.audit[0]).toMatchObject({ engine: "rule", usedFallback: true });
  });

  it("emite una entrada de audit por issue", async () => {
    const primary = new FakeEngine([
      { severity: "blocker", confidence: 0.95, engine: "jev" },
      { severity: "warning", confidence: 0.4, engine: "jev" },
    ]);
    const result = await classifyReviewIssues(
      primary,
      rule,
      [input("a"), input("b")],
      0.8
    );
    expect(result.audit).toHaveLength(2);
    expect(result.audit[1].usedFallback).toBe(true);
  });
});

describe("resolveDecisionConfig", () => {
  it("usa rule y 0.8 por defecto", () => {
    const config = resolveDecisionConfig({} as NodeJS.ProcessEnv);
    expect(config.engine).toBe("rule");
    expect(config.confidenceThreshold).toBe(0.8);
    expect(config.provider?.model).toBe("jev-1.13");
  });

  it("lee motor, umbral y modelo del entorno", () => {
    const config = resolveDecisionConfig({
      CROUPIER_DECISION_ENGINE: "jev",
      CROUPIER_CONFIDENCE_THRESHOLD: "0.6",
      TYPESAFE_MODEL: "jev-latest",
    } as NodeJS.ProcessEnv);
    expect(config.engine).toBe("jev");
    expect(config.confidenceThreshold).toBe(0.6);
    expect(config.provider?.model).toBe("jev-latest");
  });

  it("ignora un umbral inválido y cae a 0.8", () => {
    const config = resolveDecisionConfig({
      CROUPIER_CONFIDENCE_THRESHOLD: "not-a-number",
    } as NodeJS.ProcessEnv);
    expect(config.confidenceThreshold).toBe(0.8);
  });
});

describe("createDecisionEngine", () => {
  it("devuelve el motor de reglas para engine=rule", async () => {
    const engine = await createDecisionEngine(
      { engine: "rule", confidenceThreshold: 0.8 },
      {} as NodeJS.ProcessEnv
    );
    expect(engine).toBeInstanceOf(RuleDecisionEngine);
  });

  it("lanza si engine=jev y falta la API key", async () => {
    await expect(
      createDecisionEngine({ engine: "jev", confidenceThreshold: 0.8 }, {} as NodeJS.ProcessEnv)
    ).rejects.toThrow("TYPESAFE_API_KEY");
  });

  it("inyecta el proveedor resuelto en el factory de Jev", async () => {
    let received: { apiKey: string; model: string; baseUrl?: string } | undefined;
    const engine = await createDecisionEngine(
      { engine: "jev", confidenceThreshold: 0.8, provider: { model: "jev-1.13" } },
      { TYPESAFE_API_KEY: "secret-key" } as NodeJS.ProcessEnv,
      {
        createJevEngine: async (provider) => {
          received = provider;
          return new RuleDecisionEngine();
        },
      }
    );
    expect(received).toEqual({ apiKey: "secret-key", model: "jev-1.13" });
    expect(engine).toBeInstanceOf(RuleDecisionEngine);
  });
});