import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

const AGENTS_DIR = 'assets/agents'

interface LoadedAgent {
  name: string
  front: Record<string, any>
  body: string
}

function loadAgents(): LoadedAgent[] {
  return readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const raw = readFileSync(join(AGENTS_DIR, file), 'utf8')
      const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
      if (!match) throw new Error(`Missing frontmatter in ${file}`)
      return {
        name: file.replace(/\.md$/, ''),
        front: parse(match[1]),
        body: match[2],
      }
    })
}

const agents = loadAgents()
const byName = new Map(agents.map((agent) => [agent.name, agent]))

describe('definiciones de agente', () => {
  it('define exactamente el roster esperado', () => {
    const names = agents.map((agent) => agent.name).sort()
    expect(names).toEqual([
      'croupier-implementer',
      'croupier-orchestrator',
      'croupier-performance',
      'croupier-planner',
      'croupier-reviewer',
      'croupier-test-writer',
      'croupier-visual-reporter',
    ])
  })

  it('no fija model en ningún agente', () => {
    for (const agent of agents) {
      expect(agent.front.model).toBeUndefined()
    }
  })

  it('el orquestador es primary y no hidden', () => {
    const orchestrator = byName.get('croupier-orchestrator')!
    expect(orchestrator.front.mode).toBe('primary')
    expect(orchestrator.front.hidden).not.toBe(true)
  })

  it('el orquestador solo puede invocar subagentes croupier-*', () => {
    const orchestrator = byName.get('croupier-orchestrator')!
    expect(orchestrator.front.permission.task).toMatchObject({
      '*': 'deny',
      'croupier-*': 'allow',
    })
  })

  it('todos los subagentes son subagent y hidden', () => {
    for (const name of [
      'croupier-planner',
      'croupier-test-writer',
      'croupier-implementer',
      'croupier-reviewer',
      'croupier-performance',
      'croupier-visual-reporter',
    ]) {
      const agent = byName.get(name)!
      expect(agent.front.mode).toBe('subagent')
      expect(agent.front.hidden).toBe(true)
    }
  })

  it('el reviewer no puede editar', () => {
    const reviewer = byName.get('croupier-reviewer')!
    expect(reviewer.front.permission.edit).toBe('deny')
  })

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

  it('el visual-reporter limita la edición a reportes', () => {
    const reporter = byName.get('croupier-visual-reporter')!
    expect(reporter.front.permission.edit).toMatchObject({
      '*': 'deny',
      'docs/reports/**': 'allow',
      '.croupier/reports/**': 'allow',
    })
  })

  it('cada agente tiene descripción y prompt no vacíos', () => {
    for (const agent of agents) {
      expect(typeof agent.front.description).toBe('string')
      expect(agent.front.description.length).toBeGreaterThan(0)
      expect(agent.body.trim().length).toBeGreaterThan(0)
    }
  })

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
})
