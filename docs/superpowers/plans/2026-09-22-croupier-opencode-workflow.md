# Croupier — Workflow opencode-native: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un workflow opencode-native por repositorio: un agente orquestador, subagentes especialistas, una skill de procedimiento y scripts deterministas para verificación y diff visual.

**Architecture:** Se declaran agentes en `.opencode/agent/`, una skill en `.opencode/skill/` y un comando en `.opencode/command/`. Los invariantes (verificación con `tsc`+`vitest`, diff de píxeles) viven en scripts Node sin LLM bajo `scripts/`. El orquestador (agente primario) guía el flujo por slice y se detiene en un gate humano. Ningún agente fija `model`: los subagentes heredan el del orquestador.

**Tech Stack:** opencode (agentes/skills/comandos/MCP), Node ≥20 (ESM), Vitest, YAML, `pixelmatch`+`pngjs`, `chrome-devtools-mcp`.

**Spec:** `docs/superpowers/specs/2026-09-22-croupier-opencode-workflow-design.md`

## Global Constraints

- Todo vive bajo `.opencode/` (agentes en `.opencode/agent/<name>.md`, skills en `.opencode/skill/<name>/SKILL.md`, comandos en `.opencode/command/<name>.md`) más `scripts/`.
- Los ficheros de agente usan frontmatter YAML. Campos permitidos: `name, model, variant, description, mode, hidden, color, steps, options, permission, disable, temperature, top_p`. El **body** es el prompt; **no** poner `prompt:` en el frontmatter.
- **Ningún agente fija `model`.** Los subagentes heredan el modelo del orquestador; el orquestador, el global del usuario.
- Prefijo de agente `croupier-`. Subagentes con `mode: subagent` y `hidden: true`. El orquestador con `mode: primary` (no hidden).
- Los scripts de invariantes (`scripts/verify.mjs`, `scripts/visual-diff.mjs`) son ESM, sin red y sin LLM.
- Rutas de import relativas con extensión `.js` **solo** aplica a `src/` (código TS del paquete); los scripts `.mjs` usan ESM nativo.
- Tras cambiar cualquier config de opencode, hay que **reiniciar opencode** (no hay hot-reload).
- Tras cada tarea: `pnpm test` y `pnpm run typecheck` en verde, y commit.
- No añadir comentarios al código de producción salvo que un paso lo indique.

---

## File Structure

- `scripts/verify.mjs` (crear) — verificación determinista `tsc`+`vitest` → JSON.
- `scripts/visual-diff.mjs` (crear) — diff de píxeles entre dos PNG.
- `tests/workflow/verify.spec.ts` (crear) — tests de `scripts/verify.mjs`.
- `tests/workflow/visual-diff.spec.ts` (crear) — tests de `scripts/visual-diff.mjs`.
- `.opencode/agent/croupier-orchestrator.md` (crear) — agente primario.
- `.opencode/agent/croupier-planner.md` (crear) — subagente.
- `.opencode/agent/croupier-test-writer.md` (crear) — subagente.
- `.opencode/agent/croupier-implementer.md` (crear) — subagente.
- `.opencode/agent/croupier-reviewer.md` (crear) — subagente.
- `.opencode/agent/croupier-visual-reporter.md` (crear) — subagente.
- `tests/workflow/agents.spec.ts` (crear) — validación de las definiciones de agente.
- `.opencode/skill/croupier-workflow/SKILL.md` (crear) — procedimiento.
- `.opencode/command/croupier.md` (crear) — comando `/croupier`.
- `tests/workflow/skill-command.spec.ts` (crear) — validación de skill y comando.
- `.opencode/opencode.json` (crear) — config de proyecto (MCP de Chrome).
- `tests/workflow/project-config.spec.ts` (crear) — validación de la config.
- `docs/croupier-workflow.md` (crear) — uso, parametrización de modelos y checklist de aceptación manual.
- `.gitignore` (modificar) — ignorar `.croupier/`.

---

### Task 1: Script determinista `verify`

**Files:**
- Create: `scripts/verify.mjs`
- Test: `tests/workflow/verify.spec.ts`

