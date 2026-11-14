import { describe, it, expect } from 'vitest'
import { loadAgentDefinitions, loadCommand, skillsDir } from '../src/assets.js'

const ASSETS = 'assets'

describe('assets', () => {
  it('carga los siete agentes con system no vacío', async () => {
    const agents = await loadAgentDefinitions(ASSETS)
    expect(agents.map((a) => a.name)).toEqual([
      'croupier-implementer',
      'croupier-orchestrator',
      'croupier-performance',
      'croupier-planner',
      'croupier-reviewer',
      'croupier-test-writer',
      'croupier-visual-reporter',
    ])
    for (const agent of agents) {
      expect(agent.config.system.trim().length).toBeGreaterThan(0)
      expect(agent.config.description.length).toBeGreaterThan(0)
    }
  })

  it('mapea permission a permissions V2 y dropea temperature/prompt', async () => {
    const agents = await loadAgentDefinitions(ASSETS)
    const orch = agents.find((a) => a.name === 'croupier-orchestrator')!
    expect((orch.config as Record<string, unknown>).temperature).toBeUndefined()
    expect((orch.config as Record<string, unknown>).prompt).toBeUndefined()
    const perms = orch.config.permissions!
    const edit = (resource: string) =>
      perms.find((r) => r.action === 'edit' && r.resource === resource)?.effect
    expect(edit('*')).toBe('deny')
    expect(edit('progress.md')).toBe('allow')
    expect(perms.find((r) => r.action === 'shell')?.effect).toBe('allow')
    expect(
      perms.find((r) => r.action === 'subagent' && r.resource === 'croupier-*')
        ?.effect,
    ).toBe('allow')
    expect(perms.find((r) => r.action === 'skill')).toBeDefined()
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
