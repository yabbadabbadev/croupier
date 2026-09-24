# Specification: @yabbadabbadev/croupier

**Version:** 1.0.0  
**Package:** `@yabbadabbadev/croupier`  
**Binary:** `croupier`  
**Paradigm:** Deterministic Multi-Agent State Machine (Graph-based SDD)

---

## 1. Vision & Core Philosophy

`croupier` es un arnés CLI autónomo para desarrollo frontend modular en TypeScript. Adopta la metáfora del croupier de casino:

- **Reparte el juego:** Descompone especificaciones y asigna ficheros atómicos a los agentes.
- **Aplica las reglas de la mesa:** Impone contratos estrictos (TDD, Clean Code, accesibilidad WCAG 2.2 AA).
- **Valida deterministamente las apuestas:** Ningún código se acepta sin el veredicto conjunto del compilador (`tsc`), la suite de tests (`vitest`), el inspector de accesibilidad en vivo (`chrome-devtools-mcp`) y el árbitro de decisiones no-LLM (Jev Arbiter).

La premisa fundamental es desacoplar de forma tajante los **motores generativos** (LLMs que generan código, tests o reviews) de los **árbitros deterministas** (CLI nativo, motor no-LLM de baja latencia y herramientas de inspección runtime).

---

## 2. Directory Structure

```text
croupier/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── ARCHITECTURE_SPEC.md
├── src/
│   ├── index.ts                     # Export público del paquete
│   ├── cli/
│   │   ├── index.ts                 # Entrypoint ejecutable (CLI)
│   │   └── ui.ts                    # Renderizado interactivo con @clack/prompts
│   ├── state/
│   │   ├── pipeline-state.ts        # Annotation y esquemas de estado LangGraph
│   │   └── types.ts                 # Interfaces auxiliares (ReviewIssue, ArbiterDecision, VerificationResult)
│   ├── arbiter/
│   │   ├── jev-arbiter.ts           # Motor de decisión no-LLM (evaluador funcional puro)
│   │   └── rules.ts                 # Heurísticas de corte y pesos de error
│   ├── nodes/
│   │   ├── orchestrator.node.ts     # Generador de spec atómica y alcance
│   │   ├── test-writer.node.ts      # Generador TDD (tests unitarios/integración en rojo)
│   │   ├── implementer.node.ts      # Generador/refactorizador de código funcional
│   │   ├── verifier.node.ts         # Wrapper determinista CLI (tsc + vitest)
│   │   ├── a11y-visual.node.ts      # Inspector MCP (Chrome DevTools + WCAG + consola web)
│   │   └── reviewer.node.ts         # Auditor de Clean Code y principios de diseño
│   ├── mcp/
│   │   ├── client.ts                # Conector Stdio con chrome-devtools-mcp
│   │   └── tools.ts                 # Mapeo a DynamicStructuredTool de LangChain
│   └── graph/
│       ├── builder.ts               # Ensamblado del StateGraph de LangGraph
│       └── routing.ts               # Funciones de bifurcación condicional
└── tests/
    ├── unit/
    │   ├── arbiter.spec.ts          # Pruebas del motor determinista Jev
    │   └── routing.spec.ts          # Pruebas de bifurcaciones de la máquina de estados
    └── integration/
        └── pipeline-flow.spec.ts    # Ejecución completa del grafo con mocks
```

---

## 3. Package Configuration & Build System

### 3.1 `package.json`

```json
{
  "name": "@yabbadabbadev/croupier",
  "version": "0.1.0",
  "description": "Deterministic multi-agent state-machine pipeline for frontend engineering",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "croupier": "./dist/cli/index.js"
  },
  "files": ["dist", "README.md", "ARCHITECTURE_SPEC.md"],
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "pnpm run typecheck && pnpm run test && pnpm run build"
  },
  "dependencies": {
    "@clack/prompts": "^0.8.2",
    "@langchain/core": "^0.3.40",
    "@langchain/langgraph": "^0.2.54",
    "@langchain/openai": "^0.4.4",
    "@modelcontextprotocol/sdk": "^1.6.0",
    "chalk": "^5.4.1",
    "dotenv": "^16.4.7",
    "execa": "^9.5.2",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/node": "^22.13.9",
    "tsup": "^8.4.0",
    "typescript": "^5.8.2",
    "vitest": "^3.0.7"
  }
}
```

### 3.2 `tsup.config.ts`

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  banner: {
    js: '#!/usr/bin/env node',
  },
})
```

### 3.3 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## 4. State Definition & Contract Schemas

### 4.1 `src/state/types.ts`

```typescript
export type Severity = 'blocker' | 'warning'

export interface ReviewIssue {
  file: string
  line?: number
  severity: Severity
  description: string
}