**Interfaces:**
- Produces: `summarizeVerification({ typeCheckExitCode, typeCheckOutput, testExitCode, testReport, testOutput })` → `{ passed, typeCheckPassed, unitTestsPassed, output, failedTestNames }`.
- `testReport` tiene forma de reporter JSON de Vitest/Jest: `{ testResults?: Array<{ name: string, assertionResults?: Array<{ title?: string, fullName?: string, status: string }> }> }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/workflow/verify.spec.ts`:

```ts
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
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm test tests/workflow/verify.spec.ts`
Expected: FAIL — `Cannot find module '../../scripts/verify.mjs'`.

- [ ] **Step 3: Implementar `scripts/verify.mjs`**

```js
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
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm test tests/workflow/verify.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck y commit**

```bash
pnpm run typecheck
git add scripts/verify.mjs tests/workflow/verify.spec.ts
git commit -m "feat(workflow): add deterministic verify script"
```

---

### Task 2: Script determinista `visual-diff`

**Files:**
- Modify: `package.json` (devDependencies) y `pnpm-lock.yaml` (vía `pnpm install`)
- Create: `scripts/visual-diff.mjs`
- Test: `tests/workflow/visual-diff.spec.ts`

**Interfaces:**
- Consumes: `pixelmatch`, `pngjs`.
- Produces: `diffPngs(bufferA: Uint8Array, bufferB: Uint8Array, options?)` → `{ diffPixels: number, totalPixels: number, ratio: number, diffPng: Uint8Array }`. Lanza si las dimensiones difieren.

- [ ] **Step 1: Añadir las dependencias**

```bash
pnpm add -D pixelmatch pngjs
```

- [ ] **Step 2: Escribir el test que falla**

Crear `tests/workflow/visual-diff.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { diffPngs } from "../../scripts/visual-diff.mjs";

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe("diffPngs", () => {
  it("da ratio 0 para imágenes idénticas", () => {
    const a = solidPng(10, 10, [255, 0, 0]);
    const b = solidPng(10, 10, [255, 0, 0]);
    const result = diffPngs(a, b);
    expect(result.diffPixels).toBe(0);
    expect(result.ratio).toBe(0);
    expect(result.totalPixels).toBe(100);
  });

  it("cuenta los píxeles distintos", () => {
    const a = solidPng(10, 10, [255, 0, 0]);
    const b = solidPng(10, 10, [0, 0, 255]);
    const result = diffPngs(a, b);
    expect(result.diffPixels).toBe(100);
    expect(result.ratio).toBe(1);
    expect(result.diffPng.length).toBeGreaterThan(0);
  });

  it("lanza si las dimensiones difieren", () => {
    const a = solidPng(10, 10, [0, 0, 0]);
    const b = solidPng(20, 10, [0, 0, 0]);
    expect(() => diffPngs(a, b)).toThrow("dimensions");
  });
});
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `pnpm test tests/workflow/visual-diff.spec.ts`
Expected: FAIL — `Cannot find module '../../scripts/visual-diff.mjs'`.

