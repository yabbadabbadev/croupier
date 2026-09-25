# Croupier Agent Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescribir los prompts del roster de croupier para destilar las buenas prácticas frontend de Vercel y la metodología de trabajo, y añadir el subagente de performance.

**Architecture:** Los agentes viven como ficheros markdown con frontmatter en `assets/agents/`; el plugin los inyecta sin pisar config del usuario. El trabajo es de contenido (prompts) + estructura (permisos, roster, skill, docs); la verificación es determinista sobre la estructura y manual sobre la calidad de la prosa.

**Tech Stack:** Markdown + YAML frontmatter, Vitest, TypeScript, pnpm, oxlint + prettier.

**Spec:** `docs/superpowers/specs/2026-09-25-croupier-agent-hardening-design.md`

## Global Constraints

- **Ningún agente fija `model`** (los subagentes heredan el del orquestador).
- **Prohibido eslint**; lint con **oxlint**, formato con **prettier**.
- Agentes con prefijo `croupier-`; subagentes `hidden: true`; orquestador `mode: primary`.
- Los assets (`assets/agents`, `assets/skills`, `assets/commands`) son la fuente de verdad.
- Los prompts son en **español**; las secciones de contrato se titulan literalmente `## Rol`, `## Principios`, `## Criterio`, `## Checklist`, `## Límites`.
- Toda práctica destilada cita el **anti-patrón** y el **porqué**, no solo el nombre.
- Tras cada tarea: `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check` en verde, y commit con Conventional Commits.
- No se toca `src/` ni el empaquetado en este plan.

---

## File Structure

- `assets/agents/croupier-*.md` (modificar 6, crear 1) — prompts/contratos del roster.
- `assets/skills/croupier-workflow/SKILL.md` (modificar) — paso de performance y roster.
- `tests/workflow/agents.spec.ts` (modificar) — roster, estructura, permisos.
- `tests/workflow/skill-command.spec.ts` (modificar) — roster y paso de performance en la skill.
- `docs/croupier-workflow.md`, `README.md`, `ROADMAP.md` (modificar) — docs y checklist.

---

## Material común (usar en todas las tareas de contenido)

Bloque de principios que se copia (adaptado) en cada prompt:

```markdown
## Principios

- **TDD**: los tests describen comportamiento y se escriben antes que la implementación.
- **Clean Code y YAGNI**: código mínimo que resuelve el problema; sin sobre-ingeniería ni abstracciones especulativas.
- **Commits atómicos** con Conventional Commits; diffs pequeños y revisables.
- **Determinismo vs juicio**: los invariantes (verificación, presupuesto, gate) los ejecuta código o reglas; tú aportas juicio sobre el contenido.
- **Sin código muerto**: nada de código comentado, imports sin usar ni TODOs sin dueño.
```

---

### Task 1: Slice 1 — Prompts de los agentes existentes + transversal A

**Files:**

- Modify: `assets/agents/croupier-orchestrator.md`
- Modify: `assets/agents/croupier-planner.md`
- Modify: `assets/agents/croupier-test-writer.md`
- Modify: `assets/agents/croupier-implementer.md`
- Modify: `assets/agents/croupier-reviewer.md`
- Modify: `assets/agents/croupier-visual-reporter.md`
- Modify: `tests/workflow/agents.spec.ts`

**Interfaces:**

- Produces: los 6 prompts con frontmatter intacto (mismas claves de permiso salvo la ampliación del test-writer) y cuerpo con las cinco secciones de contrato. `tests/workflow/agents.spec.ts` expone aserciones de estructura y de globs.

- [ ] **Step 1: Escribir los tests que fallan (fase Red)**

Añadir al final del `describe('definiciones de agente', ...)` de `tests/workflow/agents.spec.ts`:

```ts
it('el test-writer permite tests .ts/.tsx/.js/.jsx, tests/ y __tests__', () => {
  const testWriter = byName.get('croupier-test-writer')!
  expect(testWriter.front.permission.edit).toMatchObject({
    '*': 'deny',
    '**/*.test.ts': 'allow',
    '**/*.test.tsx': 'allow',
    '**/*.test.js': 'allow',
    '**/*.test.jsx': 'allow',
    '**/*.spec.ts': 'allow',
    '**/*.spec.tsx': 'allow',
    '**/*.spec.js': 'allow',
    '**/*.spec.jsx': 'allow',
    'tests/**': 'allow',
    '**/__tests__/**': 'allow',
  })
})

it('cada agente declara la estructura de contrato', () => {
  const sections = [
    '## Rol',
    '## Principios',
    '## Criterio',
    '## Checklist',
    '## Límites',
  ]
  for (const agent of agents) {
    for (const section of sections) {
      expect(agent.body).toContain(section)
    }
  }
})

it('cada prompt es sustancial (no una nota de una línea)', () => {
  for (const agent of agents) {
    expect(agent.body.trim().length).toBeGreaterThan(400)
  }
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test tests/workflow/agents.spec.ts`
Expected: FAIL — el test-writer no lista `.tsx`/`.jsx`/`.js` ni `**/__tests__/**`, y los cuerpos no contienen las secciones.

- [ ] **Step 3: Reescribir los 6 prompts**

Mantener **intacto** el frontmatter de cada agente excepto `croupier-test-writer`, cuya clave `permission.edit` se sustituye por:

```yaml
permission:
  edit:
    '*': deny
    '**/*.test.ts': allow
    '**/*.test.tsx': allow
    '**/*.test.js': allow
    '**/*.test.jsx': allow
    '**/*.spec.ts': allow
    '**/*.spec.tsx': allow
    '**/*.spec.js': allow
    '**/*.spec.jsx': allow
    'tests/**': allow
    '**/__tests__/**': allow
```

Cada cuerpo usa las cinco secciones. Contenido de dominio por agente:

**`croupier-orchestrator`**

- `## Rol`: dueño del workflow por slices; decide y coordina, **no edita código**; despacha subagentes con `Task`.
- `## Criterio`: un slice a la vez; leer spec (`## Slices`) y `progress.md`; presupuesto de reintentos por defecto 3; `croupier_verify` en verde antes de review; despachar `croupier-reviewer` y `croupier-performance`; sus `blocker` vuelven al bucle con el mismo presupuesto; agotado → escalar al humano; escribir `progress.md` y **detenerse en el gate humano**; política de reportes `ask`/`commit`/`ignore`.
- `## Checklist`: spec y ledger leídos; slice activo identificado; baseline capturado si aplica; verify verde; review y performance despachados; `progress.md` actualizado con decisión/verificación/auditoría; gate presentado.
- `## Límites`: `edit: deny` salvo `progress.md` y reportes; `task` solo a `croupier-*`; no avanza sin aprobación explícita.

**`croupier-planner`**

- `## Rol`: convierte un slice en un plan de implementación por tareas atómicas.
- `## Criterio`: cada tarea = test → implementación → commit; `targetFiles` completos y mínimos (YAGNI); declarar rutas UI y **modo de baseline**; declarar **budget de performance opcional** (LCP < 2.5s, INP < 200ms, CLS < 0.1); anticipar riesgos de performance, accesibilidad y composición; seguir el estilo de `writing-plans`.
- `## Checklist`: el plan cubre todos los criterios del slice; `targetFiles` reales; orden TDD; riesgos anotados; ningún paso ambiguo.
- `## Límites`: escribe solo bajo `docs/superpowers/plans/`; `bash: deny`; no toca código ni tests.

**`croupier-test-writer`**

- `## Rol`: fase Red de TDD; escribe aserciones que describen comportamiento antes de la implementación.
- `## Criterio`: TDD estricto; tests de comportamiento, no de implementación; `@testing-library/react`; queries por rol/accesibilidad (`getByRole`, `getByLabelText`) sobre `data-testid` (usar `testid` solo con justificación); `user-event` en vez de `fireEvent`; un test = un comportamiento; cubrir happy path y casos límite; aislar y no depender de orden.
- `## Checklist`: el test falla por la razón correcta (no por import roto); no acoplado a detalles internos; corre con el runner del proyecto; nombres que revelan el comportamiento.
- `## Límites`: edita solo ficheros de test (globs de frontmatter); si un test parece incorrecto, se reporta, no se edita la implementación.

**`croupier-implementer`**

