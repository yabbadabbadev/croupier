# Port de croupier a la API de plugins de OpenCode 2 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar `@yabbadabbadev/croupier` de la API V1 (`@opencode-ai/plugin`) a la API V2 (`@opencode/plugin`), solo V2, de modo que cargue y registre todo su workflow en OpenCode 2.

**Architecture:** El entrypoint pasa a `Plugin.define({ id, setup })`. El hook `config` (que mutaba la config global) se sustituye por transforms de dominio (`ctx.agent`/`ctx.command`/`ctx.skill`/`ctx.mcp`/`ctx.tool`). Los assets markdown (7 agentes, 1 comando, 1 skill) se siguen leyendo en `setup` y se registran vía transforms.

**Tech Stack:** TypeScript, `@opencode/plugin@^2.3.0`, tsup, vitest, pnpm.

**Spec:** `/private/var/folders/q6/p_z6f_6d10b9vmxwyf4z65rc0000gn/T/opencode/croupier-port/design.md`

## Global Constraints

- Solo V2: sin `server()`/V1. Dependencia `@opencode/plugin`, no `@opencode-ai/plugin`.
- Entrypoint: `export default Plugin.define({ id: "croupier", async setup(ctx) {…} })`.
- Agentes: `ctx.agent.transform(e => e.update(id, a => {…}))` (crea si no existe). Campos V2: `description`, `mode`, `hidden`, `system`, `permissions` (array). Sin `temperature`, sin `prompt`, sin `permission` mapa.
- Commands: `ctx.command.transform(e => e.add({ name, description, execute }))` (no hay `template`).
- Skills: `ctx.skill.transform(e => e.add({ id, name, description, path, content }))`.
- MCP: `ctx.mcp.transform(e => { if (!e.get(name)) e.set(name, cfg) })`; `disabled` (no `enabled`).
- Tools: `ctx.tool.transform(e => e.add({ name, description, input: <JSON Schema>, execute }))`; dir de proyecto desde `ctx.location.directory`; retorno `{ content }`.
- Registro **incondicional** de agentes/comando (los overrides del usuario ganan por layering de config).
- No cambiar los assets markdown ni el comportamiento del workflow.
- Trabajar en un worktree aislado desde `origin/main`.

## Review Focus

- **Permisos de agente traducidos mal** (acción de tool de plugin / MCP) → Task 2 y Task 5 (E2E): una regla que no casa provoca prompts en cada tool-call.
- **El comando pierde `$ARGUMENTS` o el agente correcto** → Task 4 (test de expansión + `switchAgent`).
- **El plugin pisa overrides del usuario** → Task 3 (test: config aplicada después).
- **Tools sin `ctx.location.directory`** (cwd equivocado) → Task 1 (test con ctx falso).
- **Regresión de la suite** → cada task corre `pnpm test`.

---

### Task 1: Migrar las tools a V2 (`croupier_verify`, `croupier_visual_diff`)

**Files:**
- Modify: `package.json` (añadir `@opencode/plugin` junto a `@opencode-ai/plugin`, que se elimina en Task 5)
- Modify: `src/tools/verify.ts`, `src/tools/visual-diff.ts`
- Modify: `tests/tools.spec.ts`

**Interfaces:**
- Produces: `verifyTool: Tool.Info` (name `croupier_verify`) y `visualDiffTool: Tool.Info` (name `croupier_visual_diff`), listos para `ctx.tool.transform(e => e.add(tool))`. `execute(input, context) => Promise<{ content: string }>`; el dir del proyecto se captura como parámetro en la factory `makeVerifyTool(directory: string)`.

- [ ] **Step 1 (RED): test de la factory**

```ts
// tests/tools.spec.ts
import { describe, it, expect } from 'vitest'
import { makeVerifyTool } from '../src/tools/verify.js'
import { makeVisualDiffTool } from '../src/tools/visual-diff.js'

describe('makeVerifyTool', () => {
  it('devuelve un Tool.Info con name y execute', () => {
    const t = makeVerifyTool('/proj')
    expect(t.name).toBe('croupier_verify')
    expect(typeof t.execute).toBe('function')
  })
})
```

- [ ] **Step 2:** `pnpm vitest run tests/tools.spec.ts` → FAIL (`makeVerifyTool` no existe).
- [ ] **Step 3 (GREEN):** en `src/tools/verify.ts`, exportar `makeVerifyTool(directory: string)` que devuelve `{ name: 'croupier_verify', description, input: { type:'object', properties:{}, additionalProperties:false }, execute: async () => ({ content: <JSON de summarizeVerification> }) }`, ejecutando tsc/vitest con `cwd: directory` (la lógica interna `summarizeVerification` se conserva). Igual en `visual-diff.ts` con `makeVisualDiffTool(directory)`, `input` = JSON Schema con `before`/`after`/`diff` (strings). Eliminar `import { tool } from '@opencode-ai/plugin'` de ambos.
- [ ] **Step 4:** `pnpm vitest run tests/tools.spec.ts` → PASS; `pnpm test` → PASS.
- [ ] **Step 5:** commit `refactor: tools del plugin a Tool.Info de OpenCode 2`.

