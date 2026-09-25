# Design: Croupier — Robustecer los agentes (frontend moderno)

**Fecha:** 2026-09-25
**Estado:** Aprobado en brainstorming, pendiente de plan de implementación
**Ámbito:** Subsistema 2 de 4. Reescribe los prompts del roster para destilar las buenas prácticas frontend de Vercel y la metodología de trabajo, y añade un subagente de performance. Incluye el pendiente transversal A.

---

## 1. Contexto y problema

El subsistema 1 empaquetó el workflow como plugin opencode (`assets/agents/*.md`, `assets/skills/croupier-workflow/SKILL.md`), pero los prompts son **flojos**: una o dos frases que describen el rol, sin criterio de dominio ni metodología. Un agente así no prescribe nada: improvisa.

El objetivo es que cada agente **interiorice** las buenas prácticas frontend de Vercel y la forma de trabajar que el autor quiere prescribir, de modo que el workflow produzca código moderno y mantenible, no solo código que pasa tests. Además se detecta que el roster carece de un especialista en performance: los CWV no tienen dueño explícito.

Referencias de prácticas (leídas y destiladas, **no** dependencias de runtime):
`vercel-react-best-practices`, `vercel-composition-patterns`, `vercel-react-view-transitions`, `web-design-guidelines`.

## 2. Objetivo y no-objetivos

**Objetivo**

- Reescribir los 6 prompts del roster para que cada uno sea un **contrato fuerte**: rol, principios, criterio de dominio (con el *porqué* y el anti-patrón), checklist accionable y límites.
- Destilar las prácticas Vercel + la metodología **dentro de los propios `.md`**, sin skill nueva ni dependencia de skills externas.
- Añadir `croupier-performance` como subagente: revisa anti-patrones en el diff y, si hay app, corre Lighthouse; `warning` por defecto, `blocker` solo con budget declarado.
- Resolver el pendiente transversal A (globs del test-writer).
- Mantener intactos los invariantes del subsistema 1: nadie fija `model`, el plugin no pisa config del usuario, permisos acotados por rol.

**No-objetivos**

- Cambiar el empaquetado (plugin/config-contribution) más allá de distribuir un agente nuevo.
- Añadir MCPs nuevos (performance reutiliza `chrome-devtools`).
- Materializar presupuestos de performance como gate duro por defecto (solo opt-in por slice).
- Feature flags (subsistema 3) ni observabilidad/Sentry (subsistema 4).

## 3. Decisión y rationale

Se adopta **destilar en los prompts** (enfoque D del brainstorming) frente a depender de las skills Vercel en runtime:

- El plugin se distribuye; asumir que el usuario tiene las skills de Vercel instaladas rompería el workflow en silencio.
- Cada rol necesita un subconjunto distinto de prácticas; destilar por rol da contratos precisos y sin ruido.
- Coste: mantenemos una copia derivada que hay que refrescar cuando Vercel actualice. Se asume conscientemente.

Se adopta además **añadir el subagente de performance ahora** (no diferirlo), porque este subsistema es precisamente el de robustecer el roster y la performance necesita dueño.

## 4. Arquitectura y componentes

### 4.1 Estructura común de cada prompt

Cada `.md` (frontmatter + body) sigue esta estructura, escalada al rol:

1. **Rol** — qué decide y qué no, en una frase.
2. **Principios** — metodología común: TDD, Clean Code/YAGNI, commits atómicos (Conventional Commits), determinismo vs juicio.
3. **Criterio de dominio** — reglas del rol con el *porqué* y el anti-patrón, no solo el nombre de la regla.
4. **Checklist** — comprobaciones accionables antes de reportar.
5. **Límites** — permisos, scope de escritura y cuándo escalar.

La base de metodología es breve y común; el criterio de dominio se asigna por rol (no se duplica todo en todos).

### 4.2 Asignación de prácticas por agente

