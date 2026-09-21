# Jev Decision Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer intercambiables los puntos de decisión difusos del pipeline mediante un `DecisionEngine` con motor determinista por defecto y motor Jev opcional, con gate de confianza y fallback determinista.

**Architecture:** Un contrato único (`DecisionEngine`) implementado por `RuleDecisionEngine` (default, offline) y `JevDecisionEngine` (envuelve el SDK de TypeSafe con un cliente inyectable). Un orquestador puro (`classifyReviewIssues`) aplica el gate por issue y cae al motor de reglas ante baja confianza o error. El port se invoca en nodos, nunca en las `conditional edges`; el estado se amplía con `decisionAudit` y el routing permanece puro.

**Tech Stack:** TypeScript (ESM, NodeNext), Node ≥20, LangGraph, Vitest, `@typesafe-ai/sdk` (carga perezosa), `dotenv`.

**Spec:** `docs/superpowers/specs/2026-09-21-jev-decision-port-design.md`

## Global Constraints

- Node.js `>=20.0.0` (ya en `package.json`).
- Módulos ESM con resolución `NodeNext`: **todo import relativo usa extensión `.js`** (p. ej. `../state/types.js`).
- `strict: true`; `tsc --noEmit` debe quedar limpio.
- No añadir comentarios al código de producción salvo que un paso lo indique.
- `CROUPIER_DECISION_ENGINE` default `rule`; con `rule` **no** se carga `@typesafe-ai/sdk` ni se requiere ninguna API key.
- Umbral de confianza default `0.8`.
- Modelo Jev default `jev-1.13`; `baseUrl` default = default del SDK (`https://api.typesafe.ai`, el SDK añade `/v1`).
- Los tests no tocan la red: el cliente Jev se inyecta como fake.
- Tras cada tarea: `pnpm run typecheck && pnpm test` en verde y commit.

---

## File Structure

- `src/state/types.ts` (modificar) — tipos de dominio del port y de configuración.
- `src/state/pipeline-state.ts` (modificar) — campo `decisionAudit`.
- `src/arbiter/rules.ts` (crear) — `RuleDecisionEngine`.
- `src/arbiter/decision-engine.ts` (crear) — orquestador `classifyReviewIssues`, `resolveDecisionConfig`, `createDecisionEngine`.
- `src/arbiter/jev-decision-engine.ts` (crear) — `JevDecisionEngine`, `SystemOneClient`, `createJevDecisionEngine`.
- `src/arbiter/review-policy.ts` (crear) — `deriveReviewApproved`.
- `src/index.ts` (modificar) — exports públicos.
- `tests/unit/decision-engine.spec.ts` (crear) — reglas, gate y config.
- `tests/unit/jev-decision-engine.spec.ts` (crear) — motor Jev con fake client.
- `tests/unit/review-policy.spec.ts` (crear) — derivación de `reviewApproved`.
- `tests/unit/routing.spec.ts` (modificar) — añadir `decisionAudit` a `makeState`.

---

### Task 1: Tipos base y `RuleDecisionEngine`

**Files:**
- Modify: `src/state/types.ts`
- Create: `src/arbiter/rules.ts`
- Test: `tests/unit/decision-engine.spec.ts`

**Interfaces:**
- Consumes: `ReviewIssue`, `Severity` (ya en `src/state/types.ts`).
- Produces:
  - `ClassifySeverityInput`, `ClassifiedSeverity`, `DecisionEngine`, `DecisionAuditEntry`, `DecisionOutcome`, `JevProviderConfig`, `DecisionEngineConfig` (en `src/state/types.ts`).
  - `RuleDecisionEngine implements DecisionEngine` con `classifyReviewIssueSeverities(inputs): Promise<ClassifiedSeverity[]>`.

- [ ] **Step 1: Añadir los tipos a `src/state/types.ts`**

Añadir al final del fichero:

```ts
export interface ClassifySeverityInput {
  issue: ReviewIssue;
  spec: string | null;
  targetFiles: string[];
}

export interface ClassifiedSeverity {
  severity: Severity;
  confidence: number;
  engine: "rule" | "jev";
}

export interface DecisionEngine {
  classifyReviewIssueSeverities(
    inputs: ClassifySeverityInput[]
  ): Promise<ClassifiedSeverity[]>;
}

export interface DecisionAuditEntry {
  point: "review_issue_severity";
  issueIndex: number;
  engine: "rule" | "jev";
  selected: Severity;
  confidence: number;
  usedFallback: boolean;
}

export interface DecisionOutcome {
  issues: ReviewIssue[];
  audit: DecisionAuditEntry[];
}

export interface JevProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  model?: string;
}

export interface DecisionEngineConfig {
  engine: "rule" | "jev";
  confidenceThreshold: number;
  provider?: JevProviderConfig;
}
```

- [ ] **Step 2: Escribir el test que falla**

Crear `tests/unit/decision-engine.spec.ts`:

```ts
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
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `pnpm test tests/unit/decision-engine.spec.ts`
Expected: FAIL — `Cannot find module '../../src/arbiter/rules.js'`.

- [ ] **Step 4: Implementar `src/arbiter/rules.ts`**

```ts
import type {
  ClassifiedSeverity,
  ClassifySeverityInput,
  DecisionEngine,
} from "../state/types.js";

const CRITICAL_PATTERNS: RegExp[] = [
  /`any`/i,
  /\bany type\b/i,
  /\bno-?any\b/i,
  /a11y/i,
  /wcag/i,
  /accessib/i,
  /accesib/i,
  /security/i,
  /seguridad/i,
  /vulnerab/i,
  /type[- ]?safety/i,
  /tipado/i,
];

function isCritical(description: string): boolean {
  return CRITICAL_PATTERNS.some((pattern) => pattern.test(description));
}

