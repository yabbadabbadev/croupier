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
