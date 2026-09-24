# Croupier Plugin Packaging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el workflow croupier en un plugin opencode empaquetado (`@yabbadabbadev/croupier`), instalable globalmente y publicable en npm, sin copiar ficheros por proyecto.

**Architecture:** El paquete exporta un `Plugin` de opencode. En el hook `config(cfg)` inyecta agentes, comando, skills path y MCP desde `assets/` (función pura `buildConfigContribution`, testeable). Registra las tools deterministas `croupier_verify` y `croupier_visual_diff`, que sustituyen a `scripts/*.mjs`. Sigue las convenciones de publicación de `@yabbadabbadev/pepito`: release-please + OIDC, CI de calidad con pnpm, oxlint + prettier.

**Tech Stack:** TypeScript (ESM), `@opencode-ai/plugin`, `yaml`, `pixelmatch`, `pngjs`, tsup, Vitest, oxlint, prettier, pnpm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-22-croupier-plugin-packaging-design.md`

## Global Constraints

- Paquete ESM; `type: "module"`.
- **Ningún agente fija `model`.** El plugin no debe pisar overrides del usuario.
- **Prohibido eslint**, en cualquier forma. Lint con **oxlint**; formato con **prettier**.
- Los assets (agentes, skill, comando) son la fuente de verdad en `assets/`; el plugin los inyecta.
- El CLI-harness retirado (`src/cli`, `src/graph`, `src/nodes`, `src/arbiter`, `src/state`, `src/index.ts`) se elimina del paquete.
- Tras cada tarea: `pnpm run typecheck && pnpm test` en verde, y commit.
- Tras cambiar config de opencode, hace falta **reiniciar opencode**.

---

## File Structure

- `package.json` (modificar) — identidad de paquete-plugin, deps y scripts.
- `tsup.config.ts` (modificar) — entry `src/plugin.ts`.
- `tsconfig.build.json` (crear) — typecheck de build.
- `src/config-contribution.ts` (crear) — `buildConfigContribution` + `applyConfigContribution`.
- `src/assets.ts` (crear) — carga de assets (agentes, skill, comando).
- `src/plugin.ts` (crear) — exporta el `Plugin`.
- `src/tools/verify.ts` (crear) — `summarizeVerification` + tool.
- `src/tools/visual-diff.ts` (crear) — `diffPngs` + tool.
- `assets/agents/*.md`, `assets/skills/croupier-workflow/SKILL.md`, `assets/commands/croupier.md` (mover desde `.opencode/`).
- `tests/config-contribution.spec.ts`, `tests/assets.spec.ts`, `tests/tools.spec.ts` (crear).
- `tests/workflow/*.spec.ts` (modificar rutas a `assets/`).
- `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/dependabot-automerge.yml`, `.github/dependabot.yml` (crear).
- `release-please-config.json`, `.release-please-manifest.json`, `.nvmrc`, `.prettierrc`, `.prettierignore`, `.oxlintrc.json` (crear).
- `src/cli`, `src/graph`, `src/nodes`, `src/arbiter`, `src/state`, `src/index.ts`, `tests/unit`, `scripts/` (eliminar).

---

### Task 1: Spike — mecanismo de inyección

**Files:**

- Modify: `package.json`
- Create: `tsconfig.build.json`
- Modify: `tsup.config.ts`
- Create: `src/config-contribution.ts`
- Create: `src/plugin.ts`
- Test: `tests/config-contribution.spec.ts`

**Interfaces:**

- Produces: `applyConfigContribution(cfg, contribution): void` y `buildConfigContribution(pkgDir): Promise<ConfigContribution>` con `ConfigContribution = { agents: Record<string, AgentConfigContribution>; command?: CommandContribution; skillsPaths: string[]; mcp: Record<string, McpContribution> }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/config-contribution.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyConfigContribution } from '../src/config-contribution.js'

describe('applyConfigContribution', () => {
  it('inyecta agentes, comando, skills y mcp en una config vacía', () => {
    const cfg: Record<string, any> = {}
    applyConfigContribution(cfg, {
      agents: {
        'croupier-orchestrator': {
          description: 'orquesta',
          mode: 'primary',
          prompt: 'eres el orquestador',
          permission: { edit: 'deny' },
        },
      },
      command: {
        description: 'cmd',
        agent: 'croupier-orchestrator',
        template: '$ARGUMENTS',
      },
      skillsPaths: ['/pkg/assets/skills'],
      mcp: {
        'chrome-devtools': {
          type: 'local',
          command: ['npx', '-y', 'chrome-devtools-mcp@latest', '--headless'],
          enabled: true,
        },
      },
    })

    expect(cfg.agent['croupier-orchestrator']).toMatchObject({
      mode: 'primary',
      prompt: 'eres el orquestador',
    })
    expect(cfg.command.croupier).toMatchObject({
      agent: 'croupier-orchestrator',
    })
    expect(cfg.skills.paths).toEqual(['/pkg/assets/skills'])
    expect(cfg.mcp['chrome-devtools']).toMatchObject({
      type: 'local',
      enabled: true,
    })
  })

  it('no pisa overrides del usuario en un agente', () => {
    const cfg: Record<string, any> = {
      agent: { 'croupier-implementer': { model: 'openrouter/x' } },
    }
    applyConfigContribution(cfg, {
      agents: {
        'croupier-implementer': {
          description: 'implementa',
          mode: 'subagent',
          hidden: true,
          prompt: 'eres el implementador',
        },
      },
      skillsPaths: [],
      mcp: {},
    })

    expect(cfg.agent['croupier-implementer'].model).toBe('openrouter/x')
    expect(cfg.agent['croupier-implementer'].prompt).toBe(
      'eres el implementador',
    )
  })

  it('no duplica el skills path ni el mcp existente', () => {
    const cfg: Record<string, any> = {
      skills: { paths: ['/pkg/assets/skills'] },
      mcp: {
        'chrome-devtools': {
          type: 'local',
          command: ['custom'],
          enabled: false,
        },
      },
    }
    applyConfigContribution(cfg, {
      agents: {},
      skillsPaths: ['/pkg/assets/skills'],
      mcp: {
        'chrome-devtools': {
          type: 'local',
          command: ['npx', '-y', 'chrome-devtools-mcp@latest'],
          enabled: true,
        },
      },
    })

    expect(cfg.skills.paths).toEqual(['/pkg/assets/skills'])
    expect(cfg.mcp['chrome-devtools'].command).toEqual(['custom'])
    expect(cfg.mcp['chrome-devtools'].enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm test tests/config-contribution.spec.ts`
Expected: FAIL — `Cannot find module '../src/config-contribution.js'`.

- [ ] **Step 3: Añadir la dependencia y la config de build**

```bash
pnpm add @opencode-ai/plugin@^1.18.32 yaml@^2.9.1
```

Modificar `tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { plugin: 'src/plugin.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
})
```

Crear `tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": [] },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Implementar `src/config-contribution.ts`**

```ts
export interface AgentConfigContribution {
  description: string
  mode: 'primary' | 'subagent' | 'all'
  hidden?: boolean
  temperature?: number
  permission?: Record<string, unknown>
  prompt: string
}

export interface CommandContribution {
  description: string
  agent: string
  template: string
}

export interface McpContribution {
  type: 'local'
  command: string[]
  enabled: boolean
}

export interface ConfigContribution {
  agents: Record<string, AgentConfigContribution>
  command?: CommandContribution
  skillsPaths: string[]
  mcp: Record<string, McpContribution>
}

export function applyConfigContribution(
  cfg: Record<string, any>,
  contribution: ConfigContribution,
): void {
  cfg.agent = cfg.agent ?? {}
  for (const [name, defaults] of Object.entries(contribution.agents)) {
    cfg.agent[name] = { ...defaults, ...(cfg.agent[name] ?? {}) }
  }

  if (contribution.command && !cfg.command?.['croupier']) {
    cfg.command = cfg.command ?? {}
    cfg.command['croupier'] = contribution.command
  }

  if (contribution.skillsPaths.length > 0) {
    cfg.skills = cfg.skills ?? {}
    const existing: string[] = cfg.skills.paths ?? []
    for (const path of contribution.skillsPaths) {
      if (!existing.includes(path)) existing.push(path)
    }
    cfg.skills.paths = existing
  }

  cfg.mcp = cfg.mcp ?? {}
  for (const [name, defaults] of Object.entries(contribution.mcp)) {
    if (!cfg.mcp[name]) cfg.mcp[name] = defaults
  }
}
```

- [ ] **Step 5: Crear `src/plugin.ts` (mínimo del spike)**

```ts
import type { Plugin } from '@opencode-ai/plugin'

export const CroupierPlugin: Plugin = async () => {
  return {
    config: async (cfg) => {
      const { applyConfigContribution } =
        await import('./config-contribution.js')
      applyConfigContribution(cfg as unknown as Record<string, any>, {
        agents: {
          'croupier-orchestrator': {
            description: 'Spike: agente de prueba inyectado por el plugin.',
            mode: 'primary',
            prompt:
              'Spike del plugin croupier. Si ves este agente, la inyeccion funciona.',
          },
        },
        skillsPaths: [],
        mcp: {},
      })
    },
  }
}
```

- [ ] **Step 6: Ejecutar el test y verificar que pasa**

Run: `pnpm test tests/config-contribution.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Typecheck y build**

Run: `pnpm run typecheck && pnpm run build`
Expected: limpio; genera `dist/plugin.js` y `dist/plugin.d.ts`.

- [ ] **Step 8: Validación manual del spike (GATE HUMANO)**

Instrucciones para el humano:

1. En tu config global de opencode (`~/.config/opencode/opencode.json`), añade `"plugin": ["/Users/alex/orca/workspaces/croupier/finback/dist/plugin.js"]`.
2. Reinicia opencode.
3. Confirma que aparece un agente `croupier-orchestrator` (spike).

Si no aparece, **PARAR** y replantear el enfoque antes de continuar.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.build.json tsup.config.ts src/config-contribution.ts src/plugin.ts tests/config-contribution.spec.ts
git commit -m "feat(plugin): spike config injection mechanism"
```

---

### Task 2: Assets y carga de agentes

**Files:**

- Move: `.opencode/agent/*.md` → `assets/agents/`
- Move: `.opencode/skill/croupier-workflow/SKILL.md` → `assets/skills/croupier-workflow/SKILL.md`
- Move: `.opencode/command/croupier.md` → `assets/commands/croupier.md`
- Create: `src/assets.ts`
- Modify: `tests/workflow/agents.spec.ts`, `tests/workflow/skill-command.spec.ts` (rutas a `assets/`)
- Test: `tests/assets.spec.ts`

**Interfaces:**

- Produces: `loadAgentDefinitions(assetsDir): AgentConfigContribution[]` (orden estable por nombre) y `loadCommand(assetsDir): CommandContribution | undefined`; `skillsDir(assetsDir): string`.

- [ ] **Step 1: Mover los assets**

```bash
mkdir -p assets/agents assets/skills assets/commands
git mv .opencode/agent/croupier-orchestrator.md assets/agents/
git mv .opencode/agent/croupier-planner.md assets/agents/
git mv .opencode/agent/croupier-test-writer.md assets/agents/
git mv .opencode/agent/croupier-implementer.md assets/agents/
git mv .opencode/agent/croupier-reviewer.md assets/agents/
git mv .opencode/agent/croupier-visual-reporter.md assets/agents/
git mv .opencode/skill/croupier-workflow assets/skills/croupier-workflow
git mv .opencode/command/croupier.md assets/commands/croupier.md
```

Actualizar en `tests/workflow/agents.spec.ts` la constante `AGENTS_DIR = "assets/agents"`, y en `tests/workflow/skill-command.spec.ts` las rutas `SKILL_PATH = "assets/skills/croupier-workflow/SKILL.md"` y `COMMAND_PATH = "assets/commands/croupier.md"`.

- [ ] **Step 2: Escribir el test que falla**

Crear `tests/assets.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadAgentDefinitions, loadCommand, skillsDir } from '../src/assets.js'

const ASSETS = 'assets'

describe('assets', () => {
  it('carga los seis agentes con prompt no vacío', async () => {
    const agents = await loadAgentDefinitions(ASSETS)
    expect(agents.map((a) => a.name)).toEqual([
      'croupier-implementer',
      'croupier-orchestrator',
      'croupier-planner',
      'croupier-reviewer',
      'croupier-test-writer',
      'croupier-visual-reporter',
    ])
    for (const agent of agents) {
      expect(agent.config.prompt.trim().length).toBeGreaterThan(0)
      expect(agent.config.description.length).toBeGreaterThan(0)
    }
  })

  it('no expone model en ningún agente', async () => {
    const agents = await loadAgentDefinitions(ASSETS)
    for (const agent of agents) {
      expect((agent.config as Record<string, unknown>).model).toBeUndefined()
    }
  })

  it('carga el comando croupier', async () => {
    const command = await loadCommand(ASSETS)
    expect(command?.agent).toBe('croupier-orchestrator')
    expect(command?.template.trim().length).toBeGreaterThan(0)
  })

  it('devuelve la ruta de skills', () => {
    expect(skillsDir(ASSETS)).toMatch(/assets\/skills$/)
  })
})
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

Run: `pnpm test tests/assets.spec.ts tests/workflow/agents.spec.ts tests/workflow/skill-command.spec.ts`
Expected: FAIL — `Cannot find module '../src/assets.js'`.

- [ ] **Step 4: Implementar `src/assets.ts`**

```ts
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import type {
  AgentConfigContribution,
  CommandContribution,
} from './config-contribution.js'

export interface LoadedAgent {
  name: string
  config: AgentConfigContribution
}

function frontmatter(raw: string): { data: Record<string, any>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) throw new Error('Missing frontmatter')
  return { data: parse(match[1]), body: match[2] }
}

export async function loadAgentDefinitions(
  assetsDir: string,
): Promise<LoadedAgent[]> {
  const dir = join(assetsDir, 'agents')
  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.md'))
    .sort()
  const agents: LoadedAgent[] = []
  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf8')
    const { data, body } = frontmatter(raw)
    agents.push({
      name: data.name ?? file.replace(/\.md$/, ''),
      config: {
        description: data.description,
        mode: data.mode,
        hidden: data.hidden,
        temperature: data.temperature,
        permission: data.permission,
        prompt: body,
      },
    })
  }
  return agents
}

export async function loadCommand(
  assetsDir: string,
): Promise<CommandContribution | undefined> {
  try {
    const raw = await readFile(
      join(assetsDir, 'commands', 'croupier.md'),
      'utf8',
    )
    const { data, body } = frontmatter(raw)
    return { description: data.description, agent: data.agent, template: body }
  } catch {
    return undefined
  }
}

export function skillsDir(assetsDir: string): string {
  return join(assetsDir, 'skills')
}
```

- [ ] **Step 5: Ejecutar y verificar**

Run: `pnpm test tests/assets.spec.ts tests/workflow/agents.spec.ts tests/workflow/skill-command.spec.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck y commit**

```bash
pnpm run typecheck
git add assets src/assets.ts tests/assets.spec.ts tests/workflow/agents.spec.ts tests/workflow/skill-command.spec.ts
git commit -m "feat(plugin): move workflow assets and add asset loader"
```

---

### Task 3: `buildConfigContribution` completa y plugin real

**Files:**

- Modify: `src/config-contribution.ts`
- Modify: `src/plugin.ts`
- Modify: `tests/config-contribution.spec.ts`
- Test: `tests/plugin.spec.ts`

**Interfaces:**

- Consumes: `loadAgentDefinitions`, `loadCommand`, `skillsDir` (Task 2).
- Produces: `buildConfigContribution(assetsDir, options?): Promise<ConfigContribution>`; el plugin usa esa contribución en `config`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `tests/config-contribution.spec.ts`:

```ts
import { buildConfigContribution } from '../src/config-contribution.js'

describe('buildConfigContribution', () => {
  it('construye la contribución desde assets', async () => {
    const contribution = await buildConfigContribution('assets')
    expect(Object.keys(contribution.agents).sort()).toEqual([
      'croupier-implementer',
      'croupier-orchestrator',
      'croupier-planner',
      'croupier-reviewer',
      'croupier-test-writer',
      'croupier-visual-reporter',
    ])
    expect(contribution.command?.agent).toBe('croupier-orchestrator')
    expect(contribution.skillsPaths[0]).toMatch(/assets\/skills$/)
    expect(contribution.mcp['chrome-devtools'].command.join(' ')).toContain(
      '--headless',
    )
  })

  it('respeta el mcp opcional desactivado', async () => {
    const contribution = await buildConfigContribution('assets', { mcp: false })
    expect(contribution.mcp).toEqual({})
  })
})
```

Crear `tests/plugin.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CroupierPlugin } from '../src/plugin.js'

describe('CroupierPlugin', () => {
  it('registra los hooks config y tool', async () => {
    const hooks = await CroupierPlugin({} as never)
    expect(typeof hooks.config).toBe('function')
    expect(hooks.tool).toBeDefined()
  })

  it('el hook config inyecta el roster en una config vacía', async () => {
    const hooks = await CroupierPlugin({} as never)
    const cfg: Record<string, any> = {}
    await hooks.config?.(cfg as never)
    expect(Object.keys(cfg.agent).sort()).toEqual([
      'croupier-implementer',
      'croupier-orchestrator',
      'croupier-planner',
      'croupier-reviewer',
      'croupier-test-writer',
      'croupier-visual-reporter',
    ])
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test tests/config-contribution.spec.ts tests/plugin.spec.ts`
Expected: FAIL — `buildConfigContribution` no exportada; el plugin no tiene tools todavía.

- [ ] **Step 3: Implementar `buildConfigContribution`**

Añadir a `src/config-contribution.ts`:

```ts
import { join } from 'node:path'
import { loadAgentDefinitions, loadCommand, skillsDir } from './assets.js'

export interface BuildOptions {
  mcp?: boolean
}

export async function buildConfigContribution(
  assetsDir: string,
  options: BuildOptions = {},
): Promise<ConfigContribution> {
  const loaded = await loadAgentDefinitions(assetsDir)
  const agents: Record<string, AgentConfigContribution> = {}
  for (const agent of loaded) agents[agent.name] = agent.config

  const command = await loadCommand(assetsDir)
  const includeMcp = options.mcp !== false

  return {
    agents,
    ...(command ? { command } : {}),
    skillsPaths: [skillsDir(assetsDir)],
    mcp: includeMcp
      ? {
          'chrome-devtools': {
            type: 'local',
            command: [
              'npx',
              '-y',
              'chrome-devtools-mcp@latest',
              '--headless',
              '--isolated',
            ],
            enabled: true,
          },
        }
      : {},
  }
}
```

- [ ] **Step 4: Implementar el plugin real (sin tools aún)**

Reemplazar `src/plugin.ts` por:

```ts
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from '@opencode-ai/plugin'
import {
  applyConfigContribution,
  buildConfigContribution,
} from './config-contribution.js'

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

export const CroupierPlugin: Plugin = async () => {
  return {
    config: async (cfg) => {
      const contribution = await buildConfigContribution(assetsDir)
      applyConfigContribution(
        cfg as unknown as Record<string, any>,
        contribution,
      )
    },
  }
}
```

- [ ] **Step 5: Ejecutar y verificar**

Run: `pnpm test tests/config-contribution.spec.ts tests/plugin.spec.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck y commit**

```bash
pnpm run typecheck
git add src/config-contribution.ts src/plugin.ts tests/config-contribution.spec.ts tests/plugin.spec.ts
git commit -m "feat(plugin): build config contribution from assets and wire plugin"
```

---

### Task 4: Tools `croupier_verify` y `croupier_visual_diff`

**Files:**

- Create: `src/tools/verify.ts`
- Create: `src/tools/visual-diff.ts`
- Modify: `src/plugin.ts`
- Modify: `assets/skills/croupier-workflow/SKILL.md`
- Modify: `assets/agents/croupier-visual-reporter.md`
- Delete: `scripts/verify.mjs`, `scripts/visual-diff.mjs`, `tests/workflow/verify.spec.ts`, `tests/workflow/visual-diff.spec.ts`
- Test: `tests/tools.spec.ts`

**Interfaces:**

- Produces: tools registradas como `croupier_verify` (sin args) y `croupier_visual_diff` (`{ before, after, diff? }`), que devuelven JSON con los mismos formatos que los scripts actuales.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/tools.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PNG } from 'pngjs'
import { summarizeVerification } from '../src/tools/verify.js'
import { diffPngs } from '../src/tools/visual-diff.js'

function solidPng(rgb: [number, number, number]): Buffer {
  const png = new PNG({ width: 4, height: 4 })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0]
    png.data[i + 1] = rgb[1]
    png.data[i + 2] = rgb[2]
    png.data[i + 3] = 255
  }
  return PNG.sync.write(png)
}

describe('summarizeVerification', () => {
  it('aprueba con typecheck y tests ok', () => {
    const result = summarizeVerification({
      typeCheckExitCode: 0,
      typeCheckOutput: '',
      testExitCode: 0,
      testReport: { testResults: [] },
      testOutput: '',
    })
    expect(result.passed).toBe(true)
  })

  it('recoge tests fallidos', () => {
    const result = summarizeVerification({
      typeCheckExitCode: 0,
      typeCheckOutput: '',
      testExitCode: 1,
      testReport: {
        testResults: [
          {
            name: 'a.spec.ts',
            assertionResults: [{ fullName: 'x', status: 'failed' }],
          },
        ],
      },
      testOutput: '',
    })
    expect(result.failedTestNames).toEqual(['x'])
  })
})

describe('diffPngs', () => {
  it('ratio 0 para idénticas y 1 para opuestas', () => {
    const a = solidPng([255, 0, 0])
    const b = solidPng([255, 0, 0])
    const c = solidPng([0, 0, 255])
    expect(diffPngs(a, b).ratio).toBe(0)
    expect(diffPngs(a, c).ratio).toBe(1)
  })

  it('lanza si difieren las dimensiones', () => {
    const small = solidPng([0, 0, 0])
    const big = PNG.sync.write(new PNG({ width: 8, height: 4 }))
    expect(() => diffPngs(small, big)).toThrow('dimensions')
  })
})
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `pnpm test tests/tools.spec.ts`
Expected: FAIL — módulos no encontrados.

- [ ] **Step 3: Añadir dependencias de imagen**

```bash
pnpm add pixelmatch@^7.2.0 pngjs@^7.0.0
```

- [ ] **Step 4: Implementar `src/tools/verify.ts`**

Portar la lógica de `scripts/verify.mjs` a TypeScript, exportando `summarizeVerification` con los mismos tipos, y añadir la tool:

```ts
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tool } from '@opencode-ai/plugin'

export interface VerificationResult {
  passed: boolean
  typeCheckPassed: boolean
  unitTestsPassed: boolean
  output: string
  failedTestNames: string[]
}

interface SummarizeInput {
  typeCheckExitCode: number
  typeCheckOutput: string
  testExitCode: number
  testReport: {
    testResults?: Array<{
      name: string
      assertionResults?: Array<{
        title?: string
        fullName?: string
        status: string
      }>
    }>
  } | null
  testOutput: string
}

export function summarizeVerification(
  input: SummarizeInput,
): VerificationResult {
  const failedTestNames: string[] = []
  for (const file of input.testReport?.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status === 'failed') {
        failedTestNames.push(assertion.fullName ?? assertion.title ?? file.name)
      }
    }
  }
  const typeCheckPassed = input.typeCheckExitCode === 0
  const unitTestsPassed = input.testExitCode === 0
  return {
    passed: typeCheckPassed && unitTestsPassed,
    typeCheckPassed,
    unitTestsPassed,
    output: [input.typeCheckOutput, input.testOutput]
      .filter(Boolean)
      .join('\n'),
    failedTestNames,
  }
}

export const verifyTool = tool({
  description:
    'Ejecuta tsc --noEmit y vitest en el proyecto y devuelve un JSON con el resultado de la verificación.',
  args: {},
  async execute(_args, context) {
    const cwd = context.directory
    const typeCheck = spawnSync('pnpm', ['exec', 'tsc', '--noEmit'], {
      cwd,
      encoding: 'utf8',
    })
    const reportPath = join(cwd, '.croupier', 'vitest.json')
    const tests = spawnSync(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--reporter=json',
        `--outputFile=${reportPath}`,
      ],
      { cwd, encoding: 'utf8' },
    )
    let testReport: SummarizeInput['testReport'] = null
    try {
      testReport = JSON.parse(readFileSync(reportPath, 'utf8'))
    } catch {
      testReport = null
    }
    const result = summarizeVerification({
      typeCheckExitCode: typeCheck.status ?? 1,
      typeCheckOutput: [typeCheck.stdout, typeCheck.stderr]
        .filter(Boolean)
        .join('\n'),
      testExitCode: tests.status ?? 1,
      testReport,
      testOutput: [tests.stdout, tests.stderr].filter(Boolean).join('\n'),
    })
    return JSON.stringify(result, null, 2)
  },
})
```

- [ ] **Step 5: Implementar `src/tools/visual-diff.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tool } from '@opencode-ai/plugin'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export interface DiffResult {
  diffPixels: number
  totalPixels: number
  ratio: number
  diffPng: Buffer
}

export function diffPngs(
  bufferA: Uint8Array,
  bufferB: Uint8Array,
  threshold = 0.1,
): DiffResult {
  const a = PNG.sync.read(Buffer.from(bufferA))
  const b = PNG.sync.read(Buffer.from(bufferB))
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    )
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold,
  })
  const totalPixels = a.width * a.height
  return {
    diffPixels,
    totalPixels,
    ratio: totalPixels === 0 ? 0 : diffPixels / totalPixels,
    diffPng: PNG.sync.write(diff),
  }
}

export const visualDiffTool = tool({
  description:
    'Compara dos PNG (before/after) y devuelve el ratio de píxeles distintos; opcionalmente escribe la imagen de diff.',
  args: {
    before: tool.schema
      .string()
      .describe('Ruta del PNG before, relativa al proyecto'),
    after: tool.schema
      .string()
      .describe('Ruta del PNG after, relativa al proyecto'),
    diff: tool.schema
      .string()
      .optional()
      .describe('Ruta donde escribir la imagen de diff'),
  },
  async execute(args, context) {
    const before = resolve(context.directory, args.before)
    const after = resolve(context.directory, args.after)
    const result = diffPngs(readFileSync(before), readFileSync(after))
    if (args.diff)
      writeFileSync(resolve(context.directory, args.diff), result.diffPng)
    return JSON.stringify(
      {
        ratio: result.ratio,
        diffPixels: result.diffPixels,
        totalPixels: result.totalPixels,
        diffPath: args.diff ?? null,
      },
      null,
      2,
    )
  },
})
```

- [ ] **Step 6: Registrar las tools en `src/plugin.ts`**

Añadir imports y el campo `tool`:

```ts
import { verifyTool } from './tools/verify.js'
import { visualDiffTool } from './tools/visual-diff.js'
```

```ts
return {
  config: async (cfg) => {
    /* ...igual... */
  },
  tool: {
    croupier_verify: verifyTool,
    croupier_visual_diff: visualDiffTool,
  },
}
```

- [ ] **Step 7: Actualizar skill y agente para usar las tools**

En `assets/skills/croupier-workflow/SKILL.md`, sustituir `node scripts/verify.mjs` por la tool `croupier_verify` y `node scripts/visual-diff.mjs` por `croupier_visual_diff`.

En `assets/agents/croupier-visual-reporter.md`, sustituir el permiso `"node scripts/visual-diff.mjs*": allow` por `"croupier_visual_diff": allow`, y en el body mencionar la tool.

- [ ] **Step 8: Eliminar los scripts antiguos**

```bash
git rm scripts/verify.mjs scripts/visual-diff.mjs tests/workflow/verify.spec.ts tests/workflow/visual-diff.spec.ts
```

- [ ] **Step 9: Ejecutar toda la suite y verificar**

Run: `pnpm test`
Expected: PASS (incluye `tests/tools.spec.ts`).

- [ ] **Step 10: Typecheck y commit**

```bash
pnpm run typecheck
git add src/tools src/plugin.ts assets tests/tools.spec.ts package.json pnpm-lock.yaml
git commit -m "feat(plugin): add deterministic verify and visual-diff tools"
```

---

### Task 5: Retirada del CLI-harness y poda del paquete

**Files:**

- Delete: `src/cli`, `src/graph`, `src/nodes`, `src/arbiter`, `src/state`, `src/index.ts`, `tests/unit`
- Modify: `package.json`

- [ ] **Step 1: Eliminar el código retirado**

```bash
git rm -r src/cli src/graph src/nodes src/arbiter src/state src/index.ts tests/unit
```

- [ ] **Step 2: Actualizar `package.json`**

Aplicar la metadata y scripts de paquete-plugin (ver Global Constraints y spec §6.1): `main: "dist/plugin.js"`, `exports` a `dist/plugin.js`/`dist/plugin.d.ts`, `files: ["dist", "assets", "README.md", "CHANGELOG.md"]`, `publishConfig.access: "public"`, `license: "MIT"`, `repository`/`homepage`/`bugs`, y scripts `build`/`test`/`typecheck`/`lint`/`format`/`format:check`/`prepublishOnly`. Retirar las deps del CLI (`@langchain/*`, `@modelcontextprotocol/sdk`, `@clack/prompts`, `chalk`, `execa`, `zod`, `dotenv`).

- [ ] **Step 3: Verificación completa**

Run: `pnpm install && pnpm run typecheck && pnpm test && pnpm run build`
Expected: typecheck limpio; tests en verde; build genera `dist/plugin.js`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: retire CLI harness and prune package to the plugin"
```

---

### Task 6: Publicación, CI y tooling (convenciones de pepito)

**Files:**

- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/dependabot-automerge.yml`, `.github/dependabot.yml`
- Create: `release-please-config.json`, `.release-please-manifest.json`, `.nvmrc`, `.prettierrc`, `.prettierignore`, `.oxlintrc.json`
- Create: `README.md`, `CHANGELOG.md`, `LICENSE`

- [ ] **Step 1: Tooling de calidad**

```bash
pnpm add -D oxlint@^1.81.0 prettier@^3.9.6
```

Crear `.nvmrc` (p. ej. `22`), `.prettierrc`, `.prettierignore`, `.oxlintrc.json` siguiendo pepito. Añadir a `package.json` los scripts `lint`, `format`, `format:check`.

- [ ] **Step 2: Release automation**

Crear `release-please-config.json` y `.release-please-manifest.json` (release-type node, manifest `0.1.0`), y `.github/workflows/release.yml` con release-please + publish por OIDC (environment `npm-publish`), adaptado a pnpm (`pnpm/action-setup` + `npm publish`). Tomar como base el `release.yml` de `/Users/alex/Dev/pepito`, cambiando el gestor de paquetes a pnpm.

- [ ] **Step 3: CI de calidad y dependabot**

Crear `.github/workflows/ci.yml` (lint, format:check, typecheck, build, test) adaptado a pnpm, `.github/workflows/dependabot-automerge.yml` y `.github/dependabot.yml`, siguiendo pepito.

- [ ] **Step 4: Docs**

Crear `README.md` (qué es, instalación como plugin, parametrización de modelos, comandos), `CHANGELOG.md` inicial y `LICENSE` (MIT).

- [ ] **Step 5: Verificación final**

Run: `pnpm run lint && pnpm run format:check && pnpm run typecheck && pnpm test && pnpm run build`
Expected: todo en verde.

- [ ] **Step 6: Nota manual de publicación (para el humano)**

Documentar en `README.md`/`CONTRIBUTING` que, para publicar, hay que configurar en npmjs el **trusted publisher** de `yabbadabbadev/croupier` (repo, workflow `release.yml`, environment `npm-publish`) y crear ese environment en GitHub con reviewer requerido.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "ci: add release-please OIDC publishing and quality tooling"
```

---

## Self-Review

**1. Cobertura de la spec**

- §4 estructura del paquete → Tasks 1–5.
- §5 plugin (config injection, no-clobber, tools, MCP) → Tasks 1, 3, 4.
- §6 instalación/distribución + §6.1 publicación/CI → Tasks 5, 6.
- §7 spike → Task 1 (Step 8).
- §8 tests → Tasks 1–4.
- §9 retirada del CLI → Task 5.
- §10 relación con subsistemas 2–5 → no requiere código aquí.
- §11 criterios → cubiertos por Tasks 1–6.
- §12 decisiones abiertas → defaults aplicados (tools `croupier_*`, MCP añadido si ausente, assets markdown+`yaml`, oxlint/prettier).

**2. Placeholder scan:** sin `TBD`/`TODO`; cada paso de código lleva el contenido real. Los workflows de Task 6 se basan en un fichero real de referencia (`pepito`) y se adaptan a pnpm.

**3. Consistencia de tipos:** `ConfigContribution`, `AgentConfigContribution`, `summarizeVerification`, `diffPngs` mantienen nombres y formas entre tareas. Nombres de tools (`croupier_verify`, `croupier_visual_diff`) coinciden en plugin, skill y agente.

**Nota de alcance:** el spike (Task 1, Step 8) es un gate humano que requiere reiniciar opencode; si falla, se replantea el enfoque antes de seguir.
