# Diseño — Port de croupier a la API de plugins de OpenCode 2 (solo V2)

- **Fecha:** 2026-11-14
- **Estado:** propuesto (pendiente de aprobación)
- **Repo:** `yabbadabbadev/croupier` (`@yabbadabbadev/croupier`)
- **Spec de referencia del framework:** docs V2 (<https://opencode.ai/docs/build/plugins> y `/build/plugins/server`)

## Intención

Portar el plugin de `@opencode-ai/plugin` (API **V1**) a `@opencode/plugin` (API **V2**), de modo que
`/croupier` y todo su workflow funcionen en OpenCode 2.

## Por qué

- En OpenCode 2.3.0 el plugin no carga: `Plugin must export a default definition with an id and an
  effect or setup function`.
- Decisión del usuario: **solo V2** (sin compatibilidad con V1). Implica bump mayor.

## Objetivos

- El plugin carga en OpenCode 2.3.0 y registra:
  7 agentes (`croupier-orchestrator` + 6 subagentes ocultos), el comando `/croupier`, la skill
  `croupier-workflow`, el MCP `chrome-devtools` y las tools `croupier_verify` / `croupier_visual_diff`.
- Los overrides del usuario ganan por el **layering de config** de OpenCode (config aplicada después de
  los transforms), no por detección del plugin — ver Anexo.
- Suite vitest verde (reescrita donde el shape cambia).

## No-objetivos

- Soportar V1 (rechazado).
- Cambiar el workflow ni los assets (agentes/comando/skill en markdown).
- Publicar en npm (lo hará release-please al mergear; el PR no publica).

## Restricciones (API V2 — verificado en `@opencode/plugin@2.3.0`)

- Entrypoint: `export default Plugin.define({ id: "croupier", async setup(ctx) { … } })`.
- **Agentes**: `ctx.agent.transform(e => e.update(id, a => { … }))`. `update` **crea** el agente si no
  existe (probado). Campos V2: `description`, `mode`, `hidden`, `system`, `permissions` (**array**),
  `color`, `steps`. **No** existe `temperature`, ni `prompt` (es `system`), ni `permission` mapa.
- **Commands**: `ctx.command.transform(e => e.add({ name, description, execute }))`. La V2
  `CommandDefinition` **no tiene `template`**: el comando es programático (`execute`). El template
  markdown debe ejecutarse dentro de `execute` vía `ctx.session.prompt(...)`.
- **Skills**: `ctx.skill.transform(e => e.add({ id, name, description, path, content }))`.
- **MCP**: `ctx.mcp.transform(e => { if (!e.get(name)) e.set(name, config) })`; config usa `disabled`.
- **Tools**: `ctx.tool.transform(e => e.add({ name, description, input: <JSON Schema>, execute }))`;
  el directorio del proyecto sale de `ctx.location.directory`; `execute` devuelve `{ content }` /
  `Tool.Content`.

## Alternativas consideradas

- **Dual V1+V2** (`setup()` + `server()` en un export): rechazado por el usuario; duplica shapes
  (zod→JSON Schema, `permission`→`permissions`, `prompt`→`system`) y tests.
- **Repartir agentes/comando/skill como ficheros** en el paquete: no sirve; OpenCode no descubre
  `.opencode/` dentro de `node_modules` de un paquete. Se usan transforms.

## Enfoque

1. **`package.json`**: dependencia `@opencode/plugin` en vez de `@opencode-ai/plugin`; bump mayor
   (0.3.x → 0.4.0 o 1.0.0) — decidir con release-please.
2. **`src/plugin.ts`** → `Plugin.define({ id: "croupier", setup })`. `setup` construye el
   *contribution* con `assets.ts`, registra las tools y aplica los transforms de dominio.
3. **`src/config-contribution.ts`**: sustituir `applyConfigContribution(cfg, …)` (mutaba la config
   global) por `registerContribution(ctx, contribution)` que:
   - agentes → `ctx.agent.transform` (`update` por id, **defaults incondicionales**; el usuario gana
     por layering),
   - comando → `ctx.command.transform` (envuelve el template en `execute`; registro incondicional),
   - skill → `ctx.skill.transform` (lee `SKILL.md` y `add`),
   - mcp → `ctx.mcp.transform` (set condicional).
   El *shape* del contribution pasa a V2: agente `{ description, mode, hidden, system, permissions }`.
4. **`src/assets.ts`**: `loadAgentDefinitions` mapea frontmatter → campos V2 (`prompt`→`system`,
   `permission`→`permissions`, dropea `temperature`); `loadCommand` devuelve el template + agent.
5. **`src/tools/*`**: convertir `tool({args: tool.schema…})` a `input` JSON Schema; `context.directory`
   → capturar `ctx.location.directory` en el closure; retorno → `{ content }`.
6. **Tests**: reescribir `plugin.spec.ts` (entrypoint V2), adaptar `config-contribution.spec.ts`,
   `tools.spec.ts`, `assets.spec.ts`, `workflow/*` a los nuevos shapes.

## Riesgos / puntos abiertos

- **Comando plantilla**: cómo reproducir `$ARGUMENTS` y la selección de agente
  (`croupier-orchestrator`) dentro de `execute`. Probable: `ctx.session.switchAgent` + `session.prompt`
  con el texto expandido. **A verificar en implementación.**
- **Molde de `input` (JSON Schema)** para las tools: los args actuales usan `tool.schema` (zod-like).
- **`temperature` de los agentes**: en V2 no aplica a nivel de agente; si importa, mover a una
  variante de modelo (probablemente se dropea: no es crítico para el workflow).
- **`chrome-devtools` MCP**: croupier lo define solo si el usuario no lo tiene; en V2 el `set`
  condicional con `e.get(name)`.

## Verificación

- `pnpm typecheck` + `pnpm test` (vitest) verdes.
- **E2E real**: cargar el plugin con OpenCode 2.3.0 y comprobar en `opencode debug agents`,
  `opencode debug config` y el log que registra los 7 agentes, el comando, la skill, el MCP (si no lo
  definía el usuario) y las 2 tools.

## Anexo — hallazgos de los spikes (2026-11-14)

Probado con `@opencode/plugin@2.3.0` (plugin local que registra transforms y vuelca lo que ve el editor):

- **Los agentes definidos en la config del usuario NO son visibles al editor de `agent.transform`** en
  `setup`: `editor.list()` solo devuelve los built-in (`build/general/explore/compaction/title/summary/plan`);
  `chat`/`implement` (de la config) no aparecen, y el modelo que la config pone en `general` no se
  refleja (`general.model === null`). ⇒ la config se aplica **después** de los transforms.
  **Consecuencia:** se elimina la lógica V1 de "merge manual / no pisar" — el plugin setea los defaults
  y el usuario gana por layering. (Reproducir el merge manual era imposible con los datos del editor.)
- **Los comandos definidos por fichero tampoco son visibles** a `ctx.command.list()` en `setup` (solo
  salen los shipped). `editor.add` registra. ⇒ el "skip si el usuario ya definió `/croupier`" no es
  implementable; se registra siempre y se documenta.
- `editor.update(id, …)` **crea** el agente si no existe (confirmado).
- El nombre de acción de permiso de una **tool de plugin** no se pudo determinar por tipos; se fija
  `{action: "<nombre-tool>", resource: "*", effect: …}` (p. ej. `croupier_verify`) y se **verifica en E2E**.
  Para MCP, el guion se conserva, así que `chrome-devtools_*` es correcto.

## Entrega

- Rama desde `origin/main`, commits convencionales (release-please), PR contra `main` con el diff y
  la evidencia de verificación.
