# Design: Jev Decision Port para `@yabbadabbadev/croupier`

**Fecha:** 2026-09-21  
**Estado:** Aprobado en brainstorming, pendiente de plan de implementación  
**Ámbito:** Extensión de `src/arbiter/` para hacer intercambiables los puntos de decisión difusos del pipeline (motor determinista por defecto; motor Jev opcional).

---

## 1. Contexto y problema

`croupier` (§1 de `ARCHITECTURE_SPEC.md`) separa explícitamente:

- **motores generativos** (LLMs que generan código, tests y reviews), y
- **árbitros deterministas** (compilador, tests, herramientas de inspección y un motor de decisión no-LLM).

Hoy conviven dos formas de decidir:

1. **Reglas duras y puras** — `evaluateVerificationState` (arbiter) y las funciones de `src/graph/routing.ts` leen booleanos, listas de tests y `retriesLeft`. Son deterministas, gratis, offline y testeables.
2. **Juicio generativo embebido** — el `reviewer.node` (LLM DeepSeek) produce `reviewApproved` y `ReviewIssue.severity` como parte de su generación. Es flexible pero lento, no determinista, sin confianza calibrada, con salida no tipada y de coste variable.

No existe ningún punto de decisión **intercambiable**: los puntos difusos están enterrados dentro de un nodo LLM, y no hay forma de sustituir ese juicio por una primitiva más barata/rápida/tipificada sin reescribir el nodo.

`typesafe/jev-1.13` ("Jev") es un modelo de **decisiones estructuradas** (System One) que devuelve opciones tipadas y `confidence` calibrada, en ~100 ms y a coste muy bajo. Encaja como motor alternativo para esos puntos difusos. Su documentación insiste, igual que la premisa de croupier, en *"use code when you can"*: el control de flujo pertenece al código y el modelo solo aparece donde hace falta juicio sobre datos no estructurados.

## 2. Objetivo y no-objetivos

**Objetivo**

- Introducir un **Decision Port** que haga explícitos e intercambiables los puntos de decisión difusos.
- Mantener el **determinismo como opción preferente y por defecto** (offline, coste 0).
- Añadir un motor **Jev** opcional, tipado, con `confidence` y **fallback determinista** ante baja confianza o error.
- Que todo sea testeable **sin red** y sin API key.

**No-objetivos (fuera de alcance de este diseño)**

- Implementar los nodos LLM reales (DeepSeek) ni el `reviewer.node`.
- MCP / inspección de accesibilidad (`a11y-visual.node`).
- Intake de specs complejas y ejecución **multi-slice** (ciclo propio posterior).
- Cambiar la topología del grafo o las funciones de routing.

## 3. Decisión y rationale

Se adopta el **Enfoque 1 — Decision Port con adaptadores**.

- **Contrato único** por punto de decisión; dos implementaciones: `RuleDecisionEngine` (default) y `JevDecisionEngine`.
- **El port se invoca en nodos, nunca en las `conditional edges`.** El routing sigue leyendo solo estado (`boolean`, `retriesLeft`) y permanece puro. Esto preserva la testabilidad determinista del grafo.
- **Gate de confianza + fallback**: resultado de Jev usable solo si `confidence >= umbral`; en caso contrario (o ante error) se cae al motor de reglas. El pipeline nunca falla por culpa de Jev.
- **SDK desacoplado**: el motor Jev depende de una interfaz mínima propia (`SystemOneClient`) inyectada; el SDK real se carga de forma perezosa. El camino por defecto (`rule`) no carga ni el SDK.

Alternativas descartadas: un nodo "advisor" en el grafo (acopla la topología al motor) y el uso de Jev solo fuera del bucle de retry (no unifica el punto de decisión).

## 4. Arquitectura y flujo

```
reviewer.node (LLM, stub)
      │  issues: ReviewIssue[]
      ▼
classifyReviewIssues(engine, inputs, opts)   ← función pura orquestadora
      │
      ├─► engine.classifyReviewIssueSeverities(inputs)   (una sola llamada)
      │        ├─ RuleDecisionEngine  (default, offline)
      │        └─ JevDecisionEngine   (SystemOneClient inyectado)
      │
      ├─► gate por issue: confidence >= threshold ?
      │        ├─ sí  → severidad de Jev  (engine: "jev")
      │        └─ no  → fallback a reglas (engine: "rule", usedFallback: true)
      │
      ▼
{ issues: ReviewIssue[], audit: DecisionAuditEntry[] }
      │
      ▼
reviewApproved = !issues.some(i => i.severity === "blocker")   (determinista)
      │
      ▼
routing.ts  (sin cambios; sigue leyendo estado)
```

