import { describe, it, expect } from 'vitest'
import { registerContribution } from '../src/config-contribution.js'
import type { ConfigContribution } from '../src/config-contribution.js'

function contributionFixture(): ConfigContribution {
  return {
    agents: {
      'croupier-orchestrator': {
        description: 'orquesta',
        mode: 'primary',
        system: 'eres el orquestador',
        permissions: [{ action: 'edit', resource: '*', effect: 'deny' }],
      },
      'croupier-implementer': {
        description: 'implementa',
        mode: 'subagent',
        hidden: true,
        system: 'eres el implementador',
      },
    },
    command: {
      description: 'cmd',
      agent: 'croupier-orchestrator',
      template: 'Ejecuta $ARGUMENTS',
    },
    skill: {
      id: 'croupier-workflow',
      name: 'Croupier Workflow',
      description: 'wf',
      path: '/pkg/assets/skills/croupier-workflow/SKILL.md',
      content: 'contenido',
    },
    mcp: {
      'chrome-devtools': {
        type: 'local',
        command: ['npx', '-y', 'chrome-devtools-mcp@latest'],
      },
    },
  }
}

function fakeCtx(existingMcp = false) {
  const calls: string[] = []
  const ctx = {
    agent: {
      transform: async (cb: any) => {
        cb({
          update: (id: string, fn: (a: any) => void) => {
            const agent: any = {}
            fn(agent)
            calls.push(`agent:${id}:${agent.system ?? ''}`)
          },
        })
      },
    },
    command: {
      transform: async (cb: any) => cb({ add: (d: any) => calls.push(`command:${d.name}`) }),
    },
    skill: {
      transform: async (cb: any) => cb({ add: (s: any) => calls.push(`skill:${s.id}`) }),
    },
    mcp: {
      transform: async (cb: any) =>
        cb({
          get: () => (existingMcp ? { type: 'local', command: ['x'] } : undefined),
          set: (n: string) => calls.push(`mcp:${n}`),
        }),
    },
  }
  return { ctx, calls }
}

describe('registerContribution', () => {
  it('registra agentes, comando, skill y mcp con transforms de dominio', async () => {
    const { ctx, calls } = fakeCtx()
    await registerContribution(ctx as never, contributionFixture())
    expect(calls).toContain('agent:croupier-orchestrator:eres el orquestador')
    expect(calls).toContain('agent:croupier-implementer:eres el implementador')
    expect(calls).toContain('command:croupier')
    expect(calls).toContain('skill:croupier-workflow')
    expect(calls).toContain('mcp:chrome-devtools')
  })

  it('no define el mcp chrome-devtools si el usuario ya lo tiene', async () => {
    const { ctx, calls } = fakeCtx(true)
    await registerContribution(ctx as never, contributionFixture())
    expect(calls.filter((c) => c.startsWith('mcp:'))).toEqual([])
  })

  it('no escribe claves undefined (hidden) en el agente', async () => {
    const agents: Record<string, unknown>[] = []
    const ctx = {
      agent: {
        transform: async (cb: any) =>
          cb({
            update: (_id: string, fn: (a: any) => void) => {
              const a: any = { hidden: false }
              fn(a)
              agents.push(a)
            },
          }),
      },
      command: { transform: async (cb: any) => cb({ add: () => {} }) },
      skill: { transform: async (cb: any) => cb({ add: () => {} }) },
      mcp: {
        transform: async (cb: any) =>
          cb({ get: () => undefined, set: () => {} }),
      },
    }
    await registerContribution(ctx as never, contributionFixture())
    for (const a of agents) expect(typeof a.hidden).toBe('boolean')
  })
})