---

### Task 2: `assets.ts` → shapes V2 (agentes y comando)

**Files:**
- Modify: `src/assets.ts`, `src/config-contribution.ts` (tipos)
- Modify: `tests/assets.spec.ts`

**Interfaces:**
- Produces: `LoadedAgent { name: string; config: AgentDefaults }` con `AgentDefaults = { description?: string; mode?: 'primary'|'subagent'|'all'; hidden?: boolean; system: string; permissions?: PermissionRule[] }`. `PermissionRule = { action: string; resource: string; effect: 'allow'|'deny'|'ask' }`. `loadCommand` devuelve `{ description: string; agent: string; template: string }`.

- [ ] **Step 1 (RED): test del mapeo**

```ts
// tests/assets.spec.ts (añadir)
import { loadAgentDefinitions } from '../src/assets.js'
it('mapea frontmatter al shape V2 del agente', async () => {
  const agents = await loadAgentDefinitions(<assetsDir>)
  const orch = agents.find((a) => a.name === 'croupier-orchestrator')!
  expect(orch.config.system).toContain('orquest')   // viene del body markdown
  expect(orch.config).not.toHaveProperty('prompt')
  expect(orch.config).not.toHaveProperty('temperature')
  expect(Array.isArray(orch.config.permissions)).toBe(true)
})
```

- [ ] **Step 2:** correr → FAIL (hoy devuelve `prompt`/`temperature`).
- [ ] **Step 3 (GREEN):** en `assets.ts`, mapear `body → system`, `permission (map) → permissions (array, orden preservado, `bash`→`shell`, `task`→`subagent`, `edit` cubre write/patch)`, dropear `temperature`. Actualizar los tipos en `config-contribution.ts`.
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5:** commit `refactor: mapear assets de croupier al shape de agentes V2`.

---

### Task 3: `registerContribution(ctx, contribution)` con transforms de dominio

**Files:**
- Modify: `src/config-contribution.ts`
- Modify: `tests/config-contribution.spec.ts`

**Interfaces:**
- Produces: `registerContribution(ctx: Pick<PluginContext,'agent'|'command'|'skill'|'mcp'>, contribution: ConfigContribution): Promise<void>`. Elimina `applyConfigContribution`.
- Consumes: `ConfigContribution` de Task 2 (`agents`, `command?`, `skillsPaths`, `mcp`).

- [ ] **Step 1 (RED): test con ctx falso**

```ts
// tests/config-contribution.spec.ts
it('registra agentes, comando, skill y mcp con transforms', async () => {
  const calls: string[] = []
  const ctx = {
    agent: { transform: async (cb: any) => cb({ update: (id: string) => calls.push(`agent:${id}`) }) },
    command: { transform: async (cb: any) => cb({ add: (d: any) => calls.push(`command:${d.name}`) }) },
    skill: { transform: async (cb: any) => cb({ add: (s: any) => calls.push(`skill:${s.id}`) }) },
    mcp: { transform: async (cb: any) => cb({ get: () => undefined, set: (n: string) => calls.push(`mcp:${n}`) }) },
  }
  await registerContribution(ctx as never, contributionFixture())
  expect(calls.sort()).toEqual([
    'agent:croupier-implementer', 'agent:croupier-orchestrator', 'agent:croupier-performance',
    'agent:croupier-planner', 'agent:croupier-reviewer', 'agent:croupier-test-writer',
    'agent:croupier-visual-reporter', 'command:croupier', 'mcp:chrome-devtools',
    'skill:croupier-workflow',
  ])
})
it('no define el mcp chrome-devtools si el usuario ya lo tiene', async () => { /* get → {…} ⇒ no set */ })
```

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3 (GREEN):** implementar `registerContribution` con los cuatro transforms. Agentes: `update(id, a => Object.assign(a, defaults))`. Comando: delegar en `makeCommandExecute(contribution.command)` (Task 4) o un placeholder hasta Task 4 (registrar `add({ name:'croupier', description, execute })`). Skill: `add({ id:'croupier-workflow', name, description, path: <SKILL.md>, content: <readFile> })`. MCP: set condicional.
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5:** commit `feat: registrar agentes/comando/skill/mcp vía transforms V2`.

---

### Task 4: Comando `/croupier` como `execute` (template + agente)