Componentes:

- `src/arbiter/decision-engine.ts` — tipos del port, interfaz `DecisionEngine`, orquestador `classifyReviewIssues` y factory `createDecisionEngine(config)`.
- `src/arbiter/rules.ts` — `RuleDecisionEngine`.
- `src/arbiter/jev-decision-engine.ts` — `JevDecisionEngine` + `createJevDecisionEngine()` con import perezoso.

## 5. Contratos

```ts
// src/state/types.ts
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

export interface JevProviderConfig {
  baseUrl?: string; // SDK default ("https://api.typesafe.ai"; el SDK añade /v1)
  apiKey?: string; // resuelto por credenciales; nunca se registra
  apiKeyEnv?: string; // default "TYPESAFE_API_KEY"
  model?: string; // default "jev-1.13"
}

export interface DecisionEngineConfig {
  engine: "rule" | "jev";
  confidenceThreshold: number; // default 0.8
  provider?: JevProviderConfig;
}
```

Orquestador (en `decision-engine.ts`):

```ts
export function classifyReviewIssues(
  primary: DecisionEngine,
  fallback: DecisionEngine,
  inputs: ClassifySeverityInput[],
  confidenceThreshold: number
): Promise<{ issues: ReviewIssue[]; audit: DecisionAuditEntry[] }>;
```

Reglas de la orquestación:

1. Se llama **una sola vez** a `primary.classifyReviewIssueSeverities(inputs)` con todos los issues.
2. Si la llamada lanza (error de red, timeout, etc.) → **todos** los issues usan `fallback`, con `usedFallback: true`.
3. Por issue, si `confidence >= confidenceThreshold` → se usa la severidad del primary (`engine: "jev"`); si no → se usa el fallback para ese issue (`engine: "rule"`, `usedFallback: true`).
4. La severidad resultante se escribe en `ReviewIssue.severity`; se emite una entrada de `DecisionAuditEntry` por issue.

## 6. Mapeo Jev concreto

Se sigue el patrón *parallel questions*: **una sola llamada** `systemOne` con una pregunta `Choice` por issue (se evalúan en paralelo; coste marginal bajo).

Estado filtrado (evitar context rot; nada de diff completo):

```ts
state = { spec, targetFiles, issues } // issues = ReviewIssue[]
```

Preguntas (IDs `issue_0..issue_N`, referenciando el estado con rutas entre backticks):

```ts
questions = {
  issue_0: choice(
    "Classify the severity of `issues[0]` for the change described by `spec`",
    {
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
    }
  ),
  issue_1: choice(/* ... */),
  // ...
};
```

Lectura de la respuesta: `answer = answers[`issue_${i}`]` → `answer.choice` (`blocker`|`warning`) y `answer.confidence`. La salida está constreñida a las opciones ofrecidas; no se parsea texto libre.

## 7. Gate de confianza y fallback

- Umbral configurable `CROUPIER_CONFIDENCE_THRESHOLD` (default `0.8`).
- `confidence >= umbral` → se usa Jev.
- `confidence < umbral` **o** error/timeout del SDK → fallback al motor de reglas para ese issue, con `usedFallback: true`, y registro en `logs`.
- El resultado global nunca depende de que Jev esté disponible.

## 8. Política del motor de reglas (default)

`RuleDecisionEngine` es determinista, offline y de coste 0:

- `blocker` si el issue ya viene como `blocker`, **o** si su descripción coincide con patrones críticos: `any`, accesibilidad/WCAG, seguridad, tipos.
- `warning` en cualquier otro caso.
- `confidence` fija en `1.0`; `engine: "rule"`.

## 9. Cambios de estado

Se añade a `PipelineAnnotation` (`src/state/pipeline-state.ts`):

```ts
decisionAudit: Annotation<DecisionAuditEntry[]>({
  reducer: (curr, next) => curr.concat(next),
  default: () => [],
}),
```

`reviewIssues` sigue siendo la fuente de la verdad; `decisionAudit` solo registra procedencia. Ripple: añadir el campo al helper `makeState` de `tests/unit/routing.spec.ts`.

## 10. Configuración y credenciales

| Variable | Valores | Default | Uso |
| --- | --- | --- | --- |
| `CROUPIER_DECISION_ENGINE` | `rule` \| `jev` | `rule` | Motor primario |
| `CROUPIER_CONFIDENCE_THRESHOLD` | número | `0.8` | Umbral del gate |
| `TYPESAFE_API_KEY` | string | — | Credencial por defecto del motor Jev |
| `TYPESAFE_MODEL` | string | `jev-1.13` | Modelo Jev |