export interface VerificationResult {
  passed: boolean
  typeCheckPassed: boolean
  unitTestsPassed: boolean
  output: string
  failedTestNames: string[]
}

export type ArbiterAction =
  | 'PROCEED_TO_A11Y'
  | 'RETRY_IMPLEMENTATION'
  | 'ESCALATE_LIMIT_REACHED'
  | 'ESCALATE_CRITICAL_FAILURE'

export interface ArbiterEvaluation {
  action: ArbiterAction
  reason: string
  remainingRetries: number
}
```

### 4.2 `src/state/pipeline-state.ts`

```typescript
import { Annotation } from "@langchain/langgraph";
import { ReviewIssue, VerificationResult, ArbiterEvaluation } from "./types.js";

export const PipelineAnnotation = Annotation.Root({
  requirement: Annotation<string>(),
  spec: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  targetFiles: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  testFiles: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  verification: Annotation<VerificationResult null |>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  arbiterEvaluation: Annotation<ArbiterEvaluation null |>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  a11yPassed: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  a11yIssues: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  reviewApproved: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  reviewIssues: Annotation<ReviewIssue[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  retriesLeft: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 3,
  }),
  logs: Annotation<string[]>({
    reducer: (curr, next) => curr.concat(next),
    default: () => [],
  }),
});

export type PipelineState = typeof PipelineAnnotation.State;
```

---

## 5. Non-LLM Arbiter: Jev Engine Specification

El módulo `src/arbiter/jev-arbiter.ts` procesa el estado de forma completamente funcional y determinista, sin generar tokens de lenguaje ni introducir latencia autoregresiva:

```typescript
import { VerificationResult, ArbiterEvaluation } from '../state/types.js'

export function evaluateVerificationState(
  verification: VerificationResult | null,
  retriesLeft: number,
): ArbiterEvaluation {
  if (!verification) {
    return {
      action: 'ESCALATE_CRITICAL_FAILURE',
      reason: 'No se obtuvo resultado de ejecución de pruebas.',
      remainingRetries: retriesLeft,
    }
  }

  if (verification.passed) {
    return {
      action: 'PROCEED_TO_A11Y',
      reason: 'TypeScript y suite de Vitest superados con éxito.',
      remainingRetries: retriesLeft,
    }
  }

  if (retriesLeft <= 1) {
    return {
      action: 'ESCALATE_LIMIT_REACHED',
      reason: `Presupuesto de reintentos agotado tras fallos: ${verification.failedTestNames.join(', ')}`,
      remainingRetries: 0,
    }
  }

  return {
    action: 'RETRY_IMPLEMENTATION',
    reason: `Fallo detectado (${verification.typeCheckPassed ? 'Tests' : 'Tipado'}). Reintentos restantes: ${retriesLeft - 1}`,
    remainingRetries: retriesLeft - 1,
  }
}
```

---

## 6. Nodes & External Tooling Contracts

### 6.1 `orchestrator.node.ts` (LLM via DeepSeek)

- **Input:** `state.requirement`.
- **Output:** `spec` atómico en Markdown con firmas de interfaces, `targetFiles: string[]`, `testFiles: string[]` y `retriesLeft: 3`.
- **Restricción:** No toca código de producción ni genera tests; desglosa contratos y localiza el árbol de dependencias.

### 6.2 `test-writer.node.ts` (LLM via DeepSeek)

- **Input:** `state.spec` y `state.testFiles`.
- **Output:** Archivos de prueba creados físicamente en disco (`*.spec.ts` o `*.spec.tsx`) utilizando Vitest y `@testing-library/react`.
- **Restricción:** TDD estricto. Las aserciones deben validar el comportamiento esperado antes de que exista la implementación (fase Red).

### 6.3 `implementer.node.ts` (LLM via DeepSeek)

- **Input:** `state.spec`, `state.targetFiles`, `state.verification.output`, `state.a11yIssues`, `state.reviewIssues`.
- **Output:** Archivos modificados o creados en `state.targetFiles`.
- **Restricción:** Solo puede escribir en los ficheros declarados en `targetFiles`. Debe cumplir principios de Clean Code, modularidad y convención BEM para clases CSS si procede.

### 6.4 `verifier.node.ts` (CLI Nativo Determinista)

- **Mecanismo:** Ejecuta mediante subproceso:
  1. `pnpm tsc --noEmit`
  2. `pnpm vitest run [testFiles] --reporter=json`
- **Output:** Produce `VerificationResult` con parsing de errores y lista de tests fallidos. No llama a LLMs.

### 6.5 `a11y-visual.node.ts` (MCP Client + Chrome DevTools)

- **Mecanismo:**
  1. Conecta con `chrome-devtools-mcp` vía stdio con `@modelcontextprotocol/sdk`.
  2. Navega a la URL local de desarrollo o render del componente (`http://localhost:5173`).
  3. Ejecuta inspección del árbol de accesibilidad (roles ARIA computados, labels, contrastes WCAG 2.2 AA) y captura excepciones no controladas de la consola web.