export class RuleDecisionEngine implements DecisionEngine {
  async classifyReviewIssueSeverities(
    inputs: ClassifySeverityInput[]
  ): Promise<ClassifiedSeverity[]> {
    return inputs.map((input) => ({
      severity:
        input.issue.severity === "blocker" || isCritical(input.issue.description)
          ? "blocker"
          : "warning",
      confidence: 1,
      engine: "rule",
    }));
  }
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pnpm test tests/unit/decision-engine.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck y commit**

```bash
pnpm run typecheck
git add src/state/types.ts src/arbiter/rules.ts tests/unit/decision-engine.spec.ts
git commit -m "feat(arbiter): add decision port types and deterministic rule engine"
```

---

### Task 2: Orquestador `classifyReviewIssues` con gate y fallback

**Files:**
- Create: `src/arbiter/decision-engine.ts`
- Modify: `tests/unit/decision-engine.spec.ts` (añadir describe al final)

**Interfaces:**
- Consumes: `DecisionEngine`, `ClassifiedSeverity`, `ClassifySeverityInput`, `DecisionOutcome` (Task 1).
- Produces: `classifyReviewIssues(primary, fallback, inputs, confidenceThreshold): Promise<DecisionOutcome>`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `tests/unit/decision-engine.spec.ts`:

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test tests/unit/decision-engine.spec.ts`
Expected: FAIL — `Cannot find module '../../src/arbiter/decision-engine.js'`.

- [ ] **Step 3: Implementar `classifyReviewIssues` en `src/arbiter/decision-engine.ts`**

```ts
import type {
  ClassifiedSeverity,
  ClassifySeverityInput,
  DecisionAuditEntry,
  DecisionEngine,
  DecisionOutcome,
  ReviewIssue,
} from "../state/types.js";

export async function classifyReviewIssues(
  primary: DecisionEngine,
  fallback: DecisionEngine,
  inputs: ClassifySeverityInput[],
  confidenceThreshold: number
): Promise<DecisionOutcome> {
  let primaryResults: ClassifiedSeverity[] | null = null;
  try {
    primaryResults = await primary.classifyReviewIssueSeverities(inputs);
  } catch {
    primaryResults = null;
  }

  const fallbackResults = await fallback.classifyReviewIssueSeverities(inputs);

  const issues: ReviewIssue[] = [];
  const audit: DecisionAuditEntry[] = [];

  inputs.forEach((input, index) => {
    const primaryResult = primaryResults?.[index];
    const fallbackResult = fallbackResults[index];
    const usePrimary =
      primaryResult !== undefined &&
      primaryResult.confidence >= confidenceThreshold;
    const chosen = usePrimary ? primaryResult : fallbackResult;

    issues.push({ ...input.issue, severity: chosen.severity });
    audit.push({
      point: "review_issue_severity",
      issueIndex: index,
      engine: chosen.engine,
      selected: chosen.severity,
      confidence: chosen.confidence,
      usedFallback: !usePrimary,
    });
  });

  return { issues, audit };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test tests/unit/decision-engine.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck y commit**

```bash
pnpm run typecheck
git add src/arbiter/decision-engine.ts tests/unit/decision-engine.spec.ts
git commit -m "feat(arbiter): add confidence-gated decision orchestration with fallback"
```

---

### Task 3: `JevDecisionEngine` con cliente inyectable

**Files:**
- Modify: `package.json` (añadir dependencia) y `pnpm-lock.yaml` (vía `pnpm install`)
- Create: `src/arbiter/jev-decision-engine.ts`
- Test: `tests/unit/jev-decision-engine.spec.ts`

**Interfaces:**
- Consumes: `ClassifiedSeverity`, `ClassifySeverityInput`, `DecisionEngine`, `ReviewIssue`, `Severity` (Task 1).
- Produces:
  - `SystemOneAnswer`, `SystemOneClient`, `JevEngineOptions`.
  - `JevDecisionEngine implements DecisionEngine`.
  - `createJevDecisionEngine(config: { apiKey: string; model: string; baseUrl?: string }): Promise<DecisionEngine>`.

- [ ] **Step 1: Añadir la dependencia**

```bash
pnpm add @typesafe-ai/sdk@^0.6.0
```

- [ ] **Step 2: Escribir el test que falla**

Crear `tests/unit/jev-decision-engine.spec.ts`:

```ts
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
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `pnpm test tests/unit/jev-decision-engine.spec.ts`
Expected: FAIL — `Cannot find module '../../src/arbiter/jev-decision-engine.js'`.

- [ ] **Step 4: Implementar `src/arbiter/jev-decision-engine.ts`**

```ts
import type {
  ClassifiedSeverity,
  ClassifySeverityInput,
  DecisionEngine,
  ReviewIssue,
  Severity,
} from "../state/types.js";

export interface SystemOneAnswer {
  choice: string;
  confidence: number;
}

export interface SystemOneClient {
  systemOne(req: { state: unknown; questions: unknown }): Promise<{
    answers: Record<string, SystemOneAnswer>;
  }>;
}

export interface JevEngineOptions {
  client: SystemOneClient;
  model: string;
}

interface JevState {
  spec: string | null;
  targetFiles: string[];
  issues: ReviewIssue[];
}

function buildQuestions(count: number): Record<string, unknown> {
  const questions: Record<string, unknown> = {};
  for (let i = 0; i < count; i += 1) {
    questions[`issue_${i}`] = {
      type: "choice",
      instructions: `Classify the severity of \`issues[${i}]\` for the change described by \`spec\`.`,
      criteria: {
        blocker: {
          what: "breaks correctness, type-safety, accessibility or acceptance of `spec`",
          not_for: "style, naming or refactor suggestions",
          examples: ["uncovered branch in a test", "WCAG failure", "use of `any`"],
        },
        warning: {
          what: "improvement that does not block acceptance",
          not_for: "bugs, a11y failures or type-safety holes",
          examples: ["unclear name", "minor duplication"],
        },
      },
    };
  }
  return questions;
}

export class JevDecisionEngine implements DecisionEngine {
  private readonly client: SystemOneClient;
  private readonly model: string;

  constructor(options: JevEngineOptions) {
    this.client = options.client;
    this.model = options.model;
  }

  async classifyReviewIssueSeverities(
    inputs: ClassifySeverityInput[]
  ): Promise<ClassifiedSeverity[]> {
    if (inputs.length === 0) {
      return [];
    }

    const state: JevState = {
      spec: inputs[0].spec,
      targetFiles: inputs[0].targetFiles,
      issues: inputs.map((input) => input.issue),
    };

    const response = await this.client.systemOne({
      state,
      questions: buildQuestions(inputs.length),
    });

    return inputs.map((_, index) => {
      const answer = response.answers[`issue_${index}`];
      if (!answer) {
        throw new Error(`Jev response missing answer for issue_${index}`);
      }
      const severity: Severity = answer.choice === "blocker" ? "blocker" : "warning";
      return { severity, confidence: answer.confidence, engine: "jev" };
    });
  }
}

export async function createJevDecisionEngine(config: {
  apiKey: string;
  model: string;
  baseUrl?: string;
}): Promise<DecisionEngine> {
  const sdk = await import("@typesafe-ai/sdk");
  const client = new sdk.TypeSafeClient({
    apiKey: config.apiKey,
    defaultModel: config.model,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });

  const wrapped: SystemOneClient = {
    systemOne: async (req) => {
      const result = await client.systemOne(
        req as unknown as Parameters<typeof client.systemOne>[0]
      );
      return { answers: result.answers as Record<string, SystemOneAnswer> };
    },
  };

  return new JevDecisionEngine({ client: wrapped, model: config.model });
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `pnpm test tests/unit/jev-decision-engine.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck y commit**

```bash
pnpm run typecheck
git add package.json pnpm-lock.yaml src/arbiter/jev-decision-engine.ts tests/unit/jev-decision-engine.spec.ts
git commit -m "feat(arbiter): add Jev decision engine with injectable SystemOne client"
```

---

### Task 4: Configuración y factory `createDecisionEngine`

**Files:**
- Modify: `src/arbiter/decision-engine.ts`
- Modify: `tests/unit/decision-engine.spec.ts` (añadir describe al final)

**Interfaces:**
- Consumes: `DecisionEngineConfig`, `JevProviderConfig`, `DecisionEngine`; `RuleDecisionEngine` (Task 1); `classifyReviewIssues` (Task 2).
- Produces:
  - `resolveDecisionConfig(env?) : DecisionEngineConfig`
  - `ResolvedJevProvider { apiKey: string; model: string; baseUrl?: string }`
  - `createDecisionEngine(config?, env?, deps?): Promise<DecisionEngine>` con `deps.createJevEngine` inyectable.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `tests/unit/decision-engine.spec.ts`:

```ts
import {
  resolveDecisionConfig,
  createDecisionEngine,
} from "../../src/arbiter/decision-engine.js";

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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test tests/unit/decision-engine.spec.ts`
Expected: FAIL — `resolveDecisionConfig`/`createDecisionEngine` no exportados.

- [ ] **Step 3: Implementar en `src/arbiter/decision-engine.ts`**

Añadir a los imports existentes y al final del fichero:

```ts
import type {
  DecisionEngineConfig,
  JevProviderConfig,
} from "../state/types.js";
import { RuleDecisionEngine } from "./rules.js";
```

```ts
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;
export const DEFAULT_TYPESAFE_MODEL = "jev-1.13";
export const DEFAULT_TYPESAFE_API_KEY_ENV = "TYPESAFE_API_KEY";

export interface ResolvedJevProvider {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export type JevEngineFactory = (
  provider: ResolvedJevProvider
) => Promise<DecisionEngine>;

export interface CreateDecisionEngineDeps {
  createJevEngine?: JevEngineFactory;
}

export function resolveDecisionConfig(
  env: NodeJS.ProcessEnv = process.env
): DecisionEngineConfig {
  const rawThreshold = Number(env.CROUPIER_CONFIDENCE_THRESHOLD);
  const confidenceThreshold =
    Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 1
      ? rawThreshold
      : DEFAULT_CONFIDENCE_THRESHOLD;

  return {
    engine: env.CROUPIER_DECISION_ENGINE === "jev" ? "jev" : "rule",
    confidenceThreshold,
    provider: {
      apiKeyEnv: DEFAULT_TYPESAFE_API_KEY_ENV,
      model: env.TYPESAFE_MODEL ?? DEFAULT_TYPESAFE_MODEL,
    },
  };
}

export async function createDecisionEngine(
  config: DecisionEngineConfig = resolveDecisionConfig(),
  env: NodeJS.ProcessEnv = process.env,
  deps: CreateDecisionEngineDeps = {}
): Promise<DecisionEngine> {
  if (config.engine === "rule") {
    return new RuleDecisionEngine();
  }

  const provider: JevProviderConfig = config.provider ?? {};
  const apiKeyEnv = provider.apiKeyEnv ?? DEFAULT_TYPESAFE_API_KEY_ENV;
  const apiKey = provider.apiKey ?? env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `Missing TypeSafe API key. Set ${apiKeyEnv} or use CROUPIER_DECISION_ENGINE=rule.`
    );
  }

  const resolved: ResolvedJevProvider = {
    apiKey,
    model: provider.model ?? DEFAULT_TYPESAFE_MODEL,
    ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
  };

  if (deps.createJevEngine) {
    return deps.createJevEngine(resolved);
  }

  const { createJevDecisionEngine } = await import("./jev-decision-engine.js");
  return createJevDecisionEngine(resolved);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test tests/unit/decision-engine.spec.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Typecheck y commit**

```bash
pnpm run typecheck
git add src/arbiter/decision-engine.ts tests/unit/decision-engine.spec.ts
git commit -m "feat(arbiter): resolve decision config and build engine with lazy Jev import"
```

---

### Task 5: Estado `decisionAudit` y política de review

**Files:**
- Modify: `src/state/pipeline-state.ts`
- Create: `src/arbiter/review-policy.ts`
- Modify: `tests/unit/routing.spec.ts` (`makeState`)
- Test: `tests/unit/review-policy.spec.ts`

**Interfaces:**
- Consumes: `DecisionAuditEntry`, `ReviewIssue` (Task 1).
- Produces:
  - Campo `decisionAudit` en `PipelineAnnotation` y en `PipelineState`.
  - `deriveReviewApproved(issues: ReviewIssue[]): boolean`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/review-policy.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveReviewApproved } from "../../src/arbiter/review-policy.js";
import type { ReviewIssue } from "../../src/state/types.js";

function issue(severity: "blocker" | "warning"): ReviewIssue {
  return { file: "src/x.ts", severity, description: "detalle" };
}

describe("deriveReviewApproved", () => {
  it("aprueba cuando no hay issues", () => {
    expect(deriveReviewApproved([])).toBe(true);
  });

  it("aprueba cuando solo hay warnings", () => {
    expect(deriveReviewApproved([issue("warning"), issue("warning")])).toBe(true);
  });

  it("rechaza cuando hay al menos un blocker", () => {
    expect(deriveReviewApproved([issue("warning"), issue("blocker")])).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test tests/unit/review-policy.spec.ts`
Expected: FAIL — `Cannot find module '../../src/arbiter/review-policy.js'`.

- [ ] **Step 3: Implementar `src/arbiter/review-policy.ts`**

```ts
import type { ReviewIssue } from "../state/types.js";

export function deriveReviewApproved(issues: ReviewIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "blocker");
}
```

- [ ] **Step 4: Añadir `decisionAudit` a `src/state/pipeline-state.ts`**

En el import, añadir `DecisionAuditEntry`:

```ts
import { ReviewIssue, VerificationResult, ArbiterEvaluation, DecisionAuditEntry } from "./types.js";
```

Dentro de `Annotation.Root({ ... })`, tras `reviewIssues`:

```ts
  decisionAudit: Annotation<DecisionAuditEntry[]>({
    reducer: (curr, next) => curr.concat(next),
    default: () => [],
  }),
```

- [ ] **Step 5: Actualizar `makeState` en `tests/unit/routing.spec.ts`**

En el objeto que devuelve `makeState`, añadir tras `reviewIssues: [],`:

```ts
    decisionAudit: [],
```

- [ ] **Step 6: Ejecutar toda la suite y verificar**

Run: `pnpm test`
Expected: PASS — `arbiter.spec.ts` (8), `decision-engine.spec.ts` (14), `jev-decision-engine.spec.ts` (5), `review-policy.spec.ts` (3), `routing.spec.ts` (15).

- [ ] **Step 7: Typecheck y commit**

```bash
pnpm run typecheck
git add src/state/pipeline-state.ts src/arbiter/review-policy.ts tests/unit/review-policy.spec.ts tests/unit/routing.spec.ts
git commit -m "feat(state): add decisionAudit and deterministic review approval policy"
```

---

### Task 6: Exports públicos y verificación final

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: API pública del paquete que incluye los nuevos módulos.

- [ ] **Step 1: Añadir los exports a `src/index.ts`**

Añadir tras las líneas existentes:

```ts
export * from "./arbiter/rules.js";
export * from "./arbiter/decision-engine.js";
export * from "./arbiter/jev-decision-engine.js";
export * from "./arbiter/review-policy.js";
```

- [ ] **Step 2: Verificación completa**

Run: `pnpm run typecheck && pnpm test && pnpm run build`
Expected: typecheck limpio; 45 tests en verde; build genera `dist/index.js`, `dist/cli/index.js` y los `.d.ts` sin errores.

- [ ] **Step 3: Comprobación de los criterios de aceptación de la spec**

Verificar manualmente:

1. Con `CROUPIER_DECISION_ENGINE=rule` (default), `createDecisionEngine()` devuelve `RuleDecisionEngine`, no se importa `@typesafe-ai/sdk` y no se requiere API key.
2. Con `engine=jev` y `TYPESAFE_API_KEY` definida, `createDecisionEngine()` construye el motor Jev; con confianza baja o error, `classifyReviewIssues` cae a reglas (`usedFallback: true`).
3. Ninguna `conditional edge` de `src/graph/routing.ts` realiza I/O.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: export decision port and Jev engine from package entrypoint"
```

---

## Self-Review

**1. Cobertura de la spec**

- §4 Arquitectura y flujo → Tasks 1–4 (`RuleDecisionEngine`, `classifyReviewIssues`, `JevDecisionEngine`, factory).
- §5 Contratos → Task 1 (tipos), Task 4 (`createDecisionEngine`).
- §6 Mapeo Jev (Choice por issue, estado filtrado) → Task 3.
- §7 Gate de confianza y fallback → Task 2 (gate por issue y fallback total ante error) + Task 4 (umbral).
- §8 Política del motor de reglas → Task 1.
- §9 Cambios de estado (`decisionAudit`) → Task 5.
- §10 Configuración y credenciales (env, precedencia, import perezoso) → Task 3 (lazy import) + Task 4 (env y credenciales).
- §11 Estrategia de tests → cada tarea con TDD; sin red (fake client en Task 3).
- §12 Criterios de aceptación → Task 6, Step 3.
- `deriveReviewApproved` (mencionado en §4/§9) → Task 5.

**2. Placeholder scan:** sin `TBD`/`TODO`; cada paso de código incluye el código real.

**3. Consistencia de tipos:** `DecisionEngine.classifyReviewIssueSeverities`, `ClassifiedSeverity { severity, confidence, engine }`, `DecisionAuditEntry`, `DecisionOutcome`, `JevProviderConfig`, `ResolvedJevProvider` se usan con los mismos nombres y formas en todas las tareas. `createJevDecisionEngine` recibe `{ apiKey, model, baseUrl? }`, que coincide con `ResolvedJevProvider`.