**Files:**
- Modify: `src/config-contribution.ts` (o nuevo `src/command.ts`)
- Modify: `tests/workflow/skill-command.spec.ts`

**Interfaces:**
- Produces: `makeCommandExecute(command: CommandContribution): (inv: CommandInvocation, ctx) => Promise<void>` que hace `ctx.session.switchAgent({ sessionID, agent: command.agent })` y `ctx.session.prompt({ sessionID, text: expandTemplate(command.template, text), delivery })`.

- [ ] **Step 1 (RED): test de expansión + agente**

```ts
it('expande $ARGUMENTS y selecciona el agente del comando', async () => {
  const seen: any = {}
  const ctx = { session: {
    switchAgent: async (i: any) => { seen.agent = i.agent },
    prompt: async (i: any) => { seen.text = i.text },
  } }
  const exec = makeCommandExecute({ description: 'd', agent: 'croupier-orchestrator', template: 'Ejecuta: $ARGUMENTS' })
  await exec({ sessionID: 's', prompt: { text: 'slice 1' }, delivery: 'steer' }, ctx as never)
  expect(seen.agent).toBe('croupier-orchestrator')
  expect(seen.text).toBe('Ejecuta: slice 1')
})
```

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3 (GREEN):** implementar `makeCommandExecute` y `expandTemplate` (`$ARGUMENTS` → texto completo; `$1..$n` posicionales; sin placeholder → añadir args tras línea en blanco). Conectar en `registerContribution`.
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5:** commit `feat: comando /croupier como execute con $ARGUMENTS y agente`.

---

### Task 5: Entrypoint V2 + wiring + quitar la dependencia V1 + docs

**Files:**
- Modify: `src/plugin.ts`, `package.json` (quitar `@opencode-ai/plugin`), `README.md`
- Modify: `tests/plugin.spec.ts`, `tests/workflow/project-config.spec.ts`

**Interfaces:**
- Produces: `export default Plugin.define({ id: 'croupier', setup })` donde `setup` construye el contribution y llama a `registerContribution(ctx, …)` y registra las tools (`makeVerifyTool(ctx.location.directory)`, `makeVisualDiffTool(ctx.location.directory)`).

- [ ] **Step 1 (RED): test del wiring**

```ts
// tests/plugin.spec.ts
it('setup registra las dos tools', async () => {
  const added: string[] = []
  const ctx = fakeCtx({ toolAdd: (t: any) => added.push(t.name) })
  await (await import('../src/plugin.js')).default.setup(ctx as never)
  expect(added.sort()).toEqual(['croupier_verify', 'croupier_visual_diff'])
})
```

- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3 (GREEN):** reescribir `src/plugin.ts` a `Plugin.define`; quitar `@opencode-ai/plugin` de `package.json`; actualizar `README.md` (requisitos: OpenCode 2 / `@opencode/plugin ^2`; instalar con `plugins: ["@yabba…/croupier"]` o directorio).
- [ ] **Step 4:** `pnpm typecheck && pnpm test` → PASS.
- [ ] **Step 5:** commit `feat!: portar croupier a la API de plugins de OpenCode 2`.

---

### Task 6: Verificación E2E real + PR

**Files:** ninguno nuevo (evidencia).

- [ ] **Step 1:** `pnpm build` → `dist/plugin.js` con `export default`.
- [ ] **Step 2 (E2E):** en un proyecto de prueba, configurar el plugin (`plugins: ["/ruta/worktree"]`) y ejecutar OpenCode 2.3.0:

```bash
opencode debug agents | jq -r '.[].id' | grep '^croupier-'      # 7 agentes
opencode debug config | jq -r '.[]|select(.path|test("opencode.jsonc$"))|.info.mcp.servers["chrome-devtools"]'
tail -100 ~/.local/share/opencode/log/opencode.log | grep -i croupier   # "loading plugin" sin WARN
```

Expected: los 7 agentes presentes; MCP `chrome-devtools` presente; `/croupier` en la lista de comandos; **sin** `failed to load plugin`. Verificar además que una regla de permiso de acción de tool (`croupier_verify`) y de MCP (`chrome-devtools_*`) casa (Review Focus): la evidencia requerida es que el log no muestre prompts/spawn inesperados al invocar.

- [ ] **Step 3:** abrir PR contra `main` con `gh pr create`, cuerpo con el resumen, los hallazgos de los spikes y la evidencia E2E. Reportar la URL.

---

## Notas de ejecución

- Worktree desde `origin/main` (el clon local está en `docs/roadmap-plugin-updates`). Comandos convencionales (release-please deriva el major del `feat!:`).
- Los 3 "puntos abiertos" del diseño (visibilidad de config, colisión de comandos, acción de permiso de tool) están resueltos documentalmente; lo único a confirmar empíricamente es la acción de permiso de tool → Task 6.