- `## Rol`: fase Green + refactor; el mínimo código que pasa los tests, dentro de `targetFiles`.
- `## Criterio` (destilar Vercel, con anti-patrón y porqué):
  - **Waterfalls (CRITICAL)**: usar `Promise.all` para operaciones independientes; mover `await` a la rama donde se usa; comprobar condiciones baratas antes de `await`; `Suspense` para streaming.
  - **Bundle (CRITICAL)**: imports directos (evitar barrels); `next/dynamic` para componentes pesados; diferir analítica/terceros tras hidratación; cargar módulos solo cuando se activan.
  - **Re-render (MEDIUM)**: derivar estado en render en vez de con effects; `memo` solo con evidencia, nunca por defecto; `startTransition`/`useDeferredValue` para actualizaciones no urgentes; refs para valores transitorios; no definir componentes dentro de componentes.
  - **Rendering (MEDIUM)**: `content-visibility` en listas largas; extraer JSX estático fuera del componente; ternario en vez de `&&` para condicionales; `useTransition` para estados de carga.
  - **Server (HIGH)**: `React.cache` para deduplicar por petición; no estado mutable a nivel de módulo; paralelizar fetches; minimizar datos serializados al cliente.
  - **JavaScript (LOW-MEDIUM)**: `Set`/`Map` para lookups; cachear accesos en bucles; early exit; `RegExp` fuera de bucles; `toSorted()` para inmutabilidad.
  - **Composición**: compound components con contexto compartido; evitar proliferación de boolean props (usar variantes explícitas o `children`); React 19: `use()` en vez de `useContext` y sin `forwardRef`.
  - **Accesibilidad**: HTML semántico primero; roles/labels correctos; foco y navegación por teclado; `alt` significativo; `prefers-reduced-motion` en animaciones.
  - **View transitions**: solo si comunican relación espacial o continuidad; `name` para shared element; `default="none"` deliberado; degradar sin animación si el navegador no soporta.
- `## Checklist`: tests verdes; `tsc` limpio; sin escribir fuera de `targetFiles`; composición y a11y revisadas; sin código muerto; animaciones con reduced motion.
- `## Límites`: solo `targetFiles` declarados por el orquestador; no edita tests; si un test parece incorrecto, lo reporta.

**`croupier-reviewer`**

- `## Rol`: revisa el diff del slice contra la spec y emite issues con severidad.
- `## Criterio`: `blocker` = rompe correctitud, criterios de aceptación, seguridad o introduce un anti-patrón claro con impacto; `warning` = mejora deseable; revisar composición, performance, accesibilidad y calidad de los tests; cada issue cita fichero y motivo; no invents ni reformula la spec.
- `## Checklist`: diff completo revisado; criterios de aceptación comprobados; categorías cubiertas; severidad justificada; ningún blocker sin acción concreta.
- `## Límites`: `edit: deny`; `bash` solo `git diff|log|status`; no ejecuta la app.

**`croupier-visual-reporter`**

- `## Rol`: produce evidencia visual y de calidad del slice.
- `## Criterio`: viewport fijo (`resize_page`), animaciones desactivadas o reduced motion, misma device scale; capturar antes/después según el modo de baseline; recoger consola y a11y; incluir CWV de `lighthouse_audit`; el informe **no bloquea** la verificación de código; si la app no responde, reportarlo sin romper el pipeline.
- `## Checklist`: rutas del slice cubiertas; baseline correcto; consola sin errores nuevos; CWV incluidos; `report.html` escrito en el directorio de reportes.
- `## Límites`: escribe solo bajo `docs/reports/**` y `.croupier/reports/**`; usa `croupier_visual_diff` y `chrome-devtools_*`; no toca código.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test tests/workflow/agents.spec.ts`
Expected: PASS (incluye los tests nuevos).

- [ ] **Step 5: Verificación completa y commit**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add assets/agents tests/workflow/agents.spec.ts
git commit -m "feat(agents): harden roster prompts with modern frontend practices"
```

---

### Task 2: Slice 2 — Subagente de performance

**Files:**

- Create: `assets/agents/croupier-performance.md`
- Modify: `tests/workflow/agents.spec.ts`

**Interfaces:**