- [ ] **Step 4: Implementar `scripts/visual-diff.mjs`**

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export function diffPngs(bufferA, bufferB, options = {}) {
  const a = PNG.sync.read(Buffer.from(bufferA));
  const b = PNG.sync.read(Buffer.from(bufferB));

  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`
    );
  }

  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: options.threshold ?? 0.1,
  });
  const totalPixels = a.width * a.height;

  return {
    diffPixels,
    totalPixels,
    ratio: totalPixels === 0 ? 0 : diffPixels / totalPixels,
    diffPng: PNG.sync.write(diff),
  };
}

function main() {
  const [beforePath, afterPath, diffPath] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    process.stderr.write("usage: visual-diff <before.png> <after.png> [diff.png]\n");
    process.exit(2);
  }

  const result = diffPngs(readFileSync(beforePath), readFileSync(afterPath));
  if (diffPath) {
    writeFileSync(diffPath, result.diffPng);
  }

  process.stdout.write(
    JSON.stringify(
      { ratio: result.ratio, diffPixels: result.diffPixels, totalPixels: result.totalPixels, diffPath: diffPath ?? null },
      null,
      2
    )
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pnpm test tests/workflow/visual-diff.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck y commit**

```bash
pnpm run typecheck
git add package.json pnpm-lock.yaml scripts/visual-diff.mjs tests/workflow/visual-diff.spec.ts
git commit -m "feat(workflow): add deterministic pixel-diff script"
```

---

### Task 3: Roster de agentes y validación

**Files:**
- Modify: `package.json` (devDependencies `yaml`) y `pnpm-lock.yaml`
- Create: `.opencode/agent/croupier-orchestrator.md`
- Create: `.opencode/agent/croupier-planner.md`
- Create: `.opencode/agent/croupier-test-writer.md`
- Create: `.opencode/agent/croupier-implementer.md`
- Create: `.opencode/agent/croupier-reviewer.md`
- Create: `.opencode/agent/croupier-visual-reporter.md`
- Test: `tests/workflow/agents.spec.ts`

**Interfaces:**
- Produces: definiciones de agente con frontmatter YAML. Nombres: `croupier-orchestrator` (primary), `croupier-planner`, `croupier-test-writer`, `croupier-implementer`, `croupier-reviewer`, `croupier-visual-reporter` (subagent, hidden).

- [ ] **Step 1: Añadir la dependencia de parseo YAML**

```bash
pnpm add -D yaml
```

- [ ] **Step 2: Escribir el test que falla**

Crear `tests/workflow/agents.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const AGENTS_DIR = ".opencode/agent";

interface LoadedAgent {
  name: string;
  front: Record<string, any>;
  body: string;
}

function loadAgents(): LoadedAgent[] {
  return readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(join(AGENTS_DIR, file), "utf8");
      const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      if (!match) throw new Error(`Missing frontmatter in ${file}`);
      return { name: file.replace(/\.md$/, ""), front: parse(match[1]), body: match[2] };
    });
}

const agents = loadAgents();
const byName = new Map(agents.map((agent) => [agent.name, agent]));