- **Output:** `a11yPassed: boolean` y `a11yIssues: string[]`.

### 6.6 `reviewer.node.ts` (LLM via DeepSeek)

- **Input:** `git diff` de `state.targetFiles` contra la rama base y `state.spec`.
- **Output:** `reviewApproved: boolean` y lista estructurada de `ReviewIssue`.
- **Restricción:** Verifica ausencia de tipos `any`, cumplimiento de Clean Code, mantenibilidad y cobertura de los requerimientos originales.

---

## 7. Graph Topology & State Machine Routing

### 7.1 Diagrama del Grafo

```text
               ┌────────────────────────┐
               │         START          │
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
               │ 1. Spec Orchestrator   │ ─── Define spec atómica y target/test files
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
               │ 2. Test Writer (TDD)   │ ─── Genera tests en rojo (Vitest)
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
      ┌──────► │ 3. Implementer Node    │ ─── Escribe/refactoriza código de producción
      │        └───────────┬────────────┘
      │                    │
      │                    ▼
      │        ┌────────────────────────┐
      │        │ 4. Deterministic Ver.  │ ─── CLI: tsc --noEmit + vitest run
      │        └───────────┬────────────┘
      │                    │
      │                    ▼
      │        ┌────────────────────────┐
      │        │ 5. Jev Arbiter Node    │ ─── Evaluación determinista sin LLM
      │        └───────────┬────────────┘
      │                    │
 (FAIL && retries > 0)     ├────────────────────────────────────┐
      │                    ▼                                    ▼
      └──────────── [¿Tests & Types OK?]              (retries_left <= 0)
                           │                                    │
                         (PASS)                                 ▼
                           │                          ┌──────────────────┐
                           ▼                          │  ESCALATE_HUMAN  │
               ┌────────────────────────┐             └──────────────────┘
               │ 6. A11y & Visual MCP   │ ─── Chrome DevTools MCP (WCAG / Console)
               └───────────┬────────────┘
                           │
 (FAIL && retries > 0)     ├────────────────────────────────────┐
      │                    ▼                                    ▼
      └──────────── [¿A11y/Visual OK?]                (retries_left <= 0)
                           │                                    │
                         (PASS)                                 ▼
                           │                          ┌──────────────────┐
                           ▼                          │  ESCALATE_HUMAN  │
               ┌────────────────────────┐             └──────────────────┘
               │ 7. Code Reviewer Node  │ ─── Clean Code y principios de diseño
               └───────────┬────────────┘
                           │
                           ├────────────────────────────────────┐
                           ▼                                    ▼
                  [¿Review Aprobado?]                     (Rechazado)
                           │                                    │
                        (PASS)                                  └──────┐
                           │                                           │
                           ▼                                           ▼
               ┌────────────────────────┐                    (Retorna a Implementer)
               │          END           │
               └────────────────────────┘
```

### 7.2 Lógica de Enrutado (`src/graph/routing.ts`)

```typescript
import { END } from '@langchain/langgraph'
import { PipelineState } from '../state/pipeline-state.js'

export function routeAfterArbiter(
  state: PipelineState,
): 'a11y_visual' | 'implementer' | typeof END {
  const evaluation = state.arbiterEvaluation
  if (!evaluation) return END

  switch (evaluation.action) {
    case 'PROCEED_TO_A11Y':
      return 'a11y_visual'
    case 'RETRY_IMPLEMENTATION':
      return 'implementer'
    case 'ESCALATE_LIMIT_REACHED':
    case 'ESCALATE_CRITICAL_FAILURE':
    default:
      return END
  }
}

export function routeAfterA11y(
  state: PipelineState,
): 'code_review' | 'implementer' | typeof END {
  if (state.a11yPassed) {
    return 'code_review'
  }
  if (state.retriesLeft <= 0) {
    return END
  }
  return 'implementer'
}

export function routeAfterReview(
  state: PipelineState,
): typeof END | 'implementer' {
  if (state.reviewApproved || state.retriesLeft <= 0) {
    return END
  }
  return 'implementer'
}
```

---

## 8. Circuit Breakers & Invariants

1. **Límite de Reintentos (Max Retries):** Máximo de 3 ciclos de corrección por feature. Si el contador llega a cero, el pipeline aborta de inmediato y escala el reporte a la terminal.
2. **Higiene de Contexto:** Ningún nodo recibe el historial conversacional completo. El implementador solo recibe la especificación, el último diff y los errores del verificador o del árbitro.
3. **Restricción de Alcance (No Phantom Edits):** Si un agente intenta modificar un archivo que no figure en `targetFiles`, la operación es rechazada a nivel de herramienta de sistema de ficheros.