- Consumes: la estructura de contrato y el patrón de tests de Task 1.
- Produces: agente `croupier-performance` con el contrato de la spec §4.3.

- [ ] **Step 1: Escribir los tests que fallan (fase Red)**

En `tests/workflow/agents.spec.ts`, ampliar el roster esperado del test `define exactamente el roster esperado` con `'croupier-performance'` (orden alfabético, entre `croupier-orchestrator` y `croupier-planner`), añadir `'croupier-performance'` a la lista del test `todos los subagentes son subagent y hidden`, y agregar:

```ts
it('el performance es read-only y usa chrome-devtools', () => {
  const perf = byName.get('croupier-performance')!
  expect(perf.front.mode).toBe('subagent')
  expect(perf.front.hidden).toBe(true)
  expect(perf.front.model).toBeUndefined()
  expect(perf.front.permission.edit).toBe('deny')
  expect(perf.front.permission['chrome-devtools_*']).toBe('allow')
  expect(perf.front.permission.bash).toMatchObject({
    '*': 'deny',
    'git diff*': 'allow',
    'git log*': 'allow',
    'git status*': 'allow',
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test tests/workflow/agents.spec.ts`
Expected: FAIL — el roster no incluye `croupier-performance`.

- [ ] **Step 3: Crear `assets/agents/croupier-performance.md`**

Contenido exacto:

```markdown
---
description: Audita performance del slice: anti-patrones en el diff y Core Web Vitals si la app está levantada. Read-only.
mode: subagent
hidden: true
temperature: 0.1
permission:
  edit: deny
  bash:
    '*': deny
    'git diff*': allow
    'git log*': allow
    'git status*': allow
  'chrome-devtools_*': allow
---

## Rol

Auditas performance del slice. Revisas el diff contra las reglas Vercel y, si hay app, mides Core Web Vitals. No editas nada: emits findings para el orquestador.

## Principios

- **Determinismo vs juicio**: los umbrales son la parte determinista; el juicio es identificar el anti-patrón y su causa.
- **Sin código muerto**: nada de código comentado, imports sin usar ni TODOs sin dueño.
- **Evidencia**: cada finding cita fichero, regla y motivo; nada de impresiones.
- **No bloqueas por ruido**: Lighthouse en local es ruidoso; solo es blocker con budget declarado.

## Criterio

Revisión de código (siempre), buscando anti-patrones Vercel:

- **Waterfalls**: `await` en serie donde bastaría `Promise.all`; `await` antes de comprobar una condición barata.
- **Bundle**: imports desde barrels; componentes pesados sin carga dinámica; terceros cargados antes de hidratar.
- **Re-render**: `memo` innecesario o ausente donde hay coste real; estado derivable guardado con effect; componentes definidos dentro de componentes.
- **Server**: fetches en serie paralelizables; serialización excesiva al cliente; estado mutable a nivel de módulo.
- **Composición**: proliferación de boolean props; falta de compound components donde toca.
- **Accesibilidad/animación**: `prefers-reduced-motion` ausente en animaciones.

Revisión de runtime (si la app responde):

- Corre `chrome-devtools_lighthouse_audit` sobre las rutas UI del slice y recoge LCP, INP y CLS.
- Mira la consola en busca de errores nuevos.

Severidad:

- `warning` por defecto para todo hallazgo.
- Con **budget declarado** por el slice, superar LCP ≥ 2.5s, INP ≥ 200ms o CLS ≥ 0.1 es `blocker`.
- Los `blocker` vuelven al bucle TDD con el mismo presupuesto de reintentos.

Salida: lista de findings `{severity, file, rule, reason}`. Si no hay app, reporta solo la parte de código sin romper el pipeline.

## Checklist

- Diff del slice completo revisado.
- Rutas UI declaradas cubiertas si hay app.
- CWV medidos y anotados (o motivo de su ausencia).
- Cada finding con severidad, fichero, regla y motivo.
- Sin findings inventados: solo lo que el diff o las métricas sostienen.

## Límites

- `edit: deny`: no escribes ficheros ni artefactos.
- `bash` limitado a `git diff|log|status`.
- Usas `chrome-devtools_*`; no ejecutas nada más.
- Si la app no responde, lo reportas; nunca bloqueas la verificación de código por ello.
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `pnpm test tests/workflow/agents.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verificación completa y commit**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add assets/agents/croupier-performance.md tests/workflow/agents.spec.ts
git commit -m "feat(agents): add read-only performance subagent"
```

---

### Task 3: Slice 3 — Integración en skill, docs y roadmap

**Files:**

- Modify: `assets/skills/croupier-workflow/SKILL.md`
- Modify: `tests/workflow/skill-command.spec.ts`
- Modify: `docs/croupier-workflow.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`

**Interfaces:**

- Consumes: agente `croupier-performance` de Task 2.
- Produces: flujo documentado con el paso de performance y roster actualizado en todos los artefactos.

- [ ] **Step 1: Escribir los tests que fallan (fase Red)**

En `tests/workflow/skill-command.spec.ts`, añadir `'croupier-performance'` a la lista del test `nombra a todos los subagentes del roster` y agregar:

```ts
it('describe el paso de performance y el budget', () => {
  expect(skillRaw).toContain('croupier-performance')
  expect(skillRaw).toMatch(/performance/i)
  expect(skillRaw).toMatch(/budget/i)
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test tests/workflow/skill-command.spec.ts`
Expected: FAIL — la skill no menciona `croupier-performance` ni el budget.

- [ ] **Step 3: Actualizar `assets/skills/croupier-workflow/SKILL.md`**

En `## Flujo por slice`, insertar tras el paso **Review**:

```markdown
5. **Performance**: despacha `croupier-performance` con el slice, `targetFiles`, rutas UI y budget opcional. Revisa el diff contra las reglas Vercel y, si la app está levantada, corre Lighthouse. Emite findings `warning` por defecto; con budget declarado, superar LCP 2.5s / INP 200ms / CLS 0.1 es `blocker`. Los `blocker` vuelven al bucle TDD con el mismo presupuesto.
```

Renumerar los pasos siguientes (informe visual = 6, cerrar = 7, gate = 8). En `## Flujo por slice` y en la política de reportes, dejar claro que el informe visual no bloquea y que performance tampoco bloquea por caída de la app. En `## Formato de progress.md`, añadir a la sección de auditoría el resultado de performance.

- [ ] **Step 4: Actualizar la documentación**

- `docs/croupier-workflow.md`: añadir el paso de performance al resumen del flujo y al checklist de aceptación manual (p. ej. "se despacha `croupier-performance`; sin budget solo emite warnings").
- `README.md`: añadir `croupier-performance` a la lista de subagentes inyectados y una breve mención del gate de performance opcional por budget.
- `ROADMAP.md`: marcar `- [x] **2. Robustecer los agentes.**` (ajustando el texto a lo hecho) y `- [x] **A. test-writer: globs incompletos.**`.

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `pnpm test && pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: PASS en todo.

- [ ] **Step 6: Commit**

```bash
git add assets/skills docs/croupier-workflow.md README.md ROADMAP.md tests/workflow/skill-command.spec.ts
git commit -m "docs(workflow): integrate performance step and update roster docs"
```

---

## Self-Review

**1. Cobertura de la spec**

- §4.1 estructura de prompts → Task 1 Step 3 (secciones) + Step 1 (test de estructura).
- §4.2 asignación por agente → Task 1 Step 3 (inventario por agente).
- §4.3 contrato de performance → Task 2 Step 3 (asset exacto) + Step 1 (tests de permisos).
- §4.4 transversal A → Task 1 Step 3 (frontmatter del test-writer) + Step 1 (test de globs).
- §5 flujo por slice → Task 3 Step 3.
- §8 estrategia de tests → Tasks 1–3.
- §9 criterios 5 y 6 → Task 3 (docs/roadmap y verificación).

**2. Placeholder scan:** sin `TBD`/`TODO`; los prompts se entregan como inventario exacto por sección y el de performance como fichero completo. El inventario es el contenido, no una descripción vaga.

**3. Consistencia de tipos:** los nombres de sección (`## Rol`, `## Principios`, `## Criterio`, `## Checklist`, `## Límites`) se usan igual en los tests y en los prompts. Los nombres de agente (`croupier-performance`) y de permisos (`chrome-devtools_*`, `git diff*`) coinciden entre tests, asset y skill.