| Agente | Prácticas y metodología que interioriza |
| --- | --- |
| `croupier-orchestrator` | Determinismo (invariantes vs juicio), presupuesto de reintentos, gate humano, política de reportes, encaje del paso de performance, no edita código, coordinación por `Task` |
| `croupier-planner` | Plan TDD por tareas atómicas, `targetFiles`, rutas UI + modo de baseline, **budget de performance opcional**, anticipación de riesgos (perf, a11y, composición), commits atómicos |
| `croupier-test-writer` | TDD estricto, testing-library, queries por rol/accesibilidad, `user-event`, comportamiento > implementación, no `testid` sin justificar; **globs ampliados (transversal A)** |
| `croupier-implementer` | Clean Code/YAGNI, composición React (compound components, no boolean props, React 19 `use()`), waterfalls (`Promise.all`/Suspense), bundle (imports directos), memo solo con evidencia, a11y semántica, view transitions con `prefers-reduced-motion` |
| `croupier-reviewer` | Diff vs spec, severidad `blocker`/`warning`, checklist de performance/composición/a11y, distinguir blocker real de ruido |
| `croupier-performance` **(nuevo)** | Anti-patrones Vercel en el diff + Lighthouse/CWV si hay app; warning por defecto, blocker solo con budget; read-only |
| `croupier-visual-reporter` | Evidencia visual, a11y y consola, CWV en el informe, view transitions capturadas, no bloquea la verificación de código |

### 4.3 Contrato de `croupier-performance`

- Frontmatter: `mode: subagent`, `hidden: true`, `temperature: 0.1`, sin `model`.
- Permisos: `edit: deny`; `bash` limitado a `git diff*`, `git log*`, `git status*`; `chrome-devtools_*: allow`.
- Entrada (del orquestador): slice, `targetFiles`, rutas UI afectadas, budget opcional.
- Salida: findings devueltos al orquestador con forma `{severity, file, rule, reason}`, donde `severity ∈ {blocker, warning}`. Read-only: **no escribe artefactos**.
- Gate:
  - `warning` por defecto para todo hallazgo.
  - Con **budget declarado por el slice**, los umbrales LCP < 2.5s, INP < 200ms, CLS < 0.1 se vuelven `blocker`.
  - Los `blocker` entran al bucle TDD con el mismo presupuesto de reintentos; agotado, escala al humano.
- Alcance doble (C):
  - **Código:** lee el diff y detecta anti-patrones Vercel (waterfalls, re-renders evitables, bundle, serialización).
  - **Runtime:** si la app está levantada, corre Lighthouse sobre las rutas UI (`chrome-devtools_lighthouse_audit`) y mira consola. Si no hay app, **no rompe** el pipeline: reporta solo la parte de código.
- Se despacha **en todos los slices** (como el reviewer); Lighthouse solo si hay app/UI.

### 4.4 Transversal A — globs del `croupier-test-writer`

Permisos de edición pasan a:

