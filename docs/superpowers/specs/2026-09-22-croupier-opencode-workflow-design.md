# Design: Croupier — Workflow de orquestación opencode-native

**Fecha:** 2026-09-22
**Estado:** Aprobado en brainstorming, pendiente de plan de implementación
**Ámbito:** Sustituye el enfoque CLI-harness por un workflow opencode-native por repositorio: un agente orquestador, subagentes especialistas, una skill de procedimiento y scripts deterministas para los invariantes.

---

## 1. Contexto y problema

El proyecto `croupier` nació como un **CLI-harness** en TypeScript: su propia máquina de estados (LangGraph), sus propios nodos LLM, su cliente MCP y su CLI. El objetivo real del autor es distinto: un **workflow personal de desarrollo** con un agente orquestador y subagentes especialistas, ejecutado **dentro de un harness como opencode**, donde el harness aporta el modelo/proveedor, los agentes, las skills, los MCP y el acceso al contexto del proyecto.

El camino CLI reimplementa capacidades que opencode ya ofrece (modelo, agentes, skills, MCP, lectura de contexto, tools de fichero) y añade una integración frágil. La única pieza que opencode no trae de serie es la **orquestación con arbitraje y reintentos**, y es pequeña.

No se parte de cero en conocimiento: el árbitro determinista (`evaluateVerificationState`) y el decision port (`classifyReviewIssues`, gate de confianza y fallback) ya implementados son reutilizables más adelante como scripts, si la práctica lo pide. El andamiaje de "harness propio" (nodos LLM, cliente MCP, CLI) queda retirado como camino principal.

## 2. Objetivo y no-objetivos

**Objetivo**

- Un workflow opencode-native, **declarado por repositorio**, que tome una spec con una lista de slices y un plan por slice, implemente un slice con orquestación y subagentes, verifique de forma determinista, produzca evidencia visual y se detenga en un **gate humano** antes de avanzar al siguiente slice.
- Reutilizar el harness (opencode) para modelo, agentes, skills, MCP y contexto.
- Mantener el determinismo como opción preferente en los invariantes (verificación, presupuesto de reintentos, aprobación humana); el resto es juicio del agente.

**No-objetivos**

- Construir un CLI o harness propio.
- Distribución npm como mecanismo primario (se contempla plantilla/instalador de `.opencode/`).
- Jev / decision port en esta fase (se difiere).
- Nodos LLM propios, cliente MCP propio.
- Multi-repo o ejecución distribuida.

## 3. Decisión y rationale

Se adopta el **enfoque opencode-native con endurecimiento progresivo**:

1. **Agente orquestador (primario)** guiado por una **skill** de procedimiento. El agente decide; la skill fija el orden y los gates.
2. **Subagentes especialistas** declarados en `.opencode/agents/`, con permisos acotados (`permission`), modelo y prompt propios.
3. **Scripts deterministas** (no agentes) para los invariantes: verificación (`tsc`+`vitest`) y diff visual. Sin LLM.
4. **Endurecer a plugin** (custom tools) solo donde la práctica demuestre que el agente es errático o caro.

Alternativa descartada: **CLI-harness propio invocando opencode** (`opencode run --agent X`). Control y estado totales, pero duplica el harness, integra de forma frágil y reimplementa contexto/tools/MCP.

**Fase 2 (opcional):** los invariantes como **plugin** (`@yabbadabbadev/...`) con custom tools deterministas, lo que permitiría distribuirlo como producto.

## 4. Arquitectura y componentes

Todo vive bajo `.opencode/` del repositorio, más `scripts/`.

### 4.1 Agente primario

- **`orchestrator`** — dueño del workflow. Permisos: `task` permitido únicamente al roster de subagentes; `edit: deny` (no toca código directo); `bash: allow`; `skill: allow`. Modelo capaz.

### 4.2 Subagentes (`mode: subagent`)