describe("definiciones de agente", () => {
  it("define exactamente el roster esperado", () => {
    const names = agents.map((agent) => agent.name).sort();
    expect(names).toEqual([
      "croupier-implementer",
      "croupier-orchestrator",
      "croupier-planner",
      "croupier-reviewer",
      "croupier-test-writer",
      "croupier-visual-reporter",
    ]);
  });

  it("no fija model en ningún agente", () => {
    for (const agent of agents) {
      expect(agent.front.model).toBeUndefined();
    }
  });

  it("el orquestador es primary y no hidden", () => {
    const orchestrator = byName.get("croupier-orchestrator")!;
    expect(orchestrator.front.mode).toBe("primary");
    expect(orchestrator.front.hidden).not.toBe(true);
  });

  it("el orquestador solo puede invocar subagentes croupier-*", () => {
    const orchestrator = byName.get("croupier-orchestrator")!;
    expect(orchestrator.front.permission.task).toMatchObject({
      "*": "deny",
      "croupier-*": "allow",
    });
  });

  it("todos los subagentes son subagent y hidden", () => {
    for (const name of [
      "croupier-planner",
      "croupier-test-writer",
      "croupier-implementer",
      "croupier-reviewer",
      "croupier-visual-reporter",
    ]) {
      const agent = byName.get(name)!;
      expect(agent.front.mode).toBe("subagent");
      expect(agent.front.hidden).toBe(true);
    }
  });

  it("el reviewer no puede editar", () => {
    const reviewer = byName.get("croupier-reviewer")!;
    expect(reviewer.front.permission.edit).toBe("deny");
  });

  it("el visual-reporter limita la edición a reportes", () => {
    const reporter = byName.get("croupier-visual-reporter")!;
    expect(reporter.front.permission.edit).toMatchObject({
      "*": "deny",
      "docs/reports/**": "allow",
      ".croupier/reports/**": "allow",
    });
  });

  it("cada agente tiene descripción y prompt no vacíos", () => {
    for (const agent of agents) {
      expect(typeof agent.front.description).toBe("string");
      expect(agent.front.description.length).toBeGreaterThan(0);
      expect(agent.body.trim().length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `pnpm test tests/workflow/agents.spec.ts`
Expected: FAIL — `ENOENT` al leer `.opencode/agent`.

- [ ] **Step 4: Crear `.opencode/agent/croupier-orchestrator.md`**

```markdown
---
description: Orquesta el workflow croupier por slices: planifica, despacha subagentes, aplica el presupuesto de reintentos y se detiene en el gate humano.
mode: primary
temperature: 0.1
permission:
  edit: deny
  bash: allow
  skill: allow
  task:
    "*": deny
    "croupier-*": allow
---

Eres el orquestador de croupier. Siempre cargas y sigues la skill `croupier-workflow`.

Nunca editas código ni ficheros de producción directamente: despachas subagentes con la tool Task y coordinas. Los invariantes los ejecutan scripts deterministas, no tú.

Invoca únicamente subagentes `croupier-*`. Al cerrar un slice, escribe `progress.md` y detente en el gate humano: no avances al siguiente slice sin aprobación explícita.
```

- [ ] **Step 5: Crear `.opencode/agent/croupier-planner.md`**

```markdown
---
description: Convierte un slice de la spec en un plan de implementación por tareas.
mode: subagent
hidden: true
temperature: 0.2
permission:
  edit:
    "*": deny
    "docs/superpowers/plans/**": allow
  bash: deny
---

Eres el planificador de croupier. Recibes un slice y produces un plan de implementación por tareas (TDD, commits frecuentes), siguiendo el estilo de la skill `writing-plans`.

Escribe el plan únicamente bajo `docs/superpowers/plans/`. No toques código de producción ni tests.
```

- [ ] **Step 6: Crear `.opencode/agent/croupier-test-writer.md`**

```markdown
---
description: Escribe tests unitarios en rojo (fase Red de TDD) para un slice.
mode: subagent
hidden: true
temperature: 0.1
permission:
  edit:
    "*": deny
    "**/*.spec.ts": allow
    "**/*.test.ts": allow
    "tests/**": allow
  bash: allow
---

Eres el escritor de tests de croupier. Sigues TDD estricto: escribes las aserciones que describen el comportamiento esperado antes de que exista la implementación (fase Red).

Editas únicamente ficheros de test. Ejecutas los tests con el runner del proyecto y reportas el fallo esperado.
```

- [ ] **Step 7: Crear `.opencode/agent/croupier-implementer.md`**

```markdown
---
description: Implementa el código de producción de un slice hasta poner los tests en verde, sin salirse de targetFiles.
mode: subagent
hidden: true
temperature: 0.1
permission:
  edit: allow
  bash: allow
---

Eres el implementador de croupier. Implementas el código mínimo que hace pasar los tests (fase Green), con Clean Code y sin salirte de los `targetFiles` declarados por el orquestador.

Nunca tocas ficheros fuera de `targetFiles`. Si un test parece incorrecto, lo reportas; no lo editas.
```

- [ ] **Step 8: Crear `.opencode/agent/croupier-reviewer.md`**

```markdown
---
description: Revisa el diff del slice y emite issues con severidad (blocker/warning). Solo lectura.
mode: subagent
hidden: true
temperature: 0.1
permission:
  edit: deny
  bash:
    "*": deny
    "git diff*": allow
    "git log*": allow
    "git status*": allow
---

Eres el revisor de croupier. Revisas el diff contra la spec y emites issues con severidad (`blocker` o `warning`), señalando fichero y motivo.

No editas nada. Solo lees y ejecutas comandos de git de solo lectura.
```

- [ ] **Step 9: Crear `.opencode/agent/croupier-visual-reporter.md`**

```markdown
---
description: Captura pantallas antes/después con chrome-devtools-mcp y genera un informe HTML comparativo.
mode: subagent
hidden: true
temperature: 0.1
permission:
  edit:
    "*": deny
    "docs/reports/**": allow
    ".croupier/reports/**": allow
  bash:
    "*": deny
    "node scripts/visual-diff.mjs*": allow
  "chrome-devtools_*": allow
---

Eres el reporter visual de croupier. Usas las tools de `chrome-devtools-mcp` (`navigate_page`, `resize_page`, `take_screenshot`, `take_snapshot`, `list_console_messages`, `lighthouse_audit`) para capturar rutas de la app.

Guardas PNG con `take_screenshot` (parámetro `filePath`) y ejecutas `node scripts/visual-diff.mjs <before.png> <after.png> <diff.png>` para el ratio de diferencia. Escribes únicamente bajo el directorio de reportes indicado. Si la app no responde, lo reportas sin romper el pipeline.
```

- [ ] **Step 10: Ejecutar el test y verificar que pasa**

Run: `pnpm test tests/workflow/agents.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 11: Typecheck y commit**

```bash
pnpm run typecheck
git add package.json pnpm-lock.yaml .opencode/agent tests/workflow/agents.spec.ts
git commit -m "feat(workflow): declare croupier agent roster with validation"
```

---

### Task 4: Skill de procedimiento y comando `/croupier`

**Files:**
- Create: `.opencode/skill/croupier-workflow/SKILL.md`
- Create: `.opencode/command/croupier.md`
- Test: `tests/workflow/skill-command.spec.ts`

**Interfaces:**
- Consumes: el roster de Task 3 (nombres de subagente), `scripts/verify.mjs` (Task 1), `scripts/visual-diff.mjs` (Task 2).
- Produces: skill `croupier-workflow` y comando `croupier` (agent `croupier-orchestrator`).

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/workflow/skill-command.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const SKILL_PATH = ".opencode/skill/croupier-workflow/SKILL.md";
const COMMAND_PATH = ".opencode/command/croupier.md";

function frontmatter(raw: string): Record<string, any> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error("Missing frontmatter");
  return parse(match[1]);
}

const skillRaw = readFileSync(SKILL_PATH, "utf8");
const commandRaw = readFileSync(COMMAND_PATH, "utf8");

describe("skill croupier-workflow", () => {
  it("declara name igual a la carpeta y una description", () => {
    const front = frontmatter(skillRaw);
    expect(front.name).toBe("croupier-workflow");
    expect(typeof front.description).toBe("string");
    expect(front.description.length).toBeGreaterThan(0);
  });

  it("describe el flujo por slice y el gate humano", () => {
    expect(skillRaw).toMatch(/gate humano/i);
    expect(skillRaw).toContain("progress.md");
    expect(skillRaw).toContain("scripts/verify.mjs");
    expect(skillRaw).toContain("scripts/visual-diff.mjs");
  });

  it("nombra a todos los subagentes del roster", () => {
    for (const name of [
      "croupier-planner",
      "croupier-test-writer",
      "croupier-implementer",
      "croupier-reviewer",
      "croupier-visual-reporter",
    ]) {
      expect(skillRaw).toContain(name);
    }
  });
});

describe("comando croupier", () => {
  it("ejecuta el agente orquestador", () => {
    const front = frontmatter(commandRaw);
    expect(front.agent).toBe("croupier-orchestrator");
    expect(typeof front.description).toBe("string");
  });

  it("tiene un template no vacío", () => {
    const body = commandRaw.split("---")[2] ?? "";
    expect(body.trim().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm test tests/workflow/skill-command.spec.ts`
Expected: FAIL — `ENOENT` al leer `SKILL.md`.

- [ ] **Step 3: Crear `.opencode/skill/croupier-workflow/SKILL.md`**

```markdown
---
name: croupier-workflow
description: Use when implementing a spec that defines ordered slices, one slice at a time, with specialist subagents, deterministic verification, and a human approval gate between slices. Trigger on "croupier", "implement next slice", or "workflow por slices".
---

# Croupier Workflow

Procedimiento del orquestador. Un slice a la vez, con verificación determinista y gate humano.

## Entradas

- `docs/superpowers/specs/<feature>-design.md` — contiene la sección `## Slices` (lista ordenada).
- `progress.md` — ledger de estado (ver Formato).

## Antes de empezar

1. Lee la spec y localiza la sección `## Slices`.
2. Lee `progress.md` si existe; el slice activo es el primero no marcado como `approved`.
3. Si no hay slice activo y quedan slices, propónlo y confírmalo con el humano.

## Flujo por slice

1. **Plan**: despacha `croupier-planner` con el slice. El plan se escribe en `docs/superpowers/plans/`.
2. **Baseline visual** (si el slice lo indica): despacha `croupier-visual-reporter` para capturar `before/` de las rutas declaradas.
3. **Bucle TDD** (presupuesto de reintentos = 3, configurable):
   - despacha `croupier-test-writer` (fase Red),
   - despacha `croupier-implementer` (fase Green),
   - ejecuta `node scripts/verify.mjs` y parsea el JSON.
   - Si `passed` es `false` y quedan reintentos → vuelve al implementer con `failedTestNames` y `output`; decrementa el presupuesto.
   - Si se agota el presupuesto → **escala al humano** y detente.
4. **Review**: despacha `croupier-reviewer`. Si hay issues `blocker`, vuelven al bucle TDD con el mismo presupuesto.
5. **Informe visual**: despacha `croupier-visual-reporter` para capturar `after/`, ejecutar `node scripts/visual-diff.mjs` y escribir `report.html`.
6. **Cerrar el slice**: escribe `progress.md`, resume el resultado y **detente en el gate humano**.
7. **Gate humano**: no avanzas al siguiente slice sin aprobación explícita. Si el humano pide cambios, vuelve al bucle TDD.

## Política de reportes

- `ignore` (default si no hay respuesta): reportes en `.croupier/reports/<slice>/`, no versionados.
- `commit`: reportes en `docs/reports/<slice>/`, versionados.
- `ask`: pregunta al humano en el gate si quiere conservar/commitear.

## Determinismo

- Los invariantes (verificación, presupuesto, gate) los ejecuta código o el orquestador siguiendo reglas, no el juicio del subagente.
- No avances nunca sin `verify` en verde y sin aprobación humana.

## Formato de `progress.md`

```markdown
# Progress — <feature>

- Slice activo: <n>
- Estado: planning | implementing | reviewing | awaiting-human | approved | escalated
- Reintentos usados: <n>/3

## Slices
- [ ] Slice 1 — <título>
- [ ] Slice 2 — <título>

## Auditoría
- <fecha> slice <n>: decisión, verificación, revisión
```
```

- [ ] **Step 4: Crear `.opencode/command/croupier.md`**

```markdown
---
description: Inicia o continúa el workflow croupier por slices.
agent: croupier-orchestrator
---

$ARGUMENTS

Si no hay argumentos, continúa el slice activo según `progress.md` y la spec más reciente en `docs/superpowers/specs/`. Sigue la skill `croupier-workflow` y detente en el gate humano al cerrar el slice.
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pnpm test tests/workflow/skill-command.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck y commit**

```bash
pnpm run typecheck
git add .opencode/skill .opencode/command tests/workflow/skill-command.spec.ts
git commit -m "feat(workflow): add croupier workflow skill and command"
```

---

### Task 5: Config de proyecto (MCP) y política de ignorados

**Files:**
- Create: `.opencode/opencode.json`
- Modify: `.gitignore`
- Test: `tests/workflow/project-config.spec.ts`

**Interfaces:**
- Produces: config de proyecto que habilita el MCP `chrome-devtools` para el `croupier-visual-reporter`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/workflow/project-config.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(".opencode/opencode.json", "utf8"));
const gitignore = readFileSync(".gitignore", "utf8");

describe("config de proyecto", () => {
  it("declara el schema", () => {
    expect(config.$schema).toBe("https://opencode.ai/config.json");
  });

  it("habilita el MCP de chrome-devtools en local y headless", () => {
    const mcp = config.mcp?.["chrome-devtools"];
    expect(mcp).toBeDefined();
    expect(mcp.type).toBe("local");
    expect(Array.isArray(mcp.command)).toBe(true);
    expect(mcp.command.join(" ")).toContain("chrome-devtools-mcp");
    expect(mcp.command).toContain("--headless");
    expect(mcp.enabled).toBe(true);
  });
});

describe("gitignore", () => {
  it("ignora el directorio de reportes por defecto", () => {
    expect(gitignore).toContain(".croupier/");
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm test tests/workflow/project-config.spec.ts`
Expected: FAIL — `ENOENT` al leer `.opencode/opencode.json`.

- [ ] **Step 3: Crear `.opencode/opencode.json`**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "chrome-devtools": {
      "type": "local",
      "command": ["npx", "-y", "chrome-devtools-mcp@latest", "--headless", "--isolated"],
      "enabled": true
    }
  }
}
```

- [ ] **Step 4: Añadir `.croupier/` a `.gitignore`**

Editar `.gitignore` para añadir al final:

```text
.croupier/
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `pnpm test tests/workflow/project-config.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck y commit**

```bash
pnpm run typecheck
git add .opencode/opencode.json .gitignore tests/workflow/project-config.spec.ts
git commit -m "feat(workflow): configure chrome-devtools MCP and ignore reports"
```

---

### Task 6: Documentación de uso y aceptación

**Files:**
- Create: `docs/croupier-workflow.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: guía de uso, parametrización de modelos y checklist de aceptación manual.

- [ ] **Step 1: Crear `docs/croupier-workflow.md`**

```markdown
# Croupier Workflow

Workflow opencode-native por repositorio para implementar specs por slices con subagentes y verificación determinista.

## Uso

1. Reinicia opencode tras instalar/editar el workflow.
2. Escribe la spec de la feature en `docs/superpowers/specs/` con una sección `## Slices`.
3. Ejecuta `/croupier`. El orquestador elige el slice activo y sigue el flujo.
4. Revisa el resultado del slice; responde en el gate para avanzar.

## Parametrización de modelos

Ningún agente fija `model`. Por defecto, los subagentes heredan el modelo del orquestador y el orquestador el global. Para fijar modelos por agente, añade en tu `opencode.json`/`opencode.jsonc` (global o de proyecto):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "croupier-orchestrator": { "model": "openrouter/deepseek/deepseek-v4.1" },
    "croupier-implementer": { "model": "{env:CROUPIER_IMPL_MODEL}" }
  }
}
```

Se admite `{env:VAR}` y `{file:...}`. Reinicia opencode tras el cambio.

## Política de reportes

`ignore` (default), `commit` o `ask`. Ver la skill `croupier-workflow`.

## Checklist de aceptación manual

Requiere un proveedor configurado y un repo con dev server para la parte visual.

1. `/croupier` sobre una spec con slices: se planifica el slice y se crean tests en rojo.
2. `scripts/verify.mjs` corre y devuelve JSON; con tests en verde, `passed` es `true`.
3. Con un test roto, el orquestador reintenta hasta 3 veces y luego escala.
4. Al cerrar el slice, se escribe `progress.md` y el flujo se detiene sin aprobación.
5. Con baseline, se generan `before/`, `after/`, `diff` y `report.html`; sin baseline, solo el estado actual.
6. Los `blocker` del reviewer devuelven al bucle TDD.
```

- [ ] **Step 2: Verificación completa**

Run: `pnpm run typecheck && pnpm test`
Expected: typecheck limpio; todos los tests en verde (los 45 previos + los nuevos de workflow).

- [ ] **Step 3: Commit**

```bash
git add docs/croupier-workflow.md
git commit -m "docs: add croupier workflow usage and acceptance guide"
```

---

## Self-Review

**1. Cobertura de la spec**

- §4.1/§4.2 roster y permisos → Task 3.
- §4.3 scripts deterministas → Tasks 1–2.
- §4.4 skill → Task 4.
- §4.5 gestión de modelos → Tasks 3 (sin `model`) y 6 (documentación).
- §5 formato de spec/slices → Task 4 (skill).
- §6 flujo por slice → Task 4 (skill).
- §7 artefactos y política → Tasks 4 (skill) y 5 (`.gitignore`, MCP).
- §8 baseline visual → Task 4 (skill) y Task 2 (`visual-diff`).
- §9 determinismo → Tasks 1–2 y Task 4.
- §10 errores → Task 4 (skill) y Task 1 (`summarizeVerification`).
- §11 tests → Tasks 1–3 y 5 (validaciones) + Task 6 (checklist manual).
- §12 distribución / §13 relación con el CLI actual → no requieren tarea de código; §13 es una nota de no-implementación.
- §14 decisiones abiertas → resueltas con defaults (nombre `croupier`, verificación script, visual-reporter declarativo por slice).
- §15 criterios de aceptación → cubiertos por Tasks 1–6; los criterios 2, 5, 6, 7 se prueban automáticamente, el 1, 3, 4 dependen del bucle LLM y van al checklist manual de Task 6.

**2. Placeholder scan:** sin `TBD`/`TODO`; cada paso incluye el contenido real.

**3. Consistencia de tipos:** `summarizeVerification` y `diffPngs` se usan con los mismos nombres y formas que se definen. Los nombres de agente coinciden entre Task 3, 4 y el test de skills. Rutas de fichero consistentes en todas las tareas.

**Nota de alcance (desviación consciente):** el criterio de aceptación §15.1/§15.3/§15.4 (bucle completo con LLM, gate, informe visual real) no se automatiza porque requiere un proveedor y consume tokens; se cubre con el checklist manual de Task 6. La cobertura automática se centra en lo determinista y en la validez de la configuración.