```
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

## 5. Flujo por slice (cambios en la skill)

Sobre el flujo actual del subsistema 1, se inserta el paso de performance:

1. Plan.
2. Baseline visual (si aplica).
3. Bucle TDD: test-writer → implementer → `croupier_verify` (reintentos).
4. Review: `croupier-reviewer`; sus `blocker` vuelven al bucle con el mismo presupuesto.
5. **Performance: `croupier-performance`.** Sus `blocker` vuelven al bucle con el mismo presupuesto.
6. Informe visual con `croupier-visual_diff` + `report.html`.
7. Cerrar slice: `progress.md` y gate humano. La auditoría registra también el resultado de performance.

El resto (determinismo, política de reportes, gate) no cambia.

## 6. Artefactos y política de versionado

Sin cambios respecto al subsistema 1. El agente de performance **no** produce artefactos versionables; sus findings van a `progress.md` (texto, versionado).

## 7. Manejo de errores

- App no servida / Lighthouse no disponible → performance reporta solo la revisión de código; nunca bloquea por ello.
- Diff vacío o slice sin código → performance reporta "sin hallazgos" y termina.
- Budget mal declarado en la spec → el orquestador lo ignora y opera en modo `warning`; lo señala en el gate.

## 8. Estrategia de tests

- `tests/workflow/agents.spec.ts`: roster esperado incluye `croupier-performance`; se valida su `mode`/`hidden`, que no fija `model`, y sus permisos (`edit: deny`, `chrome-devtools_*` allow, bash de git). Se valida que `croupier-test-writer` permite `.tsx`/`.jsx`/`.js` y `**/__tests__/**`.
- `tests/workflow/skill-command.spec.ts`: la skill nombra el roster actualizado (incluido `croupier-performance`) y el paso de performance.
- Los prompts siguen sin ser unit-testables directamente; su calidad se valida por el checklist de aceptación manual y revisión.

## 9. Criterios de aceptación

1. Los 7 prompts siguen la estructura de §4.1 y destilan las prácticas asignadas en §4.2.
2. `croupier-performance` existe con el contrato de §4.3 y aparece en el flujo de la skill.
3. El `croupier-test-writer` permite tests `.ts/.tsx/.js/.jsx`, `tests/**` y `**/__tests__/**` (transversal A resuelto).
4. Ningún agente fija `model`; el plugin no pisa overrides del usuario (sin cambios en config-contribution).
5. `croupier-workflow` SKILL.md refleja el nuevo paso y el roster; `docs/croupier-workflow.md`, `README.md` y `ROADMAP.md` actualizados (ítem 2 y pendiente A marcados).
6. `pnpm test`, `pnpm run typecheck`, `pnpm run lint` y `pnpm run format:check` en verde.

## 10. Slices

1. **Slice 1 — Prompts de los agentes existentes + transversal A.**
   - Objetivo: reescribir los 6 prompts con la estructura y el criterio de §4.1–§4.2, y ampliar los globs del test-writer.
   - Criterios: prompts fuertes y consistentes; transversal A resuelto; tests de agentes en verde.
   - `targetFiles`: `assets/agents/croupier-orchestrator.md`, `assets/agents/croupier-planner.md`, `assets/agents/croupier-test-writer.md`, `assets/agents/croupier-implementer.md`, `assets/agents/croupier-reviewer.md`, `assets/agents/croupier-visual-reporter.md`, `tests/workflow/agents.spec.ts`.
   - UI: no · baseline: `after-only`.
2. **Slice 2 — Subagente de performance.**
   - Objetivo: crear `croupier-performance` con el contrato de §4.3.
   - Criterios: asset con permisos y criterio correctos; roster de tests actualizado.
   - `targetFiles`: `assets/agents/croupier-performance.md`, `tests/workflow/agents.spec.ts`.
   - UI: no · baseline: `after-only`.
3. **Slice 3 — Integración en skill, docs y roadmap.**
   - Objetivo: reflejar el paso de performance y el roster en la skill y la documentación, y cerrar el ítem 2 y el pendiente A del roadmap.
   - Criterios: skill y docs coherentes; roadmap actualizado; `skill-command.spec.ts` en verde.
   - `targetFiles`: `assets/skills/croupier-workflow/SKILL.md`, `docs/croupier-workflow.md`, `README.md`, `ROADMAP.md`, `tests/workflow/skill-command.spec.ts`.
   - UI: no · baseline: `after-only`.

## 11. Decisiones abiertas

- ¿Croupier debe ofrecer un budget de performance por defecto recomendado (documentado) o dejarlo siempre al slice?
- ¿El reviewer debería dejar de reportar performance para no solaparse con `croupier-performance`? (Se mantiene el solape por ahora: el reviewer audita en el diff, performance aporta el runtime.)
- Refresco de las prácticas destiladas cuando Vercel actualice sus skills (cadencia sin definir).
- Futuro: gate de CWV determinista como paso propio (posible relación con el subsistema 4).