- **`planner`** — convierte un slice en plan de implementación, apoyándose en superpowers `writing-plans`. Escritura **solo** en `docs/superpowers/plans/`.
- **`test-writer`** — fase roja TDD. Edita **solo** ficheros de test; `bash` para ejecutar vitest.
- **`implementer`** — implementa el slice. Edita **solo** `targetFiles`; `bash` para tests/typecheck.
- **`reviewer`** — read-only; `bash` limitado a `git diff` y similares. Emite issues con severidad (`blocker`/`warning`).
- **`visual-reporter`** — usa las tools de `chrome-devtools-mcp` (`take_screenshot`, `take_snapshot`, `list_console_messages`, `lighthouse_audit`, `resize_page`, `navigate_page`); escribe **solo** en el directorio de reportes; ejecuta el script de diff visual.

### 4.3 Componentes deterministas (sin LLM)

- **`scripts/verify`** — ejecuta `tsc --noEmit` y `vitest run --reporter=json`; devuelve un JSON estructurado (`passed`, `typeCheckPassed`, `unitTestsPassed`, `failedTestNames`, `output`).
- **`scripts/visual-diff`** — diff de píxeles sobre dos PNG (`pixelmatch`+`pngjs` o `odiff`); devuelve ratio de píxeles distintos e imagen de diff.

### 4.4 Skill

- **`skills/croupier-workflow/SKILL.md`** — el procedimiento completo (ver §6). Entrada por comando `/croupier` o invocación de la skill.

### 4.5 Gestión de modelos y parametrización

- Los agentes del workflow **no fijan `model`** en sus definiciones. Así, por las reglas de opencode, los subagentes heredan el modelo del `orchestrator`, y éste el modelo global configurado. **Cero IDs hardcodeados.**
- El usuario parametriza desde su propia config de opencode (`opencode.jsonc`), con la precedencia habitual (global → proyecto), p. ej. `agent.orchestrator.model`, `agent.implementer.model`, `agent.reviewer.model`. Esto **pisa** el default heredado sin tocar los ficheros del workflow.
- Se admite interpolación `{env:VAR}` y `{file:...}`, de modo que los modelos pueden venir de variables de entorno (p. ej. `{env:CROUPIER_IMPL_MODEL}`) sin editar la config.
- Recomendación documentada (no impuesta): modelo capaz para `orchestrator`/`implementer`; uno más rápido/barato para tareas mecánicas (`test-writer`, `visual-reporter`).
- El workflow **no lee `opencode.jsonc` desde código propio**: opencode aplica la config a nuestras definiciones de agente. El workflow aporta prompts, permisos y perfil de especialidad; el modelo lo elige el usuario.

## 5. Formato de spec y slices

La spec de una feature (producida con brainstorming/writing-plans de superpowers) incluye una sección **`## Slices`** con una lista ordenada; cada slice declara:

- objetivo y criterios de aceptación,
- `targetFiles` estimados,
- rutas de UI afectadas (para el baseline visual) y el **modo de baseline** (§8).

El workflow planifica e implementa **un slice a la vez**. El plan de cada slice vive en `docs/superpowers/plans/`.

## 6. Flujo por slice

1. El `orchestrator` lee la spec y `progress.md` y determina el slice activo (o pregunta).
2. `planner` produce el plan del slice.
3. Si el modo lo pide, `visual-reporter` captura `before/` de las rutas declaradas.
4. Bucle TDD: `test-writer` → `implementer` → `scripts/verify`.
   - Verificación fallida y quedan reintentos → vuelve a `implementer` con el JSON de fallos.
   - Sin reintentos → **escala al humano**.
5. `reviewer` emite issues; los `blocker` entran en el bucle con el mismo presupuesto.
6. `visual-reporter` captura `after/`, ejecuta `scripts/visual-diff` y escribe `report.html` (capturas, a11y, consola).
7. El `orchestrator` escribe `progress.md`, resume el slice y **se detiene**: gate humano.
8. Aprobación humana → siguiente slice. Cambios solicitados → vuelve al bucle.

Presupuesto de reintentos por slice: default **3**, configurable.