**Credenciales con precedencia conmutable.** El motor Jev no fija el proveedor: recibe `JevProviderConfig` (`baseUrl`, `apiKeyEnv`, `model`) y resuelve la credencial con esta precedencia:

1. `apiKey` explícita en config (no recomendado en ficheros versionados).
2. Variable de entorno indicada por `apiKeyEnv` (default `TYPESAFE_API_KEY`).
3. Fichero `.env` del proyecto (vía `dotenv`).
4. Prompt interactivo (solo en CLI, si falta y el motor es `jev`).

Las claves nunca se escriben en `logs` ni en el estado. Solo se exige la credencial del proveedor **realmente usado**: con `rule` (default) no se requiere ninguna.

**Sobre "una única key".** El endpoint de Jev es propio (`POST {baseUrl}/systemone`, `Authorization: Bearer`), **no** `chat/completions`. Por tanto una sola API key de OpenRouter cubre los nodos LLM generativos (ciclo futuro), pero **no** a Jev por defecto. `baseUrl` queda configurable para permitir enrutar Jev por una pasarela compatible si en el futuro se verifica; mientras tanto, Jev requiere `TYPESAFE_API_KEY` o se usa el motor `rule`.

**Desacople del SDK.** `@typesafe-ai/sdk` se carga con `await import(...)` dentro de `createJevDecisionEngine()`. Con `CROUPIER_DECISION_ENGINE=rule` el SDK nunca se carga. El motor recibe un `SystemOneClient` con interfaz propia mínima:

```ts
export interface SystemOneClient {
  systemOne(req: { state: unknown; questions: unknown }): Promise<{
    answers: Record<string, { choice: string; confidence: number }>;
  }>;
}
```

El cliente real satisface esta interfaz; los tests inyectan un fake.

## 11. Estrategia de tests (TDD, sin red)

- `tests/unit/decision-engine.spec.ts`
  - Motor de reglas: pass-through de `blocker`; detección de patrones críticos (`any`, a11y/WCAG, seguridad, tipos); default `warning`.
  - Gate: alta confianza usa el primario; baja confianza hace fallback por issue; error del primario hace fallback total.
  - Se emiten entradas de `audit` correctas (`engine`, `selected`, `confidence`, `usedFallback`).
- `tests/unit/jev-decision-engine.spec.ts` (fake `SystemOneClient`, sin red)
  - Mapea `choice`+`confidence` a `ClassifiedSeverity` con `engine: "jev"`.
  - Hace **una sola** llamada con una pregunta por issue.
  - Propaga errores del cliente para que el gate haga fallback.
- `tests/unit/review-policy.spec.ts`
  - `reviewApproved = !issues.some(i => i.severity === "blocker")`.
- `tests/unit/routing.spec.ts`
  - Se actualiza `makeState` con `decisionAudit`; los tests existentes siguen verdes.

## 12. Criterios de aceptación

1. Con `CROUPIER_DECISION_ENGINE=rule` (default): sin red, sin cargar `@typesafe-ai/sdk`, resultado 100% determinista.
2. Con `jev` y API key: clasifica con `confidence` y cae a reglas cuando `confidence < umbral` o hay error.
3. `pnpm run typecheck` limpio y `pnpm test` en verde, incluidos los tests nuevos y los existentes.
4. Ninguna `conditional edge` realiza I/O; el routing sigue siendo puro.

## 13. Riesgos y notas

- **Jev no es determinista bit a bit** (aunque es self-consistente y calibrado): por eso el default es `rule` y los tests mockean el cliente.
- **Jaggedness de Jev** (documentada por TypeSafe): lectura literal, mal en matemáticas/conteo/fechas e indirección; sensible al context rot y a contenido adversarial. El estado se filtra al mínimo y las preguntas son atómicas. No usar Jev para decisiones multi-salto (p. ej. "¿falló el test o la implementación?"); para eso, descomponer o usar un modelo generativo.
- **`confidence` es un eje aparte**: el gate compara contra el umbral y decide actuar o escalar/fallback.
- La spec `ARCHITECTURE_SPEC.md` sigue siendo la fuente de verdad del pipeline; este documento define una extensión de `src/arbiter/`.

## 14. Trabajo futuro relacionado (no incluido aquí)

- Más puntos de decisión sobre el mismo port: severidad/auto-corrección de a11y, intención del requisito en el intake, decisión de escalada con `Noul`.
- Implementación real de los nodos LLM (DeepSeek) y de MCP/a11y.
- Intake de specs y ejecución **multi-slice** (secuencial/paralelo) como ciclo de diseño independiente.