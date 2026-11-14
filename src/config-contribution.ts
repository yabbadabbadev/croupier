import { loadAgentDefinitions, loadCommand, loadSkill } from './assets.js'
import { makeCommandExecute, type CommandExecute, type SessionClient } from './command.js'

export interface PermissionRule {
  action: string
  resource: string
  effect: 'allow' | 'deny' | 'ask'
}

/** Defaults de agente en shape V2 (registrables vía `ctx.agent.transform`). */
export interface AgentDefaults {
  description?: string
  mode?: 'primary' | 'subagent' | 'all'
  hidden?: boolean
  system: string
  permissions?: PermissionRule[]
}

export interface CommandContribution {
  description: string
  agent: string
  template: string
}

export interface SkillContribution {
  id: string
  name: string
  description: string
  path: string
  content: string
}

export interface McpContribution {
  type: 'local'
  command: string[]
  disabled?: boolean
}

export interface ConfigContribution {
  agents: Record<string, AgentDefaults>
  command?: CommandContribution
  skill?: SkillContribution
  mcp: Record<string, McpContribution>
}

export interface BuildOptions {
  mcp?: boolean
}

export async function buildConfigContribution(
  assetsDir: string,
  options: BuildOptions = {},
): Promise<ConfigContribution> {
  const loaded = await loadAgentDefinitions(assetsDir)
  const agents: Record<string, AgentDefaults> = {}
  for (const agent of loaded) agents[agent.name] = agent.config

  const command = await loadCommand(assetsDir)
  const skill = await loadSkill(assetsDir)
  const includeMcp = options.mcp !== false

  return {
    agents,
    ...(command ? { command } : {}),
    ...(skill ? { skill } : {}),
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
          },
        }
      : {},
  }
}

// --- Registro vía transforms de dominio (API V2) ---

interface AgentEditorLike {
  update(id: string, update: (agent: Record<string, unknown>) => void): void
}
interface CommandEditorLike {
  add(def: {
    name: string
    description?: string
    execute: CommandExecute
  }): void
}
interface SkillEditorLike {
  add(skill: SkillContribution): void
}
interface McpEditorLike {
  get(name: string): unknown
  set(name: string, config: McpContribution): void
}

export interface RegisterContext {
  agent: { transform(cb: (editor: AgentEditorLike) => void): Promise<unknown> }
  command: {
    transform(cb: (editor: CommandEditorLike) => void): Promise<unknown>
  }
  skill: { transform(cb: (editor: SkillEditorLike) => void): Promise<unknown> }
  mcp: { transform(cb: (editor: McpEditorLike) => void): Promise<unknown> }
  session: SessionClient
}

/**
 * Registra el contribution en la API V2. Los overrides del usuario ganan por el
 * layering de config de OpenCode (la config se aplica después de los transforms),
 * así que aquí se setean los defaults incondicionalmente. El MCP usa `set` solo si el
 * nombre no está ya registrado por otro plugin (la config del usuario no es visible
 * en `setup`; si la define, gana igualmente por layering).
 */
export async function registerContribution(
  ctx: RegisterContext,
  contribution: ConfigContribution,
): Promise<void> {
  await ctx.agent.transform((editor) => {
    for (const [id, defaults] of Object.entries(contribution.agents)) {
      editor.update(id, (agent) => {
        for (const [key, value] of Object.entries(defaults)) {
          if (value !== undefined) agent[key] = value
        }
      })
    }
  })

  if (contribution.command) {
    const command = contribution.command
    await ctx.command.transform((editor) => {
      editor.add({
        name: 'croupier',
        description: command.description,
        execute: makeCommandExecute(command, ctx.session),
      })
    })
  }

  if (contribution.skill) {
    const skill = contribution.skill
    await ctx.skill.transform((editor) => editor.add(skill))
  }

  const mcp = contribution.mcp
  if (Object.keys(mcp).length > 0) {
    await ctx.mcp.transform((editor) => {
      for (const [name, config] of Object.entries(mcp)) {
        if (!editor.get(name)) editor.set(name, config)
      }
    })
  }
}