## 7. Artefactos y política de versionado

| Artefacto | Naturaleza | Versionado |
| --- | --- | --- |
| `docs/superpowers/specs/<feature>-design.md` | estado/texto | sí |
| `docs/superpowers/plans/<slice>.md` | estado/texto | sí |
| `progress.md` | estado/texto | sí |
| `docs/reports/<slice>/**` (PNG, HTML) | evidencia visual | según política |

Política de reportes, configurable por repo/slice: `ignore` (en directorio git-ignorado), `commit` (`docs/reports/`), `ask` (pregunta en el gate humano). **Default: `ask`**, con caída a `ignore` si no hay respuesta; nunca bloquea el flujo.

## 8. Baseline visual

Modo declarativo por slice:

- `baseline+after` — captura `before/` al inicio del slice y `after/` al final; se diffean.
- `after-only` — sin comparación; el informe documenta el estado actual.
- `reference` — contra mock/URL externa (futuro).

`take_screenshot` guarda PNG a disco vía `filePath`. Para reducir ruido: viewport fijo (`resize_page`), animaciones desactivadas, misma device scale. El MCP se ejecuta en modo `--headless`.

## 9. Política de determinismo

- **Invariantes (código):** resultado de verificación, presupuesto de reintentos, gate de aprobación humana.
- **Juicio (LLM):** contenido del plan, código, severidad de review, narrativa del informe.
- **Jev:** fuera de esta fase. Se evalúa si un punto difuso recurrente se vuelve errático.

## 10. Manejo de errores

- Verificación fallida → bucle con presupuesto; agotado → escalada a humano.
- Fallo de script o MCP caído → escala; el informe visual **no** bloquea la verificación de código.
- Escritura fuera de scope → `permission` la deniega (no phantom edits).
- App no servida en la URL de dev → `visual-reporter` reporta la imposibilidad sin romper el pipeline.

## 11. Estrategia de tests

- Unit tests para `scripts/verify` y `scripts/visual-diff` (deterministas, sin red).
- Proyecto-fixture con un slice mínimo: smoke test end-to-end que verifica que se generan plan, `progress.md` y `report.html`.
- Prompts de agente: se validan mediante el smoke (no unit-testables directamente).

## 12. Distribución

`.opencode/` (agents, skills, commands) + `scripts/` por repositorio. Llevarlo a global = copiar contenido a `~/.config/opencode/`, revisando rutas internas y dependencias del plugin. Formas de distribución: repo/plantilla o instalador que copia. Fase 2: plugin npm.

## 13. Relación con el `croupier` actual

El CLI-harness actual se **retira como camino principal**. Su árbitro determinista y su decision port se conservan en el repositorio como referencia y como candidatos a reutilización futura en `scripts/` o en el plugin de fase 2.

## 14. Decisiones abiertas

- Nombre definitivo del workflow.
- Verificación como script (arranque) vs custom tool de plugin (endurecimiento).
- ¿`visual-reporter` en cada slice o solo cuando el slice toca UI?
- Especialización de modelos (qué modelo por defecto recomendar en la doc), si se acaba ofreciendo una recomendación concreta.

## 15. Criterios de aceptación

1. Existe un workflow por repo que, dada una spec con slices, planifica e implementa un slice con subagentes y orquestación.
2. La verificación es determinista (`scripts/verify`) y el presupuesto de reintentos se respeta.
3. El workflow se detiene en un gate humano al cerrar cada slice; no avanza sin aprobación.
4. Se genera evidencia visual (`report.html`) con capturas antes/después cuando el modo lo pide, sin ensuciar el repo por defecto.
5. Los permisos de los subagentes impiden ediciones fuera de su scope.
6. `scripts/verify` y `scripts/visual-diff` tienen tests y pasan; el smoke end-to-end genera plan, `progress.md` y `report.html`.
7. Ningún agente del workflow fija un `model`; los modelos son parametrizables por el usuario desde la config de opencode (con `{env:...}` soportado) y los subagentes heredan el del orquestador por defecto.